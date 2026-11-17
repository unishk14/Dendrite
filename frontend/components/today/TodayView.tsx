"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ActivitySeries, ActivitySession, ActivityStatus, ActivitySummary, GraphSnapshot } from "@/lib/types";
import { clock, hm, hmParts, sameDay } from "@/lib/time";
import { usePens } from "@/lib/pens";
import { Icon } from "@/components/ui/Icon";

interface Props {
  status: ActivityStatus | null;
  busy: boolean;
  onToggleRecording: () => void;
  onOpenNode: (id: number) => void;
  onOpenTrends: () => void;
  onSpan: (span: string) => void;
}

interface Stroke { key: string; left: number; width: number; pen: string; active: boolean; label: string; title: string }
interface Tally { name: string; total: number; active: number; via?: string }

const secondsSinceMidnight = (d: Date) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();

function tally(list: Tally[]): Tally[] {
  const map = new Map<string, Tally>();
  for (const x of list) {
    const t = map.get(x.name) ?? { name: x.name, total: 0, active: 0, via: x.via };
    t.total += x.total; t.active += x.active; map.set(x.name, t);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function TodayView({ status, busy, onToggleRecording, onOpenNode, onOpenTrends, onSpan }: Props) {
  const pens = usePens();
  const [series, setSeries] = useState<ActivitySeries | null>(null);
  const [byNow, setByNow] = useState<ActivitySeries | null>(null);
  const [sessions, setSessions] = useState<ActivitySession[] | null>(null);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const dayRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const at = new Date();
      try {
        const [s, clipped, r, u, g] = await Promise.all([
          api.activitySeries(8, "day"), api.activitySeries(8, "day", secondsSinceMidnight(at)),
          api.activityRecent(1), api.activitySummary(1), api.graph(),
        ]);
        if (!active) return;
        setSeries(s); setByNow(clipped); setSessions(r.recent); setSummary(u); setGraph(g); setNow(at); setError("");
      } catch (e) { if (active) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (active) setRetrying(false); }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [attempt]);

  const today = series?.buckets.at(-1) ?? null;
  const total = today?.total_seconds ?? 0;
  const activeSec = today?.active_seconds ?? 0;
  const passiveSec = Math.max(0, total - activeSec);

  const todays = useMemo(() => (sessions ?? []).filter(s => sameDay(new Date(s.started_at), now)).sort((a, b) => a.started_at.localeCompare(b.started_at)), [sessions, now]);
  const first = todays[0] ? new Date(todays[0].started_at) : null;
  useEffect(() => { onSpan(first ? `Today from ${clock(first)} to ${clock(now)}` : "Today"); }, [first?.getTime(), now.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Most used, from today's own sessions: apps, and separately the websites inside them.
  const apps = useMemo(() => tally(todays.map(s => ({ name: s.app, total: s.total_seconds, active: s.active_seconds }))), [todays]);
  // A website keeps the pen it has in the day column: its own, or else its browser's.
  const sites = useMemo(() => tally(todays.filter(s => s.domain).map(s => ({ name: s.domain.replace(/^www\./, ""), total: s.total_seconds, active: s.active_seconds, via: s.app }))), [todays]);
  const topApps = apps.slice(0, 4);
  const rest = apps.slice(4).reduce((acc, a) => ({ total: acc.total + a.total, active: acc.active + a.active }), { total: 0, active: 0 });
  const listMax = Math.max(1, ...apps.map(a => a.total));

  // The day: every hour as a ruled planner row, each session as highlighter strokes.
  const hours = useMemo(() => {
    const firstHour = first ? Math.min(first.getHours(), 6) : 6;
    const rows = Array.from({ length: 24 - firstHour }, (_, i) => ({ hour: firstHour + i, strokes: [] as Stroke[] }));
    for (const s of todays) {
      const start = new Date(s.started_at);
      const end = s.ended_at ? new Date(s.ended_at) : new Date(start.getTime() + s.total_seconds * 1000);
      const activeShare = s.total_seconds ? s.active_seconds / s.total_seconds : 0;
      const label = s.domain ? s.domain.replace(/^www\./, "") : s.app;
      let cursor = start;
      while (cursor < end) {
        const hourEnd = new Date(cursor); hourEnd.setMinutes(60, 0, 0);
        const segEnd = end < hourEnd ? end : hourEnd;
        const row = rows.find(r => r.hour === cursor.getHours());
        if (row) row.strokes.push({
          key: `${s.id}-${cursor.getTime()}`,
          left: (cursor.getMinutes() * 60 + cursor.getSeconds()) / 36,
          width: Math.max(0.8, (segEnd.getTime() - cursor.getTime()) / 36000),
          pen: pens.css(s.domain, s.app), active: activeShare >= 0.5, label,
          title: `${label}${s.domain ? ` in ${s.app}` : ""}, ${clock(cursor)} to ${clock(segEnd)}. ${hm(s.active_seconds)} active of ${hm(s.total_seconds)}.`,
        });
        cursor = segEnd;
      }
    }
    // Label a stroke only when no later stroke starts inside it, so text is never covered.
    for (const row of rows) {
      row.strokes.sort((a, b) => a.left - b.left);
      row.strokes.forEach((st, i) => { const next = row.strokes[i + 1]; if (next && next.left < st.left + st.width - 0.5) st.label = ""; });
    }
    return rows;
  }, [todays, first, pens]);

  useEffect(() => {
    const el = dayRef.current;
    if (scrolled.current || !el || !series) return;
    const row = el.querySelector<HTMLElement>(`[data-hour="${now.getHours()}"]`);
    if (row) el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight * 0.6);
    scrolled.current = true;
  }, [series, now]);

  // Compared with the usual amount by this time of day, naming the app that differs most.
  const compare = useMemo(() => {
    if (!series || !byNow || !today) return null;
    const usedDays = series.buckets.slice(0, -1).map((b, i) => ({ full: b, clipped: byNow.buckets[i] })).filter(d => d.full.total_seconds > 0 && d.clipped);
    if (usedDays.length < 2) return null;
    const usual = usedDays.reduce((sum, d) => sum + d.clipped.total_seconds, 0) / usedDays.length;
    const delta = total - usual;
    const pool = [...today.apps, ...usedDays.flatMap(d => d.clipped.apps)].filter(a => a.app_id !== "other");
    let driver = "", driverDelta = 0;
    for (const id of new Set(pool.map(a => a.app_id))) {
      const mine = today.apps.find(a => a.app_id === id)?.total_seconds ?? 0;
      const avg = usedDays.reduce((sum, d) => sum + (d.clipped.apps.find(a => a.app_id === id)?.total_seconds ?? 0), 0) / usedDays.length;
      const diff = mine - avg;
      if (Math.sign(diff) === Math.sign(delta) && Math.abs(diff) > Math.abs(driverDelta)) { driverDelta = diff; driver = pool.find(a => a.app_id === id)?.app ?? ""; }
    }
    return { usual, delta, driver: Math.abs(driverDelta) >= 300 ? driver : "", driverDelta };
  }, [series, byNow, today, total]);

  // Today's node map: the apps and sites used in the last day, and the notes they connect to.
  const map = useMemo(() => {
    if (!summary || !graph) return null;
    const used = summary.usage.filter(u => u.node_id && (u.type === "app" || u.type === "domain") && graph.nodes.some(n => n.id === u.node_id)).sort((a, b) => b.total_seconds - a.total_seconds).slice(0, 7);
    if (!used.length) return null;
    const W = 340, H = 280, cx = W / 2, cy = H / 2;
    const maxT = Math.max(...used.map(u => u.total_seconds), 1);
    const inner = used.map((u, i) => {
      const a = (i / used.length) * Math.PI * 2 - Math.PI / 2;
      return { id: u.node_id, title: u.title, kind: u.type, fill: pens.css(u.title), x: cx + Math.cos(a) * 88, y: cy + Math.sin(a) * 66, r: 7 + 11 * Math.sqrt(u.total_seconds / maxT), angle: a, detail: hm(u.total_seconds) };
    });
    const ids = new Set(inner.map(n => n.id));
    const outer: typeof inner = [];
    const links: { a: { x: number; y: number }; b: { x: number; y: number }; source: string; key: string }[] = [];
    for (const n of inner) {
      const notes = graph.edges.filter(e => e.source_id === n.id || e.target_id === n.id)
        .map(e => ({ e, other: graph.nodes.find(x => x.id === (e.source_id === n.id ? e.target_id : e.source_id)) }))
        .filter(x => x.other?.type === "note").sort((p, q) => q.e.strength - p.e.strength).slice(0, 2);
      notes.forEach(({ e, other }, k) => {
        if (!other) return;
        let node = outer.find(o => o.id === other.id);
        if (!node && outer.length < 6 && !ids.has(other.id)) {
          const a = n.angle + (k === 0 ? -0.3 : 0.3);
          node = { id: other.id, title: other.title, kind: "note", fill: "var(--paper-raised)", x: cx + Math.cos(a) * 148, y: cy + Math.sin(a) * 118, r: 6 + 7 * other.importance, angle: a, detail: "note" };
          outer.push(node);
        }
        if (node) links.push({ a: n, b: node, source: e.source, key: `${e.id}` });
      });
    }
    for (const e of graph.edges) if (ids.has(e.source_id) && ids.has(e.target_id)) {
      links.push({ a: inner.find(n => n.id === e.source_id)!, b: inner.find(n => n.id === e.target_id)!, source: e.source, key: `${e.id}` });
    }
    // Crop the view to where the dots actually are (plus room for labels), so the map never floats in empty space.
    const all = [...inner, ...outer];
    const x0 = Math.min(...all.map(n => n.x - n.r)) - 56, x1 = Math.max(...all.map(n => n.x + n.r)) + 56;
    const y0 = Math.min(...all.map(n => n.y - n.r)) - 8, y1 = Math.max(...all.map(n => n.y + n.r)) + 24;
    return { box: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`, W, H, nodes: all, links };
  }, [summary, graph, pens]);

  const parts = hmParts(total);
  const failed = !!error && !series;
  const loading = !series && !error;
  const recording = !!status?.config.enabled;
  const share = total ? Math.round(activeSec / total * 100) : 0;
  const week = series?.buckets.slice(-7) ?? [];
  const weekMax = Math.max(1, ...week.map(b => b.total_seconds));
  const unavailable = <p className="muted">Not available until Dendrite can reach its local server.</p>;

  return (
    <div className="today-wrap">
      {error && <div className="banner" role="alert">
        <p><strong>Today&apos;s activity couldn&apos;t be loaded.</strong> The local Dendrite server said: {error}.{series ? " Showing the last numbers that loaded." : ""}</p>
        <button disabled={retrying} onClick={() => { setRetrying(true); setAttempt(n => n + 1); }}>{retrying ? "Trying…" : "Try again"}</button>
      </div>}

      <div className="today">
        <section className="panel summary" aria-labelledby="today-total">
          <h2 id="today-total">Screen time today</h2>
          {failed ? unavailable : loading ? <div className="skeleton tall" aria-hidden="true" /> : total > 0 ? <>
            <p className="total" aria-label={`${parts.h} hours ${parts.m} minutes`}>
              {parts.h > 0 && <><span className="num">{parts.h}</span><span className="unit">h</span></>}
              <span className="num">{parts.m}</span><span className="unit">min</span>
            </p>
            {first && <p className="muted">Since {clock(first)} this morning.</p>}

            <div className="split" aria-hidden="true" style={{ ["--pen" as string]: "var(--hl-yellow)" }}>
              <span className="seg pass2" style={{ width: `${share}%` }} />
              <span className="seg hatch" style={{ width: `${100 - share}%` }} />
            </div>
            <dl className="split-key">
              <div><dt><span className="key-swatch pass2" /> Active</dt><dd>{hm(activeSec)}<small>{share}%</small></dd></div>
              <div><dt><span className="key-swatch hatch" /> Passive</dt><dd>{hm(passiveSec)}<small>{100 - share}%</small></dd></div>
            </dl>
            <p className="explain">Active means you typed or moved the mouse recently. Passive means the screen was in front of you with no input.</p>

            <p className="compare">
              {!compare ? "After a few more days, Dendrite will compare today with your usual day."
                : Math.abs(compare.delta) < 600 ? <>About your usual for this time of day, <strong>{hm(compare.usual)}</strong>.</>
                : <><strong>{hm(Math.abs(compare.delta))} {compare.delta < 0 ? "less" : "more"}</strong> than you usually have by {clock(now)}.
                  {compare.driver && <> The biggest difference is <span className="circled">{compare.driver}</span>, {hm(Math.abs(compare.driverDelta))} {compare.driverDelta < 0 ? "less" : "more"}.</>}</>}
            </p>
          </> : <div className="empty">
            {status && !status.supported ? <p>This computer can&apos;t record app usage. Recording needs macOS.</p>
              : recording ? <p>Nothing recorded yet today. Dendrite notes which app is in front every few seconds, and your first stretch appears after about a minute.</p>
              : <><p>Nothing recorded today. Recording is paused, so Dendrite isn&apos;t noting which apps you use.</p>
                <button className="primary" disabled={busy || !status} onClick={onToggleRecording}>Start recording</button></>}
          </div>}

          {week.length > 0 && <div className="week">
            <div className="week-head"><h3>Last 7 days</h3><button className="quiet" onClick={onOpenTrends}>See trends <Icon name="arrow" size={16} /></button></div>
            <ol className="week-bars">
              {week.map((b, i) => {
                const h = b.total_seconds / weekMax * 100, a = b.total_seconds ? b.active_seconds / b.total_seconds : 0;
                const isToday = i === week.length - 1;
                return <li key={b.start} className={isToday ? "is-today" : ""} title={`${b.label}: ${hm(b.total_seconds)}, ${hm(b.active_seconds)} active`}
                  style={{ ["--pen" as string]: isToday ? "var(--hl-yellow)" : "var(--hl-grey)" }}>
                  <span className="bar hatch" style={{ height: `${Math.max(h, b.total_seconds ? 4 : 0)}%` }}><i className="pass2" style={{ height: `${a * 100}%` }} /></span>
                  <span className="day-label" aria-hidden="true">{new Date(b.start).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                  <span className="sr-only">{b.label}: {hm(b.total_seconds)}</span>
                </li>;
              })}
            </ol>
          </div>}
        </section>

        <section className="panel day" aria-labelledby="today-day">
          <div className="panel-head">
            <h2 id="today-day">Your day</h2>
            <p className="legend"><span className="key-swatch pass2 grey" /> mostly active <span className="key-swatch hatch grey" /> mostly passive</p>
          </div>
          <div className="hours" ref={dayRef}>
            {failed ? <div className="day-note">{unavailable}</div>
              : loading ? Array.from({ length: 8 }, (_, i) => <div key={i} className="hour"><span className="h-label" /><div className="lane"><span className="skeleton stroke-sk" style={{ width: `${30 + (i * 17) % 50}%`, marginLeft: `${(i * 23) % 30}%` }} /></div></div>)
              : hours.map(row => {
                const future = row.hour > now.getHours();
                return <div key={row.hour} data-hour={row.hour} className={`hour ${future ? "future" : ""} ${row.hour === now.getHours() ? "current" : ""}`}>
                  <span className="h-label">{clock(new Date(new Date(now).setHours(row.hour, 0, 0, 0)))}</span>
                  <div className="lane">
                    {row.strokes.map(s => (
                      <span key={s.key} tabIndex={0} role="img" aria-label={s.title} data-tip={s.title}
                        className={`stroke ${s.active ? "pass2" : "hatch"} ${s.left > 60 ? "tip-left" : ""}`} style={{ left: `${s.left}%`, width: `${s.width}%`, ["--pen" as string]: s.pen }}>
                        {s.width >= 14 && s.label && <span className="stroke-label">{s.label}</span>}
                      </span>
                    ))}
                    {row.hour === now.getHours() && <span className="now" style={{ left: `${(now.getMinutes() / 60) * 100}%` }}><span>Now</span></span>}
                  </div>
                </div>;
              })}
            {!loading && !failed && !todays.length && <p className="day-note">Your day fills in here as you use your computer: each app becomes a highlighter stroke across the minutes you used it.</p>}
          </div>
        </section>

        <section className="panel side" aria-labelledby="today-top">
          <h2 id="today-top">Most used today</h2>
          {failed ? unavailable : loading ? <div className="skeleton list" aria-hidden="true" /> : !apps.length ? <p className="muted">Apps and websites you use today will be listed here, longest first.</p> : <>
            <ol className="top">
              {topApps.map(a => <TopRow key={a.name} item={a} max={listMax} pen={pens.css(a.name)} />)}
              {rest.total > 0 && <TopRow item={{ name: "Everything else", ...rest }} max={listMax} pen="var(--hl-grey)" />}
            </ol>
            {sites.length > 0 && <>
              <h3 className="sub">Websites</h3>
              <ol className="top">{sites.slice(0, 3).map(s => <TopRow key={s.name} item={s} max={listMax} pen={pens.css(s.name, s.via)} />)}</ol>
            </>}
          </>}

          <h2 className="map-head">How today connects</h2>
          {failed ? unavailable : map ? <>
            <svg className="map" viewBox={map.box} role="group" aria-label="Apps and websites from the last day, and the notes they connect to">
              {map.links.map(l => <line key={l.key} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} className={`link ${l.source}`} />)}
              {map.nodes.map(n => (
                <g key={n.id} className={`node ${n.kind}`} role="button" tabIndex={0} aria-label={`${n.title}, ${n.detail}. Open in Notes`}
                  onClick={() => onOpenNode(n.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenNode(n.id); } }}>
                  <circle cx={n.x} cy={n.y} r={n.r} style={{ fill: n.fill }} />
                  <text x={n.x} y={n.y + n.r + 14} textAnchor="middle">{n.title.length > 18 ? `${n.title.slice(0, 17)}…` : n.title}</text>
                </g>
              ))}
            </svg>
            <p className="muted small">Filled dots are apps and websites, sized by time. Open circles are your notes. Select any dot to open it in Notes.</p>
          </> : <p className="muted">Once you&apos;ve used a few apps or websites, this map shows how they connect to your notes.</p>}
        </section>
      </div>

      <style jsx>{`
        .today-wrap { height: 100%; display: flex; flex-direction: column; min-height: 0; }
        .banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 16px 24px 0; padding: 10px 12px 10px 16px; border: var(--stroke) solid var(--danger); border-radius: var(--radius); background: var(--danger-soft); flex: none; }
        .banner p { color: var(--ink); font-size: 14px; }
        .today { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(300px, 340px) minmax(0, 1fr) minmax(300px, 360px); grid-template-rows: minmax(0, 1fr); gap: 20px; padding: 20px 24px 24px; align-items: start; }
        .panel { background: var(--paper-raised); border: var(--stroke) solid var(--border); border-radius: var(--radius-lg); padding: 20px 22px; min-height: 0; max-height: 100%; overflow: auto; display: flex; flex-direction: column; gap: 14px; }
        .total { display: flex; align-items: baseline; gap: 4px; line-height: 1; margin-top: 2px; }
        .num { font-size: 72px; font-weight: 700; letter-spacing: -0.04em; }
        .unit { font-size: 24px; font-weight: 600; color: var(--ink-2); margin-right: 10px; }
        .split { display: flex; height: 20px; border-radius: 5px; overflow: hidden; border: var(--stroke) solid var(--border); margin-top: 6px; }
        .seg { display: block; height: 100%; }
        .split-key { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .split-key dt { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink-2); }
        .key-swatch { display: inline-block; width: 24px; height: 12px; border-radius: 3px; --pen: var(--hl-yellow); flex: none; }
        .key-swatch.grey { --pen: var(--hl-grey); }
        .split-key dd { font-size: 19px; font-weight: 650; margin-top: 2px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .split-key small { font-size: 13px; font-weight: 500; color: var(--ink-3); }
        .explain { font-size: 13px; color: var(--ink-2); line-height: 1.5; }
        .compare { padding-top: 14px; border-top: var(--stroke) dashed var(--border); font-size: 15px; line-height: 1.7; }
        .compare strong { background: var(--hl-yellow); color: var(--on-hl); padding: 0 4px; border-radius: 3px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
        .circled { position: relative; white-space: nowrap; font-weight: 650; padding: 0 2px; }
        .circled::after { content: ""; position: absolute; inset: -4px -7px -3px -6px; border: 1.75px solid var(--rule); border-radius: 50%; transform: rotate(-3deg); pointer-events: none; }
        .empty { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; color: var(--ink-2); line-height: 1.55; }
        .week { padding-top: 16px; border-top: var(--stroke) solid var(--hairline); display: flex; flex-direction: column; gap: 10px; }
        .week-head { display: flex; justify-content: space-between; align-items: center; }
        .week-head button { min-height: 32px; padding: 4px 6px; }
        .week-bars { list-style: none; display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; height: 104px; }
        .week-bars li { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; }
        .bar { width: 100%; max-width: 26px; display: flex; flex-direction: column; justify-content: flex-end; border-radius: 4px 4px 2px 2px; overflow: hidden; }
        .bar i { display: block; }
        .is-today .bar { outline: 1.5px solid var(--ink); outline-offset: 1px; }
        .day-label { font-size: 12px; color: var(--ink-3); }
        .is-today .day-label { color: var(--rule); font-weight: 700; }

        .day { padding: 0; gap: 0; height: 100%; }
        .panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 18px 22px 14px; border-bottom: var(--stroke) solid var(--border); flex-wrap: wrap; flex: none; }
        .legend { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); }
        .legend .key-swatch.hatch { margin-left: 8px; }
        .hours { flex: 1; min-height: 0; overflow: auto; padding: 4px 22px 18px; position: relative; }
        .hour { display: grid; grid-template-columns: 64px 1fr; gap: 18px; height: 48px; align-items: center; border-bottom: 1px solid var(--grid); }
        .hour.future .h-label { color: var(--grid-strong); }
        .h-label { font-size: 13px; color: var(--ink-3); text-align: right; }
        .current .h-label { color: var(--rule); font-weight: 650; }
        .lane { position: relative; height: 32px; background: linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 25% 100%; }
        .stroke { position: absolute; top: 2px; height: 28px; border-radius: 3px 5px 4px 3px; display: flex; align-items: center; padding: 0 8px; color: var(--on-hl); animation: stroke-in .5s var(--ease) both; outline-offset: 2px; }
        .stroke-label { position: relative; z-index: 1; font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .hatch .stroke-label { background: var(--paper-raised); padding: 0 4px; border-radius: 3px; color: var(--ink); }
        .stroke::before { content: attr(data-tip); position: absolute; left: 0; bottom: calc(100% + 8px); width: max-content; max-width: 280px; padding: 7px 10px; border-radius: var(--radius-sm); background: var(--ink); color: var(--paper); font-size: 13px; font-weight: 500; line-height: 1.4; white-space: normal; z-index: 5; opacity: 0; transform: translateY(3px); pointer-events: none; transition: opacity .15s var(--ease), transform .15s var(--ease); }
        .stroke.tip-left::before { left: auto; right: 0; }
        .stroke:hover::before, .stroke:focus-visible::before { opacity: 1; transform: none; }
        .stroke:hover, .stroke:focus-visible { z-index: 4; }
        .now { position: absolute; top: -8px; bottom: -8px; width: 2px; background: var(--rule); z-index: 3; }
        .now span { position: absolute; top: -2px; left: 6px; font-size: 12px; font-weight: 700; color: var(--rule); background: var(--paper-raised); padding: 0 3px; }
        .day-note { padding: 20px 0 0 82px; max-width: 56ch; color: var(--ink-2); }

        .top { list-style: none; display: flex; flex-direction: column; gap: 12px; }
        .sub { font-size: 15px; color: var(--ink-2); margin-top: 4px; }
        .map-head { padding-top: 16px; border-top: var(--stroke) solid var(--hairline); }
        .map { width: 100%; height: auto; overflow: visible; flex: none; }
        .map :global(.link) { stroke: var(--edge-inferred); stroke-width: 1.25; stroke-dasharray: 3 4; }
        .map :global(.link.explicit) { stroke: var(--edge-explicit); stroke-dasharray: none; }
        .map :global(.link.activity) { stroke: var(--edge-usage); stroke-width: 6; stroke-linecap: round; opacity: .45; stroke-dasharray: none; }
        .map :global(.node) { cursor: pointer; outline: none; }
        .map :global(.node circle) { stroke: var(--node-outline); stroke-width: 1.5; transition: stroke-width .15s var(--ease); }
        .map :global(.node.note circle) { stroke-width: 2; }
        .map :global(.node:hover circle), .map :global(.node:focus-visible circle) { stroke: var(--rule); stroke-width: 3; }
        .map :global(.node text) { font-size: 12px; font-weight: 550; fill: var(--ink); paint-order: stroke; stroke: var(--paper-raised); stroke-width: 4px; stroke-linejoin: round; }
        .small { font-size: 13px; line-height: 1.5; }
        .skeleton { border-radius: 6px; background: linear-gradient(90deg, var(--paper-sunk), var(--grid), var(--paper-sunk)); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
        .skeleton.tall { height: 220px; } .skeleton.list { height: 240px; }
        .stroke-sk { display: block; height: 24px; }
        @keyframes shimmer { to { background-position: -200% 0; } }
        .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        @media (max-width: 1180px) {
          .today { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto minmax(460px, 1fr); overflow: auto; }
          .day { grid-column: 1 / -1; grid-row: 2; }
          .panel { max-height: none; }
        }
        @media (max-width: 760px) {
          .banner { margin: 12px 12px 0; flex-wrap: wrap; }
          .today { display: flex; flex-direction: column; padding: 12px; gap: 12px; overflow: auto; }
          .today > * { flex: none; }
          .panel { overflow: visible; max-height: none; }
          .day .hours { max-height: 60vh; }
          .num { font-size: 56px; }
          .hour { grid-template-columns: 46px 1fr; gap: 10px; }
          .hours { padding: 4px 12px 14px; }
          .day-note { padding-left: 56px; }
        }
      `}</style>
    </div>
  );
}

function TopRow({ item, max, pen }: { item: Tally; max: number; pen: string }) {
  const w = item.total / max * 100, act = item.total ? item.active / item.total * 100 : 0;
  return <li className="row" style={{ ["--pen" as string]: pen }}>
    <span className="name">{item.name}</span>
    <span className="time">{hm(item.total)}</span>
    <span className="track hatch" aria-hidden="true" style={{ width: `${Math.max(w, 2)}%` }}><i className="pass2" style={{ width: `${act}%` }} /></span>
    <style jsx>{`
      .row { display: grid; grid-template-columns: 1fr auto; gap: 5px 10px; }
      .name { font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .time { font-weight: 650; }
      .track { grid-column: 1 / -1; height: 12px; border-radius: 3px; overflow: hidden; display: block; animation: stroke-in .6s var(--ease) both; }
      .track i { display: block; height: 100%; }
    `}</style>
  </li>;
}
