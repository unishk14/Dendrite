import { hm } from "@/lib/time";

// Connection reasons arrive as compact machine strings ("browser usage; 249.0
// active minutes; 26 observed sessions; 77% active"). Turn each part into a
// plain sentence; anything unrecognised passes through unchanged.
const KIND: Record<string, string> = {
  "browser usage": "Opened in this browser",
  "visited page": "A page on this website",
  "browser page use": "This page was open in the browser",
  "foreground context": "Used at the same time",
  "context switch": "You often switched straight between them",
  "activity concept": "Matches a topic in your notes",
};

export function explainReason(reason: string | undefined): string[] {
  if (!reason) return [];
  return reason.split("; ").map(part => {
    const p = part.trim();
    if (KIND[p]) return KIND[p];
    let m = /^([\d.]+) active minutes$/.exec(p);
    if (m) return `${hm(Number(m[1]) * 60)} of active use`;
    m = /^(\d+) (?:observed )?sessions$/.exec(p);
    if (m) return `${m[1]} ${m[1] === "1" ? "time" : "separate times"}`;
    m = /^(\d+)% active$/.exec(p);
    if (m) return `${m[1]}% of that time you were active`;
    m = /^Shared note concept: (.+)$/.exec(p);
    if (m) return `Matches a topic in your notes: ${m[1]}`;
    m = /^(\w+) evidence \(\d+\)$/.exec(p);
    if (m) return `Matched by ${m[1]}`;
    return p;
  }).filter(Boolean);
}
