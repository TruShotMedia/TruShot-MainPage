import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TruShot Media",
    short_name: "TruShot",
    description: "TruShot Media website and private business CRM.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f3f2ec",
    theme_color: "#1f5e41",
    categories: ["business", "photo", "productivity"],
    icons: [
      { src: "/icons/trushot-app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/trushot-app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/trushot-app-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
