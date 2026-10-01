"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PortfolioItem } from "@/lib/types";

const ERROR_ADVANCE_DELAY_MS = 1_200;

export function PortfolioKioskPlayer({ items }: { items: PortfolioItem[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const errorAdvanceTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const currentItem = items[currentIndex];

  const showNext = useCallback(() => {
    if (items.length < 2) return;
    if (errorAdvanceTimerRef.current !== null) {
      globalThis.clearTimeout(errorAdvanceTimerRef.current);
      errorAdvanceTimerRef.current = null;
    }
    setIsReady(false);
    setCurrentIndex((index) => (index + 1) % items.length);
  }, [items.length]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.volume = 0;
    void video.play().catch(() => undefined);
  }, [currentIndex]);

  useEffect(() => () => {
    if (errorAdvanceTimerRef.current !== null) globalThis.clearTimeout(errorAdvanceTimerRef.current);
  }, []);

  if (!currentItem) {
    return (
      <main className="portfolio-kiosk portfolio-kiosk-empty">
        <Image src="/brand/logo-white.png" alt="TruShot Media" width={520} height={193} priority />
        <p>No landscape portfolio films are currently published.</p>
      </main>
    );
  }

  return (
    <main className="portfolio-page portfolio-kiosk" aria-label="TruShot Media landscape portfolio kiosk">
      <div className={`portfolio-kiosk-loading ${isReady ? "is-hidden" : ""}`} aria-hidden={isReady}>
        <Image src="/brand/logo-white.png" alt="" width={260} height={97} priority />
        <span>Preparing film {String(currentIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>
      </div>

      <div className="portfolio-kiosk-media" key={currentItem.id}>
        <video
          ref={videoRef}
          className={isReady ? "is-ready" : ""}
          src={currentItem.public_url}
          poster={currentItem.poster_url ?? undefined}
          muted
          autoPlay
          playsInline
          loop={items.length === 1}
          preload="auto"
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          draggable={false}
          aria-label={currentItem.alt_text}
          onCanPlay={(event) => {
            event.currentTarget.muted = true;
            event.currentTarget.volume = 0;
            setIsReady(true);
            void event.currentTarget.play().catch(() => undefined);
          }}
          onLoadedData={() => setIsReady(true)}
          onEnded={showNext}
          onError={() => {
            setIsReady(false);
            if (items.length > 1 && errorAdvanceTimerRef.current === null) {
              errorAdvanceTimerRef.current = globalThis.setTimeout(showNext, ERROR_ADVANCE_DELAY_MS);
            }
          }}
          onVolumeChange={(event) => {
            if (event.currentTarget.muted && event.currentTarget.volume === 0) return;
            event.currentTarget.muted = true;
            event.currentTarget.volume = 0;
          }}
        />
      </div>

      <p className="sr-only" aria-live="polite">Playing {currentItem.alt_text}, film {currentIndex + 1} of {items.length}.</p>
    </main>
  );
}
