"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, Maximize2, X } from "lucide-react";
import { PortfolioVideo } from "@/components/public/portfolio-video";
import { getPortfolioDisplaySizeFromDimensions } from "@/lib/portfolio";
import type { PortfolioItem } from "@/lib/types";

type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

export function PortfolioGallery({
  items,
  firstVideoId,
  priorityFirst = false,
}: {
  items: PortfolioItem[];
  firstVideoId?: string | null;
  priorityFirst?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [detectedLayouts, setDetectedLayouts] = useState<Record<string, { displaySize: PortfolioItem["display_size"]; ratio: number }>>({});
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mediaFrameRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedItem = selectedIndex === null ? null : items[selectedIndex];

  const recordDimensions = useCallback((itemId: string, width: number, height: number) => {
    if (!width || !height) return;
    const ratio = width / height;
    const displaySize = getPortfolioDisplaySizeFromDimensions(width, height);
    setDetectedLayouts((current) => {
      const existing = current[itemId];
      if (existing?.displaySize === displaySize && Math.abs(existing.ratio - ratio) < 0.001) return current;
      return { ...current, [itemId]: { displaySize, ratio } };
    });
  }, []);

  const closeViewer = useCallback(() => {
    setSelectedIndex(null);
    globalThis.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);

  const showPrevious = useCallback(() => {
    setSelectedIndex((current) => current === null ? null : (current - 1 + items.length) % items.length);
  }, [items.length]);

  const showNext = useCallback(() => {
    setSelectedIndex((current) => current === null ? null : (current + 1) % items.length);
  }, [items.length]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.querySelectorAll<HTMLVideoElement>(".portfolio-video-element").forEach((video) => video.pause());
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft" && items.length > 1) showPrevious();
      if (event.key === "ArrowRight" && items.length > 1) showNext();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeViewer, items.length, selectedIndex, showNext, showPrevious]);

  async function enterFullscreen() {
    const frame = mediaFrameRef.current;
    if (!frame) return;
    try {
      if (frame.requestFullscreen) {
        await frame.requestFullscreen();
        return;
      }
      const video = frame.querySelector("video") as FullscreenVideo | null;
      video?.webkitEnterFullscreen?.();
    } catch {
      // Native controls still expose the device's video fullscreen option.
    }
  }

  const lightbox = selectedItem && typeof document !== "undefined" ? createPortal(
    <div
      className="portfolio-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Full-screen view of ${selectedItem.alt_text}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeViewer();
      }}
    >
      <div className="portfolio-lightbox-toolbar">
        <div>
          <span>{selectedItem.media_kind === "video" ? "Motion" : "Still"}</span>
          <small>{String((selectedIndex ?? 0) + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</small>
        </div>
        <div>
          <button type="button" onClick={enterFullscreen} aria-label="Enter native full screen">
            <Maximize2 size={17} /> <span>Full screen</span>
          </button>
          <button ref={closeButtonRef} type="button" onClick={closeViewer} aria-label="Close full-screen viewer">
            <X size={19} />
          </button>
        </div>
      </div>

      <div ref={mediaFrameRef} className="portfolio-lightbox-media" key={selectedItem.id}>
        {selectedItem.media_kind === "video" ? (
          <video
            src={selectedItem.public_url}
            poster={selectedItem.poster_url ?? undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            aria-label={selectedItem.alt_text}
          />
        ) : (
          <Image
            src={selectedItem.public_url}
            alt={selectedItem.alt_text}
            fill
            priority
            sizes="100vw"
          />
        )}
      </div>

      {items.length > 1 ? (
        <div className="portfolio-lightbox-navigation">
          <button type="button" onClick={showPrevious} aria-label="View previous portfolio item"><ChevronLeft size={20} /></button>
          <button type="button" onClick={showNext} aria-label="View next portfolio item"><ChevronRight size={20} /></button>
        </div>
      ) : null}
      <p className="portfolio-lightbox-label">{selectedItem.alt_text}</p>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div className="portfolio-gallery">
        {items.map((item, index) => {
          const detectedLayout = detectedLayouts[item.id];
          const displaySize = detectedLayout?.displaySize ?? item.display_size;
          return (
          <article
            className={`portfolio-tile portfolio-tile-${displaySize}`}
            key={item.id}
          >
            <div className="portfolio-media" style={detectedLayout ? { aspectRatio: detectedLayout.ratio } : undefined}>
              {item.media_kind === "video" ? (
                <PortfolioVideo
                  src={item.public_url}
                  poster={item.poster_url}
                  label={item.alt_text}
                  soundEnabled={item.id === firstVideoId}
                  onDimensions={(width, height) => recordDimensions(item.id, width, height)}
                />
              ) : (
                <Image
                  src={item.public_url}
                  alt={item.alt_text}
                  fill
                  priority={priorityFirst && index === 0}
                  sizes="(max-width: 1050px) 50vw, 25vw"
                  onLoad={(event) => recordDimensions(item.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                />
              )}
              <div className="portfolio-media-shade" />
              <span className="portfolio-kind">{item.media_kind === "video" ? "Motion" : "Still"}</span>
              <button
                className="portfolio-expand-button"
                type="button"
                onClick={(event) => {
                  lastTriggerRef.current = event.currentTarget;
                  setSelectedIndex(index);
                }}
                aria-label={`View ${item.alt_text} full screen`}
              >
                <Expand size={16} />
                <span>View</span>
              </button>
            </div>
          </article>
          );
        })}
      </div>
      {lightbox}
    </>
  );
}
