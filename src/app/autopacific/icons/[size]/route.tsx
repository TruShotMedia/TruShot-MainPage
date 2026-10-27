import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

const supportedSizes = new Set([16, 32, 180, 192, 512]);
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const requestedSize = Number((await params).size);
  if (!supportedSizes.has(requestedSize)) return new Response("Icon size not found", { status: 404 });
  if (requestedSize <= 32) {
    const surface = new URL(request.url).searchParams.get("surface") === "marketing" ? "marketing" : "production";
    const file = surface === "marketing" ? "autopacific-marketing-favicon.svg" : "autopacific-production-favicon.svg";
    const svg = await readFile(path.join(process.cwd(), "public", "brand", file));
    return new ImageResponse(
      // ImageResponse needs a plain image element, not the browser Image component.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:image/svg+xml;base64,${svg.toString("base64")}`} width={requestedSize} height={requestedSize} alt="" />,
      { width: requestedSize, height: requestedSize, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
    );
  }
  const logo = await readFile(path.join(process.cwd(), "public", "brand", "autopacific-logo-clean.png"));
  const logoWidth = Math.round(requestedSize * .82);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f1f7fa" }}>
      {/* ImageResponse rasterises the existing logo without native platform dependencies. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${logo.toString("base64")}`} width={logoWidth} height={Math.round(logoWidth * 312 / 1800)} alt="" />
    </div>,
    { width: requestedSize, height: requestedSize, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
