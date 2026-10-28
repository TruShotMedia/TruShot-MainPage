export const AUTOPACIFIC_LOGIN_EMAIL = "jherholdt@autopac.com.au";
export const AUTOPACIFIC_PORTAL_KEY = "autopacific";
export const AUTOPACIFIC_CLIENT_NAME = "Autopacific Group";
export const AUTOPACIFIC_SECURITY_PATH = "/autopacific/security";

export function safeAutopacificPath(value: string | null | undefined, fallback: "/autopacific" | "/marketing" = "/autopacific") {
  if (!value || value.includes("\\") || value.includes("//")) return fallback;
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || !["/autopacific", "/autopacific/mobile", "/marketing", AUTOPACIFIC_SECURITY_PATH].includes(url.pathname)) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

/** Never let the challenge redirect back into itself after verification. */
export function autopacificMfaDestination(value: string | null | undefined) {
  const destination = safeAutopacificPath(value);
  const url = new URL(destination, "https://workspace.invalid");
  if (url.pathname !== AUTOPACIFIC_SECURITY_PATH) return destination;
  const nested = safeAutopacificPath(url.searchParams.get("next"));
  return new URL(nested, "https://workspace.invalid").pathname === AUTOPACIFIC_SECURITY_PATH ? "/autopacific" : nested;
}

export function autopacificMfaPath(next: string | null | undefined) {
  return `${AUTOPACIFIC_SECURITY_PATH}?${new URLSearchParams({ next: autopacificMfaDestination(next) })}`;
}
