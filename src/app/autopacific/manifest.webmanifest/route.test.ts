import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("AutoPacific manifest", () => {
  it("launches the dedicated mobile experience", async () => {
    const response = GET();
    const manifest = await response.json();

    expect(manifest).toMatchObject({
      id: "/autopacific",
      scope: "/autopacific",
      start_url: "/autopacific/mobile",
      display: "standalone",
    });
  });
});
