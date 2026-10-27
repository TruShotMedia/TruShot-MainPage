export const AUTOPACIFIC_LOGIN_EMAIL = "jherholdt@autopac.com.au";
export const AUTOPACIFIC_PORTAL_KEY = "autopacific";
export const AUTOPACIFIC_CLIENT_NAME = "Autopacific Group";

export function safeAutopacificPath(value: string | null | undefined) {
  if (!value || value.includes("\\") || value.includes("//")) return "/autopacific";
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || !["/autopacific", "/autopacific/mobile"].includes(url.pathname)) return "/autopacific";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/autopacific";
  }
}
