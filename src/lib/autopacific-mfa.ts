import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTOPACIFIC_LOGIN_EMAIL, AUTOPACIFIC_PORTAL_KEY } from "@/lib/autopacific-access";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

/** Setup/challenge access must remain possible before the user reaches AAL2. */
export const getAutopacificAccountContext = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub || claims.email?.toLowerCase() !== AUTOPACIFIC_LOGIN_EMAIL) return null;
  const { data: membership, error: membershipError } = await supabase.from("website-portal-users").select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("user_id", claims.sub)
    .eq("portal_key", AUTOPACIFIC_PORTAL_KEY).eq("is_active", true).maybeSingle();
  if (membershipError || !membership) return null;
  return { supabase, claims };
});

/** Fetch from Auth, not the factor list cached in an old browser session. */
export async function readAutopacificMfa(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return null;
  return {
    all: data.all,
    verified: data.all.filter((factor) => factor.status === "verified"),
    totp: data.totp,
  };
}

export async function hasAutopacificMfaAssurance(supabase: SupabaseClient, aal: unknown) {
  if (aal === "aal2") return true;
  const factors = await readAutopacificMfa(supabase);
  // Safe rollout: enrollment activates enforcement. An Auth failure never grants access.
  return factors !== null && factors.verified.length === 0;
}
