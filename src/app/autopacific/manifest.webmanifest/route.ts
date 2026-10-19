export function GET() {
  const manifest = {
    name: "AutoPacific Production",
    short_name: "AutoPacific",
    description: "AutoPacific Group production jobs, tasks, calendar and daily itinerary.",
    id: "/autopacific",
    start_url: "/autopacific",
    scope: "/autopacific",
    display: "standalone",
    orientation: "any",
    background_color: "#071017",
    theme_color: "#5d91b0",
    categories: ["business", "productivity"],
    icons: [
      { src: "/autopacific/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/autopacific/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/autopacific/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "application/manifest+json",
    },
  });
}
