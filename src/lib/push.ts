export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag: string;
  badgeCount?: number;
  kind?: "autopacific" | "flight" | "ingreign";
  timestamp?: number;
};

export function buildClientRequestPushMessage({
  enquiryId,
  name,
  businessName,
  badgeCount,
}: {
  enquiryId: string;
  name: string;
  businessName: string | null;
  badgeCount?: number;
}): PushMessage {
  const requester = businessName ? `${name} · ${businessName}` : name;
  return {
    title: "New client request",
    body: `${requester} has asked to work with TruShot Media.`,
    url: `/admin/requests?request=${encodeURIComponent(enquiryId)}`,
    tag: `client-request-${enquiryId}`,
    ...(badgeCount ? { badgeCount } : {}),
  };
}

export function isExpiredPushSubscriptionError(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return false;
  const statusCode = Number((error as { statusCode?: unknown }).statusCode);
  return statusCode === 404 || statusCode === 410;
}
