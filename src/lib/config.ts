export const TRUSHOT_WORKSPACE_ID =
  process.env.TRUSHOT_WORKSPACE_ID ?? "11111111-1111-4111-8111-111111111111";

export const SITE_URL = "https://www.trushotmedia.com";

const configuredTabletRefreshMinutes = Number(process.env.TABLET_REFRESH_INTERVAL_MINUTES ?? 15);
export const TABLET_REFRESH_INTERVAL_MINUTES = Number.isFinite(configuredTabletRefreshMinutes)
  ? Math.min(60, Math.max(10, configuredTabletRefreshMinutes))
  : 15;

export const BRAND = {
  name: "TruShot Media",
  email: "info@fearlessau.com",
  green: "#1f5e41",
  timezone: "Australia/Brisbane",
  currency: "AUD",
} as const;
