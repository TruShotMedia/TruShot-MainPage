"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Pause, Play, Volume2, VolumeX } from "lucide-react";

export function PortfolioVideo({
  src,
  label,
  poster,
  soundEnabled = false,
  onDimensions,
}: {
  src: string;
  label: string;
  poster?: string | null;
  soundEnabled?: boolean;
  onDimensions?: (width: number, height: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(!soundEnabled);
  const [shouldLoad, setShouldLoad] = useState(soundEnabled);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const Observer = globalThis.IntersectionObserver;
    if (typeof Observer === "undefined") {
      const timeout = globalThis.setTimeout(() => setShouldLoad(true), 0);
      return () => globalThis.clearTimeout(timeout);
    }
    const observer = new Observer(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "500px 0px" });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
  }, [shouldLoad]);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (!shouldLoad) {
      setShouldLoad(true);
      return;
    }
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
      <div className={`portfolio-video-placeholder ${isReady ? "is-ready" : ""} ${hasError ? "has-error" : ""}`} aria-hidden="true">
        {!hasError && <LoaderCircle className="spin" size={19} />}
        <span>{hasError ? "Tap play to retry" : poster ? "Loading motion" : "TruShot motion"}</span>
      </div>
      <video
        ref={videoRef}
        className={`portfolio-video-element ${poster ? "has-poster" : ""} ${isReady ? "is-ready" : ""}`}
        src={shouldLoad ? src : undefined}
        poster={poster ?? undefined}
        muted={isMuted}
        loop
        playsInline
        preload={shouldLoad ? "metadata" : "none"}
        aria-label={label}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          if (video.videoWidth && video.videoHeight) onDimensions?.(video.videoWidth, video.videoHeight);
        }}
        onLoadedData={() => { setIsReady(true); setHasError(false); }}
        onCanPlay={() => { setIsReady(true); setHasError(false); }}
        onError={() => { setHasError(true); setIsReady(false); }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
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
