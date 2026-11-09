import { z } from "zod";
import type { TabletJobRecord } from "./types";

export const jobLocationSchema = z.object({
  version: z.literal(1),
  label: z.string().trim().min(1).max(300),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  precision: z.enum(["address", "place", "street", "city", "region", "manual"]),
  provider: z.enum(["geoapify", "manual"]),
  placeId: z.string().max(500).optional(),
  city: z.string().max(150).optional(),
  country: z.string().max(100).optional(),
  attribution: z.string().max(1000),
}).strict();
export type JobLocation = z.infer<typeof jobLocationSchema>;
export const jobLocationInputSchema = z.string().max(5000).transform((value, ctx) => {
  if (!value.trim()) return null;
  try { return JSON.parse(value) as unknown; }
  catch { ctx.addIssue({ code: "custom", message: "Choose the location again before saving." }); return z.NEVER; }
}).pipe(jobLocationSchema.nullable());

export function readJobLocation(value: unknown): JobLocation | null {
  const parsed = jobLocationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Only whole, unambiguous aliases. Never rewrite arbitrary venue/address text. */
export function normalizeLocationQuery(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  const aliases: Record<string, string> = { mel: "Melbourne, Victoria, Australia", melbourne: "Melbourne, Victoria, Australia", bne: "Brisbane, Queensland, Australia", brisbane: "Brisbane, Queensland, Australia", syd: "Sydney, New South Wales, Australia", sydney: "Sydney, New South Wales, Australia" };
  return aliases[cleaned.toLowerCase()] ?? cleaned;
}

export function locationIsApproximate(location: JobLocation) {
  return ["city", "region", "street"].includes(location.precision);
}

export type JobLocationGroup = { id: string; location: JobLocation; jobs: TabletJobRecord[] };
export function groupJobsByLocation(jobs: TabletJobRecord[]): JobLocationGroup[] {
  const groups = new Map<string, JobLocationGroup>();
  for (const job of jobs) {
    const location = readJobLocation(job.location_details);
    if (!location || location.label !== job.location) continue;
    const id = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
    const group = groups.get(id);
    if (group) group.jobs.push(job); else groups.set(id, { id, location, jobs: [job] });
  }
  for (const group of groups.values()) group.jobs.sort((a,b) => (b.shoot_date ?? b.due_date ?? "").localeCompare(a.shoot_date ?? a.due_date ?? "") || a.title.localeCompare(b.title));
  return [...groups.values()].sort((a,b) => b.jobs.length-a.jobs.length || a.location.label.localeCompare(b.location.label));
}

export function filterMapJobs(jobs: TabletJobRecord[], { search = "", status = "all", from = "", to = "" }: { search?: string; status?: string; from?: string; to?: string }) {
  const query = search.trim().toLocaleLowerCase();
  return jobs.filter(job => {
    const date = job.shoot_date ?? job.due_date;
    return (!query || `${job.title} ${job.location ?? ""}`.toLocaleLowerCase().includes(query))
      && (status === "all" || job.status_id === status)
      && (!from || Boolean(date && date >= from)) && (!to || Boolean(date && date <= to));
  });
}

type GeoapifyResult = { formatted?: string; name?: string; address_line1?: string; address_line2?: string; lat?: number; lon?: number; result_type?: string; place_id?: string; city?: string; country?: string; datasource?: { attribution?: string; sourcename?: string } };
export function geoapifyLocation(result: GeoapifyResult | null): JobLocation | null {
  if (!result || typeof result !== "object") return null;
  const label = (result.name && result.formatted && !result.formatted.startsWith(result.name) ? `${result.name}, ${result.formatted}` : result.formatted ?? result.address_line1 ?? "").slice(0,300);
  const precision = result.result_type === "building" || result.result_type === "amenity" ? "address" : result.result_type === "street" ? "street" : ["city", "suburb", "postcode", "district"].includes(result.result_type ?? "") ? "city" : "region";
  return readJobLocation({ version: 1,label,latitude: result.lat,longitude: result.lon,precision,provider: "geoapify",placeId: result.place_id,city: result.city,country: result.country,attribution: result.datasource?.attribution ?? "Geoapify · OpenStreetMap contributors · OpenAddresses · GeoNames" });
}
