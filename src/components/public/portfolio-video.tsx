"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

export function PortfolioVideo({ src, label }: { src: string; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
  }, []);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  return (
    <>
      <video ref={videoRef} src={src} muted loop playsInline preload="metadata" aria-label={label} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      <button className="portfolio-video-control" type="button" onClick={togglePlayback} aria-label={isPlaying ? "Pause video" : "Play video"}>
        {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
      </button>
    </>
  );
}
