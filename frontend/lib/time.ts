// Plain-language durations for a general audience: "6 h 42 min", "42 min".
export function hm(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return s === 0 ? "0 min" : "under 1 min";
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// Split for big display: { h: "6", m: "42" }.
export function hmParts(seconds: number): { h: number; m: number } {
  const s = Math.max(0, Math.round(seconds));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) };
}

export const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

