import { ProductionWordmark } from "@/components/autopacific/production-wordmark";
import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { signInToAutopacific } from "@/app/autopacific/actions";
import { AutopacificLoginButton } from "@/components/autopacific/autopacific-login-button";
import { AutopacificLoginCleanup } from "@/components/autopacific/autopacific-session-controls";
import { safeAutopacificPath } from "@/lib/autopacific-access";
import { getProductionContext } from "@/lib/data/admin";
import "@/app/autopacific/login/login.css";

export async function AutopacificLogin({ searchParams, surface = "autopacific" }: { searchParams: Promise<{ error?: string; next?: string }>; surface?: "autopacific" | "marketing" }) {
  const { error, next } = await searchParams;
  const destination = safeAutopacificPath(next, surface === "marketing" ? "/marketing" : "/autopacific");
  if (!error && await getProductionContext()) redirect(destination);
  return <main className="autopacific-login">
    <AutopacificLoginCleanup />
    <section className="autopacific-login-card">
      <div className="autopacific-login-logo"><ProductionWordmark preload sizes="(max-width: 440px) 240px, 280px" /></div>
      <span className="autopacific-login-eyebrow"><LockKeyhole size={15} /> {surface === "marketing" ? "Private marketing workspace" : "Private production workspace"}</span>
      <h1>{surface === "marketing" ? "Good ideas. Clear plans." : "Ready for what’s next."}</h1>
      <p>{surface === "marketing" ? "Plan the brief, shape deliverables and keep production moving." : "Your jobs, content and schedule. One focused workspace."}</p>
      <form action={signInToAutopacific}>
        <input type="hidden" name="surface" value={surface} />
        <input type="hidden" name="next" value={destination} />
        <label htmlFor="autopacific-password">Password</label>
        <input id="autopacific-password" name="password" type="password" autoComplete="current-password" required minLength={6} maxLength={256} />
        {error ? <p className="autopacific-login-error" role="alert">{error === "access" ? "This account does not have AutoPacific access. Contact your administrator." : "That password didn’t work. Please try again."}</p> : null}
        <AutopacificLoginButton />
      </form>
      <small>Secure access · AutoPacific Group</small>
    </section>
  </main>;
}
