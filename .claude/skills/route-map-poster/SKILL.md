---
name: route-map-poster
description: Generate an illustrated itinerary/route-map poster (小红书 / xiaohongshu travel-guide style) as a PNG. Renders a REAL map base from CARTO/OpenStreetMap tiles, then overlays numbered hand-drawn attraction icons, a dashed route line, and a grouped legend with sketches. Use when the user wants a route map, travel itinerary map, attraction map poster, "把地点画在地图上", "行程地图", a one-day/multi-day sightseeing route image, or a styled map with marked spots. Works for any city given attractions with lat/lng.
---

# Route Map Poster

Generates a travel route poster: real map background + numbered line-art icons for
each attraction + dashed route + a color-grouped legend. Output is a high-res PNG
(1240px wide, height auto).

## Requirements

- Node.js and the `sharp` package. If `sharp` is not installed, run once:
  ```bash
  cd .claude/skills/route-map-poster && npm install sharp
  ```
  (You can also reuse an existing install via `NODE_PATH=/path/to/node_modules`.)
- A CJK font for Chinese labels (e.g. `WenQuanYi Zen Hei`, usually preinstalled).
  Override the font with the `POSTER_FONT` env var if needed.
- Network access to `basemaps.cartocdn.com` to download map tiles.

## How to use

1. **Gather real coordinates.** For each attraction, find its `lat`/`lng` (decimal
   degrees). Use your own geographic knowledge or look them up. Accuracy here is what
   makes the map look real — double-check anything you're unsure of.
2. **Write a spec JSON** (schema below). Pick an `icon` per stop from the built-in
   list, and assign each stop to a `group` (a colored section / day / area).
3. **Run the generator:**
   ```bash
   node generate.js <spec.json> [output.png]
   ```
4. **Show the result** to the user with the file tool, and offer tweaks (basemap
   style, icons, grouping, zoom).

## Spec schema

```jsonc
{
  "title":      "布里斯班一日游路线",        // required, banner title
  "subtitle":   "真实地图 + 景点简笔画",      // optional, banner subtitle
  "output":     "poster.png",               // optional default output path
  "basemap":    "light",                    // light | dark | voyager  (default light)
  "bannerColor":"#ffce2e",                  // optional banner bg
  "paper":      "#fdf9f1",                   // optional page bg
  "routeColor": "#ff8a1e",                   // optional route line color
  "footer":     "底图 © OpenStreetMap / CARTO",
  "zoom":       16,                          // optional; omit to auto-fit
  "groups": [                                // 1–3 groups → 1–3 legend columns
    { "id": "S", "label": "South Bank 南岸", "color": "#e8553f" },
    { "id": "N", "label": "City 北岸",       "color": "#2f6df0" }
  ],
  "route": [1, 2, 3, 5, 4, 7, 6, 8, 9, 10],  // optional: stop "n"s in walking order
  "stops": [
    { "n": 1, "group": "S", "lat": -27.4760, "lng": 153.0233,
      "icon": "beach", "name": "南岸公园", "en": "South Bank", "desc": "人造沙滩" }
    // ...
  ]
}
```

Field notes:
- `n` — unique number shown in the marker badge and legend; also referenced by `route`.
- `group` — must match a `groups[].id`; sets the marker/legend color.
- `en` and `desc` are optional (English subtitle on the map; description in the legend).
- Keep it to ~12 stops per poster for legibility; for multi-day trips make one poster
  per day or use up to 3 groups.

## Built-in icons (`icon` field)

`beach` `sun` `wave` `pagoda` `wheel` `art` `museum` `bag` `market` `star` `heart`
`tree` `flower` `mountain` `waterfall` `beer` `coffee` `food` `camera` `ferry`
`plane` `car` `hotel` `building` `church` `castle` `bridge` `paw` `pin`

`pin` is the fallback for anything unmatched. Pick the closest match (e.g. `paw` for a
zoo/wildlife park, `food` for a restaurant, `mountain` for a national park, `plane`
for an airport, `castle`/`church` for historic landmarks).

## Example

`examples/brisbane.json` is a complete, working spec. Try:

```bash
node generate.js examples/brisbane.json brisbane.png
```

## Tips

- `basemap: "voyager"` gives a warmer, label-rich base; `"dark"` for night themes.
- Omit `zoom` to auto-fit all stops; set it manually to zoom in/out.
- Two groups render as a clean two-column legend (e.g. South Bank vs City, or Day 1 vs
  Day 2). Three groups → three narrower columns.
- A matching `.svg` is written next to the `.png` if you want to edit it further.
