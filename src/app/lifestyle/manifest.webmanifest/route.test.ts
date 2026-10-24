import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("Lifestyle manifest", () => {
  it("launches as its own standalone application", async () => {
    const manifest = await GET().json();
    expect(manifest).toMatchObject({ id: "/lifestyle", scope: "/lifestyle", start_url: "/lifestyle", display: "standalone" });
  });
});
