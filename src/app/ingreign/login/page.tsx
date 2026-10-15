import Image from "next/image";
import { LockKeyhole, Sparkles } from "lucide-react";
import { signInToIngreign } from "@/app/ingreign/actions";
import { IngreignLoginButton } from "@/components/ingreign/ingreign-login-button";

export default async function IngreignLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="ingreign-login-page">
      <section className="ingreign-login-brand">
        <div className="ingreign-login-glow" />
        <Image src="/ingreign/ingreign-logo-white.png" alt="INGREIGN" width={900} height={780} priority />
        <div><Sparkles size={16} /><span>Gather · Worship · Grow</span></div>
      </section>
      <section className="ingreign-login-panel">
        <div className="ingreign-login-card">
          <span className="ingreign-login-icon"><LockKeyhole size={20} /></span>
          <p>Private content workspace</p>
          <h1>Welcome to<br />INGREIGN.</h1>
          <span>Plan every post, copy approved captions and create ready-to-share event artwork in one place.</span>
          <form action={signInToIngreign}>
            <label>Password<input name="password" type="password" autoComplete="current-password" autoFocus required /></label>
            {error ? <div className="ingreign-login-error">{error === "access" ? "This account does not have INGREIGN access." : "Those details didn’t work. Please try again."}</div> : null}
            <IngreignLoginButton />
          </form>
          <small>Securely powered by TruShot Media</small>
        </div>
      </section>
    </main>
  );
}

