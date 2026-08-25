"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

const protectedMediaSelector = ".portfolio-gallery img, .portfolio-gallery video, .portfolio-lightbox img, .portfolio-lightbox video, .portfolio-logo-marquee img, .portfolio-media, .portfolio-lightbox-media";

function isProtectedMediaTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(protectedMediaSelector));
}

export function PortfolioProtection() {
  const [noticeVisible, setNoticeVisible] = useState(false);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function showNotice() {
      setNoticeVisible(true);
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => setNoticeVisible(false), 2400);
    }

    function preventMediaContextMenu(event: MouseEvent) {
      if (!isProtectedMediaTarget(event.target)) return;
      event.preventDefault();
      showNotice();
    }

    function preventMediaDrag(event: DragEvent) {
      if (!isProtectedMediaTarget(event.target)) return;
      event.preventDefault();
    }

    function preventSaveShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== "s") return;
      if (!document.querySelector(".portfolio-page")) return;
      event.preventDefault();
      showNotice();
    }

    document.addEventListener("contextmenu", preventMediaContextMenu);
    document.addEventListener("dragstart", preventMediaDrag);
    window.addEventListener("keydown", preventSaveShortcut);
    return () => {
      document.removeEventListener("contextmenu", preventMediaContextMenu);
      document.removeEventListener("dragstart", preventMediaDrag);
      window.removeEventListener("keydown", preventSaveShortcut);
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  return (
    <div className={`portfolio-protection-notice ${noticeVisible ? "is-visible" : ""}`} role="status" aria-live="polite" aria-hidden={!noticeVisible}>
      <ShieldCheck size={16} aria-hidden="true" />
      <span><strong>Private preview</strong><small>Media is available for viewing only.</small></span>
    </div>
  );
}
