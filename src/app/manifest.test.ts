import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("TruShot CRM web app manifest", () => {
  it("installs as a standalone app that opens the admin workspace", () => {
    const value = manifest();

    expect(value).toMatchObject({
      name: "TruShot Media CRM",
      short_name: "TruShot CRM",
      id: "/admin",
      start_url: "/admin",
      scope: "/",
      display: "standalone",
      background_color: "#f3f2ec",
      theme_color: "#1f5e41",
    });
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/trushot-app-192.png", sizes: "192x192" }),
      expect.objectContaining({ src: "/icons/trushot-app-512.png", sizes: "512x512" }),
      expect.objectContaining({ src: "/icons/trushot-app-512-maskable.png", purpose: "maskable" }),
    ]));
  });
});
