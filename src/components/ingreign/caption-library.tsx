"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Copy, ImagePlus } from "lucide-react";
import { buildRecurringIngreignMarkers, replaceIngreignCaptionTokens, type IngreignCaptionPreset } from "@/lib/ingreign";

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function CaptionLibrary({ presets }: { presets: IngreignCaptionPreset[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const markers = useMemo(() => {
    const year = Number(todayKey().slice(0, 4));
    return [...buildRecurringIngreignMarkers(year), ...buildRecurringIngreignMarkers(year + 1)].filter((marker) => marker.date >= todayKey());
  }, []);

  async function copyPreset(preset: IngreignCaptionPreset) {
    const marker = markers.find((item) => item.presetKey === preset.preset_key) ?? markers[0];
    const caption = marker ? replaceIngreignCaptionTokens(preset.caption, marker) : preset.caption;
    await navigator.clipboard.writeText(caption);
    setCopied(preset.id);
    window.setTimeout(() => setCopied((value) => value === preset.id ? null : value), 1800);
  }

  return (
    <div className="ingreign-caption-grid">
      {presets.map((preset, index) => (
        <article key={preset.id}>
          <header><span>{String(index + 1).padStart(2, "0")}</span><strong>{preset.label}</strong></header>
          <p>{preset.caption}</p>
          <div>
            <button type="button" onClick={() => void copyPreset(preset)}>
              {copied === preset.id ? <Check size={16} /> : <Copy size={16} />}
              {copied === preset.id ? "Copied" : "Copy caption"}
            </button>
            <Link href={`/ingreign/generator?preset=${preset.preset_key}`}><ImagePlus size={16} /> Create post</Link>
          </div>
        </article>
      ))}
    </div>
  );
}

