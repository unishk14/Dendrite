"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../ui/Icon";

const REPO = "https://github.com/Zeusangis/Dendrite";

/* ── Sample day ───────────────────────────────────────────
   Made-up data, labelled as such on the page. The four most-used apps own
   blue, pink, green and orange in rank order; everything else is grey. */
const PEN = {
  code: "var(--hl-blue)",
  safari: "var(--hl-pink)",
  slack: "var(--hl-green)",
  notes: "var(--hl-orange)",
  other: "var(--hl-grey)",
} as const;
type Pen = keyof typeof PEN;
type Stroke = { pen: Pen; left: number; width: number; active: boolean; label?: string };
type Hour = { label: string; strokes: Stroke[]; now?: number; future?: boolean };

const DAY: Hour[] = [
  { label: "9 AM", strokes: [
    { pen: "slack", left: 3, width: 15, active: true, label: "Slack" },
    { pen: "code", left: 20, width: 62, active: true, label: "VS Code" },
    { pen: "other", left: 84, width: 11, active: false },
  ] },
  { label: "10 AM", strokes: [
    { pen: "code", left: 0, width: 44, active: true, label: "VS Code" },
    { pen: "safari", left: 46, width: 32, active: true, label: "github.com" },
    { pen: "code", left: 80, width: 20, active: true, label: "VS Code" },
  ] },
  { label: "11 AM", strokes: [
    { pen: "safari", left: 0, width: 22, active: false, label: "Safari" },
    { pen: "slack", left: 24, width: 15, active: true, label: "Slack" },
    { pen: "code", left: 41, width: 54, active: true, label: "VS Code" },
  ] },
  { label: "12 PM", strokes: [
    { pen: "safari", left: 8, width: 40, active: false, label: "youtube.com" },
    { pen: "other", left: 52, width: 9, active: true },
  ] },
  { label: "1 PM", strokes: [
    { pen: "notes", left: 5, width: 29, active: true, label: "Notes" },
    { pen: "code", left: 38, width: 52, active: true, label: "VS Code" },
  ] },
  { label: "2 PM", now: 40, strokes: [
    { pen: "safari", left: 0, width: 22, active: true, label: "Safari" },
    { pen: "code", left: 24, width: 15, active: true },
  ] },
  { label: "3 PM", future: true, strokes: [] },
];

const TOP: { name: string; pen: Pen; time: string; share: number; active: number }[] = [
  { name: "VS Code", pen: "code", time: "2 h 31 min", share: 100, active: 88 },
  { name: "Safari", pen: "safari", time: "1 h 37 min", share: 64, active: 46 },
  { name: "Slack", pen: "slack", time: "48 min", share: 32, active: 79 },
  { name: "Notes", pen: "notes", time: "29 min", share: 19, active: 93 },
  { name: "Everything else", pen: "other", time: "23 min", share: 15, active: 52 },
];

const WEEK = [
  { d: "Mon", total: 6.4, active: 0.66 },
  { d: "Tue", total: 5.8, active: 0.7, today: true },
  { d: "Wed", total: 7.1, active: 0.62 },
  { d: "Thu", total: 6.9, active: 0.68 },
  { d: "Fri", total: 5.2, active: 0.58 },
  { d: "Sat", total: 2.6, active: 0.41 },
  { d: "Sun", total: 3.1, active: 0.38 },
];

const SITES: { name: string; pen: Pen; via: string; time: string; share: number }[] = [
  { name: "github.com", pen: "safari", via: "Safari", time: "4 h 10 min", share: 100 },
  { name: "youtube.com", pen: "safari", via: "Safari", time: "2 h 51 min", share: 68 },
  { name: "docs.google.com", pen: "safari", via: "Safari", time: "1 h 22 min", share: 33 },
  { name: "news.ycombinator.com", pen: "safari", via: "Safari", time: "47 min", share: 19 },
];

const pen = (p: Pen) => ({ ["--pen" as string]: PEN[p] }) as CSSProperties;

/* ── Small parts ──────────────────────────────────────── */

function Mark({ size = 28 }: { size?: number }) {
  // A dendrite: one cell (you, in yellow) branching to the things you use.
  return (
    <svg className="lp-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M13 18 L26.5 7.5 M13 18 L26 25 M13 18 L5.5 6" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="26.5" cy="7.5" r="3" fill="var(--hl-blue)" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="26" cy="25" r="3" fill="var(--hl-pink)" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="5.5" cy="6" r="2.5" fill="var(--hl-green)" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="13" cy="18" r="5.5" fill="var(--hl-yellow)" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
}

function GitHubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" style={{ flex: "none" }}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GetIt({ big = false }: { big?: boolean }) {
  return (
    <a className={`lp-btn lp-btn-primary${big ? " lp-btn-big" : ""}`} href={REPO} target="_blank" rel="noopener noreferrer">
      <GitHubMark size={big ? 22 : 18} /> Get it on GitHub
    </a>
  );
}

/* Hand-drawn arrows, one per direction. Paths are drawn in when the note scrolls into view. */
const ARROWS = {
  down: { box: "0 0 60 56", d: "M12 4 C 8 22, 22 36, 40 46 M30 47 L41 46.5 L37 36" },
  downLeft: { box: "0 0 60 56", d: "M50 4 C 52 24, 38 38, 16 46 M26 49 L15 46.5 L21 37" },
  up: { box: "0 0 60 56", d: "M14 52 C 10 34, 20 18, 38 8 M28 7 L39 7.5 L36 18" },
  upLeft: { box: "0 0 60 56", d: "M48 52 C 50 32, 38 18, 18 9 M28 6 L17 8.5 L23 18" },
};

function Note({ children, arrow, align = "start", className = "" }: { children: ReactNode; arrow: keyof typeof ARROWS; align?: "start" | "end"; className?: string }) {
  const a = ARROWS[arrow];
  const pointsUp = arrow === "up" || arrow === "upLeft";
  const svg = (
    <svg className="lp-arrow" viewBox={a.box} aria-hidden="true" focusable="false">
      <path d={a.d} pathLength={1} />
    </svg>
  );
  return (
    <p className={`lp-note lp-note-${align} ${pointsUp ? "is-below" : "is-above"} ${className}`} data-draw>
      {pointsUp && svg}
      <span>{children}</span>
      {!pointsUp && svg}
    </p>
  );
}

function CopyBlock({ title, lines }: { title: string; lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <figure className="lp-term">
      <figcaption>
        <span>{title}</span>
        <button type="button" className="lp-copy" onClick={copy} aria-label={`Copy commands for ${title}`}>
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre><code>{lines.map((l, i) => <span key={i} className="lp-line">{l}</span>)}</code></pre>
      <span className="sr-only" aria-live="polite">{copied ? "Copied to clipboard" : ""}</span>
    </figure>
  );
}

/* ── The report itself, rebuilt with sample data ─────────── */

function Report() {
  return (
    <div className="lp-sheet" role="img" aria-label="Sample Dendrite report for a Tuesday: 5 hours 48 minutes of screen time, 4 hours 2 minutes active and 1 hour 46 minutes passive. Most used: VS Code 2 hours 31 minutes, Safari 1 hour 37 minutes, Slack 48 minutes, Notes 29 minutes.">
      <div className="lp-bar" aria-hidden="true">
        <span className="lp-bar-brand"><Mark size={20} /> Dendrite</span>
        <span className="lp-tabs"><span className="on">Today</span><span>Trends</span><span>Notes</span></span>
        <span className="lp-span">Tuesday from 9:02 AM to 2:24 PM</span>
        <span className="lp-rec"><i /> Recording</span>
      </div>

      <div className="lp-cols" aria-hidden="true">
        {/* Left: the total, the split, the comparison */}
        <div className="lp-col">
          <div className="lp-slot"><Note arrow="down">everything you looked at today</Note></div>
          <section className="lp-panel">
            <h3>Screen time</h3>
            <p className="lp-total">
              <span className="num">5</span><span className="unit">h</span>
              <span className="num">48</span><span className="unit">min</span>
              <svg className="lp-circle" viewBox="0 0 220 96" preserveAspectRatio="none" data-draw-self>
                <path pathLength={1} d="M118 8 C 60 2, 8 18, 6 48 C 4 80, 70 92, 128 88 C 186 84, 216 64, 212 40 C 208 14, 160 4, 96 10" />
              </svg>
            </p>
            <p className="lp-muted">Since 9:02 AM this morning.</p>
            <div className="lp-split" style={{ ["--pen" as string]: "var(--hl-yellow)" }}>
              <span className="seg pass2" style={{ width: "70%" }} />
              <span className="seg hatch" style={{ width: "30%" }} />
            </div>
            <dl className="lp-key">
              <div><dt><span className="sw pass2" style={{ ["--pen" as string]: "var(--hl-yellow)" }} />Active</dt><dd>4 h 02 min <small>70%</small></dd></div>
              <div><dt><span className="sw hatch" style={{ ["--pen" as string]: "var(--hl-yellow)" }} />Passive</dt><dd>1 h 46 min <small>30%</small></dd></div>
            </dl>
            <p className="lp-compare">That&apos;s <mark>38 min less</mark> than a usual Tuesday. The biggest difference is <b>Safari</b>, 41 min less.</p>
          </section>
          <div className="lp-slot"><Note arrow="up">compared with your usual, never judged</Note></div>
        </div>

        {/* Centre: the day as highlighter strokes across the hours */}
        <div className="lp-col lp-col-day">
          <div className="lp-slot"><Note arrow="down">each app is a stroke across the minutes you used it</Note></div>
          <section className="lp-panel lp-day">
            <h3>Your day</h3>
            <div className="lp-hours">
              {DAY.map((h, row) => (
                <div key={h.label} className={`lp-hour${h.future ? " future" : ""}`}>
                  <span className="lp-hl">{h.label}</span>
                  <div className="lp-lane">
                    {h.strokes.map((s, i) => (
                      <span
                        key={i}
                        className={`lp-stroke ${s.active ? "pass2" : "hatch"}${s.width < 24 ? " short" : ""}`}
                        style={{ ...pen(s.pen), left: `${s.left}%`, width: `${s.width}%`, ["--i" as string]: row * 3 + i } as CSSProperties}
                      >
                        {s.width >= 14 && s.label && <span>{s.label}</span>}
                      </span>
                    ))}
                    {h.now !== undefined && <span className="lp-now" style={{ left: `${h.now}%` }}><span>Now</span></span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="lp-slot lp-slot-sample"><Note arrow="up" className="lp-n-now">the blue line is now</Note><p className="lp-note lp-n-key"><span>short strokes carry no name: match the pen to the list below</span></p><p className="lp-sample" aria-hidden="true">Sample day. The numbers are made up.</p></div>
        </div>

        {/* Right: most used */}
        <div className="lp-col">
          <div className="lp-slot"><Note arrow="downLeft" align="end">your top four apps each own a pen</Note></div>
          <section className="lp-panel">
            <h3>Most used today</h3>
            <ol className="lp-top">
              {TOP.map(t => (
                <li key={t.name} style={pen(t.pen)}>
                  <span className="name">{t.name}</span>
                  <span className="time">{t.time}</span>
                  <span className="track hatch" style={{ width: `${t.share}%` }}><i className="pass2" style={{ width: `${t.active}%` }} /></span>
                </li>
              ))}
            </ol>
          </section>
          <div className="lp-slot"><Note arrow="upLeft" align="end">everything else stays grey</Note></div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────── */

export function Landing({ className = "" }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  // Ballpoint notes draw themselves as they scroll into view. Without JS, or
  // with reduced motion, they are simply there.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.add("js-draw");
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("drawn"); io.unobserve(e.target); }
      }
    }, { threshold: 0.6, rootMargin: "0px 0px -8% 0px" });
    el.querySelectorAll("[data-draw], [data-draw-self]").forEach(n => io.observe(n));
    return () => io.disconnect();
  }, []);

  const max = Math.max(...WEEK.map(w => w.total));

  return (
    <div ref={root} className={`lp ${className}`}>
      <a className="lp-skip" href="#main">Skip to content</a>
      <header className="lp-header">
        <div className="lp-wrap lp-header-in">
          <a className="lp-brand" href="#top" aria-label="Dendrite, back to top"><Mark /> <span>Dendrite</span></a>
          <nav aria-label="Sections" className="lp-nav">
            <a href="#read">How to read it</a>
            <a href="#privacy">Privacy</a>
            <a href="#start">Get started</a>
          </nav>
          <a className="lp-btn lp-btn-ghost" href={REPO} target="_blank" rel="noopener noreferrer"><GitHubMark size={16} /> GitHub</a>
        </div>
      </header>

      <main id="main">
        {/* Hero: the question, the answer, the marked-up report */}
        <section id="top" className="lp-hero">
          <div className="lp-wrap lp-hero-copy">
            <h1>Where did <span className="lp-hi">today</span> go?</h1>
            <div className="lp-hero-side">
              <p className="lp-lede">
                Your day, marked up like a planner: what you used, when, and how much of it you were really there for. Kept on your own computer.
              </p>
              <div className="lp-actions">
                <GetIt />
                <a className="lp-btn lp-btn-quiet" href="#read">See how it reads <Icon name="arrow" size={16} /></a>
              </div>
              <p className="lp-fine">No account. No cloud. Records on macOS; the browser extension works in Chrome, Edge, Brave and Firefox.</p>
            </div>
          </div>
          <div className="lp-wrap lp-hero-report">
            <Report />
          </div>
        </section>

        {/* Two kinds of time */}
        <section id="read" className="lp-section lp-two">
          <div className="lp-wrap">
            <h2>Two kinds of time,<br />drawn two ways.</h2>
            <div className="lp-specimen" aria-hidden="true">
              <div className="lp-big pass2" style={{ ["--pen" as string]: "var(--hl-yellow)", width: "70%" }}><span>Active</span></div>
              <div className="lp-big hatch" style={{ ["--pen" as string]: "var(--hl-yellow)", width: "30%" }}><span>Passive</span></div>
            </div>
            <div className="lp-defs">
              <div>
                <h3><span className="sw pass2" style={{ ["--pen" as string]: "var(--hl-yellow)" }} aria-hidden="true" /> Active</h3>
                <p>You typed or moved the mouse recently. The highlighter goes over it twice, so it reads darker.</p>
              </div>
              <div>
                <h3><span className="sw hatch" style={{ ["--pen" as string]: "var(--hl-yellow)" }} aria-hidden="true" /> Passive</h3>
                <p>The screen was on and in front of you, with no input: reading, watching, thinking. One faint, hatched pass.</p>
              </div>
              <p className="lp-honest">
                Active is an estimate of recent input. It isn&apos;t a measure of attention, and Dendrite never calls it productive. You choose how long without input counts as passive.
              </p>
            </div>
          </div>
        </section>

        {/* The week */}
        <section className="lp-section lp-week">
          <div className="lp-wrap lp-week-grid">
            <div className="lp-week-copy">
              <h2>Then step back to the week.</h2>
              <p className="lp-sentence">
                This week you spent <mark>37 h 06 min</mark> in front of the screen, <mark>2 h 19 min less</mark> than last week. Most of the difference was weekends.
              </p>
              <p className="lp-muted-p">Trends over 7, 30 or 90 days. Every website on its own: its time, its pages, and which browser you used. Each number opens onto what was recorded to make it.</p>
            </div>
            <div className="lp-panel lp-week-panel" aria-hidden="true">
              <h3>Last 7 days</h3>
              <ol className="lp-bars">
                {WEEK.map(w => (
                  <li key={w.d} className={w.today ? "is-today" : ""} style={{ ["--pen" as string]: w.today ? "var(--hl-yellow)" : "var(--hl-grey)" }}>
                    <span className="bar hatch" style={{ height: `${(w.total / max) * 100}%` }}><i className="pass2" style={{ height: `${w.active * 100}%` }} /></span>
                    <span className="d">{w.d}</span>
                  </li>
                ))}
              </ol>
              <Note arrow="up">today is the yellow one</Note>
              <h3 className="lp-sub">Websites</h3>
              <ol className="lp-top lp-top-sm">
                {SITES.map(s => (
                  <li key={s.name} style={pen(s.pen)}>
                    <span className="name">{s.name} <small>via {s.via}</small></span>
                    <span className="time">{s.time}</span>
                    <span className="track pass2" style={{ width: `${s.share}%` }} />
                  </li>
                ))}
              </ol>
            </div>
            <p className="sr-only">Sample week: Monday 6.4 hours, Tuesday 5.8, Wednesday 7.1, Thursday 6.9, Friday 5.2, Saturday 2.6, Sunday 3.1.</p>
          </div>
        </section>

        {/* Privacy, on night paper */}
        <section id="privacy" className="lp-section lp-night">
          <div className="lp-wrap">
            <h2>It stays on this computer.</h2>
            <p className="lp-lede lp-night-lede">Dendrite runs on your machine and keeps its records there. There&apos;s nothing to sign up for and nowhere for your day to be sent.</p>
            <div className="lp-ledger">
              <div className="lp-ledger-col">
                <h3>What it writes down</h3>
                <ul>
                  <li>Which app is in front, and for how long</li>
                  <li>Whether you&apos;ve touched the keyboard or mouse lately, never what you typed</li>
                  <li>Which website the browser&apos;s tab is on, if you add the extension</li>
                  <li>Window titles and page addresses, only if you turn them on, with logins and query strings stripped</li>
                </ul>
              </div>
              <div className="lp-ledger-col lp-never">
                <h3>What it never touches</h3>
                <ul>
                  <li><s>Keystrokes</s></li>
                  <li><s>Screenshots</s></li>
                  <li><s>What&apos;s on a page</s></li>
                  <li><s>An account, or a copy in the cloud</s></li>
                </ul>
                <Note arrow="up" align="end" className="lp-n-never">not switched off. never built.</Note>
              </div>
            </div>
            <ul className="lp-controls">
              <li><b>Stop recording</b> at any time, from the top bar.</li>
              <li><b>Leave out</b> an app or a site, and its history is deleted.</li>
              <li><b>Choose</b> how many days to keep.</li>
              <li><b>Delete everything</b> in one step.</li>
            </ul>
          </div>
        </section>

        {/* Notes, secondary */}
        <section className="lp-section lp-notes">
          <div className="lp-wrap lp-notes-grid">
            <svg className="lp-map" viewBox="0 0 420 300" role="img" aria-label="Sample map: the apps VS Code, Safari and Slack, linked to notes called Week plan, Reading list and Project ideas.">
              <g className="lp-links">
                <line x1="120" y1="110" x2="250" y2="70" />
                <line x1="120" y1="110" x2="300" y2="210" className="soft" />
                <line x1="300" y1="210" x2="250" y2="70" className="soft" />
                <line x1="300" y1="210" x2="160" y2="240" />
                <line x1="70" y1="220" x2="160" y2="240" />
                <line x1="70" y1="220" x2="120" y2="110" className="soft" />
              </g>
              <g className="lp-nodes">
                <circle cx="120" cy="110" r="30" style={{ fill: "var(--hl-blue)" }} />
                <circle cx="300" cy="210" r="24" style={{ fill: "var(--hl-pink)" }} />
                <circle cx="70" cy="220" r="17" style={{ fill: "var(--hl-green)" }} />
                <circle cx="250" cy="70" r="12" className="note" />
                <circle cx="160" cy="240" r="12" className="note" />
              </g>
              <g className="lp-labels">
                <text x="120" y="160" textAnchor="middle">VS Code</text>
                <text x="345" y="214">Safari</text>
                <text x="70" y="262" textAnchor="middle">Slack</text>
                <text x="268" y="74">Project ideas</text>
                <text x="178" y="244">Reading list</text>
              </g>
            </svg>
            <div>
              <h2>Link what you use to what you write.</h2>
              <p className="lp-muted-p">If you keep notes, Dendrite can connect them to the apps and sites you use, and every connection says why it exists. Don&apos;t like one? Mute it. Notes are plain Markdown files in a folder you own, with links, tags and full-text search.</p>
              <p className="lp-fine">Optional. The daily report works without a single note.</p>
            </div>
          </div>
        </section>

        {/* Start */}
        <section id="start" className="lp-section lp-start">
          <div className="lp-wrap">
            <h2>Running in two terminals.</h2>
            <p className="lp-muted-p">You&apos;ll need Go and Node.js. Recording apps works on macOS; notes and the graph run anywhere.</p>
            <Note arrow="down" className="lp-n-start">start here, then the other one</Note>
            <div className="lp-terms">
              <CopyBlock title="Terminal 1: the recorder" lines={["git clone https://github.com/Zeusangis/Dendrite.git", "cd Dendrite/backend", "go run ./cmd/server"]} />
              <CopyBlock title="Terminal 2: the report" lines={["cd Dendrite/frontend", "npm ci", "npm run dev"]} />
            </div>
            <p className="lp-then">Then open <a href="http://127.0.0.1:3000">127.0.0.1:3000</a>. Your day fills in as you use your computer, and <span className="lp-kbd">Recording</span> in the top bar pauses it whenever you like.</p>
            <div className="lp-close">
              <GetIt big />
              <p className="lp-fine">Setup for the browser extension and starting at login is in the README.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span className="lp-brand"><Mark size={22} /> <span>Dendrite</span></span>
          <p>Reports your habits. Doesn&apos;t judge them.</p>
          <p className="lp-fine">Sample data on this page is made up.</p>
        </div>
      </footer>
    </div>
  );
}
