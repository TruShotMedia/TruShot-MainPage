import type { JobLocation } from "./job-location";

// Saved building coordinates from the workspace's verified Geoapify results.
// The B unit identifier is retained in the display address; the Geebung pin
// refers to the building, not an inferred unit entrance.
export const GEEBUNG_JOB_LOCATION: JobLocation = {
  version: 1,
  label: "352b Bilsen Rd, Geebung QLD 4034",
  latitude: -27.3716565,
  longitude: 153.0559374,
  precision: "address",
  provider: "geoapify",
  city: "Brisbane",
  country: "Australia",
  attribution: "© OpenStreetMap contributors",
};

export const KEYSBOROUGH_JOB_LOCATION: JobLocation = {
  version: 1,
  label: "49-75 Pacific Dr, Keysborough VIC 3173",
  latitude: -38.0157397,
  longitude: 145.1817973,
  precision: "address",
  provider: "geoapify",
  city: "Melbourne",
  country: "Australia",
  attribution: "© OpenStreetMap contributors",
};

// These label/address pairs were explicitly requested and reconfirmed by the
// owner. Do not derive their addresses from the city in the shortcut's name.
export const JOB_LOCATION_SHORTCUTS = [
  { id: "autopacific-melbourne", name: "Autopacific Group Melbourne", location: GEEBUNG_JOB_LOCATION },
  { id: "cruisemaster-brisbane", name: "Cruisemaster Brisbane", location: KEYSBOROUGH_JOB_LOCATION },
] as const;
