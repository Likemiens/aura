# AGENTS.md: aura

Notes for coding agents adding aura to a project; people read [README.md](README.md). aura is glowing data tiles as framework-free Web Components, in one ES module (`aura.js`, no dependencies, MIT; types in `aura.d.ts`). `<aura-tile>` shows one reading: a number on its scale, a small chart, a colour that follows the value. `<aura-board>` lays tiles out in a grid people can reorder, hide and widen. `bindWeather()` fills tiles from Open-Meteo. Demo: https://likemiens.com/ui/aura

## Install

- Pinned: `import { bindWeather } from "https://cdn.jsdelivr.net/gh/Likemiens/aura@v1.0.0/aura.js"` in a `<script type="module">`. Any import of the module registers both tags.
- Always the latest: `https://likemiens.com/ui/aura/aura.js` (no-cache, CORS open). Pin a tag for production.
- npm: `npm install github:Likemiens/aura`, then `import { bindWeather, findPlaces, toneAt, TONES, SCALES } from "aura"`. Or copy `aura.js` and `aura.d.ts` into the project.

## Contract

- `<aura-tile>`: the same keys as attributes or in `tile.data` (attributes win). `kind` ring dial wave ruler split pulse scatter swatch meter dots (default ring); `label sublabel caption`; `value min max unit decimals` (scale 0–100, or the bounds of `series`); `text` (words for the number); `series times at` (comma lists in attributes; ruler, scatter and dots scrub); `ends`; `angle spread` (dial); `color` (swatch); `stops` (meter); `facts` (`"Gusts: 16 km/h, From: NE"` or `[[label, value]]`, shown by a wide tile); `tone` (a palette, a scale name, four colours, or `[[at, tone]]` in data); `state` loading empty error stale; `message`; `alert` (a threshold, bare = always); `size="short"`; `numerals="dotted"`. Attributes only: `span` 1–4 (columns on a board), `metric` (for bindWeather), `id`.
- `tile.data` reads a copy, and setting it replaces everything; `tile.update(patch)` merges.
- `<aura-board>`: `editable` (Edit button, long press 480 ms, drag, corner grip, −, ✓, ✕, keyboard), `persist="name"` (localStorage `aura-board:name`), `lang`. `edit() done() cancel()`, `editing`, `tiles`, `layout` = `{ order, hidden, spans }` (get and set). It manages only its direct `aura-tile` children.
- Events, all bubbling and composed: tile `aura-select {key, value, index, data}`, `aura-scrub {key, index, value, time}`, `aura-retry {key}`, `aura-toggle {key, hidden}`; board `aura-edit {editing}`, `aura-change {order, hidden, spans}` (on ✓), `aura-resize {key, span}`; root of the binding `aura-weather {place, time, offset, weather}` or `{error}`. `key` is the `id`, else the `metric` or `label` attribute.
- `bindWeather(root, options)`: `{ lat, lon }` or `{ place }`, plus `units` (metric, imperial), `lang` (en, ru), `every` (seconds, 600). Returns `{ refresh(), set(options), stop(), weather }`. Metrics: temperature delta humidity pressure clouds uv-day uv wind air daylight rain. `findPlaces(name, lang?, count?)` geocodes.
- CSS: `--aura-edge --aura-mid --aura-core --aura-accent --aura-ink --aura-font --aura-radius --aura-focus`; board `--aura-columns --aura-gap --aura-row --aura-bar-bg --aura-bar-ink --aura-bar-gap`. Parts: tile `tile viz label sublabel caption badge grip`, board `grid toolbar edit cancel done`.

## Recipes

Your own metrics from a socket. The look goes in attributes, the live values in data:

```js
// <aura-tile id="cpu" kind="ring" label="CPU" unit="%" tone="percent" alert="90">
// <aura-tile id="rps" kind="ruler" label="Requests" sublabel="per second" span="2">
import "aura";
const cpu = document.getElementById("cpu"), rps = document.getElementById("rps");
const socket = new WebSocket("wss://example.com/metrics");
socket.onmessage = (event) => {
  const m = JSON.parse(event.data); // { cpu: 42, rps: [ …the last 60 ] }
  cpu.update({ value: m.cpu, state: "ready" });
  rps.update({ series: m.rps, at: m.rps.length - 1, state: "ready" });
};
socket.onclose = () => [cpu, rps].forEach((tile) => tile.update({ state: "stale", message: "Reconnecting" }));
```

The weather for a city: tiles with a `metric`, then `const weather = bindWeather(board, { place: "Lisbon" })`. Move it with `weather.set({ place: "Porto" })`, end it with `weather.stop()`. Put "Weather data by Open-Meteo.com" with a link next to it.

React 19 in a client-only app: attributes as JSX props, data and events through a ref:

```jsx
import { useEffect, useRef } from "react";
import "aura";

function Cpu({ value, onOpen }) {
  const ref = useRef(null);
  useEffect(() => ref.current.update({ value }), [value]);
  useEffect(() => {
    const tile = ref.current, open = (event) => onOpen(event.detail);
    tile.addEventListener("aura-select", open);
    return () => tile.removeEventListener("aura-select", open);
  }, [onOpen]);
  return <aura-tile ref={ref} id="cpu" kind="ring" label="CPU" unit="%" tone="percent" />;
}
```

Next.js and other server rendering: import inside an effect, and stop the binding on cleanup:

```tsx
"use client";
import { useEffect, useRef } from "react";
export function Weather({ place }: { place: string }) {
  const board = useRef<HTMLElement>(null);
  useEffect(() => {
    let binding: { stop(): void } | undefined, alive = true;
    import("aura").then(({ bindWeather }) => { if (alive && board.current) binding = bindWeather(board.current, { place }); });
    return () => { alive = false; binding?.stop(); };
  }, [place]);
  return <aura-board ref={board} editable persist="weather"><aura-tile metric="temperature" span="2" /><aura-tile metric="wind" /></aura-board>;
}
```

## Gotchas

- It is an ES module: `<script type="module">` or `import`. Use one URL everywhere; two URLs are two modules, and only the first defines the tags.
- Set `data` only once the tags are defined: after the import resolves, or after `await customElements.whenDefined("aura-tile")`. A `data` set earlier sticks to the element as a plain property and hides the real one for good; `update()` does not exist yet.
- Attributes win over data: a `state`, `tone` or `alert` attribute hides what `update()` or `bindWeather()` sets for that key.
- `persist`: one name per board. A kept layout wins over the markup's order, hidden tiles and widths; change the name to reset everyone's. Tiles are matched by key, so give each a distinct `id`, `metric` or `label` attribute (data doesn't count). The layout comes back once, when the tiles first arrive: render them together with the board.
- Open-Meteo: credit "Weather data by Open-Meteo.com" with a link (CC BY 4.0); the free API is for non-commercial use. One binding per root: `stop()` the old one first (React StrictMode runs effects twice).
- React 19 sets `dangerouslySetInnerHTML` again whenever its `{ __html }` object is a new one: the tiles are replaced and a binding is left on detached nodes. Keep that object at module level. The board moves its tiles in the DOM itself, so keep the list of tiles React renders stable.
- Resets that pin `[hidden] { display: none !important }` (Tailwind's preflight) beat the component's own `:host([hidden])`. So while editing, a hidden tile carries `off` instead and shows as a ghost; read `board.layout.hidden`, not `tile.hidden`.
- SSR: the module extends `HTMLElement` as it loads; import it in the browser only. JSX in TypeScript: declare `aura-board` and `aura-tile` in `JSX.IntrinsicElements` yourself; `aura.d.ts` types the DOM.
- The edit bar's defaults are made for a dark page. On a light one set `--aura-bar-bg` and `--aura-bar-ink`. `edit()` on a board without `editable` has no ✓ ✕ bar and no dragging.

## Don't

- Don't reach into the shadow DOM or style its classes: use `--aura-*` and `::part()`.
- Don't wrap tiles in other elements inside a board: it lays out and edits only its direct children.
- Don't set `hidden` on tiles while the board is editing; set `board.layout` when it is not.
