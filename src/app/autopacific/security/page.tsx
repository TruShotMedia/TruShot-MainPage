import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ProductionWordmark } from "@/components/autopacific/production-wordmark";
import { AutopacificMfaForm } from "@/components/autopacific/autopacific-mfa-form";
import { AutopacificMfaLocalCleanup, AutopacificSignOutButton } from "@/components/autopacific/autopacific-session-controls";
import { AUTOPACIFIC_SECURITY_PATH, autopacificMfaDestination } from "@/lib/autopacific-access";
import { getAutopacificAccountContext, readAutopacificMfa } from "@/lib/autopacific-mfa";
import "../login/login.css";

export const metadata: Metadata = { title: { absolute: "Account security | AutoPacific" }, robots: { index: false, follow: false } };

export default async function AutopacificSecurityPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = autopacificMfaDestination((await searchParams).next);
  const context = await getAutopacificAccountContext();
  if (!context) redirect(`/autopacific/login?${new URLSearchParams({ next: `${AUTOPACIFIC_SECURITY_PATH}?${new URLSearchParams({ next })}` })}`);
  const factors = await readAutopacificMfa(context.supabase);
  const enabled = !!factors?.verified.length;
  const verified = enabled && context.claims.aal === "aal2";
  return <main className="autopacific-login autopacific-security">
    <AutopacificMfaLocalCleanup />
    <section className="autopacific-login-card">
      <div className="autopacific-login-logo"><ProductionWordmark preload sizes="280px" /></div>
      <span className="autopacific-login-eyebrow"><ShieldCheck size={15} /> Account security</span>
      <h1>{verified ? "A little extra peace of mind." : enabled ? "One more step." : "Protect your workspace."}</h1>
      {!factors ? <p className="autopacific-login-error" role="alert">We couldn’t check your authenticator. Please reload this page before continuing.</p> : verified ? <>
        <div className="autopacific-mfa-success"><ShieldCheck size={22} /><div><strong>Two-step verification is on</strong><p>This device has been verified. Future sign-ins require your password and an authenticator code.</p></div></div>
        <Link className="autopacific-mfa-continue" href={next}>Continue to workspace</Link>
      </> : <>
        <p>{enabled ? "Enter the current six-digit code from Microsoft Authenticator or your chosen authenticator app." : "Use an authenticator app to add a second check to your AutoPacific and Marketing sign-ins."}</p>
        <AutopacificMfaForm mode={enabled ? "challenge" : "enroll"} factors={factors.totp.map((factor) => ({ id: factor.id, name: factor.friendly_name || "Authenticator" }))} next={next} />
      </>}
      <p className="autopacific-mfa-help">Keep access to your authenticator. If your phone is lost, contact your administrator for identity-checked recovery. There is no email-only bypass.</p>
      <AutopacificSignOutButton destination={next} showLabel />
    </section>
  </main>;
}
