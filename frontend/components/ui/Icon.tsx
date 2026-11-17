// One drawn icon set: 20px grid, 1.75 stroke, round caps, so every icon in the
// app shares weight and style. Icons are decorative; the control carries the name.
const paths = {
  plus: "M10 4.5v11M4.5 10h11",
  search: "M8.75 14.5a5.75 5.75 0 1 0 0-11.5 5.75 5.75 0 0 0 0 11.5ZM13 13l3.5 3.5",
  sync: "M15.5 8A6 6 0 0 0 4.7 6.3M4.5 12a6 6 0 0 0 10.8 1.7M15.5 3.5V8H11M4.5 16.5V12H9",
  settings: "M3.5 6h8M14.5 6h2M3.5 14h2M8.5 14h8M13 4.25v3.5M7 12.25v3.5",
  close: "m5.5 5.5 9 9M14.5 5.5l-9 9",
  fit: "M3.5 7.5v-3a1 1 0 0 1 1-1h3M12.5 3.5h3a1 1 0 0 1 1 1v3M16.5 12.5v3a1 1 0 0 1-1 1h-3M7.5 16.5h-3a1 1 0 0 1-1-1v-3",
  zoomIn: "M10 5v10M5 10h10",
  zoomOut: "M5 10h10",
  edit: "M12.5 4.5 15.5 7.5 7.5 15.5H4.5v-3Z",
  chevron: "m7.5 5 5 5-5 5",
  undo: "M7 5 3.5 8.5 7 12M3.5 8.5h8a4.5 4.5 0 0 1 0 9H9",
  redo: "m13 5 3.5 3.5L13 12M16.5 8.5h-8a4.5 4.5 0 0 0 0 9H11",
  graph: "M6 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM14.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7.5 17.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7.7 5.5l5 1.8M13.5 9.2l-4.7 4.6M6.3 6.5l.8 7",
  shield: "M10 2.75 4 5v4.5c0 3.6 2.5 6.3 6 7.75 3.5-1.45 6-4.15 6-7.75V5Z",
  arrow: "M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ flex: "none" }}>
      <path d={paths[name]} />
    </svg>
  );
}
