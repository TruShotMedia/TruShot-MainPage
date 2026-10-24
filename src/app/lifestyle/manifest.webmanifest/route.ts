export function GET() {
  return new Response(JSON.stringify({
    name: "Lifestyle by TruShot",
    short_name: "Lifestyle",
    description: "A private strength, routine and wellbeing planner.",
    id: "/lifestyle",
    start_url: "/lifestyle",
    scope: "/lifestyle",
    display: "standalone",
    orientation: "any",
    background_color: "#07130e",
    theme_color: "#1f6b49",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/lifestyle/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/lifestyle/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/lifestyle/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "application/manifest+json",
    },
  });
}

