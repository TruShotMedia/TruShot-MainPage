"use client";

/* eslint-disable @next/next/no-img-element -- airline marks are small third-party carrier assets with an error fallback. */

import { Plane } from "lucide-react";
import { useState } from "react";
import { airlineLogoUrl } from "@/lib/airlines";

type AirlineLogoProps = {
  code?: string | null;
  name: string;
  className?: string;
};

export function AirlineLogo({ code, name, className = "" }: AirlineLogoProps) {
  const [failed, setFailed] = useState(false);
  const src = airlineLogoUrl(code);

  if (!src || failed) {
    return <span className={`airline-logo airline-logo-fallback ${className}`.trim()} aria-label={name ? `${name} airline` : "Airline"}><Plane size={13} aria-hidden="true" /></span>;
  }

  return (
    <span className={`airline-logo ${className}`.trim()}>
      <img alt={`${name} logo`} src={src} onError={() => setFailed(true)} />
    </span>
  );
}
