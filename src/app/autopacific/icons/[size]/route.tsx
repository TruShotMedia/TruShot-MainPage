import { ImageResponse } from "next/og";
import { SITE_URL } from "@/lib/config";

const supportedSizes = new Set([180, 192, 512]);

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const requestedSize = Number((await params).size);
  if (!supportedSizes.has(requestedSize)) return new Response("Icon size not found", { status: 404 });
  const logoUrl = new URL("/brand/autopacific-logo-clean.png", SITE_URL).toString();

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(145deg, #f9fbfc 0%, #e8f0f4 100%)",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          padding: "13%",
          width: "100%",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="AutoPacific Group" src={logoUrl} style={{ height: "auto", width: "100%" }} />
      </div>
    ),
    {
      height: requestedSize,
      width: requestedSize,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
