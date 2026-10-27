import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("AutoPacific browser icons", () => {
  it("renders distinct 32px production and marketing PNGs", async () => {
    const bodies: Uint8Array[] = [];
    for (const surface of ["production", "marketing"]) {
      const response = await GET(new Request(`https://www.trushotmedia.com/autopacific/icons/32?surface=${surface}&v=1`), { params: Promise.resolve({ size: "32" }) });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      const body = new Uint8Array(await response.arrayBuffer());
      expect(await sharp(body).metadata()).toMatchObject({ width: 32, height: 32, format: "png" });
      bodies.push(body);
    }
    expect(bodies[0]).not.toEqual(bodies[1]);
  // Includes the first load/compilation of the portable image-rendering WASM.
  }, 20_000);

  it("preserves the existing installed-app icon", async () => {
    const response = await GET(new Request("https://www.trushotmedia.com/autopacific/icons/180"), { params: Promise.resolve({ size: "180" }) });
    expect(response.status).toBe(200);
    expect(await sharp(new Uint8Array(await response.arrayBuffer())).metadata()).toMatchObject({ width: 180, height: 180 });
  });

  it("rejects unsupported sizes", async () => {
    const response = await GET(new Request("https://www.trushotmedia.com/autopacific/icons/999"), { params: Promise.resolve({ size: "999" }) });
    expect(response.status).toBe(404);
  });
});
