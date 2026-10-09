"use client";

import { useEffect, useRef, useState } from "react";

export function LazyAmbientVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVisibleRef = useRef(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    if (typeof window.IntersectionObserver === "undefined") {
      isVisibleRef.current = true;
      const fallbackTimer = window.setTimeout(() => setShouldLoad(true), 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const observer = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting) {
        setShouldLoad(true);
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    }, { rootMargin: "320px 0px" });

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={videoRef}
      src={shouldLoad ? src : undefined}
      muted
      loop
      playsInline
      preload={shouldLoad ? "metadata" : "none"}
      aria-hidden="true"
      onCanPlay={(event) => {
        if (isVisibleRef.current) void event.currentTarget.play().catch(() => undefined);
      }}
    />
  );
}
