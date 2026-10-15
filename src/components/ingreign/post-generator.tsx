"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, ImagePlus, RefreshCcw, Sparkles, Upload } from "lucide-react";
import {
  getCountdownValue,
  markerDateParts,
  replaceIngreignCaptionTokens,
  type IngreignCalendarMarker,
  type IngreignCaptionPreset,
  type IngreignGeneratorMode,
  type IngreignPresetKey,
} from "@/lib/ingreign";

const STORAGE_KEY = "ingreign-generator-v1";
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1350;

type SavedInputs = {
  date: string;
  eventDate: string;
  presetKey: IngreignPresetKey;
  mode: IngreignGeneratorMode;
  monthLabel: string;
  dayLabel: string;
  caption: string;
};

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be read."));
    image.src = url;
  });
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement) {
  const scale = Math.max(OUTPUT_WIDTH / image.naturalWidth, OUTPUT_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (OUTPUT_WIDTH - width) / 2, (OUTPUT_HEIGHT - height) / 2, width, height);
}

function splitDateWidth(context: CanvasRenderingContext2D, monthLabel: string, dayLabel: string, maxWidth: number, fontFamily: string) {
  let monthSize = 112;
  let daySize = 112;
  const gap = 26;
  while (monthSize > 66) {
    context.font = `900 ${monthSize}px ${fontFamily}`;
    const monthWidth = context.measureText(monthLabel).width;
    context.font = `900 ${daySize}px ${fontFamily}`;
    const dayWidth = context.measureText(dayLabel).width;
    if (monthWidth + gap + dayWidth <= maxWidth) return { monthSize, daySize, monthWidth, gap };
    monthSize -= 4;
    daySize -= 4;
  }
  context.font = `900 ${monthSize}px ${fontFamily}`;
  return { monthSize, daySize, monthWidth: context.measureText(monthLabel).width, gap };
}

export function PostGenerator({ presets, initialMarker }: { presets: IngreignCaptionPreset[]; initialMarker: IngreignCalendarMarker | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [message, setMessage] = useState("");
  const fallbackPreset = presets[0];
  const initialDate = initialMarker?.date ?? todayKey();
  const initialParts = markerDateParts(initialDate);
  const initialPreset = presets.find((preset) => preset.preset_key === initialMarker?.presetKey) ?? fallbackPreset;
  const [date, setDate] = useState(initialDate);
  const [eventDate, setEventDate] = useState(initialMarker?.eventDate ?? initialDate);
  const [presetKey, setPresetKey] = useState<IngreignPresetKey>(initialPreset?.preset_key ?? "date_post");
  const [mode, setMode] = useState<IngreignGeneratorMode>(initialMarker?.generatorMode ?? initialPreset?.generator_mode ?? "date_only");
  const [monthLabel, setMonthLabel] = useState(initialMarker?.monthLabel ?? initialParts.monthLabel);
  const [dayLabel, setDayLabel] = useState(initialMarker?.dayLabel ?? initialParts.dayLabel);
  const [caption, setCaption] = useState(() => {
    if (!initialPreset) return "";
    return initialMarker?.captionOverride ?? replaceIngreignCaptionTokens(initialPreset.caption, initialMarker ?? {
      date: initialDate,
      eventDate: initialDate,
      monthLabel: initialParts.monthLabel,
      dayLabel: initialParts.dayLabel,
    });
  });

  const presetByKey = useMemo(() => new Map(presets.map((preset) => [preset.preset_key, preset])), [presets]);

  useEffect(() => {
    if (initialMarker || typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as SavedInputs | null;
      if (!saved) return;
      setDate(saved.date);
      setEventDate(saved.eventDate);
      setPresetKey(saved.presetKey);
      setMode(saved.mode);
      setMonthLabel(saved.monthLabel);
      setDayLabel(saved.dayLabel);
      setCaption(saved.caption);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [initialMarker]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ date, eventDate, presetKey, mode, monthLabel, dayLabel, caption } satisfies SavedInputs));
  }, [caption, date, dayLabel, eventDate, mode, monthLabel, presetKey]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    await document.fonts.ready;
    const fontScope = canvas.closest(".ingreign-root") ?? document.documentElement;
    const configuredFont = getComputedStyle(fontScope).getPropertyValue("--font-ingreign").trim();
    const fontFamily = configuredFont ? `${configuredFont}, Arial, sans-serif` : "Arial, sans-serif";
    context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    if (imageUrl) {
      const uploadedImage = await loadImage(imageUrl);
      drawCover(context, uploadedImage);
    } else {
      const gradient = context.createLinearGradient(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      gradient.addColorStop(0, "#4b1018");
      gradient.addColorStop(0.55, "#16090d");
      gradient.addColorStop(1, "#080608");
      context.fillStyle = gradient;
      context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      context.fillStyle = "rgba(239,112,137,.12)";
      context.beginPath();
      context.arc(840, 260, 330, 0, Math.PI * 2);
      context.fill();
    }

    const overlay = await loadImage("/ingreign/generator-overlay.png");
    context.drawImage(overlay, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.shadowColor = "rgba(0,0,0,.38)";
    context.shadowBlur = 18;
    context.shadowOffsetY = 4;

    const countdown = getCountdownValue(mode);
    if (countdown) {
      context.fillStyle = "rgba(255,255,255,.72)";
      context.font = `600 30px ${fontFamily}`;
      context.fillText("COUNTING DOWN", OUTPUT_WIDTH / 2, 382);
      context.fillStyle = "#ffffff";
      context.font = `900 242px ${fontFamily}`;
      context.fillText(countdown, OUTPUT_WIDTH / 2, 602);
      context.fillStyle = "rgba(255,255,255,.72)";
      context.font = `900 55px ${fontFamily}`;
      context.fillText("DAYS", OUTPUT_WIDTH / 2, 676);
    }

    context.shadowBlur = 12;
    context.textAlign = "left";
    const dateY = countdown ? 1060 : 1005;
    const sizing = splitDateWidth(context, monthLabel, dayLabel, 930, fontFamily);
    const startX = 68;
    context.fillStyle = "#ffffff";
    context.font = `900 ${sizing.monthSize}px ${fontFamily}`;
    context.fillText(monthLabel, startX, dateY);
    context.fillStyle = "#ef7089";
    context.font = `900 ${sizing.daySize}px ${fontFamily}`;
    context.fillText(dayLabel, startX + sizing.monthWidth + sizing.gap, dateY);
    context.shadowColor = "transparent";
  }, [dayLabel, imageUrl, mode, monthLabel]);

  useEffect(() => {
    void draw().catch(() => setMessage("The preview could not be rendered. Try another image."));
  }, [draw]);

  function selectPreset(nextKey: IngreignPresetKey) {
    const preset = presetByKey.get(nextKey);
    if (!preset) return;
    setPresetKey(nextKey);
    setMode(preset.generator_mode);
    setCaption(replaceIngreignCaptionTokens(preset.caption, { date, eventDate, monthLabel, dayLabel }));
  }

  function updateDate(nextDate: string) {
    setDate(nextDate);
    setEventDate(nextDate);
    const parts = markerDateParts(nextDate);
    setMonthLabel(parts.monthLabel);
    setDayLabel(parts.dayLabel);
    const preset = presetByKey.get(presetKey);
    if (preset) setCaption(replaceIngreignCaptionTokens(preset.caption, { date: nextDate, eventDate: nextDate, ...parts }));
  }

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choose a photo file to continue.");
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    setMessage("");
  }

  async function copyCaption() {
    await navigator.clipboard.writeText(caption);
    setMessage("Caption copied to your clipboard.");
  }

  async function downloadPost() {
    if (!imageUrl) {
      setMessage("Upload a photo before generating your post.");
      return;
    }
    await draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
    if (!blob) {
      setMessage("The PNG could not be created. Please try again.");
      return;
    }
    await navigator.clipboard.writeText(caption).catch(() => undefined);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ingreign-${date}-${presetKey}.png`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("PNG downloaded and caption copied.");
  }

  return (
    <div className="ingreign-generator-layout">
      <section className="ingreign-generator-preview">
        <div className="ingreign-preview-heading"><span><Sparkles size={14} /> Live preview</span><strong>1080 × 1350</strong></div>
        <canvas ref={canvasRef} width={OUTPUT_WIDTH} height={OUTPUT_HEIGHT} aria-label="INGREIGN post preview" />
      </section>

      <section className="ingreign-generator-controls">
        <div className="ingreign-upload-control">
          <input id="ingreign-photo" type="file" accept="image/*" onChange={(event) => chooseImage(event.target.files?.[0])} />
          <label htmlFor="ingreign-photo"><Upload size={19} /><span><strong>{imageName || "Upload your photo"}</strong><small>The image stays on this device and is never uploaded.</small></span></label>
        </div>

        <div className="ingreign-control-grid">
          <label>Post type<select value={presetKey} onChange={(event) => selectPreset(event.target.value as IngreignPresetKey)}>{presets.map((preset) => <option value={preset.preset_key} key={preset.id}>{preset.label}</option>)}</select></label>
          <label>Post date<input type="date" value={date} onChange={(event) => updateDate(event.target.value)} /></label>
          <label>Month<input value={monthLabel} maxLength={20} onChange={(event) => setMonthLabel(event.target.value)} /></label>
          <label>Day<input value={dayLabel} maxLength={4} onChange={(event) => setDayLabel(event.target.value)} /></label>
        </div>

        <fieldset className="ingreign-mode-control">
          <legend>Countdown treatment</legend>
          {(["countdown_3", "countdown_2", "countdown_1", "date_only"] as const).map((value) => (
            <button type="button" key={value} className={mode === value ? "is-active" : undefined} onClick={() => setMode(value)}>
              {value === "date_only" ? "Date only" : `${value.replace("countdown_", "0")} ${value === "countdown_1" ? "day" : "days"}`}
            </button>
          ))}
        </fieldset>

        <label className="ingreign-caption-field">Caption<textarea rows={9} value={caption} onChange={(event) => setCaption(event.target.value)} /></label>

        <div className="ingreign-generator-actions">
          <button type="button" className="is-secondary" onClick={() => void draw()}><RefreshCcw size={17} /> Refresh preview</button>
          <button type="button" className="is-secondary" onClick={() => void copyCaption()}><Copy size={17} /> Copy caption</button>
          <button type="button" className="is-primary" onClick={() => void downloadPost()}><Download size={17} /> Generate PNG</button>
        </div>
        {message ? <p className="ingreign-generator-message"><CheckCircle2 size={15} /> {message}</p> : null}
      </section>
    </div>
  );
}

