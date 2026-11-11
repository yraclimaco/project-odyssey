# Project Odyssey: pre-mission planning map (MVP mockup)

UC San Diego **Innovating for National Security** student project. This is an interactive
mockup that tests one question: **is magnetic map information understandable and useful
to XLUUV planners deciding what is worth evaluating further?**

**Task:** help a planner prepare a location and route option for technical review using available magnetic data.

Workflow: **Inspect a location → Mark it with a reason → Compare a route through it → Save a review**

The output is a planning review: the available evidence, the distance tradeoff, and the questions that
still need answering. It does not decide which locations are usable navigation checkpoints and does not
recommend a route.

> This tool does **not** run a navigation simulation, control a vehicle, produce position
> fixes, or show improved navigation accuracy. Route lines are **sketches**, not recommendations.

## Start the app

Requires Node.js 20+ (built with Node 24).

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Type-check (`tsc -b`) and production build |
| `npm run lint` | Lint with oxlint |
| `npm run check` | Built-in checks: distances, data honesty, export contents, zero/missing/failed values, stale-response protection, header status, saved-data migration, safe note rendering, saved observations, distance precision, route framing, example review |

## Demo script (about 3 minutes)

1. Open the app. The header shows **Magnetic data not loaded**. Demo areas are hidden by default.
2. **Map data** tab: click **Load magnetic map** (needs internet). The header changes to **Magnetic layer visible**
   only after the first map image has loaded.
3. Click any point on the map. The panel shows the value (nT), dataset, and reference altitude.
   **Data details** and **What still needs checking** are collapsed below.
4. Type a reason under **Why investigate this location?** and click **Mark for review**. It is saved as
   "Review location 1" together with the queried value and its timestamp (rename it in the panel if you like).
5. Click **Open Plan route**. Choose a start and destination on the map, then **Add** the marked location as stop 3.
6. Read **Direct route / Route with stops / Extra distance** at the bottom of the sidebar. **Fit route** frames both lines.
7. Click **Review summary**. Enter what the reviewer should assess, then **Print / Save PDF** or **Download JSON**.

For a ready-made presentation, click **Open example** in Map data. It opens a separate, fictional review
(illustrative route, one review point, a question-style note) and queries the real value at the example point
when the magnetic map is loaded. **Return to my work** restores your own review unchanged.

## MVP behavior notes

- **Saved observations.** Marking a point saves the actual query result (value, units, layer, dataset,
  reference altitude, error estimate, source ID, query time, demo status). Missing data, failed requests, and
  "map not loaded" are saved as such. Switching layers or reopening a location never replaces it; use
  **Refresh saved observation** to re-query. A failed refresh keeps the old observation.
- **Areas** never get a single value. A point chosen inside an area is a point check, listed separately.
- **Distances** are shown to 0.1 in every row. Extra distance is computed from full-precision meters, then rounded.
- **Map framing.** The map fits the route once when a saved route is restored or when start and destination are
  first set, leaving room for the detail panel. After that it only moves when you click **Fit route**.
- **Review map overview** is a live Leaflet map drawn from the saved review state and printed by the browser.
  If the NOAA layer cannot load, the overview says so and shows the route only.
- Older saved work (v1/v2) is migrated: timestamp names like "Location 4F2K" become "Review location N",
  names you typed are kept, and locations marked before this version show "No observation saved" with a
  **Query and save observation** action.

## What works

- **Two separate data modes.** Illustrative mode works offline and without credentials. Public-data mode
  calls NOAA's public EMAG2v3 map service directly from the browser.
- **NOAA EMAG2v3 layer** (after **Load magnetic map**). You can choose anomaly at 4 km altitude, at sea level, or the map error estimate, and adjust opacity.
  The legend swatch comes from the service itself. Click the map to get the cell values
  (nT) through the service's `identify` operation. Missing cells show "No data at this cell".
  The value is never shown as 0.
- **Service failure handling.** If NOAA cannot be reached, the header shows "Couldn't load data", and the map shows
  **Try again** and **Continue with demo data**. Illustrative data is never substituted
  quietly. To test it, open `http://localhost:5173/?simulateServiceFailure`.
- **Locations.** Click the map to inspect any point. **Mark for review** saves it to Saved locations; demo areas can be marked too.
  Marking never changes the route. Notes are stored per location. Everything stays **"Requires validation"**.
- **Route sketches.** These show the direct route (navy dashed) and the route with stops (orange). You can drag any marker,
  remove a stop, or remove all stops. **Fit route** zooms to the route (the map never moves on its own). **Clear route** asks before clearing. A stop placed inside an area records that area in the saved file.
  Distances are geodesic on WGS84 using GeographicLib, shown in nmi or km. Lines are drawn along geodesics.
- **Export.** This is a JSON file labeled "Planning review only". It includes waypoints, annotations
  and notes, distances, each data source with its provenance flag, any public-grid point queries,
  and unresolved assumptions.
- Work is saved in this browser only (localStorage). **Reset demo** clears it.

## Selection panel and review (latest update)

- **Value states** are kept distinct: loading, value, "No value at this point", "Could not retrieve", and "Not provided by source" for metadata.
  Zero is a real value. Documented sentinel values from the NCEI format file (99999, −888, −999) are never shown as measurements.
- **Stale results**: a newer click cancels the previous point request, and responses are matched by request ID, so a value
  never appears under the wrong location.
- **Areas** show no single value. You choose a point inside the area, and its value is labeled as a point value.
- **Review summary** is a readable page with print styles (browser Print / Save as PDF). User notes are rendered as text and
  labeled as user-entered.
- **Saved work** from older versions is migrated automatically.
- Interview observations shaped the wording and the "Further checks" items only. No scores, error models, or recommendations
  were derived from them.

## What is illustrative

- **Demo areas A, B, and C** (`src/data/illustrativeCandidates.ts`) were placed by hand to
  demonstrate the interface. They are not real observations. They carry `dataOrigin: "illustrative"`
  and have no source, value, resolution, or error estimate (all `null`). **Their locations do not
  establish real magnetic navigation opportunities.**
- **Example start and destination** points ("Use example route (demo)").
- Illustrative mode shows **no magnetic layer**, so no magnetic values are invented.

## What is verified, and how

These were checked against the live service and the NCEI product page on 2026-11-06. Notes are in
`src/data/emag2v3.ts`.

- Service: `https://gis.ngdc.noaa.gov/arcgis/rest/services/EMAG2v3/MapServer`. Coordinate system WGS84
  (wkid 4326). The service is dynamic, not tiled. CORS is open.
- Layer ids: 3 = Upward Continued, 4 = Sea Level, 7 = Data Source Code, 8 = Error Estimate.
- Units: nT, from the service legend. The error estimate is also in nT, per NCEI.
- Missing value: `identify` returns the string `"NoData"`. In rendered images, no-data cells appear gray.
- Grid: 2 arc-minute. Upward Continued is 4 km above the WGS84 ellipsoid. Sea Level covers oceanic and
  coastal regions. Source: NCEI product page.
- Dataset DOI: 10.7289/V5H70CVX.
- Land outlines: Natural Earth 1:50m, bundled through the `world-atlas` npm package.
- Distance checks (`npm run check`): identical points = 0 m. 1° of longitude at the equator = 111,319.49 m
  (WGS84 a·π/180).

## What is not validated

- Whether any location, anomaly, or route is useful for magnetic navigation. **Navigation usefulness: not validated** everywhere.
- Whether sketch lines are feasible. They can cross land, restricted areas, or other constraints.
- The data source code (layer 7) is shown as a raw number. Its code-to-name table has not been verified here.
- No stakeholder review, user testing, or performance results exist for this prototype.

Map resolution, magnetic map error, and vehicle position error are different quantities. This tool
does not convert one into another, and it reports no vehicle navigation accuracy.

## Out of scope for this build

Terrain, gravity, acoustic navigation, sensor fusion, automatic route optimization, arrival time, energy use,
drift, position improvement, success probability, and compatibility with any Navy or vehicle mission format.

## Project structure

```
src/
  data/                     map data and source config (no UI code)
    types.ts                CandidateArea and related types (nullable unknowns)
    illustrativeCandidates.ts   illustrative demo dataset
    emag2v3.ts              verified NOAA EMAG2v3 service facts
  lib/
    geodesy.ts              GeographicLib distances and geodesic line drawing
    emagService.ts          NOAA REST client (availability, legend, export, identify)
    exportReview.ts         "Planning review only" export builder
    persistence.ts          localStorage save/restore
  components/               Header, Sidebar, MapView, MagneticOverlay, Legend, InspectionPanel
scripts/check.ts            lightweight checks (no test framework)
```

To use real candidate data later, replace `ILLUSTRATIVE_CANDIDATES` with records of the same
`CandidateArea` shape that carry `dataOrigin: "verified-public-source"` and their source fields.
The interface does not need to change.

## Next data and domain questions for a real pilot

1. Which magnetic products do planners actually have, and at what resolution and reference altitude?
   Examples include EMAG2v3, WDMAM, regional aeromagnetic surveys, and classified or controlled surveys.
2. How should operating depth relate to the map's reference elevation? EMAG2v3 publishes values at 4 km
   altitude and at sea level only.
3. What criteria would make an area a candidate? Examples: gradient strength, anomaly distinctness, track
   density, or error estimate. Who sets and validates those criteria?
4. How should the NOAA error estimate and data-source coverage be interpreted for planning, and what
   threshold would make an area "requires more data"?
5. What land, bathymetry, traffic, and restricted-area constraints must route sketches respect?
6. Which existing mission-planning or simulation tools would receive the selected routes, and what
   information do their users need from this review step?
7. What would show the prototype is "useful"? Who are the test users, what tasks would they do, and
   how would success be measured?
