"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ActivityNodeDetail, ActivityStatus, ActivityWebsiteResult, MutedConnection, Note } from "@/lib/types";
import { hm } from "@/lib/time";
import { explainReason } from "@/lib/reasons";
import { usePens } from "@/lib/pens";

const nodeLabel = (node: Note | undefined, path: string) => node?.title || path;
const SOURCE_LABEL: Record<string, string> = { activity: "From your activity", explicit: "Link you wrote", automatic: "Found automatically" };

interface Props { days: number; status: ActivityStatus | null; connections: boolean; revision: number; onOpen: (id: number) => void; onChanged: () => void }

export function WebsiteExplorer({ days, status, connections, revision, onOpen, onChanged }: Props) {
  const [kind, setKind] = useState<"domains" | "pages">("domains");
  const [sort, setSort] = useState<"active" | "recent" | "duration">("active");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<ActivityWebsiteResult | null>(null);
  const [detail, setDetail] = useState<ActivityNodeDetail | null>(null);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState<MutedConnection[]>([]);
  const [busy, setBusy] = useState(false);
  const pens = usePens();

  useEffect(() => {
    if (!connections) { setMuted([]); return; }
    let active = true;
    api.mutedConnections().then(r => { if (active) setMuted(r.muted); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [connections, revision]);
  useEffect(() => {
    let active = true, sequence = 0;
    // Only the list resets here: muting bumps the revision, and clearing the
    // selection would close the very panel the user just acted in.
    setResult(null);
    const load = async () => {
      const current = ++sequence;
      try { const r = await api.activityWebsites(kind, { days, limit: 25, offset, sort, search }); if (active && current === sequence) { setResult(r); setError(""); } }
      catch (e) { if (active && current === sequence) setError(String(e)); }
    };
    const delay = setTimeout(load, 200), timer = setInterval(load, 8000);
    return () => { active = false; clearTimeout(delay); clearInterval(timer); };
  }, [days, kind, offset, sort, search, revision]);
  useEffect(() => { setDetail(null); }, [kind, search, days]);

  const inspect = async (id: number) => { try { setDetail(await api.activityNode(id)); setError(""); } catch (e) { setError(String(e)); } };
  const setHidden = async (sourceId: number, targetId: number, hidden: boolean) => {
    setBusy(true);
    try {
      if (hidden) await api.unmuteConnection(sourceId, targetId); else await api.muteConnection(sourceId, targetId);
      setMuted((await api.mutedConnections()).muted);
      if (detail) await inspect(detail.node.id);
      setError(""); onChanged();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const clearMute = async (m: MutedConnection) => { if (m.a?.id && m.b?.id) await setHidden(m.a.id, m.b.id, true); };

  const items = (kind === "domains" ? result?.domains : result?.pages) ?? [];
  const top = Math.max(1, ...items.map(w => w.total_seconds));
  const emptyText = !status?.config.browser_pages ? "Website recording is turned off. Turn it on under Privacy, retention & browser setup to see websites here."
    : !status.config.enabled ? "Recording is stopped. Websites you visited before stopping appear here while they're kept."
    : "No websites in this range yet. For reliable website times, pair the browser extension.";

  return <section className="websites" aria-label={connections ? "Activity connections" : "Website activity"}>
    <div className="intro">
      <h2>{connections ? "How your websites connect" : "Websites you use"}</h2>
      <p className="muted">{connections ? "Select a website to see what it's connected to and why. Mute anything that doesn't belong." : "Time spent on each website, with the part where you were active drawn solid."}</p>
    </div>
    <div className="filters">
      <label>Show <select aria-label="Website type" value={kind} onChange={e => { setKind(e.target.value as typeof kind); setOffset(0); }}><option value="domains">Websites</option><option value="pages">Pages</option></select></label>
      <label>Sort by <select aria-label="Website sort" value={sort} onChange={e => { setSort(e.target.value as typeof sort); setOffset(0); }}><option value="active">Most active</option><option value="recent">Most recent</option><option value="duration">Most time</option></select></label>
      <input aria-label="Search website activity" placeholder="Search by title or address" value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} />
    </div>
    {error && <p role="alert" className="error">{error}</p>}

    <div className={`layout ${detail ? "with-detail" : ""}`}>
      <div className="list-col">
        {!result ? <p role="status" className="empty">Loading websites…</p> : !items.length ? <p className="empty">{emptyText}</p> :
          <ul className="website-list">
            {items.map(w => {
              const act = w.total_seconds ? w.active_seconds / w.total_seconds * 100 : 0;
              return <li key={w.domain + w.url} className={detail?.node.id === w.node_id ? "current" : ""} style={{ ["--pen" as string]: pens.css(w.domain, w.browsers[0]) }}>
                <div className="line">
                  <button className="site" disabled={!w.node_id} onClick={() => connections ? inspect(w.node_id) : onOpen(w.node_id)}>{w.title}</button>
                  <span className="time">{hm(w.total_seconds)}</span>
                </div>
                <span className="track" aria-hidden="true"><span className="fill hatch" style={{ width: `${Math.max(2, w.total_seconds / top * 100)}%` }}><i className="pass2" style={{ width: `${act}%` }} /></span></span>
                <p className="meta">{w.domain}{w.browsers.length ? ` in ${w.browsers.join(", ")}` : ""}. {hm(w.active_seconds)} active over {w.sessions} {w.sessions === 1 ? "visit" : "visits"}{kind === "domains" ? `, ${w.pages} ${w.pages === 1 ? "page" : "pages"}` : ""}. Last visited {new Date(w.last_seen).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.</p>
                {w.url && <p className="url">{w.url}</p>}
                <div className="line-actions">
                  <span className="muted small">{w.connections} {w.connections === 1 ? "connection" : "connections"}</span>
                  {!connections && <button className="quiet" disabled={!w.node_id} onClick={() => inspect(w.node_id)}>Explain connections</button>}
                </div>
              </li>;
            })}
          </ul>}
        {result && result.total > 0 && <nav aria-label="Website pagination">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous websites</button>
          <span>{offset + 1} to {Math.min(offset + 25, result.total)} of {result.total}</span>
          <button disabled={offset + 25 >= result.total} onClick={() => setOffset(offset + 25)}>Next websites</button>
        </nav>}
      </div>

      {detail && <section className="detail" aria-label="Website connection explanations">
        <div className="detail-head">
          <h3>{detail.node.title}</h3>
          <button onClick={() => onOpen(detail.node.id)}>Inspect activity node</button>
          <p className="muted small">Each number is how strong a connection is, out of 150.</p>
        </div>
        {[...detail.related_notes, ...detail.related_nodes].map(({ node, edge }) => <article key={edge.id}>
          <div className="line">
            <button className="site" onClick={() => onOpen(node.id)}>{node.title}</button>
            <span className="strength"><span className="sr-only">Strength </span>{Math.round(edge.strength)}<small>/150</small></span>
          </div>
          <p className="muted small">{SOURCE_LABEL[edge.source] ?? edge.source}, {edge.relationship_type}</p>
          <ul className="reason">{explainReason(edge.reason).map(r => <li key={r}>{r}</li>)}</ul>
          {edge.source === "activity" && <button className="quiet mute" disabled={busy} onClick={() => setHidden(detail.node.id, node.id, false)}>Mute this connection</button>}
        </article>)}
        {!detail.connections && <p className="muted">Nothing is connected to this website yet.</p>}
        {!!detail.muted_connections && <p className="muted">{detail.muted_connections} muted connection{detail.muted_connections === 1 ? " is" : "s are"} hidden here. Restore {detail.muted_connections === 1 ? "it" : "them"} under Connections.</p>}
      </section>}
    </div>

    {connections && !!muted.length && <section className="muted-list" aria-label="Muted connections">
      <h3>Muted connections ({muted.length})</h3>
      <p className="muted">These stay hidden from the graph and lists until you restore them. Your time totals don&apos;t change.</p>
      <ul>
        {muted.map(m => <li key={m.a_path + m.b_path}>
          <span>{nodeLabel(m.a, m.a_path)} <span className="muted">and</span> {nodeLabel(m.b, m.b_path)}</span>
          {m.a?.id && m.b?.id ? <button disabled={busy} onClick={() => clearMute(m)}>Restore this connection</button> : <span className="muted small">No longer kept. Stays hidden if it comes back.</span>}
        </li>)}
      </ul>
    </section>}

    <style jsx>{`
      .websites { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
      .intro h2 { font-size: 21px; }
      .intro p { margin-top: 2px; max-width: 72ch; }
      .filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      .filters label { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink-2); }
      .filters input { flex: 1; min-width: 200px; max-width: 380px; }
      .empty { padding: 32px; text-align: center; color: var(--ink-2); border: var(--stroke) dashed var(--grid-strong); border-radius: var(--radius-lg); background: var(--paper-raised); }
      .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
      .layout.with-detail { grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr); }
      .website-list { list-style: none; border: var(--stroke) solid var(--border); border-radius: var(--radius-lg); background: var(--paper-raised); overflow: hidden; }
      .website-list li { display: flex; flex-direction: column; gap: 6px; padding: 14px 18px; border-bottom: 1px solid var(--grid); }
      .website-list li:last-child { border-bottom: 0; }
      .website-list li.current { background: var(--rule-soft); box-shadow: inset 0 0 0 1.5px var(--rule); }
      .line { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
      .site { border: 0; background: none; padding: 0; min-height: 0; font-size: 16px; font-weight: 650; text-align: left; white-space: normal; overflow-wrap: anywhere; justify-content: flex-start; }
      .site:hover:not(:disabled) { background: none; color: var(--rule); text-decoration: underline; text-underline-offset: 3px; }
      .time { font-weight: 650; flex: none; }
      .track { height: 10px; }
      .fill { display: block; height: 100%; border-radius: 3px; overflow: hidden; }
      .fill i { display: block; height: 100%; }
      .meta { font-size: 14px; color: var(--ink-2); overflow-wrap: anywhere; }
      .url { font-family: var(--font-mono); font-size: 12.5px; color: var(--ink-3); overflow-wrap: anywhere; }
      .line-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .line-actions button { min-height: 32px; padding: 4px 8px; color: var(--rule); }
      .small { font-size: 13px; }
      nav { display: flex; align-items: center; gap: 12px; margin-top: 12px; color: var(--ink-2); font-size: 14px; flex-wrap: wrap; }
      .detail { position: sticky; top: 64px; display: flex; flex-direction: column; gap: 4px; padding: 18px 20px; border: var(--stroke) solid var(--border); border-radius: var(--radius-lg); background: var(--paper-raised); box-shadow: var(--lift); animation: rise .2s var(--ease); }
      .detail-head { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding-bottom: 12px; border-bottom: var(--stroke) solid var(--border); }
      .detail-head h3 { font-size: 19px; overflow-wrap: anywhere; }
      article { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 0; border-bottom: 1px dashed var(--grid-strong); }
      article .line { width: 100%; }
      .strength { font-size: 13px; font-weight: 700; padding: 1px 7px; border: 1.25px solid var(--ink); border-radius: 4px; flex: none; }
      .strength small { font-weight: 500; color: var(--ink-3); }
      .reason { list-style: none; display: flex; flex-direction: column; gap: 2px; font-size: 14px; line-height: 1.5; }
      .reason li { position: relative; padding-left: 14px; }
      .reason li::before { content: ""; position: absolute; left: 0; top: 9px; width: 8px; height: 4px; border-radius: 2px; background: var(--edge-usage); }
      .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      .mute { min-height: 32px; padding: 4px 8px; margin-left: -8px; color: var(--danger); }
      .muted-list { padding: 18px 20px; border: var(--stroke) solid var(--border); border-radius: var(--radius-lg); background: var(--paper-raised); display: flex; flex-direction: column; gap: 8px; }
      .muted-list ul { list-style: none; }
      .muted-list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--grid); flex-wrap: wrap; }
      @media (max-width: 1000px) { .layout.with-detail { grid-template-columns: 1fr; } .detail { position: static; } }
    `}</style>
  </section>;
}
