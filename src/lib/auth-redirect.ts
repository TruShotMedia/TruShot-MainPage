const DEFAULT_AUTHENTICATED_PATH = "/admin/overview";

export function safeAuthenticatedPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  if (value === "/tablet") return value;
  if ((value === "/admin" || value.startsWith("/admin/")) && !value.startsWith("/admin/login")) {
    return value;
  }

  return DEFAULT_AUTHENTICATED_PATH;
}
