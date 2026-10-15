import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "INGREIGN Content Studio",
    short_name: "INGREIGN",
    description: "INGREIGN event calendar, captions and post generator.",
    id: "/ingreign",
    start_url: "/ingreign",
    scope: "/ingreign",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#140b0d",
    theme_color: "#140b0d",
    categories: ["productivity", "social"],
    icons: [
      { src: "/ingreign/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ingreign/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/ingreign/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

