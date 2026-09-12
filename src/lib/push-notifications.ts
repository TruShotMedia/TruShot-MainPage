import "server-only";

import webpush from "web-push";
import { BRAND } from "@/lib/config";
import { buildClientRequestPushMessage, isExpiredPushSubscriptionError, type PushMessage } from "@/lib/push";
import { createServiceClient } from "@/lib/supabase/service";

export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

type PushDeliveryResult = {
  configured: boolean;
  delivered: number;
  failed: number;
  expiredIds: string[];
};

function getPushConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? `mailto:${BRAND.email}`;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export async function sendPushNotifications(
  subscriptions: StoredPushSubscription[],
  message: PushMessage,
): Promise<PushDeliveryResult> {
  const configuration = getPushConfiguration();
  if (!configuration) return { configured: false, delivered: 0, failed: 0, expiredIds: [] };

  webpush.setVapidDetails(configuration.subject, configuration.publicKey, configuration.privateKey);
  const deliveries = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
        },
        JSON.stringify(message),
        { TTL: 60 * 60 * 24, urgency: "high" },
      );
      return subscription.id;
    }),
  );

  const expiredIds: string[] = [];
  let delivered = 0;
  deliveries.forEach((delivery, index) => {
    if (delivery.status === "fulfilled") {
      delivered += 1;
      return;
    }
    if (isExpiredPushSubscriptionError(delivery.reason)) expiredIds.push(subscriptions[index].id);
  });

  return {
    configured: true,
    delivered,
    failed: deliveries.length - delivered,
    expiredIds,
  };
}

export async function notifyNewClientRequest({
  workspaceId,
  enquiryId,
  name,
  businessName,
}: {
  workspaceId: string;
  enquiryId: string;
  name: string;
  businessName: string | null;
}) {
  try {
    const supabase = createServiceClient();
    if (!supabase) {
      console.warn("Client-request push skipped because the server notification credentials are incomplete.");
      return;
    }

    const { data, error } = await supabase
      .from("website-push-subscriptions")
      .select("id,endpoint,p256dh,auth_key")
      .eq("workspace_id", workspaceId);
    if (error) throw error;
    if (!data?.length) return;

    const result = await sendPushNotifications(
      data as StoredPushSubscription[],
      buildClientRequestPushMessage({ enquiryId, name, businessName }),
    );
    if (result.expiredIds.length) {
      const { error: cleanupError } = await supabase
        .from("website-push-subscriptions")
        .delete()
        .in("id", result.expiredIds);
      if (cleanupError) console.error("Expired push subscriptions could not be removed.", cleanupError);
    }
  } catch (error) {
    console.error("The client request was saved, but its push notification could not be delivered.", error);
  }
}
