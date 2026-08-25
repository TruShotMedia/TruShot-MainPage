// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { getImageDimensions } from "./media-dimensions";

describe("getImageDimensions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads intrinsic dimensions and releases the decoded bitmap", async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn(async () => ({ width: 1080, height: 1920, close }));
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const file = new File(["photo"], "portrait.jpg", { type: "image/jpeg" });

    await expect(getImageDimensions(file)).resolves.toEqual({ width: 1080, height: 1920 });
    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(close).toHaveBeenCalledOnce();
  });
});
