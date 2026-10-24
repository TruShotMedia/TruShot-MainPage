import sharp from "sharp";

const supportedSizes = new Set([180, 192, 512]);
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!supportedSizes.has(size)) return new Response("Icon size not found", { status: 404 });
  const stroke = Math.max(8, Math.round(size * .048));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${Math.round(size * .22)}" fill="#123c2c"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size * .34}" fill="#1f6b49" opacity=".72"/>
      <path d="M${size * .2} ${size * .52}h${size * .11}l${size * .07}-${size * .13} ${size * .09} ${size * .25} ${size * .09}-${size * .35} ${size * .09} ${size * .23} ${size * .07}-${size * .12}h${size * .11}"
        fill="none" stroke="#d8f3e5" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${size * .2} ${size * .34}v${size * .32}M${size * .8} ${size * .34}v${size * .32}" stroke="#9be0bc" stroke-width="${stroke * 1.3}" stroke-linecap="round"/>
    </svg>`;
  const icon = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(icon), {
    headers: { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": "image/png" },
  });
}

