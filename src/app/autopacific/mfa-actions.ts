"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autopacificMfaDestination } from "@/lib/autopacific-access";
import { getAutopacificAccountContext, readAutopacificMfa } from "@/lib/autopacific-mfa";

const expired = "Your session has expired. Sign in again to continue.";
const unavailable = "We couldn’t reach the verification service. Please try again shortly.";
const factorSchema = z.uuid();

export async function beginAutopacificMfaSetup(password: string) {
  const context = await getAutopacificAccountContext();
  if (!context) return { error: expired };
  const parsed = z.string().min(6).max(256).safeParse(password);
  if (!parsed.success) return { error: "Enter your current AutoPacific password." };
  const existing = await readAutopacificMfa(context.supabase);
  if (!existing) return { error: unavailable };
  if (existing.verified.length) return { error: "Two-step verification is already enabled. Reload this page to verify your sign-in." };

  // A stolen, unattended password-only session must not be enough to set up MFA.
  const email = z.email().safeParse(context.claims.email);
  if (!email.success) return { error: expired };
  const { data: login, error: loginError } = await context.supabase.auth.signInWithPassword({ email: email.data, password: parsed.data });
  if (loginError || login.user?.id !== context.claims.sub) return { error: "That password didn’t work. Please try again." };
  const refreshed = await readAutopacificMfa(context.supabase);
  if (!refreshed) return { error: unavailable };
  if (refreshed.verified.length) return { error: "Two-step verification is already enabled. Reload this page to verify your sign-in." };
  // A refreshed/abandoned setup has no usable secret on this device. Replace
  // only our own unverified attempts; never remove a verified or unrelated factor.
  for (const factor of refreshed.all) {
    if (factor.status === "unverified" && factor.factor_type === "totp" && factor.friendly_name?.startsWith("AutoPacific Authenticator ")) {
      const { error: cleanupError } = await context.supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (cleanupError) return { error: unavailable };
    }
  }
  const { data, error } = await context.supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "AutoPacific MarketingTeamCRM",
    friendlyName: `AutoPacific Authenticator ${crypto.randomUUID().slice(0, 8)}`,
  });
  if (error || !data) return { error: "We couldn’t start setup. Please try again, or contact your administrator if this continues." };
  // These are shown only for this explicit setup request. Never persist or log them.
  const svg = data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, "");
  return { enrollment: { id: data.id, qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, secret: data.totp.secret } };
}

export async function verifyAutopacificMfa(input: { factorId: string; code: string; next?: string }) {
  const parsed = z.object({ factorId: factorSchema, code: z.string().regex(/^\d{6}$/), next: z.string().max(1000).optional() }).safeParse(input);
  if (!parsed.success) return { error: "Enter the six-digit code shown in your authenticator app." };
  const context = await getAutopacificAccountContext();
  if (!context) return { error: expired };
  const factors = await readAutopacificMfa(context.supabase);
  if (!factors) return { error: unavailable };
  const factor = factors.all.find((factor) => factor.id === parsed.data.factorId && factor.factor_type === "totp");
  if (!factor) return { error: "That authenticator is no longer available. Reload this page to continue." };
  if (factor.status !== "verified" && factors.verified.length && context.claims.aal !== "aal2") return { error: "Verify your existing authenticator first. Reload this page to continue." };
  const { error } = await context.supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) return { error: "That code wasn’t accepted. Check your phone’s time is automatic, wait for a new code, then try again." };
  const { data: claims, error: claimsError } = await context.supabase.auth.getClaims();
  if (claimsError || claims?.claims?.aal !== "aal2") return { error: unavailable };
  revalidatePath("/autopacific", "layout");
  revalidatePath("/marketing", "layout");
  return { ok: true, destination: autopacificMfaDestination(parsed.data.next) };
}

export async function cancelAutopacificMfaSetup(factorId: string) {
  if (!factorSchema.safeParse(factorId).success) return { error: "That setup could not be cancelled. Reload this page." };
  const context = await getAutopacificAccountContext();
  if (!context) return { error: expired };
  const factors = await readAutopacificMfa(context.supabase);
  if (!factors) return { error: unavailable };
  const factor = factors.all.find((item) => item.id === factorId);
  if (!factor) return { ok: true };
  // This action can never remove an active authenticator or bypass MFA.
  if (factor.status !== "unverified" || factor.factor_type !== "totp") return { error: "An active authenticator cannot be removed here." };
  const { error } = await context.supabase.auth.mfa.unenroll({ factorId });
  return error ? { error: unavailable } : { ok: true };
}
