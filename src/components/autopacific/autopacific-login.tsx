import { ProductionWordmark } from "@/components/autopacific/production-wordmark";
import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { signInToAutopacific } from "@/app/autopacific/actions";
import { AutopacificLoginButton } from "@/components/autopacific/autopacific-login-button";
import { AutopacificLoginCleanup } from "@/components/autopacific/autopacific-session-controls";
import { AUTOPACIFIC_SECURITY_PATH, autopacificMfaPath, safeAutopacificPath } from "@/lib/autopacific-access";
import { getAutopacificAccountContext, readAutopacificMfa } from "@/lib/autopacific-mfa";
import { getProductionContext } from "@/lib/data/admin";
import "@/app/autopacific/login/login.css";

export async function AutopacificLogin({ searchParams, surface = "autopacific" }: { searchParams: Promise<{ error?: string; next?: string }>; surface?: "autopacific" | "marketing" }) {
  const { error, next } = await searchParams;
  const destination = safeAutopacificPath(next, surface === "marketing" ? "/marketing" : "/autopacific");
  let verificationUnavailable = false;
  if (!error) {
    const account = await getAutopacificAccountContext();
    if (account) {
      const factors = await readAutopacificMfa(account.supabase);
      if (!factors) verificationUnavailable = true;
      else if (factors.verified.length && account.claims.aal !== "aal2") redirect(autopacificMfaPath(destination));
      else redirect(destination);
    } else if (!destination.startsWith(AUTOPACIFIC_SECURITY_PATH) && await getProductionContext()) redirect(destination);
  }
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
        {error || verificationUnavailable ? <p className="autopacific-login-error" role="alert">{error === "access" ? "This account does not have AutoPacific access. Contact your administrator." : error === "verification" || verificationUnavailable ? "We couldn’t check two-step verification. Please sign in again or try shortly." : "That password didn’t work. Please try again."}</p> : null}
        <AutopacificLoginButton />
      </form>
      <small>Secure access · AutoPacific Group</small>
    </section>
  </main>;
}
