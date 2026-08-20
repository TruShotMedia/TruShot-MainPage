"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

export function PortfolioVideo({ src, label, soundEnabled = false }: { src: string; label: string; soundEnabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(!soundEnabled);

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

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    if (video.paused) {
      void video.play().catch(() => undefined);
    }
  }

  return (
    <>
      <video ref={videoRef} src={src} muted={isMuted} loop playsInline preload="metadata" aria-label={label} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      <div className="portfolio-video-controls">
        <button className="portfolio-video-control" type="button" onClick={togglePlayback} aria-label={isPlaying ? "Pause video" : soundEnabled && !isMuted ? "Play video with sound" : "Play video"}>
          {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </button>
        {soundEnabled ? (
          <button className="portfolio-video-control portfolio-video-sound-control" type="button" onClick={toggleSound} aria-label={isMuted ? "Unmute video" : "Mute video"} aria-pressed={isMuted}>
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        ) : null}
      </div>
    </>
  );
}
