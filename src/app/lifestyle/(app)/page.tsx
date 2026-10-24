import { redirect } from "next/navigation";
import { LifestyleApp } from "@/components/lifestyle/lifestyle-app";
import { getLifestyleData } from "@/lib/data/lifestyle";

export default async function LifestylePage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; session?: string | string[] }> }) {
  const [data, query] = await Promise.all([getLifestyleData(), searchParams]);
  if (!data) redirect("/lifestyle/login");
  return (
    <LifestyleApp
      key={`${data.profile.days_per_week}:${data.profile.preferred_start_time}:${data.sessions.map((session) => `${session.id}:${session.status}:${session.exercises.filter((exercise) => exercise.completed).length}`).join("|")}`}
      initialData={data}
      initialView={typeof query.view === "string" ? query.view : undefined}
      requestedSessionId={typeof query.session === "string" ? query.session : undefined}
      notificationPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
    />
  );
}

