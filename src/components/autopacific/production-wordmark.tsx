import Image from "next/image";
import { PRODUCTION_WORDMARK } from "@/lib/production-branding";
import "./production-wordmark.css";

/** Frames the approved artwork without changing its pixels or transparent background. */
export function ProductionWordmark({ className = "", preload = false, sizes = "(max-width: 640px) 160px, 220px" }: { className?: string; preload?: boolean; sizes?: string }) {
  return (
    <span className={`production-wordmark ${className}`}>
      <span className="production-wordmark-frame">
        <Image {...PRODUCTION_WORDMARK} alt={PRODUCTION_WORDMARK.alt} preload={preload} sizes={sizes} />
      </span>
    </span>
  );
}
