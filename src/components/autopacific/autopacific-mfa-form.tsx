"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { beginAutopacificMfaSetup, cancelAutopacificMfaSetup, verifyAutopacificMfa } from "@/app/autopacific/mfa-actions";

type Enrollment = { id: string; qr: string; secret: string };

export function AutopacificMfaForm({ mode, factors, next }: { mode: "enroll" | "challenge"; factors: { id: string; name: string }[]; next: string }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [selectedFactor, setSelectedFactor] = useState(factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const isSetup = mode === "enroll";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const passwordInput = event.currentTarget.elements.namedItem("password") as HTMLInputElement | null;
    const password = passwordInput?.value ?? "";
    if (passwordInput) passwordInput.value = "";
    setError("");
    startTransition(async () => { try {
      if (isSetup && !enrollment) {
        const result = await beginAutopacificMfaSetup(password);
        if (result.enrollment) setEnrollment(result.enrollment);
        else setError(result.error ?? "Setup could not be started. Please try again.");
      } else {
        const result = await verifyAutopacificMfa({ factorId: enrollment?.id ?? selectedFactor, code, next });
        setCode("");
        if (result.ok && result.destination) {
          setEnrollment(null);
          // A fresh document also drops any browser client's old AAL1 session.
          window.location.replace(result.destination);
          return;
        }
        setError(result.error ?? "Verification could not be completed. Please try again.");
      }
    } catch {
      setError("We couldn’t connect. Check your connection and try again.");
    } });
  }

  function cancelSetup() {
    if (!enrollment) return;
    setError("");
    startTransition(async () => { try {
      const result = await cancelAutopacificMfaSetup(enrollment.id);
      if (result.error) setError(result.error);
      else { setEnrollment(null); setCode(""); }
    } catch { setError("We couldn’t cancel setup. Please try again."); }
    });
  }

  return <form onSubmit={submit} className="autopacific-mfa-form">
    {isSetup && !enrollment ? <>
      <div className="autopacific-mfa-notice"><strong>Before you begin</strong><p>Have Microsoft Authenticator ready. Confirming your code will sign out other sessions using this shared account, including kiosks. Anyone signing in to Marketing will also need a code.</p></div>
      <label htmlFor="mfa-password">Confirm your AutoPacific password</label>
      <input id="mfa-password" name="password" type="password" autoComplete="current-password" minLength={6} maxLength={256} required disabled={pending} />
    </> : <>
      {enrollment ? <>
        <ol className="autopacific-mfa-steps"><li>In Microsoft Authenticator, tap <strong>+</strong> then <strong>Other account</strong>.</li><li>Scan this private QR code. Don’t share it.</li><li>Enter the six-digit code shown for AutoPacific.</li></ol>
        <div className="autopacific-mfa-qr">
          {/* eslint-disable-next-line @next/next/no-img-element -- An in-memory Supabase TOTP QR must never go through the image optimizer. */}
          <img src={enrollment.qr} alt="Private authenticator setup QR code" width={240} height={240} />
        </div>
        <details className="autopacific-mfa-manual"><summary>Can’t scan the code?</summary><p>Add an account manually in your authenticator using this setup key. Keep it private.</p><code>{enrollment.secret}</code></details>
      </> : factors.length > 1 ? <><label htmlFor="mfa-factor">Authenticator</label><select id="mfa-factor" value={selectedFactor} onChange={(event) => setSelectedFactor(event.target.value)} disabled={pending}>{factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.name}</option>)}</select></> : null}
      <label htmlFor="mfa-code">Authenticator code</label>
      <input className="autopacific-mfa-code" id="mfa-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required disabled={pending} aria-describedby="mfa-code-hint" />
      <p id="mfa-code-hint" className="autopacific-mfa-hint">Use the code in your authenticator app, not an email or SMS code.</p>
    </>}
    {error ? <p className="autopacific-login-error" role="alert">{error}</p> : null}
    <button type="submit" disabled={pending || (mode === "challenge" && !selectedFactor)}>{pending ? <LoaderCircle size={17} className="autopacific-mfa-spinner" aria-hidden="true" /> : null}{pending ? "Please wait…" : isSetup && !enrollment ? "Set up authenticator" : enrollment ? "Enable two-step verification" : "Verify and continue"}</button>
    {enrollment ? <button className="autopacific-mfa-secondary" type="button" disabled={pending} onClick={cancelSetup}>Cancel setup</button> : isSetup ? <Link className="autopacific-mfa-back" href={next}>Not now · return to workspace</Link> : null}
  </form>;
}
