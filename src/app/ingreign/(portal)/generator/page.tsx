import { ImagePlus } from "lucide-react";
import { PostGenerator } from "@/components/ingreign/post-generator";
import { getIngreignGeneratorData } from "@/lib/data/ingreign";
import { buildRecurringIngreignMarkers, manualEventToMarker, type IngreignPresetKey } from "@/lib/ingreign";

export default async function IngreignGeneratorPage({ searchParams }: { searchParams: Promise<{ date?: string; event?: string; preset?: string; marker?: string }> }) {
  const [data, query] = await Promise.all([getIngreignGeneratorData(), searchParams]);
  if (!data) return null;
  const requestedPreset = data.presets.find((preset) => preset.preset_key === query.preset);
  const requestedYear = Number(query.date?.slice(0, 4)) || new Date().getUTCFullYear();
  const recurring = [...buildRecurringIngreignMarkers(requestedYear - 1), ...buildRecurringIngreignMarkers(requestedYear), ...buildRecurringIngreignMarkers(requestedYear + 1)];
  let initialMarker = query.marker?.startsWith("manual-")
    ? data.manualEvents.map(manualEventToMarker).find((marker) => marker.id === query.marker) ?? null
    : recurring.find((marker) => marker.id === query.marker || (marker.date === query.date && marker.presetKey === query.preset)) ?? null;
  if (!initialMarker && requestedPreset && query.date) {
    const eventDate = query.event ?? query.date;
    const parts = new Intl.DateTimeFormat("en-AU", { month: "long", day: "2-digit", timeZone: "UTC" }).formatToParts(new Date(`${eventDate}T00:00:00Z`));
    const values = new Map(parts.map((part) => [part.type, part.value]));
    initialMarker = {
      id: "query",
      date: query.date,
      eventDate,
      title: requestedPreset.label,
      calendarLabel: requestedPreset.label,
      presetKey: requestedPreset.preset_key as IngreignPresetKey,
      generatorMode: requestedPreset.generator_mode,
      monthLabel: values.get("month") ?? "",
      dayLabel: values.get("day") ?? "",
      captionOverride: null,
      notificationEnabled: false,
      isManual: false,
    };
  }
  return (
    <>
      <header className="ingreign-page-header">
        <div><span><ImagePlus size={15} /> Event post generator</span><h1>From photo<br />to post.</h1></div>
        <p>Upload a photo, adjust the date or countdown, then download a polished PNG. Your image never leaves this device.</p>
      </header>
      <PostGenerator presets={data.presets} initialMarker={initialMarker} />
    </>
  );
}

