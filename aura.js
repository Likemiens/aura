// Aura — glowing data tiles for any web page: https://likemiens.com/ui/aura/
// One ES module, no dependencies.
//   <aura-tile>   one reading: a number on its scale, a small chart, and a colour that follows the value. It lays itself
//                 out by its own size: one column wide like a small widget, two and more like a wide one;
//   <aura-board>  lays tiles out; people reorder, hide and widen them (long press or Edit), the layout can be remembered;
//   bindWeather() keeps tiles that carry a `metric` filled from Open-Meteo (free, no key, open to any origin).
// The contract — attributes, data, events, CSS hooks — is described on the page above and typed in aura.d.ts.

// edge, mid, core, accent: a bright rim, a darker heart behind the number, the colour of marks
export const TONES = {
  coral: ["#f39a86", "#e2552e", "#163f18", "#f6e04b"],
  teal: ["#76e2d6", "#27b4b6", "#0a6b84", "#dcee6e"],
  red: ["#f6958b", "#d8343e", "#5a0710", "#ffffff"],
  lime: ["#dde33c", "#a8b316", "#1c2306", "#f2ea4c"],
  magenta: ["#f37db6", "#df2f79", "#990735", "#ffb12f"],
  blue: ["#4c88f7", "#1c4ed6", "#030a26", "#45b9ff"],
  sand: ["#d0a678", "#a8714b", "#6a3e29", "#f8d43d"],
  moss: ["#6c9a8c", "#2f5a4c", "#0a1c15", "#90e37e"],
  mauve: ["#c8708c", "#8a5a78", "#463650", "#f3d34c"],
  ember: ["#f5661f", "#e1411c", "#3b3fd8", "#ffffff"],
  slate: ["#9aabbf", "#56667c", "#151d29", "#e8eef6"],
  ice: ["#b3dafd", "#4f8ff0", "#0b2a6b", "#ffffff"],
};

// value → tone; between two stops the tones are mixed
export const SCALES = {
  temperature: [[-15, "ice"], [0, "blue"], [10, "teal"], [17, "moss"], [22, "lime"], [27, "coral"], [32, "red"], [38, "magenta"]],
  uv: [[1, "moss"], [4, "lime"], [6.5, "sand"], [9, "red"], [11, "magenta"]],
  aqi: [[10, "moss"], [30, "lime"], [50, "sand"], [70, "red"], [90, "magenta"]],
  clouds: [[10, "lime"], [90, "slate"]],
  delta: [[-8, "blue"], [0, "moss"], [8, "magenta"]],
  percent: [[0, "slate"], [50, "teal"], [100, "lime"]],
};

const KINDS = ["ring", "dial", "wave", "ruler", "split", "pulse", "scatter", "swatch", "meter", "dots"];
const SCRUB = new Set(["ruler", "scatter", "dots"]);
const LEAN = new Set(["split", "pulse", "meter", "swatch"]);
const ATTRS = ["kind", "label", "sublabel", "value", "unit", "min", "max", "text", "caption", "message", "facts", "ends", "series",
  "times", "at", "angle", "spread", "color", "stops", "tone", "state", "size", "alert", "decimals", "numerals"];
// drawings are in units of a one-column tile: 200 wide, 236 tall (112 when short); a wider tile is wider in units
const X0 = 18;
const WIDE = 290;
const MAX_SPAN = 4;

// The colours and the centre of the glow are typed properties, so a new tone, a lean toward the reading or the pointer
// glides instead of jumping. A browser without registerProperty simply switches.
for (const [name, syntax, initialValue] of [
  ["--_aura-edge", "<color>", "#5b6573"], ["--_aura-mid", "<color>", "#3b4350"], ["--_aura-core", "<color>", "#151a21"],
  ["--_aura-gx", "<percentage>", "50%"], ["--_aura-gy", "<percentage>", "54%"], ["--_aura-grow", "<number>", "1"],
]) {
  try { CSS.registerProperty({ name, syntax, inherits: false, initialValue }); } catch { /* registered already, or not supported */ }
}

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const f1 = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (v) => (v === null || v === undefined || v === "" || typeof v === "boolean" || !Number.isFinite(+v) ? null : +v);
const rnd = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ru = (el) => (el.closest("[lang]")?.lang || navigator.language || "").toLowerCase().startsWith("ru");
const keyOf = (t) => t.id || t.getAttribute("metric") || t.getAttribute("label") || "";
const spanOf = (t) => clamp(Math.round(num(t.getAttribute("span")) ?? 1), 1, MAX_SPAN);
const emit = (el, type, detail) => el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));

// "a, b" or an array → array; commas inside brackets — rgb(), color-mix() — stay where they are
function items(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || !v.trim()) return null;
  const out = [];
  let depth = 0, cur = "";
  for (const ch of v) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// facts: [["Gusts", "16 km/h"], …], or "Gusts: 16 km/h, From: NE" in an attribute
function factsOf(v) {
  const list = items(v);
  if (!list?.length) return null;
  return list.map((f) => {
    if (Array.isArray(f)) return [String(f[0] ?? ""), String(f[1] ?? "")];
    const [label, value] = String(f).includes(":") ? String(f).split(/:(.*)/s) : ["", f];
    return [label.trim(), String(value).trim()];
  });
}

function palette(t) {
  if (Array.isArray(t) && t.length === 4 && typeof t[0] === "string") return t;
  if (typeof t !== "string") return null;
  if (TONES[t]) return TONES[t];
  const list = items(t);
  return list?.length === 4 ? list : null;
}

/** The four colours of a scale at a value: toneAt("temperature", 24). A scale is a name or [[at, tone], …]. */
export function toneAt(scale, value) {
  const stops = typeof scale === "string" ? SCALES[scale] : scale;
  if (!stops?.length) return TONES.slate;
  const i = Number.isFinite(value) ? stops.findIndex(([at]) => value < at) : 0;
  if (i === 0) return palette(stops[0][1]) ?? TONES.slate;
  if (i < 0) return palette(stops[stops.length - 1][1]) ?? TONES.slate;
  const [a, from] = stops[i - 1], [b, to] = stops[i];
  const A = palette(from) ?? TONES.slate, B = palette(to) ?? TONES.slate;
  const k = Math.round(((value - a) / (b - a)) * 100);
  return A.map((c, j) => `color-mix(in oklab, ${c} ${100 - k}%, ${B[j]})`);
}

function resolveTone(tone, value) {
  if (Array.isArray(tone) && Array.isArray(tone[0])) return toneAt(tone, value);
  if (typeof tone === "string" && SCALES[tone]) return toneAt(tone, value);
  return palette(tone) ?? TONES.teal;
}

const formats = new Map();
function formatter(lang, decimals, signed) {
  const key = `${lang}|${decimals}|${signed}`;
  if (!formats.has(key)) {
    const nf = new Intl.NumberFormat(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: "min2", signDisplay: signed ? "exceptZero" : "auto" });
    formats.set(key, (v) => (Number.isFinite(v) ? nf.format(v).replace("-", "−") : "—"));
  }
  return formats.get(key);
}

/* ---------- drawings ---------- */

const right = (m) => m.W - X0;

function big(m, x, cy, size, anchor = "middle") {
  const unit = m.unit ? `<tspan class="unit" dx="${f1(size * 0.05)}" dy="${f1(-size * 0.42)}" font-size="${f1(size * 0.36)}">${esc(m.unit)}</tspan>` : "";
  return `<text class="val${m.dotted ? " dotted" : ""}" x="${f1(x)}" y="${f1(cy + size * 0.35)}" font-size="${size}" text-anchor="${anchor}"><tspan class="num">${esc(m.text)}</tspan>${unit}</text>`;
}
const corner = (m) => (m.text ? `<text class="val" x="${f1(right(m))}" y="40" font-size="25" text-anchor="end"><tspan class="num">${esc(m.text)}</tspan>${m.unit ? `<tspan class="unit" font-size="11" dx="1" dy="-10">${esc(m.unit)}</tspan>` : ""}</text>` : "");
const ends = (m, y, em = -1) => (m.ends ? `<text class="end${em === 0 ? " em" : ""}" x="${X0}" y="${y}">${esc(m.ends[0])}</text><text class="end${em === 1 ? " em" : ""}" x="${f1(right(m))}" y="${y}" text-anchor="end">${esc(m.ends[1] ?? "")}</text>` : "");
const arrow = (x, y) => `<path class="mark" d="M${f1(x - 4.5)} ${y}h9l-4.5 6z"/>`;

// A wide tile reads like a wide widget: the number on the left under the header, the facts on the right on its
// baseline, the chart across the whole width below.
const lead = (m, cy, size = 46) => big(m, X0, cy, size, "start") + factLine(m, cy + size * 0.35);

function factLine(m, baseline) {
  const f = m.facts;
  if (!f?.length) return "";
  const x1 = right(m), room = x1 - 210, n = Math.min(f.length, Math.max(1, Math.floor(room / 84))), w = room / n;
  return f.slice(0, n).map(([label, value], i) => {
    const x = f1(x1 - (n - 1 - i) * w);
    return `<text class="fact" x="${x}" y="${f1(baseline - 25)}" text-anchor="end">${esc(label)}</text><text class="fact-v" x="${x}" y="${f1(baseline)}" text-anchor="end">${esc(value)}</text>`;
  }).join("");
}

// beside a round gauge the facts stack as rows; on a very wide tile they stand side by side instead
const factCols = (m, x, baseline, max = 3) => {
  const f = (m.facts ?? []).slice(0, max), w = (right(m) - x) / Math.max(1, f.length);
  return f.map(([label, value], i) => `<text class="fact" x="${f1(x + i * w)}" y="${f1(baseline - 25)}">${esc(label)}</text><text class="fact-v" x="${f1(x + i * w)}" y="${f1(baseline)}">${esc(value)}</text>`).join("");
};
const factRows = (m, x, y0, max = 3) =>
  (m.facts ?? []).slice(0, max).map(([label, value], i) => `<text class="fact" x="${x}" y="${y0 + i * 54}">${esc(label)}</text><text class="fact-v" x="${x}" y="${y0 + i * 54 + 25}">${esc(value)}</text>`).join("");

// time labels under a wide chart, as many as fit
function marks(m, px, y) {
  if (!m.times || !m.series) return ends(m, y);
  const n = m.series.length, fit = Math.max(2, Math.floor((right(m) - X0) / 52)), k = Math.max(1, Math.ceil((n - 1) / (fit - 1)));
  let out = "";
  for (let i = 0; i < n; i += k) out += `<text class="end" x="${f1(px(i))}" y="${y}" text-anchor="middle">${esc(m.times[i] ?? "")}</text>`;
  return out;
}

// a round gauge keeps its shape: on a wide tile it stays in the first column and the facts take the rest
const gauge = (m, inner) => {
  if (!m.wide || !m.facts) return inner;
  const n = Math.min(m.facts.length, 3);
  return inner + ((right(m) - 222) / n >= 130 ? factCols(m, 222, 136) : factRows(m, 222, 78));
};

const VIEW = {
  ring(m) {
    const cx = m.wide && !m.facts ? m.W / 2 : 100;
    return gauge(m, `<circle class="track" cx="${cx}" cy="124" r="62"/>
<circle class="arc" cx="${cx}" cy="124" r="62" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="${f1(100 - m.t * 100)}" transform="rotate(-90 ${cx} 124)"/>
<g class="spin" style="transform-origin:${cx}px 124px;transform:rotate(${f1(m.t * 360)}deg)"><circle class="knob" cx="${cx}" cy="62" r="3.4"/></g>${big(m, cx, 124, 46)}`);
  },
  dial(m) {
    const cx = m.wide && !m.facts ? m.W / 2 : 100;
    let ticks = "", hot = "";
    for (let i = 0; i < 60; i++) ticks += `<line x1="${cx}" y1="58" x2="${cx}" y2="64" transform="rotate(${i * 6} ${cx} 124)"/>`;
    const k = Math.round(2 + clamp(m.spread ?? 0.4) * 5);
    for (let j = -k; j <= k; j++) hot += `<line x1="${cx}" y1="${f1(52 + Math.abs(j) * 0.8)}" x2="${cx}" y2="66" transform="rotate(${j * 6} ${cx} 124)" opacity="${(1 - Math.abs(j) / (k + 1)).toFixed(2)}"/>`;
    return gauge(m, `<g class="ticks">${ticks}</g><g class="spin hot" style="transform-origin:${cx}px 124px;transform:rotate(${f1(m.angle ?? m.t * 360)}deg)">${hot}</g>${big(m, cx, 124, 40)}`);
  },
  wave(m) {
    const y = 172, x1 = right(m), mx = X0 + m.t * (x1 - X0);
    const sine = (phase) => {
      let d = "";
      for (let x = X0; x <= mx; x += 2) {
        const settle = clamp((mx - x) / 16); // the wave calms down into the line at the marker
        d += `${d ? "L" : "M"}${f1(x)} ${f1(y + 7 * settle * Math.sin(((x - X0) / 40) * 2 * Math.PI + phase))}`;
      }
      return d;
    };
    return `<g class="breath" style="transform-origin:0 ${y}px"><path class="w" d="${sine(0)}"/><path class="w w2" d="${sine(Math.PI)}"/></g>
<line class="rest" x1="${f1(mx)}" y1="${y}" x2="${f1(x1)}" y2="${y}"/>${arrow(mx, y - 13)}${m.wide ? lead(m, 100) : big(m, 100, 110, 46)}`;
  },
  ruler(m) {
    const y = 186, x1 = right(m), span = x1 - X0, s = m.series, n = s ? s.length : Math.round(span / 4.1) + 1;
    const px = (i) => X0 + (i / (n - 1)) * span;
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = px(i), h = s ? 5 + 21 * m.norm(s[i]) : i % 5 ? 7 : 13;
      out += `<line data-i="${i}" x1="${f1(x)}" x2="${f1(x)}" y1="${y}" y2="${f1(y - h)}"/>`;
      // a dimmer tick between two readings keeps the ruler dense
      if (s && i < n - 1) {
        const xm = x + span / (n - 1) / 2, hm = 4 + 10 * (m.norm(s[i]) + m.norm(s[i + 1])) / 2;
        out += `<line class="minor" x1="${f1(xm)}" x2="${f1(xm)}" y1="${y}" y2="${f1(y - hm)}"/>`;
      }
    }
    return `<g class="ruler">${out}</g>${m.wide ? lead(m, 100) + marks(m, px, 219) : big(m, 100, 112, 46)}`;
  },
  split(m) {
    const y = m.wide ? 162 : 150, x1 = right(m), mx = X0 + m.t * (x1 - X0);
    return `<line class="fill" x1="${X0}" y1="${y}" x2="${f1(mx)}" y2="${y}"/><line class="rest" x1="${f1(mx)}" y1="${y}" x2="${f1(x1)}" y2="${y}"/>
${arrow(mx, y - 12)}${ends(m, y + 23, m.t >= 0.5 ? 1 : 0)}${m.wide ? lead(m, 100) : big(m, 100, 108, 46)}`;
  },
  pulse(m) {
    const y = m.wide ? 166 : 150, x1 = right(m), span = x1 - X0, n = Math.max(41, Math.round(span / 4.1) | 1);
    const hot = Math.round(m.t * (n - 1)), zero = m.zero < 0 ? -1 : Math.round(m.zero * (n - 1));
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = f1(X0 + (i / (n - 1)) * span), d = (i - hot) / 9;
      const h = 3 + 20 * Math.exp(-d * d) * (0.65 + 0.35 * Math.abs(Math.sin(i * 2.3)));
      out += `<line${i === hot ? ' class="hot"' : i === zero ? ' class="zero"' : ""} x1="${x}" x2="${x}" y1="${f1(y - h)}" y2="${f1(y + h)}"/>`;
    }
    return `<g class="pulse" style="transform-origin:0 ${y}px">${out}</g>${m.wide ? lead(m, 92, 30) : big(m, 100, 88, 30)}`;
  },
  scatter(m) {
    const s = m.series ?? [], n = Math.max(2, s.length), cy = 126, x1 = right(m);
    const px = (i) => X0 + 6 + (i / (n - 1)) * (x1 - X0 - 12);
    let dots = "";
    s.forEach((v, i) => {
      const k = m.norm(v), x = px(i), y = cy + 46 - k * 92;
      dots += `<circle data-i="${i}"${k < 0.03 ? ' class="nil"' : ""} cx="${f1(x)}" cy="${f1(y)}" r="${f1(1.3 + k * 4.4)}"/>`;
      // a few satellites around strong readings turn the line into a cloud; seeded, so it never jumps
      for (let j = 0; j < Math.round(k * 3); j++) {
        dots += `<circle class="sat" cx="${f1(x + (rnd(i * 31 + j) - 0.5) * 16 * k)}" cy="${f1(y + (rnd(i * 17 + j * 7) - 0.5) * 26 * k)}" r="${f1(0.8 + rnd(i + j * 13) * 2.4 * k)}"/>`;
      }
    });
    const ax = f1(px(m.at)), foot = m.wide ? marks(m, px, 219) : m.message || m.caption ? "" : ends(m, 219);
    return `<line class="cross" x1="${X0}" y1="${cy}" x2="${f1(x1)}" y2="${cy}"/><line class="cross v" x1="${ax}" y1="66" x2="${ax}" y2="186"/>
<g class="dots">${dots}</g><text class="tip" x="${ax}" y="58" text-anchor="middle"></text>${foot}${m.wide ? factLine(m, 55) : ""}`;
  },
  swatch(m) {
    const y = 176, x1 = right(m), span = x1 - X0, mx = X0 + m.t * span, n = Math.round(span / 3.73) + 1;
    let strip = "";
    for (let i = 0; i < n; i++) { const x = f1(X0 + (i / (n - 1)) * span); strip += `<line x1="${x}" x2="${x}" y1="${y - 4}" y2="${y + 4}"/>`; }
    return `<circle class="halo" cx="100" cy="98" r="31"/><circle class="sw" cx="100" cy="98" r="19"/>
<g class="strip">${strip}</g><line class="needle" x1="${f1(mx)}" x2="${f1(mx)}" y1="${y - 10}" y2="${y + 6}"/><path class="mark sw" d="M${f1(mx - 4)} ${y + 16}l4-6 4 6z"/>${!m.wide ? "" : (right(m) - 222) / Math.min(2, m.facts?.length ?? 1) >= 130 ? factCols(m, 222, 112, 2) : factRows(m, 222, 70, 2)}`;
  },
  meter(m) {
    const y = m.short ? 80 : 168, x1 = right(m), mx = X0 + m.t * (x1 - X0);
    const stops = (m.stops ?? ["color-mix(in oklab, var(--_aura-edge), #fff 60%)", "var(--accent)"])
      .map((c, i, a) => `<stop offset="${(i / Math.max(1, a.length - 1)).toFixed(3)}" style="stop-color:${esc(c)}"/>`).join("");
    return `<defs><linearGradient id="bar">${stops}</linearGradient></defs><rect class="bar" x="${X0}" y="${y - 2.5}" width="${f1(x1 - X0)}" height="5" rx="2.5" fill="url(#bar)"/>
${arrow(mx, y - 13)}${ends(m, y + 19)}${m.short ? corner(m) : m.wide ? lead(m, 100) : big(m, 100, 112, 46)}`;
  },
  dots(m) {
    const y = m.short ? 78 : 168, x1 = right(m), s = m.series ?? [], n = Math.max(2, s.length);
    const px = (i) => X0 + 3 + (i / (n - 1)) * (x1 - X0 - 6);
    let out = "";
    s.forEach((v, i) => {
      const k = m.norm(v);
      out += `<circle data-i="${i}" cx="${f1(px(i))}" cy="${y}" r="${f1(1.5 + k * 3.5)}" opacity="${(0.4 + 0.6 * k).toFixed(2)}"/>`;
    });
    return `<g class="row">${out}</g>${m.wide ? marks(m, px, y + 21) : ends(m, y + 21)}${m.short ? corner(m) : m.wide ? lead(m, 100) : big(m, 100, 112, 46)}`;
  },
};

// a faint grain over the glow keeps its darkest parts from banding into steps
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='.33 .33 .33 0 0 .33 .33 .33 0 0 .33 .33 .33 0 0 0 0 0 0 .1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;
// from the heart to the rim in eased steps, so that the falloff has no edge and no ring of a muddy in-between colour
const BODY = `var(--_aura-core) 0%,
  color-mix(in oklab, var(--_aura-core) 92%, var(--_aura-mid)) 12%,
  color-mix(in oklab, var(--_aura-core) 70%, var(--_aura-mid)) 24%,
  color-mix(in oklab, var(--_aura-core) 40%, var(--_aura-mid)) 36%,
  color-mix(in oklab, var(--_aura-core) 14%, var(--_aura-mid)) 47%,
  var(--_aura-mid) 56%,
  color-mix(in oklab, var(--_aura-mid) 74%, var(--_aura-edge)) 68%,
  color-mix(in oklab, var(--_aura-mid) 40%, var(--_aura-edge)) 82%,
  color-mix(in oklab, var(--_aura-mid) 12%, var(--_aura-edge)) 94%,
  var(--_aura-edge) 100%`;
const SHAPE = "calc(var(--rx, 74%) * var(--_aura-grow)) calc(var(--ry, 64%) * var(--_aura-grow)) at var(--_aura-gx) var(--_aura-gy)";
const LIGHT = "120% 70% at 50% -16%";

const TILE_CSS = `
:host{display:block;position:relative;aspect-ratio:200/236;container-type:size;color:var(--aura-ink,#fff);font-family:var(--aura-font,inherit);
  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:pan-y;outline:none;--ease:cubic-bezier(.22,1,.36,1)}
:host([data-size=short]){aspect-ratio:200/112}
:host([hidden]){display:none}
:host([editing]){touch-action:none}
.tile{position:absolute;inset:0;overflow:hidden;isolation:isolate;--u:calc(100cqh / 236);border-radius:var(--aura-radius,clamp(12px,calc(var(--u) * 18),28px));
  --accent:var(--aura-accent,var(--tone-accent));
  box-shadow:inset 0 0 0 1px rgb(255 255 255/.14),inset 0 1px 1px rgb(255 255 255/.3);
  transition:transform .4s var(--ease),opacity .3s,filter .3s}
:host([data-size=short]) .tile{--u:calc(100cqh / 112)}
.glow{position:absolute;inset:0;z-index:-1;border-radius:inherit;
  --_aura-edge:var(--aura-edge,var(--tone-edge));--_aura-mid:var(--aura-mid,var(--tone-mid));--_aura-core:var(--aura-core,var(--tone-core));
  --_aura-gx:calc(var(--gx,50%) + var(--lean,0%) + var(--px,0%));--_aura-gy:calc(var(--gy,54%) + var(--py,0%));--_aura-grow:var(--grow,1);
  background:radial-gradient(${LIGHT},color-mix(in oklab,var(--_aura-edge) 80%,#fff),transparent 64%),radial-gradient(${SHAPE},${BODY});
  background:${GRAIN},radial-gradient(${LIGHT} in oklab,color-mix(in oklab,var(--_aura-edge) 80%,#fff),transparent 64%),radial-gradient(${SHAPE} in oklab,${BODY});
  background-blend-mode:soft-light,normal,normal;
  transition:--_aura-edge .9s var(--ease),--_aura-mid .9s var(--ease),--_aura-core .9s var(--ease),--_aura-gx 1s var(--ease),--_aura-gy 1s var(--ease),--_aura-grow 1s var(--ease),filter .6s}
:host([data-size=short]) .glow{--rx:60%;--ry:118%;--gx:66%;--gy:50%}
:host([data-wide]) .glow{--rx:68%;--ry:82%}
:host([data-wide][data-size=short]) .glow{--rx:44%;--ry:122%;--gx:70%}
.tile::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none}
.tile::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;translate:-100% 0;background:linear-gradient(110deg,transparent 30%,rgb(255 255 255/.2) 50%,transparent 70%)}
.tile[data-state=loading]::after{opacity:1;animation:sheen 1.5s ease-in-out infinite}
@keyframes sheen{to{translate:100% 0}}
.tile[data-state=loading] .glow,.tile[data-state=empty] .glow,.tile[data-state=error] .glow{filter:saturate(.1) brightness(.72)}
.tile[data-state=stale] .glow{filter:saturate(.35) brightness(.9)}
.tile[data-state=loading] svg,.tile[data-state=empty] svg,.tile[data-state=error] svg{opacity:.28}
.tile[data-state=loading] .val,.tile[data-state=loading] .foot{opacity:0}
.tile[data-state=error]{cursor:pointer}
.tile[data-level=alert]::before{box-shadow:inset 0 0 0 1.5px var(--accent);animation:alarm 1.6s ease-in-out infinite}
@keyframes alarm{50%{box-shadow:inset 0 0 0 3.5px var(--accent)}}
.tile[data-level=alert] .label::after{content:"";display:inline-block;width:.42em;height:.42em;margin-left:.36em;vertical-align:.1em;border-radius:50%;background:var(--accent)}
@media (hover:hover){:host(:not([editing]):hover) .tile{transform:translateY(-2px) scale(1.012)}}
:host(:not([editing]):active) .tile{transform:scale(.97);transition-duration:.12s}
:host(:focus-visible) .tile{outline:2px solid var(--aura-focus,#0c75f1);outline-offset:3px}
:host([editing]) .tile{animation:jiggle .3s var(--aura-jiggle,0s) ease-in-out infinite alternate;cursor:grab}
@keyframes jiggle{from{rotate:-.75deg}to{rotate:.75deg}}
:host([dragging]),:host([resizing]){z-index:5}
:host([dragging]) .tile{animation:none;transform:scale(1.06);cursor:grabbing;box-shadow:inset 0 0 0 1px rgb(255 255 255/.2)}
:host([resizing]) .tile{animation:none;box-shadow:inset 0 0 0 1.5px rgb(255 255 255/.55)}
:host([off]) .tile{opacity:.42;filter:saturate(.25)}
:host([off]) .tile::before{border:1.5px dashed rgb(255 255 255/.6)}
.badge,.grip{position:absolute;z-index:2;width:24px;height:24px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;
  background:rgb(44 44 46/.94);color:#fff;box-shadow:inset 0 0 0 1px rgb(255 255 255/.14);
  opacity:0;scale:.3;pointer-events:none;transition:opacity .2s,scale .35s var(--ease)}
.badge{left:-7px;top:-7px;cursor:pointer}
/* inside the corner, as on a widget, and above the badge of the tile below and to the right */
.grip{right:5px;bottom:5px;z-index:3;cursor:ew-resize;touch-action:none}
.badge::before,.grip::before{content:"";position:absolute;inset:-6px}
.badge svg,.grip svg{position:static;width:14px;height:14px;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none}
.badge .plus{display:none}
:host([off]) .badge .plus{display:inline}
:host([editing]) .badge,:host([editing]:not([off])) .grip{opacity:1;scale:1;pointer-events:auto}
:host([dragging]) .badge,:host([dragging]) .grip{opacity:0}
.head,.foot{position:absolute;left:calc(var(--u) * 18);right:calc(var(--u) * 18);pointer-events:none}
.head{top:calc(var(--u) * 16);font-size:calc(var(--u) * 14.4);line-height:1.2;font-weight:600;letter-spacing:-.005em}
:host([data-corner]) .head{right:calc(var(--u) * 72)}
:host([data-size=short]) .foot,:host([data-wide]) .foot{display:none}
.label,.sub{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{opacity:.6}
.foot{bottom:calc(var(--u) * 15.2);font-size:calc(var(--u) * 12);line-height:1.1;font-weight:500;opacity:.62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .3s}
:host([data-kind=swatch]) .foot{opacity:.9}
:host([data-kind=swatch]) .foot:not(:empty)::before{content:"";display:inline-block;width:.62em;height:.62em;margin-right:.4em;border-radius:50%;background:var(--swatch,var(--accent));vertical-align:-.04em}
svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;transition:opacity .4s}
.val{fill:currentColor;font-weight:400;letter-spacing:-.025em}
.unit{fill-opacity:.5;letter-spacing:0}
.dotted .num{fill:none;stroke:currentColor;stroke-width:1.15;stroke-dasharray:0 2.3;stroke-linecap:round}
.end,.tip{fill:currentColor;font-size:11px;font-weight:500}
.end{fill-opacity:.5}.end.em{fill-opacity:.95}.tip{font-weight:600}
.fact{fill:currentColor;fill-opacity:.62;font-size:11px;font-weight:500}
.fact-v{fill:currentColor;font-size:19px;font-weight:500;letter-spacing:-.01em}
.track{fill:none;stroke:rgb(255 255 255/.22);stroke-width:1.2}
.arc{fill:none;stroke:var(--accent);stroke-width:2.6;stroke-linecap:round}
.knob,.mark{fill:var(--accent)}
.ticks line,.ruler line,.strip line{stroke:rgb(255 255 255/.42);stroke-width:1.1;stroke-linecap:round}
.ruler line{transform-box:fill-box;transform-origin:50% 100%;transition:transform .25s var(--ease),stroke .25s}
.ruler .minor{stroke-opacity:.45}
.ruler .on{stroke:#fff;stroke-width:2.2;transform:scaleY(1.4)}
.hot line{stroke:var(--accent);stroke-width:2.2;stroke-linecap:round}
.w{fill:none;stroke:var(--accent);stroke-width:1.5;stroke-linecap:round}.w2{stroke-opacity:.5}
.breath{animation:breath 5s ease-in-out infinite}
@keyframes breath{50%{transform:scaleY(.55)}}
.rest{stroke:rgb(255 255 255/.32);stroke-width:1.3}
.fill{stroke:var(--accent);stroke-width:1.8;stroke-linecap:round}
.pulse{animation:pulse 3.4s ease-in-out infinite}
@keyframes pulse{50%{transform:scaleY(.8)}}
.pulse line{stroke:rgb(255 255 255/.38);stroke-width:1.2;stroke-linecap:round;transform-box:fill-box;transform-origin:50% 50%}
.pulse .zero{stroke:rgb(255 255 255/.85)}
.pulse .hot{stroke:var(--accent);stroke-width:2.2}
.cross{stroke:rgb(255 255 255/.16);stroke-width:1}
.dots circle{fill:var(--accent)}.dots .sat{fill-opacity:.62}.dots .nil{fill:#fff;fill-opacity:.32}
.dots circle,.row circle{transform-box:fill-box;transform-origin:50% 50%}
.dots .on,.row .on{stroke:#fff;stroke-width:1.6}
.halo{fill:none;stroke:rgb(255 255 255/.55);stroke-width:1.3;stroke-dasharray:0 4.7;stroke-linecap:round}
.sw{fill:var(--swatch,var(--accent));transition:fill .9s var(--ease)}
.needle{stroke:#fff;stroke-width:1.6;stroke-linecap:round}
.row circle{fill:#fff}
.strip line{transform-box:fill-box;transform-origin:50% 50%}
.enter .arc{animation:arc-in 1.2s var(--ease) both}
@keyframes arc-in{from{stroke-dashoffset:100px}}
.enter .spin{animation:spin-in 1.2s var(--ease) both}
@keyframes spin-in{from{transform:rotate(0deg)}}
.enter .ruler line,.enter .pulse line,.enter .strip line{animation:grow .9s var(--ease) both}
@keyframes grow{from{transform:scaleY(0)}}
.enter .dots circle,.enter .row circle,.enter .sw{animation:pop .8s var(--ease) both}
@keyframes pop{from{transform:scale(0)}}
.enter .mark,.enter .needle,.enter .w,.enter .fill,.enter .fact,.enter .fact-v{animation:fade .7s .25s both}
@keyframes fade{from{opacity:0}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (prefers-reduced-motion:reduce){*,.tile::after,.tile::before{animation:none!important;transition:none!important}}`;

const STATE_TEXT = { empty: ["No data", "Нет данных"], error: ["Couldn't load · retry", "Не загрузилось · повторить"], stale: ["Not updated", "Не обновлялось"] };

export class AuraTile extends HTMLElement {
  static observedAttributes = ATTRS;
  #data = {};
  #m = null;
  #shown = null;
  #to = null;
  #raf = 0;
  #scrub = null;
  #queued = false;
  #ready = false;
  #entered = 0;
  #down = null;
  #moved = false;
  #rest = 0;
  #W = 200;
  // the drawing follows the tile's own proportions: a wider tile is wider in drawing units, not larger
  #size = new ResizeObserver(([entry]) => {
    const box = entry.contentBoxSize?.[0], w = box ? box.inlineSize : entry.contentRect.width, h = box ? box.blockSize : entry.contentRect.height;
    if (!w || !h) return;
    const W = Math.max(120, Math.round(((this.dataset.size === "short" ? 112 : 236) * w) / h));
    if (Math.abs(W - this.#W) < 2) return;
    this.#W = W;
    this.#queue();
  });

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${TILE_CSS}</style><div class="tile" part="tile"><div class="glow" aria-hidden="true"></div>
<svg part="viz" aria-hidden="true"></svg><div class="head"><span class="label" part="label"></span><span class="sub" part="sublabel"></span></div><div class="foot" part="caption"></div></div>
<button class="badge" part="badge" type="button" tabindex="-1"><svg viewBox="0 0 24 24"><path d="M6.5 12h11"/><path class="plus" d="M12 6.5v11"/></svg></button>
<span class="grip" part="grip" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6.5L3.5 12 9 17.5M15 6.5l5.5 5.5-5.5 5.5"/></svg></span><span class="sr" aria-live="polite"></span>`;
    this.addEventListener("pointerdown", (e) => { this.#down = { x: e.clientX, y: e.clientY }; this.#moved = false; clearTimeout(this.#rest); });
    this.addEventListener("pointermove", (e) => this.#pointer(e));
    this.addEventListener("pointerup", (e) => {
      this.#down = null;
      if (e.pointerType !== "mouse" && this.#scrub !== null) this.#rest = setTimeout(() => this.#scrubTo(null), 1400);
    });
    this.addEventListener("pointerleave", (e) => {
      const tile = this.shadowRoot.querySelector(".tile");
      tile.style.removeProperty("--px");
      tile.style.removeProperty("--py");
      if (e.pointerType === "mouse") this.#scrubTo(null);
    });
    this.addEventListener("blur", () => this.#scrubTo(null));
    this.addEventListener("click", () => {
      if (this.#moved || this.hasAttribute("editing")) return;
      if (this.#m?.state === "error") emit(this, "aura-retry", { key: keyOf(this) });
      else emit(this, "aura-select", { key: keyOf(this), value: this.#m?.value ?? null, index: this.#scrub, data: { ...this.#data } });
    });
    this.addEventListener("keydown", (e) => this.#key(e));
    root.querySelector(".badge").addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleAttribute("off");
      emit(this, "aura-toggle", { key: keyOf(this), hidden: this.hasAttribute("off") });
    });
  }

  connectedCallback() {
    this.shadowRoot.querySelector(".badge").setAttribute("aria-label", ru(this) ? "Скрыть или вернуть" : "Hide or bring back");
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    if (!this.hasAttribute("role")) this.setAttribute("role", "group");
    this.#size.observe(this);
    this.#queue();
  }

  disconnectedCallback() { this.#size.disconnect(); }

  attributeChangedCallback() { this.#queue(); }

  /** Everything the tile shows, as one object; attributes, when present, win over it. */
  get data() { return { ...this.#data }; }
  set data(value) { this.#data = value && typeof value === "object" ? { ...value } : {}; this.#queue(); }
  /** Merges a part of the data: tile.update({ value: 21 }). */
  update(patch) { Object.assign(this.#data, patch); this.#queue(); }

  #queue() {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => { this.#queued = false; this.#render(); });
  }

  #model() {
    const d = { ...this.#data };
    for (const name of ATTRS) if (this.hasAttribute(name)) d[name] = this.getAttribute(name);
    const kind = KINDS.includes(d.kind) ? d.kind : "ring";
    const series = items(d.series)?.map(num);
    const hasSeries = !!series && series.length > 1;
    const finite = hasSeries ? series.filter(Number.isFinite) : [];
    const lo = num(d.min) ?? (finite.length ? Math.min(...finite) : 0);
    const hi = num(d.max) ?? (finite.length ? Math.max(...finite) : 100);
    const span = hi - lo || 1;
    const at = hasSeries ? clamp(Math.round(num(d.at) ?? 0), 0, series.length - 1) : 0;
    const value = num(d.value) ?? (hasSeries ? series[at] : null);
    const state = ["loading", "empty", "error", "stale"].includes(d.state) ? d.state : value === null && !d.text ? "empty" : "ready";
    const decimals = num(d.decimals) ?? (value !== null && Math.abs(value) < 10 && !Number.isInteger(value) ? 1 : 0);
    const lang = ru(this) ? "ru" : (this.closest("[lang]")?.lang || navigator.language || "en");
    const threshold = num(d.alert);
    const short = d.size === "short", wide = this.#W >= WIDE, caption = d.caption ?? "";
    return {
      kind, state, value, lo, hi, at, decimals, short, wide, W: this.#W,
      series: hasSeries ? series : null,
      norm: (v) => (Number.isFinite(v) ? clamp((v - lo) / span) : 0),
      t: value === null ? 0.5 : clamp((value - lo) / span),
      zero: lo < 0 && hi > 0 ? -lo / span : -1,
      label: d.label ?? "", sublabel: d.sublabel ?? "", unit: d.unit ?? "", caption,
      // what the tile says instead of its caption when it has nothing fresh to show
      message: STATE_TEXT[state] ? d.message ?? STATE_TEXT[state][ru(this) ? 1 : 0] : "",
      // a wide tile has no footer line: its caption joins the facts
      facts: wide && !short ? factsOf(d.facts) ?? (caption ? [["", caption]] : null) : null,
      ends: items(d.ends), times: items(d.times), stops: items(d.stops),
      angle: num(d.angle), spread: num(d.spread), color: d.color || "",
      tone: d.tone ?? "teal", dotted: d.numerals === "dotted",
      alert: d.alert === true || d.alert === "" || d.alert === "true" || (threshold !== null && value !== null && value >= threshold),
      fixed: d.text !== undefined && d.text !== null,
      format: formatter(lang, decimals, kind === "pulse"),
      text: d.text ?? (state === "ready" || state === "stale" ? null : "—"),
    };
  }

  #render() {
    const m = this.#model(), root = this.shadowRoot, tile = root.querySelector(".tile");
    if (m.text === null) m.text = m.format(m.value);
    if (this.#scrub !== null && (!m.series || this.#scrub >= m.series.length)) this.#scrub = null;
    this.#m = m;
    Object.assign(this.dataset, { kind: m.kind, size: m.short ? "short" : "tall" });
    this.toggleAttribute("data-wide", m.wide);
    this.toggleAttribute("data-corner", m.short && ["meter", "dots"].includes(m.kind) && !!m.text);
    tile.dataset.state = m.state;
    tile.dataset.level = m.alert && m.state === "ready" ? "alert" : "";

    const [edge, mid, core, accent] = resolveTone(m.tone, m.value);
    const style = tile.style;
    style.setProperty("--tone-edge", edge);
    style.setProperty("--tone-mid", mid);
    style.setProperty("--tone-core", core);
    style.setProperty("--tone-accent", accent);
    if (m.color) style.setProperty("--swatch", m.color); else style.removeProperty("--swatch");
    // the heart of the glow leans toward the reading on the gauges that have a side, further on a wide tile
    style.setProperty("--lean", LEAN.has(m.kind) ? `${f1((m.t - 0.5) * (m.wide ? 44 : 24))}%` : "0%");
    style.setProperty("--grow", (0.92 + 0.16 * m.t).toFixed(3));
    // a round gauge stays in the first column of a wide tile, and the heart of the glow stays behind it
    if (m.wide && !m.short && ["ring", "dial", "swatch"].includes(m.kind) && (m.facts || m.kind === "swatch")) style.setProperty("--gx", "36%");
    else style.removeProperty("--gx");

    root.querySelector(".label").textContent = m.label;
    root.querySelector(".sub").textContent = m.short || m.wide ? m.message || m.sublabel : m.sublabel;
    root.querySelector(".foot").textContent = m.message || m.caption;
    const svg = root.querySelector("svg[part=viz]");
    svg.setAttribute("viewBox", `0 0 ${m.W} ${m.short ? 112 : 236}`);
    svg.innerHTML = VIEW[m.kind](m);
    if (m.state === "ready" && !this.#ready) this.#entered = performance.now();
    const entering = m.state === "ready" && performance.now() - this.#entered < 160; // a resize right after the first reading keeps its entrance
    this.#ready = m.state === "ready" || m.state === "stale";
    svg.classList.toggle("enter", entering && !reduced());
    this.#tween(m, entering);
    this.#mark();
    this.setAttribute("aria-label", [m.label, m.sublabel].filter(Boolean).join(", ") + `: ${m.text}${m.unit ? ` ${m.unit}` : ""}${m.message || m.caption ? `. ${m.message || m.caption}` : ""}`);
  }

  // counts the number up to a new reading; a redraw on the way does not restart it
  #tween(m, entering) {
    if (m.value === this.#to && this.#raf) return;
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    const from = this.#shown;
    this.#to = m.value;
    this.#shown = m.value;
    if (m.fixed || m.value === null || reduced()) return;
    const start = from !== null ? from : entering ? (m.zero >= 0 ? 0 : m.lo) : m.value; // a first reading counts up from the bottom of its scale, or from zero
    if (start === m.value) return;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 900), current = start + (m.value - start) * (1 - (1 - k) ** 4);
      const el = this.shadowRoot.querySelector(".num");
      this.#shown = current;
      if (el && this.#scrub === null) el.textContent = m.format(current);
      this.#raf = k < 1 ? requestAnimationFrame(step) : 0;
    };
    this.#raf = requestAnimationFrame(step);
  }

  #pointer(e) {
    if (this.hasAttribute("editing")) return;
    const r = this.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (e.pointerType === "mouse") {
      const tile = this.shadowRoot.querySelector(".tile");
      tile.style.setProperty("--px", `${f1((x - 0.5) * 12)}%`);
      tile.style.setProperty("--py", `${f1((y - 0.5) * 10)}%`);
    }
    if (this.#down && Math.hypot(e.clientX - this.#down.x, e.clientY - this.#down.y) > 6) this.#moved = true;
    const m = this.#m;
    if (!m?.series || !SCRUB.has(m.kind) || (e.pointerType !== "mouse" && !e.buttons)) return;
    const n = m.series.length;
    this.#scrubTo(clamp(Math.round(((x * m.W - X0) / (m.W - 2 * X0)) * (n - 1)), 0, n - 1));
  }

  #key(e) {
    if (this.hasAttribute("editing") || e.target !== this) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.#moved = false; this.click(); return; }
    const m = this.#m;
    if (!m?.series || !SCRUB.has(m.kind)) return;
    const n = m.series.length, i = this.#scrub ?? m.at;
    const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1, Escape: null }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    this.#scrubTo(next === null ? null : clamp(next, 0, n - 1));
  }

  #scrubTo(i) {
    if (i === this.#scrub || !this.#m) return;
    this.#scrub = i;
    this.#mark();
    const m = this.#m;
    if (i !== null) emit(this, "aura-scrub", { key: keyOf(this), index: i, value: m.series[i], time: m.times?.[i] ?? null });
  }

  // highlights the current point (or the one under the pointer) and shows its reading
  #mark() {
    const m = this.#m, root = this.shadowRoot, svg = root.querySelector("svg[part=viz]");
    if (!m) return;
    const i = this.#scrub, cur = i ?? (m.series ? m.at : Math.round(m.t * 40));
    svg.querySelectorAll(".on").forEach((el) => el.classList.remove("on"));
    if (m.kind === "ruler" || i !== null) svg.querySelector(`[data-i="${cur}"]`)?.classList.add("on");
    const numEl = svg.querySelector(".num"), foot = root.querySelector(".foot"), sub = root.querySelector(".sub");
    const time = i !== null ? m.times?.[i] ?? `${i}` : null;
    if (m.kind === "scatter") {
      const dot = svg.querySelector(`[data-i="${cur}"]`), v = svg.querySelector(".cross.v"), tip = svg.querySelector(".tip");
      if (dot && v) { v.setAttribute("x1", dot.getAttribute("cx")); v.setAttribute("x2", dot.getAttribute("cx")); tip?.setAttribute("x", dot.getAttribute("cx")); }
      if (tip) tip.textContent = i === null ? "" : `${time} · ${m.format(m.series[i])}`;
    }
    if (numEl && this.#raf === 0) numEl.textContent = i === null ? m.text : m.format(m.series[i]);
    else if (numEl && i !== null) numEl.textContent = m.format(m.series[i]);
    if (m.short || m.wide) sub.textContent = i === null ? m.message || m.sublabel : time;
    else if (m.kind !== "scatter") foot.textContent = i === null ? m.message || m.caption : time;
    if (i !== null) root.querySelector(".sr").textContent = `${time}: ${m.format(m.series[i])}${m.unit ? ` ${m.unit}` : ""}`;
  }
}

const BOARD_CSS = `
:host{display:flex;flex-direction:column;container:aura-board/inline-size;--ease:cubic-bezier(.22,1,.36,1)}
.grid{--cols:var(--aura-columns,2);--gap:var(--aura-gap,10px);display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));
  grid-auto-rows:calc((100cqi - (var(--cols) - 1) * var(--gap)) / var(--cols) * var(--aura-row,.56));grid-auto-flow:row dense;gap:var(--gap)}
@container aura-board (min-width:520px){.grid{--cols:var(--aura-columns,3)}}
@container aura-board (min-width:760px){.grid{--cols:var(--aura-columns,4)}}
::slotted(aura-tile){grid-row:span 2;aspect-ratio:auto}
::slotted(aura-tile[data-size=short]){grid-row:span 1}
::slotted(aura-tile[data-span="2"]){grid-column:span 2}
::slotted(aura-tile[data-span="3"]){grid-column:span 3}
::slotted(aura-tile[data-span="4"]){grid-column:span 4}
.bar{position:relative;display:flex;align-items:center;justify-content:center;min-height:56px;margin-top:auto;padding-top:var(--aura-bar-gap,24px)}
:host(:not([editable])) .bar{display:none}
button{font:inherit;-webkit-tap-highlight-color:transparent}
.round{position:absolute;bottom:0;width:56px;height:56px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;cursor:pointer;
  opacity:0;scale:.5;pointer-events:none;transition:opacity .2s,scale .4s var(--ease)}
.round svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.cancel{left:0;background:rgb(28 28 30/.94);color:#fff;box-shadow:inset 0 0 0 1px rgb(255 255 255/.12)}
.done{right:0;background:#fff;color:#111}
:host([editing]) .round{opacity:1;scale:1;pointer-events:auto}
.pill{height:34px;padding:0 18px;border:0;border-radius:17px;cursor:pointer;font:500 13px/1 var(--aura-font,inherit);letter-spacing:.01em;
  background:var(--aura-bar-bg,rgb(118 118 128/.3));color:var(--aura-bar-ink,rgb(255 255 255/.92));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:background .25s,color .25s}
.pill:disabled{cursor:default;background:transparent;color:color-mix(in srgb,var(--aura-bar-ink,#fff) 55%,transparent)}
button:focus-visible{outline:2px solid var(--aura-focus,#0c75f1);outline-offset:3px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}`;

const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const inside = (r, x, y) => r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

export class AuraBoard extends HTMLElement {
  static observedAttributes = ["editable", "lang"];
  #snapshot = null;
  #drag = null;
  #press = 0;
  #swallow = false;
  #restored = false;
  // the columns change with the board's width; a tile is never wider than they are
  #width = new ResizeObserver(() => this.#spans());
  #watch = new MutationObserver(() => this.#spans());

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${BOARD_CSS}</style><div class="grid" part="grid"><slot></slot></div>
<div class="bar" part="toolbar"><button class="round cancel" part="cancel" type="button"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
<button class="pill" part="edit" type="button"></button><button class="round done" part="done" type="button"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button></div>
<span class="sr" aria-live="polite"></span>`;
    root.querySelector(".cancel").addEventListener("click", () => this.cancel());
    root.querySelector(".done").addEventListener("click", () => this.done());
    root.querySelector(".pill").addEventListener("click", () => this.edit());
    root.querySelector("slot").addEventListener("slotchange", () => { this.#restore(); this.#spans(); });
    this.addEventListener("pointerdown", (e) => this.#pointerDown(e));
    this.addEventListener("pointermove", (e) => this.#pointerMove(e));
    this.addEventListener("pointerup", (e) => this.#pointerUp(e));
    this.addEventListener("pointercancel", (e) => this.#pointerUp(e));
    this.addEventListener("contextmenu", (e) => { if (this.editing || this.#press) e.preventDefault(); });
    this.addEventListener("keydown", (e) => this.#key(e));
    this.addEventListener("aura-toggle", (e) => this.#toggled(e.target));
    // a long press or a drag ends in a click; it must not open the tile
    this.addEventListener("click", (e) => { if (this.#swallow) { this.#swallow = false; e.stopPropagation(); } }, true);
  }

  connectedCallback() {
    this.#label();
    this.#width.observe(this);
    this.#watch.observe(this, { attributes: true, subtree: true, attributeFilter: ["span"] });
    this.#spans();
  }

  disconnectedCallback() {
    this.#width.disconnect();
    this.#watch.disconnect();
  }

  attributeChangedCallback() { this.#label(); }

  get tiles() { return [...this.children].filter((el) => el.localName === "aura-tile"); }
  get editing() { return this.hasAttribute("editing"); }

  /** { order: [key…], hidden: [key…], spans: { key: columns } } — a key is the tile's id, metric or label. */
  get layout() {
    const tiles = this.tiles, spans = {};
    for (const t of tiles) if (spanOf(t) > 1) spans[keyOf(t)] = spanOf(t);
    return { order: tiles.map(keyOf), hidden: tiles.filter((t) => t.hidden || t.hasAttribute("off")).map(keyOf), spans };
  }
  set layout(layout) {
    if (!Array.isArray(layout?.order)) return;
    const tiles = this.tiles, byKey = new Map(tiles.map((t) => [keyOf(t), t]));
    for (const k of layout.order) if (byKey.has(k)) this.append(byKey.get(k));
    for (const t of tiles) if (!layout.order.includes(keyOf(t))) this.append(t); // tiles added since go last
    const hidden = new Set(layout.hidden ?? []);
    for (const t of tiles) t.hidden = hidden.has(keyOf(t));
    // a layout kept before widths existed leaves the widths of the markup alone
    if (layout.spans && typeof layout.spans === "object") {
      for (const t of tiles) {
        const s = num(layout.spans[keyOf(t)]);
        if (s > 1) t.setAttribute("span", s); else t.removeAttribute("span");
      }
    }
    this.#spans();
  }

  edit() {
    if (this.editing) return;
    this.#snapshot = this.tiles.map((t) => [t, t.hidden, t.getAttribute("span")]);
    this.#flip(() => {
      this.setAttribute("editing", "");
      for (const t of this.tiles) {
        // a hidden tile shows as a ghost while editing; `off`, because page resets pin [hidden] to display: none
        t.toggleAttribute("off", t.hidden);
        t.hidden = false;
        t.setAttribute("editing", "");
        t.style.setProperty("--aura-jiggle", `${(-Math.random() * 0.6).toFixed(2)}s`);
      }
    });
    this.#label();
    emit(this, "aura-edit", { editing: true });
  }

  done() {
    if (!this.editing) return;
    this.#leave(() => { for (const t of this.tiles) t.hidden = t.hasAttribute("off"); });
    const layout = this.layout, key = this.getAttribute("persist");
    if (key) try { localStorage.setItem(`aura-board:${key}`, JSON.stringify(layout)); } catch { /* private mode: the layout lives until reload */ }
    emit(this, "aura-change", layout);
    emit(this, "aura-edit", { editing: false });
  }

  cancel() {
    if (!this.editing) return;
    const snapshot = this.#snapshot ?? [];
    this.#leave(() => {
      for (const [t, hidden, span] of snapshot) {
        this.append(t);
        t.hidden = hidden;
        if (span) t.setAttribute("span", span); else t.removeAttribute("span");
      }
      this.#spans();
    });
    emit(this, "aura-edit", { editing: false });
  }

  #leave(change) {
    this.#flip(() => {
      change?.();
      this.removeAttribute("editing");
      for (const t of this.tiles) { t.removeAttribute("editing"); t.removeAttribute("off"); }
    });
    this.#snapshot = null;
    this.#label();
  }

  #label() {
    const r = ru(this), pill = this.shadowRoot.querySelector(".pill");
    pill.textContent = this.editing ? (r ? "Перетащите или растяните плитку" : "Drag to move, pull a corner to widen") : r ? "Изменить" : "Edit";
    pill.disabled = this.editing;
    this.shadowRoot.querySelector(".cancel").setAttribute("aria-label", r ? "Отменить" : "Cancel");
    this.shadowRoot.querySelector(".done").setAttribute("aria-label", r ? "Готово" : "Done");
  }

  #restore() {
    if (this.#restored) return;
    this.#restored = true;
    const key = this.getAttribute("persist");
    if (!key) return;
    try { this.layout = JSON.parse(localStorage.getItem(`aura-board:${key}`)); } catch { /* nothing saved, or no storage */ }
  }

  #cols() {
    return getComputedStyle(this.shadowRoot.querySelector(".grid")).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
  }

  // the width a tile asks for (span), held to the columns there are; the grid reads data-span
  #spans() {
    const cols = this.#cols();
    for (const t of this.tiles) {
      const s = Math.min(spanOf(t), cols);
      if (s > 1) t.dataset.span = s; else delete t.dataset.span;
    }
  }

  // moves tiles to their new places smoothly; returns where each one ends up
  #flip(change, skip) {
    const tiles = this.tiles.filter((t) => t !== skip);
    const first = new Map(tiles.map((t) => [t, center(t)]));
    const seen = new Set(tiles.filter((t) => t.getBoundingClientRect().width));
    change();
    const rects = new Map();
    for (const t of this.tiles) {
      if (t === skip) continue;
      t.getAnimations().forEach((a) => a.id === "aura-flip" && a.cancel());
      const rect = t.getBoundingClientRect();
      rects.set(t, rect);
      if (reduced() || !rect.width) continue;
      if (!seen.has(t)) { t.animate([{ opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 }], { duration: 260, easing: "ease-out", id: "aura-flip" }); continue; }
      const a = first.get(t), dx = a.x - (rect.left + rect.width / 2), dy = a.y - (rect.top + rect.height / 2);
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      t.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)", id: "aura-flip" });
    }
    return rects;
  }

  // a new width, the way a widget snaps to its next size
  #resize(tile, span) {
    const s = clamp(span, 1, Math.min(MAX_SPAN, this.#cols()));
    if (s === Math.min(spanOf(tile), this.#cols())) return false;
    this.#flip(() => {
      if (s > 1) tile.setAttribute("span", s); else tile.removeAttribute("span");
      this.#spans();
    });
    tile.animate([{ opacity: 0.55, scale: 0.97 }, { opacity: 1, scale: 1 }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    navigator.vibrate?.(6);
    this.#say(tile);
    return true;
  }

  #pointerDown(e) {
    this.#swallow = false;
    const tile = e.target.closest?.("aura-tile");
    if (!tile || tile.parentElement !== this || e.button > 0 || !this.hasAttribute("editable")) return;
    const inner = e.composedPath()[0];
    if (inner?.closest?.(".badge")) return;
    if (inner?.closest?.(".grip") && this.editing) {
      const grid = this.shadowRoot.querySelector(".grid"), cols = this.#cols(), gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      this.#drag = { tile, id: e.pointerId, x: e.clientX, mode: "resize", from: Math.min(spanOf(tile), cols), step: (grid.clientWidth - gap * (cols - 1)) / cols + gap };
      tile.setPointerCapture?.(e.pointerId);
      tile.setAttribute("resizing", "");
      this.#swallow = true;
      return;
    }
    this.#drag = { tile, id: e.pointerId, x: e.clientX, y: e.clientY, live: false, ox: 0, oy: 0, over: null, rects: null };
    if (this.editing) return;
    clearTimeout(this.#press);
    this.#press = setTimeout(() => {
      this.#press = 0;
      if (this.#drag?.tile !== tile) return;
      this.#swallow = true;
      this.edit();
      navigator.vibrate?.(8);
    }, 480);
  }

  #pointerMove(e) {
    const d = this.#drag;
    if (!d || e.pointerId !== d.id) return;
    if (d.mode === "resize") {
      this.#resize(d.tile, Math.round(d.from + (e.clientX - d.x) / d.step));
      return;
    }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!this.editing) {
      if (Math.hypot(dx, dy) > 8) { clearTimeout(this.#press); this.#press = 0; this.#drag = null; }
      return;
    }
    if (!d.live) {
      if (Math.hypot(dx, dy) < 5) return;
      d.live = true;
      this.#swallow = true;
      d.tile.setPointerCapture?.(e.pointerId);
      d.tile.setAttribute("dragging", "");
      d.rects = new Map(this.tiles.map((t) => [t, t.getBoundingClientRect()]));
    }
    d.tile.style.translate = `${dx + d.ox}px ${dy + d.oy}px`;
    const over = this.tiles.find((t) => t !== d.tile && inside(d.rects.get(t), e.clientX, e.clientY));
    if (!over) { d.over = null; return; }
    if (over === d.over) return;
    d.over = over;
    const tiles = this.tiles, before = center(d.tile);
    d.rects = this.#flip(() => (tiles.indexOf(d.tile) < tiles.indexOf(over) ? over.after(d.tile) : over.before(d.tile)), d.tile);
    // the tile changed its slot under the pointer: shift its offset so it stays where the finger is
    const after = center(d.tile);
    d.ox += before.x - after.x;
    d.oy += before.y - after.y;
    d.tile.style.translate = `${dx + d.ox}px ${dy + d.oy}px`;
  }

  #pointerUp(e) {
    clearTimeout(this.#press);
    this.#press = 0;
    // the click of this same gesture comes right after; a later one is the visitor's own
    if (this.#swallow) setTimeout(() => { this.#swallow = false; });
    const d = this.#drag;
    if (!d || e.pointerId !== d.id) return;
    this.#drag = null;
    if (d.mode === "resize") {
      d.tile.removeAttribute("resizing");
      if (spanOf(d.tile) !== d.from) emit(this, "aura-resize", { key: keyOf(d.tile), span: spanOf(d.tile) });
      return;
    }
    if (!d.live) return;
    const from = d.tile.style.translate;
    d.tile.style.translate = "";
    d.tile.removeAttribute("dragging");
    if (!reduced()) d.tile.animate([{ translate: from }, { translate: "0 0" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
    this.#say(d.tile);
  }

  #toggled(tile) {
    if (tile.parentElement !== this) return;
    if (tile.hasAttribute("off")) this.#flip(() => this.append(tile));
    this.#say(tile);
  }

  #key(e) {
    if (!this.editing) return;
    if (e.key === "Escape") { e.preventDefault(); this.cancel(); return; }
    const tile = e.target.closest?.("aura-tile");
    if (!tile || tile.parentElement !== this) return;
    if (e.key === "Enter") { e.preventDefault(); this.done(); tile.focus(); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      tile.toggleAttribute("off");
      this.#toggled(tile);
      tile.focus({ preventScroll: true });
      return;
    }
    // Shift with an arrow widens or narrows the tile; an arrow alone moves it
    if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      if (this.#resize(tile, Math.min(spanOf(tile), this.#cols()) + (e.key === "ArrowRight" ? 1 : -1))) emit(this, "aura-resize", { key: keyOf(tile), span: spanOf(tile) });
      tile.focus({ preventScroll: true });
      return;
    }
    const cols = this.#cols();
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    if (!step) return;
    e.preventDefault();
    const tiles = this.tiles, i = tiles.indexOf(tile), j = clamp(i + step, 0, tiles.length - 1);
    if (i === j) return;
    this.#flip(() => (j > i ? tiles[j].after(tile) : tiles[j].before(tile)));
    tile.focus({ preventScroll: true });
    this.#say(tile);
  }

  #say(tile) {
    const tiles = this.tiles, r = ru(this), name = tile.getAttribute("aria-label")?.split(":")[0] || keyOf(tile);
    const width = `${r ? "ширина" : "width"} ${Math.min(spanOf(tile), this.#cols())} ${r ? "из" : "of"} ${this.#cols()}`;
    this.shadowRoot.querySelector(".sr").textContent = tile.hidden || tile.hasAttribute("off")
      ? `${name} — ${r ? "скрыта" : "hidden"}`
      : `${name} — ${r ? "место" : "position"} ${tiles.indexOf(tile) + 1} ${r ? "из" : "of"} ${tiles.length}, ${width}`;
  }
}

/* ---------- weather: Open-Meteo forecast and air quality ---------- */

const STRINGS = {
  en: {
    weather: "Weather", feels: "Feels like", high: "High", low: "Low", humidity: "Humidity", dew: "Dew point", dry: "Dry", comfy: "Comfortable", muggy: "Muggy", oppressive: "Oppressive",
    pressure: "Pressure", rising: "Rising", falling: "Falling", steady: "Steady", ago: "3 h ago", trend: "Trend",
    sky: "Sky", clear: "Clear", overcast: "Overcast", cover: "Cloud cover", layers: ["Low", "Middle", "High"],
    warmer: "Warmer", colder: "Colder", same: "Same", than: "than yesterday", as: "as yesterday", yesterday: "Yesterday",
    uv: "UV index", peak: "Peak", noUv: "No sun today", uvLevels: ["Low", "Moderate", "High", "Very high", "Extreme"], hours: ["AM", "PM"],
    wind: "Wind", gusts: "Gusts", from: "From", kmh: "km/h", ms: "m/s", compass: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    air: "Air", quality: "Quality", aqi: ["Good", "Fair", "Moderate", "Poor", "Very poor", "Extremely poor"],
    daylight: "Daylight", left: (d) => `${d} left`, sunrise: (d) => `Sunrise in ${d}`, h: "h", min: "min", polar: "No sunset today", up: "Sunrise", down: "Sunset", length: "Day",
    rain: "Rain", dry12: "Dry for 12 hours", now: "Now", plus12: "+12 h", hour: "Next hour",
    wmo: ["Clear", "Mostly clear", "Partly cloudy", "Overcast", "Fog", "Drizzle", "Rain", "Snow", "Showers", "Thunderstorm"],
    offline: "Offline", failed: "Couldn't load · retry",
  },
  ru: {
    weather: "Погода", feels: "Ощущается", high: "Макс.", low: "Мин.", humidity: "Влажность", dew: "Точка росы", dry: "Сухо", comfy: "Комфортно", muggy: "Душно", oppressive: "Очень душно",
    pressure: "Давление", rising: "Растёт", falling: "Падает", steady: "Стабильно", mm: "мм рт. ст.", ago: "3 ч назад", trend: "Тренд",
    sky: "Небо", clear: "Ясно", overcast: "Пасмурно", cover: "Облачность", layers: ["Нижняя", "Средняя", "Верхняя"],
    warmer: "Теплее", colder: "Холоднее", same: "Так же", than: "чем вчера", as: "как вчера", yesterday: "Вчера",
    uv: "УФ-индекс", peak: "Пик", noUv: "Солнца не будет", uvLevels: ["Низкий", "Умеренный", "Высокий", "Очень высокий", "Экстремальный"], hours: ["0:00", "23:00"],
    wind: "Ветер", gusts: "Порывы", from: "Откуда", kmh: "км/ч", ms: "м/с", compass: ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"],
    air: "Воздух", quality: "Качество", aqi: ["Хороший", "Приемлемый", "Умеренный", "Плохой", "Очень плохой", "Опасный"],
    daylight: "Световой день", left: (d) => `Ещё ${d}`, sunrise: (d) => `Рассвет через ${d}`, h: "ч", min: "мин", polar: "Солнце не зайдёт", up: "Восход", down: "Закат", length: "День",
    rain: "Осадки", dry12: "Сухо 12 часов", now: "Сейчас", plus12: "+12 ч", hour: "Через час",
    wmo: ["Ясно", "Малооблачно", "Местами облачно", "Пасмурно", "Туман", "Морось", "Дождь", "Снег", "Ливень", "Гроза"],
    offline: "Нет связи", failed: "Не загрузилось · повторить",
  },
};
// readable on a dark heart; the official EEA colours are darker at the bad end
const AQI_COLORS = ["#50f0e6", "#5be0a8", "#f0e641", "#ff6a50", "#ff3d7f", "#c77dff"];
const UV_STOPS = ["#4fbf63", "#e8e04a", "#f29a38", "#e8443a", "#a35ce0"];
const DAY_STOPS = ["#4b3c7a", "#f08a5d", "#ffd56b", "#f08a5d", "#4b3c7a"];
// what a tile shows while its first reading loads: kind, label, size
const SHELL = {
  temperature: ["ruler", "weather"], delta: ["pulse", "yesterday"], humidity: ["ring", "humidity"], pressure: ["wave", "pressure"],
  clouds: ["split", "sky"], "uv-day": ["scatter", "uv"], uv: ["meter", "uv", "short"], wind: ["dial", "wind"], air: ["swatch", "air"],
  daylight: ["meter", "daylight", "short"], rain: ["dots", "rain", "short"],
};

const hm = (s) => +s.slice(0, 2) * 60 + +s.slice(3, 5);
const hhmm = (iso) => iso?.slice(11, 16) ?? "";
const toC = (v, w) => (w.imperial ? ((v - 32) * 5) / 9 : v);
const deg = (v) => `${Math.round(v)}°`;
const cond = (code, L) => L.wmo[code <= 3 ? code : code <= 48 ? 4 : code <= 57 ? 5 : code <= 67 ? 6 : code <= 77 ? 7 : code <= 82 ? 8 : code <= 86 ? 7 : 9] ?? "";
const span = (minutes, L) => { const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return h ? `${h} ${L.h} ${m} ${L.min}` : `${m} ${L.min}`; };

const METRICS = {
  temperature(w, x, L) {
    const c = w.current, s = x.day.map((k) => w.hourly.temperature_2m[k]);
    const hi = w.daily.temperature_2m_max[x.d], lo = w.daily.temperature_2m_min[x.d];
    return {
      kind: "ruler", label: L.weather, sublabel: `↑${Math.round(hi)}° ↓${Math.round(lo)}°`, value: c.temperature_2m, unit: "°", decimals: 0,
      series: s, at: x.at, times: x.day.map((k) => hhmm(w.hourly.time[k])), min: Math.min(lo, ...s), max: Math.max(hi, ...s),
      caption: `${L.feels} ${deg(c.apparent_temperature)}`, facts: [[L.feels, deg(c.apparent_temperature)], [L.high, deg(hi)], [L.low, deg(lo)]],
      tone: w.imperial ? toneAt("temperature", toC(c.temperature_2m, w)) : "temperature", numerals: "dotted",
    };
  },
  delta(w, x, L) {
    const now = w.current.temperature_2m, then = w.hourly.temperature_2m[x.i - 24];
    const diff = Number.isFinite(then) ? now - then : null, r = Math.round(diff ?? 0);
    return {
      kind: "pulse", label: r > 0 ? L.warmer : r < 0 ? L.colder : L.same, sublabel: r ? L.than : L.as, value: diff, unit: "°", decimals: 0, min: -10, max: 10,
      caption: Number.isFinite(then) ? `${L.yesterday} ${deg(then)}` : "", facts: Number.isFinite(then) ? [[L.yesterday, deg(then)], [L.now, deg(now)]] : null, tone: "delta",
    };
  },
  humidity(w, x, L) {
    const c = w.current, dew = toC(c.dew_point_2m, w);
    return {
      kind: "ring", label: L.humidity, sublabel: dew < 10 ? L.dry : dew < 16 ? L.comfy : dew < 20 ? L.muggy : L.oppressive,
      value: c.relative_humidity_2m, unit: "%", min: 0, max: 100, caption: `${L.dew} ${deg(c.dew_point_2m)}`,
      facts: [[L.dew, deg(c.dew_point_2m)], [L.feels, deg(c.apparent_temperature)]], tone: "teal",
    };
  },
  pressure(w, x, L) {
    const mm = L === STRINGS.ru, k = mm ? 0.750062 : 1; // Russian forecasts give it in millimetres of mercury
    const p = w.current.pressure_msl, before = w.hourly.pressure_msl[x.i - 3], trend = Number.isFinite(before) ? p - before : 0;
    const word = trend > 1 ? L.rising : trend < -1 ? L.falling : L.steady;
    return {
      kind: "wave", label: L.pressure, sublabel: mm ? L.mm : "hPa", value: p * k, decimals: 0, min: 970 * k, max: 1050 * k,
      caption: word, facts: Number.isFinite(before) ? [[L.ago, String(Math.round(before * k))], [L.trend, word]] : [[L.trend, word]], tone: "coral",
    };
  },
  clouds(w, x, L) {
    const c = w.current, cover = c.cloud_cover;
    const layers = [c.cloud_cover_low, c.cloud_cover_mid, c.cloud_cover_high].map((v, i) => [L.layers[i], `${Math.round(v ?? 0)}%`]);
    return {
      kind: "split", label: L.sky, sublabel: cond(c.weather_code, L), value: cover, unit: "%", min: 0, max: 100, ends: [L.clear, L.overcast],
      caption: L.cover, facts: Number.isFinite(c.cloud_cover_low) ? layers : null, tone: "clouds",
    };
  },
  "uv-day"(w, x, L) {
    const s = x.day.map((k) => w.hourly.uv_index[k] ?? 0), peak = Math.max(...s), at = s.indexOf(peak), when = hhmm(w.hourly.time[x.day[at]]);
    return {
      kind: "scatter", label: L.uv, sublabel: peak < 0.5 ? L.noUv : `${L.peak} ${Math.round(peak)} · ${when}`,
      value: w.current.uv_index, decimals: 0, min: 0, max: Math.max(8, peak), series: s, at: x.at, times: x.day.map((k) => hhmm(w.hourly.time[k])),
      ends: L.hours, facts: [[L.now, String(Math.round(w.current.uv_index))], [L.peak, peak < 0.5 ? "0" : `${Math.round(peak)} · ${when}`]], tone: "blue", alert: 6,
    };
  },
  uv(w, x, L) {
    const u = w.current.uv_index, level = u < 2.5 ? 0 : u < 5.5 ? 1 : u < 7.5 ? 2 : u < 10.5 ? 3 : 4;
    return { kind: "meter", size: "short", label: L.uv, sublabel: L.uvLevels[level], value: u, decimals: 0, min: 0, max: 11, stops: UV_STOPS, ends: ["0", "11+"], tone: "uv", alert: 6 };
  },
  wind(w, x, L) {
    const c = w.current, u = w.windUnit, unit = { kmh: L.kmh, ms: L.ms, mph: "mph" }[u], top = { kmh: 60, ms: 17, mph: 40 }[u];
    const from = L.compass[Math.round(c.wind_direction_10m / 45) % 8];
    return {
      kind: "dial", label: L.wind, sublabel: from, value: c.wind_speed_10m, unit, min: 0, max: top,
      decimals: u === "ms" ? undefined : 0, angle: c.wind_direction_10m, spread: clamp((c.wind_gusts_10m - c.wind_speed_10m) / Math.max(1, c.wind_speed_10m) / 2),
      caption: `${L.gusts} ${Math.round(c.wind_gusts_10m)} ${unit}`, facts: [[L.gusts, `${Math.round(c.wind_gusts_10m)} ${unit}`], [L.from, `${from} · ${deg(c.wind_direction_10m)}`]],
      tone: "sand", alert: c.wind_gusts_10m >= top * 0.8,
    };
  },
  air(w, x, L) {
    const a = w.air?.european_aqi;
    if (!Number.isFinite(a)) return { kind: "swatch", label: L.air, sublabel: L.quality, value: null };
    const band = Math.min(5, Math.floor(a / 20)), pm = w.air.pm2_5, pm10 = w.air.pm10;
    return {
      kind: "swatch", label: L.air, sublabel: `${L.quality} · ${Math.round(a)}`, value: a, min: 0, max: 100, color: AQI_COLORS[band], caption: L.aqi[band],
      facts: [[L.quality, L.aqi[band]], ...(Number.isFinite(pm) ? [["PM2.5 · PM10", `${Math.round(pm)} · ${Math.round(pm10)} µg`]] : [])], tone: "aqi", alert: 60,
    };
  },
  daylight(w, x, L) {
    const rise = hhmm(w.daily.sunrise[x.d]), set = hhmm(w.daily.sunset[x.d]);
    const base = { kind: "meter", size: "short", label: L.daylight, text: "", stops: DAY_STOPS, tone: "mauve" };
    if (!rise || !set || rise === set) return { ...base, sublabel: L.polar, value: 1, min: 0, max: 1 };
    const r = hm(rise), s = hm(set), now = x.minutes, day = now >= r && now < s;
    const next = hhmm(w.daily.sunrise[x.d + 1]) || rise;
    const wait = now < r ? r - now : 24 * 60 - now + hm(next);
    return {
      ...base, sublabel: day ? L.left(span(s - now, L)) : L.sunrise(span(wait, L)), value: clamp(now, r, s) - r, min: 0, max: s - r, ends: [rise, set],
      facts: [[L.up, rise], [L.down, set], [L.length, span(s - r, L)]],
    };
  },
  rain(w, x, L) {
    const s = w.hourly.precipitation_probability.slice(x.i, x.i + 12).map((v) => v ?? 0), peak = Math.max(...s), at = s.indexOf(peak);
    return {
      kind: "dots", size: "short", label: L.rain, sublabel: peak < 20 ? L.dry12 : `${peak}% · ${hhmm(w.hourly.time[x.i + at])}`, value: peak, unit: "%", decimals: 0,
      min: 0, max: 100, series: s, at: 0, times: s.map((_, k) => hhmm(w.hourly.time[x.i + k])), ends: [L.now, L.plus12],
      facts: [[L.hour, `${s[1] ?? s[0]}%`], [L.peak, `${peak}% · ${hhmm(w.hourly.time[x.i + at])}`]], tone: "ember",
    };
  },
};

const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`Open-Meteo answered ${r.status}`); return r.json(); });

/** Places by name, best match first: [{ name, country, lat, lon }]. */
export async function findPlaces(name, lang = "en", count = 5) {
  const q = new URLSearchParams({ name, count, language: lang, format: "json" });
  const { results = [] } = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  return results.map((p) => ({ name: p.name, country: p.country ?? "", lat: p.latitude, lon: p.longitude }));
}

async function load(o, lang) {
  const imperial = o.units === "imperial", windUnit = imperial ? "mph" : lang === "ru" ? "ms" : "kmh";
  const at = { latitude: (+o.lat).toFixed(2), longitude: (+o.lon).toFixed(2), timezone: "auto" };
  const forecast = new URLSearchParams({
    ...at, past_days: 1, forecast_days: 2, wind_speed_unit: windUnit, ...(imperial ? { temperature_unit: "fahrenheit" } : {}),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,weather_code",
    hourly: "temperature_2m,uv_index,precipitation_probability,pressure_msl",
    daily: "sunrise,sunset,temperature_2m_max,temperature_2m_min",
  });
  const [w, air] = await Promise.all([
    getJSON(`https://api.open-meteo.com/v1/forecast?${forecast}`),
    getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${new URLSearchParams({ ...at, current: "european_aqi,pm2_5,pm10" })}`).catch(() => null),
  ]);
  return { ...w, air: air?.current ?? null, imperial, windUnit };
}

// where "now" is in the hourly and daily arrays — in the place's own time
function clock(w) {
  const now = w.current.time, today = now.slice(0, 10), hours = w.hourly.time;
  const i = Math.max(0, hours.indexOf(`${now.slice(0, 13)}:00`)), day = [];
  hours.forEach((t, k) => t.startsWith(today) && day.push(k));
  return { i, day, at: i - day[0], d: w.daily.time.indexOf(today), minutes: hm(now.slice(11, 16)) };
}

/**
 * Fills every <aura-tile metric="…"> inside `root` (or `root` itself) from Open-Meteo and keeps it fresh.
 * options: { lat, lon } or { place: "Berlin" }, units: "metric" | "imperial", lang: "en" | "ru", every: seconds (600).
 * Returns { refresh(), set(options), stop(), weather }.
 */
export function bindWeather(root, options = {}) {
  const opts = { units: "metric", every: 600, ...options };
  let last = null, loadedAt = 0, timer = 0, run = 0, stopped = false;
  const tiles = () => [...(root.matches?.("aura-tile[metric]") ? [root] : []), ...root.querySelectorAll("aura-tile[metric]")];
  const lang = () => ((opts.lang || root.closest?.("[lang]")?.lang || navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en");

  async function refresh() {
    const mine = ++run, L = STRINGS[lang()];
    clearTimeout(timer);
    if (!last) {
      for (const t of tiles()) {
        const shell = SHELL[t.getAttribute("metric")];
        if (shell) t.data = { kind: shell[0], label: L[shell[1]], size: shell[2], state: "loading" };
      }
    }
    try {
      if ((opts.lat == null || opts.lon == null) && opts.place) {
        const [p] = await findPlaces(opts.place, lang(), 1);
        if (!p) throw Object.assign(new Error(`No place called “${opts.place}”`), { code: "place" });
        Object.assign(opts, p);
      }
      if (opts.lat == null || opts.lon == null) throw new Error("bindWeather needs { lat, lon } or { place }");
      const w = await load(opts, lang());
      if (mine !== run || stopped) return;
      last = w;
      loadedAt = Date.now();
      const x = clock(w);
      for (const t of tiles()) {
        const metric = METRICS[t.getAttribute("metric")];
        if (!metric) continue;
        try { t.data = metric(w, x, L); } catch { t.data = { ...t.data, value: null, state: "empty" }; }
      }
      emit(root, "aura-weather", { place: { name: opts.name ?? opts.place ?? "", country: opts.country ?? "", lat: +opts.lat, lon: +opts.lon }, time: w.current.time, offset: w.utc_offset_seconds, weather: w });
    } catch (error) {
      if (mine !== run || stopped) return;
      for (const t of tiles()) {
        if (METRICS[t.getAttribute("metric")]) t.update({ state: last ? "stale" : "error", message: last ? `${L.offline} · ${hhmm(last.current.time)}` : L.failed });
      }
      emit(root, "aura-weather", { error });
    }
    if (!stopped && opts.every > 0) timer = setTimeout(refresh, opts.every * 1000);
  }

  const onRetry = () => refresh();
  const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - loadedAt > opts.every * 1000) refresh(); };
  root.addEventListener("aura-retry", onRetry);
  document.addEventListener("visibilitychange", onVisible);
  refresh();

  return {
    refresh,
    set(next = {}) {
      if ("place" in next || "lat" in next || "lon" in next) { last = null; if (!("lat" in next)) opts.lat = opts.lon = null; delete opts.name; delete opts.country; }
      Object.assign(opts, next);
      return refresh();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      root.removeEventListener("aura-retry", onRetry);
      document.removeEventListener("visibilitychange", onVisible);
    },
    get weather() { return last; },
  };
}

if (!customElements.get("aura-tile")) customElements.define("aura-tile", AuraTile);
if (!customElements.get("aura-board")) customElements.define("aura-board", AuraBoard);
