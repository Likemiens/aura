/**
 * Types for aura.js — https://likemiens.com/ui/aura/
 * The module registers <aura-tile> and <aura-board> and exports the weather binding:
 *   import { bindWeather, findPlaces, toneAt, TONES, SCALES } from "https://likemiens.com/ui/aura/aura.js";
 * Keep this file next to the import (or anywhere your tsconfig includes) to type the tags and the exports.
 */

export type AuraKind = "ring" | "dial" | "wave" | "ruler" | "split" | "pulse" | "scatter" | "swatch" | "meter" | "dots";
export type AuraToneName = "coral" | "teal" | "red" | "lime" | "magenta" | "blue" | "sand" | "moss" | "mauve" | "ember" | "slate" | "ice";
export type AuraScaleName = "temperature" | "uv" | "aqi" | "clouds" | "delta" | "percent";
/** Rim, glow, heart behind the number, colour of the marks: any CSS colours. */
export type AuraPalette = [edge: string, mid: string, core: string, accent: string];
/** Stops of a scale that colours a tile by its value; between two stops the tones mix. */
export type AuraScale = Array<[at: number, tone: AuraToneName | AuraPalette]>;
export type AuraState = "ready" | "loading" | "empty" | "error" | "stale";

/** Everything a tile shows. The same names work as attributes; attributes win over data. */
export interface AuraData {
  kind?: AuraKind;
  /** The two lines at the top and the line at the bottom. */
  label?: string;
  sublabel?: string;
  caption?: string;
  /** What the tile says instead of its caption when it is empty, in error or stale. */
  message?: string;
  /** Extra readings a wide tile shows on its right: [["Gusts", "16 km/h"], …]. A wide tile shows its caption here too. */
  facts?: Array<[label: string, value: string]>;
  /** The reading; null shows the empty state. */
  value?: number | null;
  /** The scale of the gauge: 0–100 unless set, or the bounds of the series. */
  min?: number;
  max?: number;
  unit?: string;
  /** Digits after the point; one for small fractions by default. */
  decimals?: number;
  /** Words in place of the number. */
  text?: string;
  /** Points of the chart (ruler, scatter, dots), their labels and the current one. */
  series?: Array<number | null>;
  times?: string[];
  at?: number;
  /** Two labels at the ends of the scale. */
  ends?: [string, string];
  /** dial: where the mark points, degrees clockwise from the top; how wide it is, 0–1. */
  angle?: number;
  spread?: number;
  /** swatch: the colour of the dot. */
  color?: string;
  /** meter: the colours of its bar, left to right. */
  stops?: string[];
  tone?: AuraToneName | AuraScaleName | AuraPalette | AuraScale;
  state?: AuraState;
  /** A threshold — the tile pulses at or above it; true pulses always. */
  alert?: number | boolean;
  size?: "tall" | "short";
  numerals?: "dotted";
  /** For bindWeather: what the tile shows. */
  metric?: AuraMetric;
}

/**
 * A tile lays itself out by its own size: one column like a small widget, two and more like a wide one (number on the left,
 * facts on the right, the chart across). On a board the `span` attribute, 1–4, sets how many columns it takes.
 */
export interface AuraTileElement extends HTMLElement {
  /** A copy of the data; setting it replaces the data. */
  data: AuraData;
  /** Merges a part of the data. */
  update(patch: Partial<AuraData>): void;
}

export interface AuraLayout {
  /** Keys in order: a tile's id, metric or label. */
  order: string[];
  hidden: string[];
  /** Columns of the tiles wider than one. A layout without it leaves the widths of the markup alone. */
  spans?: Record<string, number>;
}

export interface AuraBoardElement extends HTMLElement {
  readonly tiles: AuraTileElement[];
  readonly editing: boolean;
  layout: AuraLayout;
  edit(): void;
  done(): void;
  cancel(): void;
}

export interface AuraSelectDetail { key: string; value: number | null; index: number | null; data: AuraData }
export interface AuraScrubDetail { key: string; index: number; value: number | null; time: string | null }
export interface AuraWeatherDetail {
  place?: { name: string; country: string; lat: number; lon: number };
  /** The time of the reading, in the place's own time: "2026-10-16T14:00". */
  time?: string;
  /** Seconds the place is ahead of UTC. */
  offset?: number;
  /** The raw Open-Meteo answer. */
  weather?: unknown;
  /** Set instead of the rest when the update failed; code "place" when the place was not found. */
  error?: Error & { code?: string };
}

export type AuraMetric = "temperature" | "delta" | "humidity" | "pressure" | "clouds" | "uv-day" | "uv" | "wind" | "air" | "daylight" | "rain";

export interface AuraWeatherOptions {
  lat?: number;
  lon?: number;
  /** A city to look up when there are no coordinates. */
  place?: string;
  units?: "metric" | "imperial";
  lang?: "en" | "ru";
  /** Seconds between updates, 600 by default; 0 updates only on refresh(). */
  every?: number;
}

export interface AuraWeatherBinding {
  refresh(): Promise<void>;
  /** A new place, language or units; a new place shows the loading state first. */
  set(options: AuraWeatherOptions & { name?: string; country?: string }): Promise<void>;
  stop(): void;
  /** The last Open-Meteo answer, or null. */
  readonly weather: unknown;
}

export function bindWeather(root: Element, options: AuraWeatherOptions): AuraWeatherBinding;
export function findPlaces(name: string, lang?: string, count?: number): Promise<Array<{ name: string; country: string; lat: number; lon: number }>>;
export function toneAt(scale: AuraScaleName | AuraScale, value: number): AuraPalette;
export const TONES: Record<AuraToneName, AuraPalette>;
export const SCALES: Record<AuraScaleName, AuraScale>;
export class AuraTile extends HTMLElement {}
export class AuraBoard extends HTMLElement {}

declare global {
  interface HTMLElementTagNameMap {
    "aura-tile": AuraTileElement;
    "aura-board": AuraBoardElement;
  }
  interface HTMLElementEventMap {
    "aura-select": CustomEvent<AuraSelectDetail>;
    "aura-scrub": CustomEvent<AuraScrubDetail>;
    "aura-retry": CustomEvent<{ key: string }>;
    "aura-toggle": CustomEvent<{ key: string; hidden: boolean }>;
    "aura-edit": CustomEvent<{ editing: boolean }>;
    "aura-resize": CustomEvent<{ key: string; span: number }>;
    "aura-change": CustomEvent<AuraLayout>;
    "aura-weather": CustomEvent<AuraWeatherDetail>;
  }
}
