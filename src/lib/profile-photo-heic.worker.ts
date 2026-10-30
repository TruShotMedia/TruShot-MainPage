/// <reference lib="webworker" />
// heic-to is LGPL-3.0-or-later; notices and corresponding source: /licenses/heic-to/.
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async ({ data: file }: MessageEvent<File>) => {
  try {
    const { heicTo } = await import("heic-to/next");
    const bitmap = await heicTo({ blob: file, type: "bitmap", options: { resizeWidth: 1024, resizeQuality: "high" } });
    scope.postMessage({ bitmap }, [bitmap]);
  } catch {
    scope.postMessage({ error: "This HEIC/HEIF photo could not be opened. Try a JPG copy or another photo." });
  }
};
