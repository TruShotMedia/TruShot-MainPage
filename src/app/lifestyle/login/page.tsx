import { Activity, Dumbbell, LockKeyhole } from "lucide-react";
import { signInToLifestyle } from "@/app/lifestyle/actions";

export default async function LifestyleLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="lifestyle-login">
      <section className="lifestyle-login-art" aria-hidden="true">
        <div className="lifestyle-orbit lifestyle-orbit-one" />
        <div className="lifestyle-orbit lifestyle-orbit-two" />
        <span className="lifestyle-login-mark"><Activity /><Dumbbell /></span>
        <p>Move with intent.</p>
        <h1>Build back<br />to strong.</h1>
        <small>Consistency over complexity.</small>
      </section>
      <section className="lifestyle-login-panel">
        <form action={signInToLifestyle} className="lifestyle-login-card">
          <span className="lifestyle-secure"><LockKeyhole size={17} /> Private health workspace</span>
          <h2>Welcome back,<br />John.</h2>
          <p>Your plan, today’s session and progress are waiting.</p>
          <label>Password<input name="password" type="password" autoComplete="current-password" autoFocus required /></label>
          {error ? <div className="lifestyle-login-error">{error === "access" ? "This account does not have Lifestyle access." : "That password didn’t work. Please try again."}</div> : null}
          <button type="submit">Open Lifestyle <span>→</span></button>
          <small>Secured with your TruShot account</small>
        </form>
      </section>
    </main>
  );
}

