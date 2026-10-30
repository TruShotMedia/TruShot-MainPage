// @vitest-environment jsdom
import { File, Blob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareProfilePhoto, PROFILE_PHOTO_SOURCE_MAX_BYTES } from "./prepare-profile-photo";
import { PROFILE_PHOTO_MAX_BYTES } from "./production-profile";

describe("profile photo preparation on phones", () => {
  const close = vi.fn(), draw = vi.fn(), revoke = vi.fn();
  let encode = vi.fn<(callback: BlobCallback, type?: string, quality?: number) => void>();
  let bitmap: ReturnType<typeof vi.fn>, workers: Array<{ terminate: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn>; onmessage?: (event: unknown) => void; onerror?: () => void }>;
  beforeEach(() => {
    vi.clearAllMocks(); workers = [];
    vi.stubGlobal("File", File); vi.stubGlobal("Blob", Blob);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: revoke }));
    bitmap = vi.fn().mockResolvedValue({ width: 1024, height: 768, close }); vi.stubGlobal("createImageBitmap", bitmap);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
    encode = vi.fn((callback: BlobCallback) => callback(new Blob(["small"], { type: "image/webp" })));
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type, quality) => { encode(callback, type, quality); });
    vi.stubGlobal("Image", class { onerror?: () => void; set src(value: string) { if (value) queueMicrotask(() => this.onerror?.()); } });
    vi.stubGlobal("Worker", class {
      terminate = vi.fn(); postMessage = vi.fn(); onmessage?: (event: unknown) => void; onerror?: () => void;
      constructor() { workers.push(this); }
    });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  const jpg = () => new File(["source"], "IMG_1234.JPG", { type: "image/jpeg" }) as unknown as globalThis.File;
  const heic = () => new File(["source"], "IMG_1234.HEIC", { type: "image/heic" }) as unknown as globalThis.File;
  it("regression: accepts Safari's actual PNG result instead of rejecting a JPEG source", async () => {
    encode.mockImplementation(callback => callback(new Blob(["png"], { type: "image/png" })));
    const photo = await prepareProfilePhoto(jpg());
    expect(photo.type).toBe("image/png"); expect(photo.name).toBe("profile.png"); expect(close).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenCalledWith(expect.anything(), 128, 0, 768, 768, 0, 0, 512, 512);
  });
  it("uses JPEG compression when Safari's PNG fallback exceeds the upload limit", async () => {
    encode.mockImplementation((callback, type) => callback(new Blob([type === "image/webp" ? new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1) : "jpg"], { type: type === "image/webp" ? "image/png" : type })));
    const photo = await prepareProfilePhoto(jpg());
    expect(photo.type).toBe("image/jpeg"); expect(photo.name).toBe("profile.jpg"); expect(photo.size).toBeLessThan(PROFILE_PHOTO_MAX_BYTES);
  });
  it("allows a camera image with an empty MIME type and supports native HEIC decoding", async () => {
    await expect(prepareProfilePhoto(new File(["photo"], "IMG_1234.JPG") as unknown as globalThis.File)).resolves.toBeDefined();
    await expect(prepareProfilePhoto(heic())).resolves.toBeDefined(); expect(workers).toHaveLength(0);
  });
  it("loads the HEIC worker only when native decoders cannot open the phone image", async () => {
    bitmap.mockRejectedValue(new Error("Unsupported")); const progress = vi.fn();
    const pending = prepareProfilePhoto(heic(), { onProgress: progress });
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    workers[0].onmessage?.({ data: { bitmap: { width: 1024, height: 1024, close } } });
    await expect(pending).resolves.toMatchObject({ type: "image/webp" });
    expect(progress).toHaveBeenCalledWith("Preparing iPhone photo…"); expect(workers[0].terminate).toHaveBeenCalled(); expect(revoke).toHaveBeenCalled();
  });
  it("can cancel HEIC decoding without blocking the dialog", async () => {
    bitmap.mockRejectedValue(new Error("Unsupported")); const controller = new AbortController();
    const pending = prepareProfilePhoto(heic(), { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(workers).toHaveLength(1)); controller.abort(); await rejected;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it("gives a useful error for corrupt HEIC files and terminates the worker", async () => {
    bitmap.mockRejectedValue(new Error("Unsupported")); const pending = prepareProfilePhoto(heic());
    const rejected = expect(pending).rejects.toThrow("HEIC");
    await vi.waitFor(() => expect(workers).toHaveLength(1)); workers[0].onmessage?.({ data: { error: "HEIC photo could not be opened" } });
    await rejected; expect(workers[0].terminate).toHaveBeenCalledOnce();
  });
  it("rejects empty, vector, non-image and oversized sources before decoding", async () => {
    for (const file of [new File([], "empty.jpg"), new File(["<svg/>"], "avatar.svg", { type: "image/svg+xml" }), new File(["text"], "notes.txt"), { name: "big.jpg", type: "image/jpeg", size: PROFILE_PHOTO_SOURCE_MAX_BYTES + 1 }]) {
      await expect(prepareProfilePhoto(file as unknown as globalThis.File)).rejects.toThrow("under 50 MB");
    }
    expect(bitmap).not.toHaveBeenCalled();
  });
  it("releases the decoded photo if every canvas encoding fails", async () => {
    encode.mockImplementation(callback => callback(null));
    await expect(prepareProfilePhoto(jpg())).rejects.toThrow("could not be resized"); expect(close).toHaveBeenCalledOnce();
  });
});
