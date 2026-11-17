"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WebsiteExplorer } from "./WebsiteExplorer";
import { api } from "@/lib/api";
import type { ActivityConfig, ActivitySeries, ActivityStatus, ActivitySummary } from "@/lib/types";
import { clock, hm } from "@/lib/time";
import { usePens, type Pens } from "@/lib/pens";
import { Icon } from "@/components/ui/Icon";

// Kept for the inspectors that format durations the same way.
export const duration = hm;
const precise = (seconds: number) => `${hm(seconds)} (${Math.round(seconds).toLocaleString()} seconds)`;
type Metric = "apps" | "active" | "switches";
type View = "overview" | "websites" | "connections";

// A round axis maximum: whole hours (or half hours under two hours), so ticks read "4 h", not "4 h 34 min".
function niceMax(seconds: number) {
  if (seconds <= 0) return 3600;
  const step = seconds < 7200 ? 1800 : 3600;
  return Math.ceil(seconds / (step * 2)) * step * 2;
}

function TrendChart({ series, metric, pens }: { series: ActivitySeries; metric: Metric; pens: Pens }) {
  const buckets = series.buckets;
  // Draw at the container's real width so labels stay 12px and every period fits on a phone.
  const wrap = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(980);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setCw(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const title = metric === "apps" ? "App usage by period" : metric === "active" ? "Active and passive time by period" : "App switches by period";
  const value = (b: ActivitySeries["buckets"][number]) => metric === "switches" ? b.context_switches : b.total_seconds;
  const raw = Math.max(1, ...buckets.map(value));
  const max = metric === "switches" ? Math.max(4, Math.ceil(raw / 4) * 4) : niceMax(raw);
  const left = cw < 520 ? 52 : 70, top = 14, width = cw - left - 10, height = cw < 520 ? 200 : 240, bottom = top + height;
  const slot = width / Math.max(1, buckets.length), bar = Math.min(44, slot * 0.62);
  const labelStep = Math.max(1, Math.ceil(buckets.length / Math.max(3, Math.floor(width / 76))));
  const short = slot < 76;
  const label = (l: string) => short ? (l.includes("–") ? l.split("–")[0] : l.split(" ")[0]) : l;
  const tick = (v: number) => metric === "switches" ? String(Math.round(v)) : v === 0 ? "0" : hm(v);
  // Apps that own a pen keep their own colour; everything else is folded into one grey stack.
  const owned = series.app_ids.filter((id, i) => id !== "other" && pens.token(series.apps[i]) !== "hl-grey");
  const ids = [...owned, ...(series.app_ids.length > owned.length || buckets.some(b => b.apps.some(a => a.app_id === "other")) ? ["other"] : [])];
  const names = ids.map(id => id === "other" ? "Everything else" : series.apps[series.app_ids.indexOf(id)]);
  const pen = (i: number) => ids[i] === "other" ? "var(--hl-grey)" : pens.css(names[i]);
  const describe = (b: ActivitySeries["buckets"][number]) => metric === "switches" ? `${b.context_switches} app switches`
    : metric === "active" ? `${hm(b.active_seconds)} active, ${hm(b.idle_seconds)} passive`
    : b.apps.map(a => `${a.app}: ${hm(a.total_seconds)}`).join(", ") || "Nothing recorded";

  return <div className="chart">
    <div className="chart-scroll" ref={wrap}>
      <svg viewBox={`0 0 ${left + width + 10} ${bottom + 34}`} width={left + width + 10} height={bottom + 34} role="img" aria-labelledby="trend-title trend-desc">
        <title id="trend-title">{title}</title>
        <desc id="trend-desc">{series.granularity === "day" ? "Daily" : "Weekly"} totals across {buckets.length} periods. Exact values are in the table below the chart.</desc>
        <defs>
          <pattern id="hatch-yellow" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="7" style={{ fill: "var(--hl-yellow)" }} /></pattern>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = bottom - f * height;
          return <g key={f}>
            <line x1={left} x2={left + width} y1={y} y2={y} className={f === 0 ? "base" : "rule"} />
            {(f === 0 || f === 0.5 || f === 1) && <text x={left - 10} y={y + 4} textAnchor="end" className="axis">{tick(max * f)}</text>}
          </g>;
        })}
        {buckets.map((b, i) => {
          const x = left + slot * i + (slot - bar) / 2;
          let y = bottom;
          const segs = metric === "apps"
            ? ids.map((id, k) => ({ key: id, fill: pen(k), hatch: false, v: b.apps.filter(a => id === "other" ? !owned.includes(a.app_id) : a.app_id === id).reduce((s, a) => s + a.total_seconds, 0) }))
            : metric === "active" ? [{ key: "a", fill: "var(--hl-yellow)", hatch: false, v: b.active_seconds }, { key: "p", fill: "url(#hatch-yellow)", hatch: true, v: b.idle_seconds }]
            : [{ key: "s", fill: "var(--hl-blue)", hatch: false, v: b.context_switches }];
          return <g key={b.start} className="col">
            <title>{b.label}: {describe(b)}</title>
            <rect x={x - 4} y={top} width={bar + 8} height={height} className="hit" />
            {segs.map(s => {
              const h = s.v / max * height; y -= h;
              return h > 0 ? <rect key={s.key} x={x} y={y} width={bar} height={Math.max(h, 1)} rx="2" style={{ fill: s.fill }} className={s.hatch ? "hatched" : "solid"} /> : null;
            })}
            {(i % labelStep === 0 || i === buckets.length - 1) && <text x={x + bar / 2} y={bottom + 22} textAnchor="middle" className="axis">{label(b.label)}</text>}
          </g>;
        })}
      </svg>
    </div>
    {metric !== "switches" && <ul className="key" aria-label="Chart key">
      {metric === "apps" ? names.map((n, i) => <li key={ids[i]}><span className="ink-swatch" style={{ ["--swatch" as string]: pen(i) }} />{n}</li>)
        : <><li><span className="ink-swatch" style={{ ["--swatch" as string]: "var(--hl-yellow)" }} />Active</li><li><span className="ink-swatch passive" style={{ ["--swatch" as string]: "var(--hl-yellow)" }} />Passive</li></>}
    </ul>}
    <details className="chart-table">
      <summary>View chart data table</summary>
      <div className="table-scroll"><table>
        <caption>{title}, {series.granularity === "day" ? "by day" : "by week"}</caption>
        <thead><tr><th scope="col">Period</th>{metric === "apps" ? <><th scope="col">App</th><th scope="col">Screen time</th><th scope="col">Active</th></> : metric === "active" ? <><th scope="col">Active</th><th scope="col">Passive</th></> : <th scope="col">App switches</th>}</tr></thead>
        <tbody>{buckets.flatMap(b => metric === "apps"
          ? (b.apps.length ? b.apps : [{ app: "No usage", total_seconds: 0, active_seconds: 0 }]).map((a, k) => <tr key={`${b.start}-${k}`}><th scope="row">{b.label}</th><td>{a.app}</td><td>{precise(a.total_seconds)}</td><td>{precise(a.active_seconds)}</td></tr>)
          : <tr key={b.start}><th scope="row">{b.label}</th>{metric === "active" ? <><td>{precise(b.active_seconds)}</td><td>{precise(b.idle_seconds)}</td></> : <td>{b.context_switches}</td>}</tr>)}</tbody>
      </table></div>
    </details>
    <style jsx>{`
      .chart-scroll { overflow-x: auto; }
      svg { display: block; overflow: visible; }
      .rule { stroke: var(--grid); stroke-width: 1; }
      .base { stroke: var(--ink); stroke-width: 1.5; }
      .axis { fill: var(--ink-3); font-size: 12px; }
      .hit { fill: transparent; }
      .col:hover .hit { fill: var(--rule-soft); }
      .hatched { stroke: var(--hl-yellow); stroke-width: 1; }
      .key { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 14px; color: var(--ink-2); margin-top: 8px; }
      .key li { display: flex; align-items: center; gap: 8px; }
      .key .ink-swatch { width: 22px; }
      .chart-table { margin-top: 16px; border-top: 1px dashed var(--grid-strong); padding-top: 12px; font-size: 14px; }
      .chart-table summary { color: var(--ink-2); font-weight: 550; }
      .table-scroll { overflow: auto; max-height: 300px; margin-top: 10px; }
      table { border-collapse: collapse; width: 100%; text-align: left; }
      caption { text-align: left; font-weight: 650; margin-bottom: 6px; }
      th, td { padding: 8px 10px; border-bottom: 1px solid var(--grid); }
      thead th { position: sticky; top: 0; background: var(--paper-raised); color: var(--ink-2); font-weight: 600; border-bottom: 1.5px solid var(--ink); }
      tbody tr:hover { background: var(--paper-sunk); }
    `}</style>
  </div>;
}

export function ActivityPanel({ onOpen, onChanged }: { onOpen: (id: number) => void; onChanged: () => void }) {
  const [status, setStatus] = useState<ActivityStatus | null>(null);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [series, setSeries] = useState<ActivitySeries | null>(null);
  const [draft, setDraft] = useState<ActivityConfig | null>(null);
  const [days, setDays] = useState(7);
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  const [metric, setMetric] = useState<Metric>("apps");
  const [view, setView] = useState<View>("overview");
  const [websiteRevision, setWebsiteRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    let active = true, sequence = 0;
    const load = async () => {
      const current = ++sequence;
      try {
        const [s, u, chart] = await Promise.all([api.activity(), api.activitySummary(days), api.activitySeries(days, granularity)]);
        if (active && current === sequence) { setStatus(s); setSummary(u); setSeries(chart); setDraft(d => d ?? s.config); setError(""); }
      } catch (e) { if (active) setError(String(e)); }
    };
    load();
    const timer = setInterval(load, 8000);
    return () => { active = false; clearInterval(timer); };
  }, [days, granularity]);

  const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await action(); } catch (e) { setError(String(e)); } finally { setBusy(false); } };
  const save = async (cfg: ActivityConfig) => { const s = await api.configureActivity(cfg); setStatus(s); setDraft(s.config); setWebsiteRevision(n => n + 1); await onChanged(); };
  const max = Math.max(1, ...(summary?.usage.map(u => u.total_seconds) ?? []));
  const passive = summary ? Math.max(0, summary.total_seconds - summary.active_seconds) : 0;
  const share = summary ? Math.round(summary.active_ratio * 100) : 0;
  const daysWithUse = useMemo(() => series?.buckets.filter(b => b.total_seconds > 0).length ?? 0, [series]);
  const perDay = summary && daysWithUse ? summary.total_seconds / Math.max(1, series?.granularity === "day" ? daysWithUse : days) : 0;
  const recording = !!status?.config.enabled;
  const pens = usePens();

  return <section className="trends" aria-label="Activity dashboard">
    <header className="head">
      <div>
        <h1>Trends</h1>
        <p className="state">
          <span className={`led ${recording ? "on" : ""}`} aria-hidden="true" />
          {recording ? "Recording in the background." : "Recording stopped. Use the switch at the top to start."}{" "}
          {status?.browser_connected ? "Browser extension connected." : "Browser extension not connected, so website times come from the app only."}
        </p>
      </div>
      <div className="controls">
        <label>Range <select aria-label="Activity time range" value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
        {view === "overview" && <label>Group by <select aria-label="Chart granularity" value={granularity} onChange={e => setGranularity(e.target.value as "day" | "week")}><option value="day">Days</option><option value="week">Weeks</option></select></label>}
      </div>
    </header>

    {error && <p role="alert" className="error">{error}</p>}
    {status && !status.supported && <p className="notice">This computer can&apos;t record app usage. Recording needs macOS.</p>}
    {status?.warning && <p role="status" className="notice">{status.warning}</p>}

    <div className="segmented sections" role="group" aria-label="Activity views">
      {([["overview", "Overview"], ["websites", "Websites"], ["connections", "Connections"]] as const).map(([id, label]) =>
        <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
    </div>

    {view !== "overview" && <WebsiteExplorer days={days} status={status} connections={view === "connections"} revision={websiteRevision} onOpen={onOpen} onChanged={() => { setWebsiteRevision(n => n + 1); onChanged(); }} />}

    {view === "overview" && summary && <dl className="ledger">
      <div><dt>Screen time</dt><dd>{hm(summary.total_seconds)}</dd></div>
      <div><dt>Active</dt><dd>{hm(summary.active_seconds)}</dd></div>
      <div><dt>Passive</dt><dd>{hm(passive)}</dd></div>
      <div><dt>Active share</dt><dd>{share}%<span className="share hatch" aria-hidden="true"><i className="pass2" style={{ width: `${share}%` }} /></span></dd></div>
      <div><dt>Per day you used it</dt><dd>{hm(perDay)}</dd></div>
    </dl>}

    {view === "overview" && series && <section className="sheet comparison" aria-label="Usage comparisons">
      <div className="sheet-head">
        <div className="comparison-heading">
          <h2>{metric === "apps" ? "Where your time went" : metric === "active" ? "Active and passive time" : "How often you switched apps"}</h2>
          <p>{granularity === "day" ? "Daily" : "Weekly"} totals over the last {days} days</p>
        </div>
        <div className="segmented" role="group" aria-label="Chart comparison">
          <button aria-pressed={metric === "apps"} onClick={() => setMetric("apps")}>Apps</button>
          <button aria-pressed={metric === "active"} onClick={() => setMetric("active")}>Active vs passive</button>
          <button aria-pressed={metric === "switches"} onClick={() => setMetric("switches")}>App switches</button>
        </div>
      </div>
      <TrendChart series={series} metric={metric} pens={pens} />
      {granularity === "week" && <p className="note">Weeks at the range boundaries may be partial; totals include only dates in the selected range.</p>}
      {metric === "switches" && <p className="note">A switch is counted each time the app in front changed while recording. Pauses and long gaps aren&apos;t counted.</p>}
    </section>}

    {view === "overview" && summary && <div className="pair">
      <section className="sheet">
        <h2>What you use</h2>
        {!summary.usage.length ? <p className="muted">Nothing recorded in this range yet. Leave Dendrite running while you use your computer; the first entry appears after about a minute.</p> :
          <ol className="usage">
            {summary.usage.slice(0, 12).map((u, i) => {
              const pen = pens.css(u.title);
              return <li key={`${u.node_id}-${u.title}`} style={{ ["--pen" as string]: pen }}>
                <button className="row" disabled={!u.node_id} onClick={() => onOpen(u.node_id)} aria-label={`${u.title}: ${hm(u.total_seconds)}, ${hm(u.active_seconds)} active. Open in Notes`}>
                  <span className="name">{u.title}</span>
                  <span className="time">{hm(u.total_seconds)}</span>
                  <span className="track" aria-hidden="true"><span className="fill hatch" style={{ width: `${Math.max(2, u.total_seconds / max * 100)}%` }}><i className="pass2" style={{ width: `${u.total_seconds ? u.active_seconds / u.total_seconds * 100 : 0}%` }} /></span></span>
                  <span className="meta">{hm(u.active_seconds)} active, {u.sessions} {u.sessions === 1 ? "stretch" : "stretches"}</span>
                </button>
              </li>;
            })}
          </ol>}
      </section>
      <section className="sheet">
        <h2>Recently</h2>
        {!summary.recent.length ? <p className="muted">Your most recent apps and sites will be logged here.</p> :
          <ol className="log">
            {summary.recent.map(s => {
              const share = s.total_seconds ? s.active_seconds / s.total_seconds : 0;
              return <li key={s.id}>
                <time dateTime={s.started_at}>{clock(new Date(s.started_at))}</time>
                <span className={`mark ${share >= 0.5 ? "pass2" : "hatch"}`} aria-hidden="true" style={{ ["--pen" as string]: pens.css(s.domain, s.app) }} />
                <div>
                  <strong>{s.app}</strong>
                  <span>{s.window_title || s.domain || "In front"}</span>
                  <small>{hm(s.total_seconds)}, {hm(s.active_seconds)} active{s.domain && s.window_title ? `, ${s.domain}` : ""}</small>
                </div>
              </li>;
            })}
          </ol>}
      </section>
    </div>}

    {draft && <details className="sheet privacy">
      <summary><Icon name="shield" />Privacy, retention & browser setup</summary>
      <p className="promise">Everything stays on this computer. Dendrite never records keystrokes, screenshots or what&apos;s on a page; it notes which app is in front and, if you allow it, the window title and website.</p>
      <fieldset disabled={busy}>
        <label className="check"><input type="checkbox" checked={draft.window_titles} onChange={e => setDraft({ ...draft, window_titles: e.target.checked })} />Record window titles (they can contain private information)</label>
        <label className="check"><input type="checkbox" checked={draft.browser_pages} onChange={e => setDraft({ ...draft, browser_pages: e.target.checked })} />Record websites and page addresses (with private details removed)</label>
        <div className="fields">
          <label>Count as passive after (seconds without input)<input aria-label="Idle threshold" type="number" min={15} max={900} value={draft.idle_seconds} onChange={e => setDraft({ ...draft, idle_seconds: Number(e.target.value) })} /></label>
          <label>Keep history for (days)<input aria-label="Activity retention days" type="number" min={1} max={365} value={draft.retention_days} onChange={e => setDraft({ ...draft, retention_days: Number(e.target.value) })} /></label>
        </div>
        <div className="fields">
          <label className="area">Never record these apps (one per line)<textarea aria-label="Excluded apps" value={draft.excluded_apps.join("\n")} onChange={e => setDraft({ ...draft, excluded_apps: e.target.value.split("\n") })} /></label>
          <label className="area">Never record these websites (includes subdomains)<textarea aria-label="Excluded domains" value={draft.excluded_domains.join("\n")} onChange={e => setDraft({ ...draft, excluded_domains: e.target.value.split("\n") })} /></label>
        </div>
        <button className="primary" onClick={() => run(() => save(draft))}>Save tracking settings</button>
        <p className="muted">Excluding an app or website also deletes what was already recorded for it. Turning off titles or websites removes them from past history too. Window titles need macOS Accessibility permission.</p>
        <hr />
        <h3>Browser extension</h3>
        <p className="muted">For accurate website times, install the Dendrite extension from the browser-extension folder and paste this private token into its options. Private windows are skipped, and only the tab you&apos;re looking at is reported.</p>
        <button onClick={() => run(async () => setToken((await api.activityPairing()).token))}>Show browser pairing token</button>
        {token && <textarea aria-label="Browser pairing token" readOnly value={token} className="token" />}
        <hr />
        <h3>Delete history</h3>
        <p className="muted">Deletes every recorded app and website and their dots in the graph. Your notes and your privacy settings stay.</p>
        <button className="danger" onClick={() => run(async () => {
          if (!confirm("Permanently delete all recorded activity? This can't be undone.")) return;
          await api.clearActivity(); setWebsiteRevision(n => n + 1); setSummary(await api.activitySummary(days)); setSeries(await api.activitySeries(days, granularity)); await onChanged();
        })}>Delete activity history</button>
      </fieldset>
    </details>}

    <style jsx>{`
      .trends { height: 100%; overflow: auto; padding: 28px 32px 48px; display: flex; flex-direction: column; gap: 20px; }
      .trends > :global(*) { width: 100%; max-width: 1200px; margin-inline: auto; flex: none; }
      .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
      h1 { font-size: 32px; letter-spacing: -0.03em; }
      .state { display: flex; align-items: baseline; gap: 8px; margin-top: 6px; color: var(--ink-2); max-width: 75ch; }
      .led { width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--ink-3); flex: none; transform: translateY(1px); }
      .led.on { background: var(--live); border-color: var(--live); }
      .controls { display: flex; gap: 12px; flex-wrap: wrap; }
      .controls label { display: flex; align-items: center; gap: 8px; color: var(--ink-2); font-size: 14px; }
      .notice { padding: 12px 14px; border: var(--stroke) solid var(--border); border-radius: var(--radius); background: var(--warning-soft); }
      .sections { align-self: flex-start; width: auto !important; margin-inline: 0 !important; }
      @media (min-width: 1265px) { .sections { margin-left: calc((100% - 1200px) / 2) !important; } }
      .ledger { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: var(--stroke) solid var(--border); border-radius: var(--radius-lg); background: var(--paper-raised); overflow: hidden; }
      .ledger > div { padding: 14px 18px; display: flex; flex-direction: column-reverse; gap: 2px; }
      .ledger > div + div { border-left: 1px solid var(--hairline); }
      .ledger dt { font-size: 14px; color: var(--ink-2); }
      .ledger dd { font-size: 26px; font-weight: 700; letter-spacing: -0.03em; display: flex; align-items: center; gap: 10px; }
      .share { flex: 1; max-width: 90px; height: 12px; border-radius: 3px; overflow: hidden; --pen: var(--hl-yellow); }
      .share i { display: block; height: 100%; }
      .sheet { background: var(--paper-raised); border: var(--stroke) solid var(--border); border-radius: var(--radius-lg); padding: 20px 22px; min-width: 0; }
      .sheet h2 { font-size: 19px; margin-bottom: 14px; }
      .sheet-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
      .sheet-head h2 { margin-bottom: 2px; }
      .comparison-heading p, .note { color: var(--ink-2); font-size: 14px; }
      .note { margin-top: 10px; }
      .pair { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 20px; align-items: start; }
      .usage { list-style: none; display: flex; flex-direction: column; }
      .row { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; text-align: left; white-space: normal; border: 0; border-radius: var(--radius-sm); background: transparent; padding: 10px 8px; font-weight: 400; }
      .row:hover:not(:disabled) { background: var(--paper-sunk); }
      .row:disabled { opacity: 1; cursor: default; }
      .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .time { font-weight: 650; }
      .track { grid-column: 1 / -1; height: 12px; }
      .fill { display: block; height: 100%; border-radius: 3px; overflow: hidden; }
      .fill i { display: block; height: 100%; }
      .meta { grid-column: 1 / -1; font-size: 13px; color: var(--ink-3); }
      .log { list-style: none; max-height: 520px; overflow: auto; }
      .log li { display: grid; grid-template-columns: 72px 10px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--grid); }
      .log time { font-size: 14px; color: var(--ink-3); text-align: right; padding-top: 1px; }
      .mark { width: 10px; border-radius: 3px; }
      .log div { display: flex; flex-direction: column; min-width: 0; }
      .log strong { font-weight: 650; }
      .log span { color: var(--ink-2); overflow-wrap: anywhere; }
      .log small { font-size: 13px; color: var(--ink-3); }
      .privacy summary { font-weight: 650; font-size: 17px; }
      .promise { margin: 14px 0 4px; max-width: 72ch; line-height: 1.55; }
      fieldset { border: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; padding-top: 14px; }
      .check { display: flex; align-items: center; gap: 10px; cursor: pointer; }
      .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 100%; }
      .fields label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: var(--ink-2); }
      .fields input { width: 140px; }
      textarea { width: 100%; min-height: 84px; font-family: var(--font-mono); font-size: 13px; }
      .token { max-width: 640px; min-height: 60px; }
      fieldset p { max-width: 72ch; line-height: 1.55; font-size: 14px; }
      hr { width: 100%; border: 0; border-top: 1px dashed var(--grid-strong); }
      @media (max-width: 1000px) { .pair { grid-template-columns: 1fr; } .ledger { grid-template-columns: repeat(3, 1fr); } .ledger > div:nth-child(4) { border-left: 0; } .ledger > div:nth-child(n+4) { border-top: 1px solid var(--hairline); } }
      @media (max-width: 760px) {
        .trends { padding: 16px 12px 40px; }
        h1 { font-size: 26px; }
        .ledger { grid-template-columns: 1fr 1fr; }
        .ledger > div { border-left: 0 !important; border-top: 1px solid var(--hairline); }
        .ledger dd { font-size: 21px; }
        .sheet { padding: 14px; }
        .fields { grid-template-columns: 1fr; }
      }
    `}</style>
  </section>;
}
