import { GET as autopacificManifest } from "@/app/autopacific/manifest.webmanifest/route";

export async function GET() {
  const manifest = await autopacificManifest().json();
  return Response.json({ ...manifest, name: "AutoPacific Marketing", short_name: "APG Marketing", description: "AutoPacific jobs, planning and calendar.", id: "/marketing", start_url: "/marketing", scope: "/marketing" }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
