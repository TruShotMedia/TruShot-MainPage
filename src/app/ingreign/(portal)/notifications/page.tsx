import { BellRing } from "lucide-react";
import { IngreignNotificationSettings } from "@/components/ingreign/notification-settings";
import { getIngreignNotificationData } from "@/lib/data/ingreign";

export default async function IngreignNotificationsPage() {
  const data = await getIngreignNotificationData();
  if (!data) return null;
  return (
    <>
      <header className="ingreign-page-header">
        <div><span><BellRing size={15} /> Posting reminders</span><h1>Right post.<br />Right day.</h1></div>
        <p>Enable native reminders on each phone or computer you use. The schedule is automatic and runs without keeping this page open.</p>
      </header>
      <IngreignNotificationSettings publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} deviceCount={data.subscriptionCount} canConfigure={data.context.access === "portal"} />
    </>
  );
}

