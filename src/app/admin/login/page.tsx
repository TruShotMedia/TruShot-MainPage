import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { signIn } from "@/app/admin/actions";
import { safeAuthenticatedPath } from "@/lib/auth-redirect";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const destination = safeAuthenticatedPath(next);
  return (
    <main className="login-page">
      <section className="login-brand">
        <Image src="/brand/logo-white.png" alt="TruShot Media" width={420} height={153} priority />
        <div>
          <p>THE WORK BEHIND<br />THE WORK.</p>
          <span>TruShot operations · Brisbane</span>
        </div>
      </section>
      <section className="login-panel">
        <Link className="login-back" href="/"><ArrowLeft size={16} /> Back to website</Link>
        <div className="login-card">
          <div className="login-icon"><LockKeyhole size={21} /></div>
          <p className="admin-eyebrow">Secure workspace</p>
          <h1>Welcome back.</h1>
          <p>Sign in to manage clients, jobs, assets and the numbers behind them.</p>
          <form action={signIn}>
            <input type="hidden" name="next" value={destination} />
            <label><span>Email</span><input name="email" type="email" defaultValue="info@fearlessau.com" required /></label>
            <label><span>Password</span><input name="password" type="password" required autoComplete="current-password" /></label>
            {error && <div className="login-error">Those details didn’t work. Please try again.</div>}
            <button className="admin-primary-button" type="submit">Sign in securely</button>
          </form>
        </div>
      </section>
    </main>
  );
}
