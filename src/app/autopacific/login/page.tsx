import Image from "next/image";
import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { signInToAutopacific } from "@/app/autopacific/actions";
import { AutopacificLoginButton } from "@/components/autopacific/autopacific-login-button";
import { AutopacificLoginCleanup } from "@/components/autopacific/autopacific-session-controls";
import { safeAutopacificPath } from "@/lib/autopacific-access";
import { getProductionContext } from "@/lib/data/admin";
import "./login.css";

export default async function AutopacificLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  if (!error && await getProductionContext()) redirect(safeAutopacificPath(next));
  return <main className="autopacific-login">
    <AutopacificLoginCleanup />
    <section className="autopacific-login-card">
      <div className="autopacific-login-logo"><Image src="/brand/autopacific-logo-clean.png" width={1800} height={312} alt="AutoPacific Group" priority /></div>
      <span className="autopacific-login-eyebrow"><LockKeyhole size={15} /> Private production workspace</span>
      <h1>Ready for what’s next.</h1>
      <p>Your jobs, content and schedule. One focused workspace.</p>
      <form action={signInToAutopacific}>
        <input type="hidden" name="next" value={safeAutopacificPath(next)} />
        <label htmlFor="autopacific-password">Password</label>
        <input id="autopacific-password" name="password" type="password" autoComplete="current-password" required minLength={6} maxLength={256} />
        {error ? <p className="autopacific-login-error" role="alert">{error === "access" ? "This account does not have AutoPacific access. Contact your administrator." : "That password didn’t work. Please try again."}</p> : null}
        <AutopacificLoginButton />
      </form>
      <small>Secure access · AutoPacific Group</small>
    </section>
  </main>;
}
