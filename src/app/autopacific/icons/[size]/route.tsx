import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const supportedSizes = new Set([180, 192, 512]);
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const requestedSize = Number((await params).size);
  if (!supportedSizes.has(requestedSize)) return new Response("Icon size not found", { status: 404 });
  const logo = await readFile(path.join(process.cwd(), "public", "brand", "autopacific-logo-clean.png"));
  const resizedLogo = await sharp(logo)
    .resize({ width: Math.round(requestedSize * .82), fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const icon = await sharp({
    create: {
      width: requestedSize,
      height: requestedSize,
      channels: 4,
      background: { r: 241, g: 247, b: 250, alpha: 1 },
    },
  })
    .composite([{ input: resizedLogo, gravity: "centre" }])
    .png()
    .toBuffer();

  return new Response(new Uint8Array(icon), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/png",
    },
  });
}
