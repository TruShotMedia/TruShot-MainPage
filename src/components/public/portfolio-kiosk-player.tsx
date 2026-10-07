"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { isLandscapeMediaDimensions } from "@/lib/portfolio";
import type { PortfolioItem } from "@/lib/types";

const ERROR_ADVANCE_DELAY_MS = 1_200;
const POSTER_VALIDATION_TIMEOUT_MS = 10_000;

function posterIsLandscape(posterUrl: string | null): Promise<boolean> {
  if (!posterUrl) return Promise.resolve(false);
  return new Promise((resolve) => {
    const poster = new window.Image();
    let isSettled = false;
    const finish = (isLandscape: boolean) => {
      if (isSettled) return;
      isSettled = true;
      window.clearTimeout(timeout);
      poster.onload = null;
      poster.onerror = null;
      resolve(isLandscape);
    };
    const timeout = window.setTimeout(() => finish(false), POSTER_VALIDATION_TIMEOUT_MS);
    poster.onload = () => finish(isLandscapeMediaDimensions(poster.naturalWidth, poster.naturalHeight));
    poster.onerror = () => finish(false);
    poster.src = posterUrl;
  });
}

export function PortfolioKioskPlayer({ items }: { items: PortfolioItem[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [posterValidation, setPosterValidation] = useState<{ key: string; items: PortfolioItem[] } | null>(null);
  const [rejectedItemIds, setRejectedItemIds] = useState<Set<string>>(() => new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const errorAdvanceTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const validationKey = items.map((item) => `${item.id}:${item.poster_url ?? ""}`).join("|");
  const posterValidatedItems = posterValidation?.key === validationKey ? posterValidation.items : null;
  const playableItems = (posterValidatedItems ?? []).filter((item) => !rejectedItemIds.has(item.id));
  const currentItem = playableItems[currentIndex];

  useEffect(() => {
    let isCurrent = true;

    void Promise.all(items.map(async (item) => ({
      item,
      isLandscape: await posterIsLandscape(item.poster_url),
    }))).then((results) => {
      if (!isCurrent) return;
      setPosterValidation({
        key: validationKey,
        items: results.filter((result) => result.isLandscape).map((result) => result.item),
      });
      setCurrentIndex(0);
      setIsReady(false);
      setRejectedItemIds(new Set());
    });

    return () => {
      isCurrent = false;
    };
  }, [items, validationKey]);

  const showNext = useCallback(() => {
    if (playableItems.length < 2) return;
    if (errorAdvanceTimerRef.current !== null) {
      globalThis.clearTimeout(errorAdvanceTimerRef.current);
      errorAdvanceTimerRef.current = null;
    }
    setIsReady(false);
    setCurrentIndex((index) => (index + 1) % playableItems.length);
  }, [playableItems.length]);

  const rejectNonLandscapeItem = useCallback((itemId: string) => {
    setIsReady(false);
    setRejectedItemIds((current) => {
      if (current.has(itemId)) return current;
      const next = new Set(current);
      next.add(itemId);
      return next;
    });
    setCurrentIndex((index) => {
      const remainingCount = playableItems.length - 1;
      return remainingCount > 0 && index < remainingCount ? index : 0;
    });
  }, [playableItems.length]);

  const confirmLandscapeVideo = useCallback((video: HTMLVideoElement, itemId: string) => {
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return true;
    if (isLandscapeMediaDimensions(video.videoWidth, video.videoHeight)) return true;
    rejectNonLandscapeItem(itemId);
    return false;
  }, [rejectNonLandscapeItem]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.volume = 0;
    void video.play().catch(() => undefined);
  }, [currentItem?.id]);

  useEffect(() => () => {
    if (errorAdvanceTimerRef.current !== null) globalThis.clearTimeout(errorAdvanceTimerRef.current);
  }, []);

  if (posterValidatedItems === null) {
    return (
      <main className="portfolio-kiosk portfolio-kiosk-empty" aria-label="Preparing TruShot Media landscape portfolio kiosk">
        <Image src="/brand/logo-white.png" alt="TruShot Media" width={520} height={193} priority />
        <p>Checking landscape films…</p>
      </main>
    );
  }

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
          loop={playableItems.length === 1}
          preload="auto"
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          draggable={false}
          aria-label={currentItem.alt_text}
          onLoadedMetadata={(event) => {
            confirmLandscapeVideo(event.currentTarget, currentItem.id);
          }}
          onCanPlay={(event) => {
            if (!confirmLandscapeVideo(event.currentTarget, currentItem.id)) return;
            event.currentTarget.muted = true;
            event.currentTarget.volume = 0;
            setIsReady(true);
            void event.currentTarget.play().catch(() => undefined);
          }}
          onLoadedData={(event) => {
            if (confirmLandscapeVideo(event.currentTarget, currentItem.id)) setIsReady(true);
          }}
          onEnded={showNext}
          onError={() => {
            setIsReady(false);
            if (playableItems.length > 1 && errorAdvanceTimerRef.current === null) {
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

      <p className="sr-only" aria-live="polite">Playing {currentItem.alt_text}, film {currentIndex + 1} of {playableItems.length}.</p>
    </main>
  );
}
