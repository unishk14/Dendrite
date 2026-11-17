"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// One pen per thing you use most. The four apps or websites with the most time
// over the last 30 days each own a highlighter colour, everywhere in the app:
// Today's strokes and lists, Trends, the Today map and the Notes graph.
// Everything else is grey. Yellow is never a pen: it is kept for "you and now".
export const PEN_TOKENS = ["hl-blue", "hl-pink", "hl-green", "hl-orange"] as const;
export const OTHER_TOKEN = "hl-grey";
export type PenToken = (typeof PEN_TOKENS)[number] | typeof OTHER_TOKEN;

const key = (name: string) => name.trim().toLowerCase().replace(/^www\./, "");

let cache: Map<string, PenToken> | null = null;
let inflight: Promise<Map<string, PenToken>> | null = null;
const listeners = new Set<(m: Map<string, PenToken>) => void>();

async function load(): Promise<Map<string, PenToken>> {
  const summary = await api.activitySummary(30);
  const ranked = summary.usage
    .filter(u => u.type === "app" || u.type === "domain")
    .sort((a, b) => b.total_seconds - a.total_seconds)
    .slice(0, PEN_TOKENS.length);
  const map = new Map<string, PenToken>();
  ranked.forEach((u, i) => map.set(key(u.title), PEN_TOKENS[i]));
  return map;
}

function refresh() {
  if (!inflight) inflight = load().then(m => { cache = m; listeners.forEach(l => l(m)); return m; }).finally(() => { inflight = null; });
  return inflight;
}

export interface Pens {
  /** Token name (e.g. "hl-blue") for an app name or website domain. */
  token: (...names: (string | undefined)[]) => PenToken;
  /** CSS value for the same, e.g. "var(--hl-blue)". */
  css: (...names: (string | undefined)[]) => string;
  ready: boolean;
}

export function usePens(): Pens {
  const [map, setMap] = useState<Map<string, PenToken> | null>(cache);
  useEffect(() => {
    listeners.add(setMap);
    refresh().catch(() => {});
    const timer = setInterval(() => { refresh().catch(() => {}); }, 60000);
    return () => { listeners.delete(setMap); clearInterval(timer); };
  }, []);
  // The first name that owns a pen wins, so a website keeps its own pen inside any browser.
  const token = (...names: (string | undefined)[]): PenToken => {
    for (const n of names) { if (n) { const t = map?.get(key(n)); if (t) return t; } }
    return OTHER_TOKEN;
  };
  return { token, css: (...names) => `var(--${token(...names)})`, ready: !!map };
}
