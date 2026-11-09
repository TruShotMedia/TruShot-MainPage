# AutoPacific and Marketing job maps

Both workspaces have a Map tab, using the same job permissions and My Space / Videographer assignment filters as the other tabs. Completed, non-archived jobs are included. Selecting a pin or a location in the accessible list opens its jobs, newest shoot first; selecting a job opens its existing brief. Search, status and shoot-date filters apply to the map and list together. Jobs without a shoot date use their due date for date filtering.

## Location selection

The job create/edit and campaign planning editors share one address picker. Search is debounced by 450 ms, requires at least three characters and is cancelled when the query changes. No search happens just because an editor opens. A selected result saves its coordinates and attribution. A manual pin is also available, without an address-search account. Free text is still supported and appears under **Needs location**, not at a guessed point.

The picker also includes owner-defined quick-location buttons, configured in `src/lib/job-location-presets.ts`. Each shows its full address and fills both the editable address and saved building pin without an autocomplete call. It changes only the draft; the normal job/campaign save is still required. Shortcut display names are explicit owner configuration, not a rule for inferring the location's city.

`website-jobs.location` remains the human-readable location (and existing ClickUp description value). `location_details` holds the versioned label, coordinates, source, precision and attribution. `location_original` retains original text when a location changes. A database trigger clears coordinates on text-only location changes from older clients or integrations, preventing stale pins. Campaign saves remain atomic and preserve concurrency, assignment and RLS checks.

Only exact legacy AutoPacific `MEL` / `Melbourne` entries are normalised to Melbourne city-level coordinates. They are explicitly approximate, not a venue or airport. Ambiguous names such as `Glass House` and empty fields are not geocoded automatically. No historical record is silently given a fabricated address.

## Services, limits and privacy

- MapLibre renders OpenFreeMap tiles directly in the browser. Maps load only when the Map tab or an editor preview is used. The public tile service has no SLA; job lists remain available if maps or WebGL fail. Attribution must remain visible. No bulk tile downloads or offline tile prefetching.
- Geoapify is used **only** for address autocomplete, via `/api/autopacific/locations`. Configure `GEOAPIFY_API_KEY` as a server-only Vercel variable. Never prefix it `NEXT_PUBLIC_`, print it, commit it or return it to the client.
- Searches require the normal authenticated, MFA-checked Production context. The server-only budget RPC allows at most 40 searches per user per UTC minute, three per workspace per UTC second, and 2,500 per workspace per UTC day, reserving headroom under the provider's free tier. Other uses of the same key can still consume its quota; provider limits remain authoritative.
- Search phrases are sent to Geoapify; browser tile requests reveal the map area to OpenFreeMap. Job titles, notes, attachments and other CRM details are not sent to either service. Search results, selected coordinates and attribution are stored under existing job RLS.
- No subscription, billing upgrade, background geocoding or additional refresh timer is configured. Map uses the existing jobs refresh/ETag endpoint, including a refresh when entering the tab. Cached offline records never override a confirmed online server response.

## Verification

`scripts/prepare-map-worker.mjs` runs before dev/build and copies the installed MapLibre module worker and license to a versioned public path. The map explicitly uses this same-origin worker; no external script CDN or CSP relaxation is required. Generated worker files are gitignored and regenerated on Vercel builds.

Covered by parser/filter/grouping tests, authenticated API/quota/failure tests, autocomplete debounce/stale-response/keyboard/manual-pin tests and workspace history/navigation tests. Database checks run inside rolled-back transactions under Production, Marketing, anonymous and service roles. Test saves do not persist or send ClickUp updates.
