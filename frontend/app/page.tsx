"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityStatus, Backup, Edge, HistoryState, Note, SearchFilters, SearchHit, Settings } from "@/lib/types";
import { api } from "@/lib/api";
import { GraphCanvas, type GraphHandle } from "@/components/graph/GraphCanvas";
import { InspectorPanel } from "@/components/inspector/InspectorPanel";
import { EditorPanel } from "@/components/editor/EditorPanel";
import { ActivityPanel } from "@/components/activity/ActivityPanel";
import { ActivityInspector } from "@/components/activity/ActivityInspector";
import { TodayView } from "@/components/today/TodayView";
import { Icon } from "@/components/ui/Icon";
import { explainReason } from "@/lib/reasons";

type Tab = "today" | "trends" | "notes";
const TABS: { id: Tab; label: string }[] = [{ id: "today", label: "Today" }, { id: "trends", label: "Trends" }, { id: "notes", label: "Notes" }];
const emptyFilters: SearchFilters = { tag: "", project: "", path: "" };

export default function Home() {
  const [tab, setTabState] = useState<Tab>("today");
  const [span, setSpan] = useState("Today");
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tools, setTools] = useState(false);
  const [showWeak, setShowWeak] = useState(false);
  const [settings, setSettings] = useState<Settings>({ min_auto_edge_strength: 25 });
  const [threshold, setThreshold] = useState("25");
  const [history, setHistory] = useState<HistoryState>({ undo: "", redo: "" });
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [edgeNotes, setEdgeNotes] = useState<Note[]>([]);
  const [activityStatus, setActivityStatus] = useState<ActivityStatus | null>(null);
  const [selectedType, setSelectedType] = useState("note");
  const graphRef = useRef<GraphHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dirty = editing || creating;

  // Tabs are deep-linkable (#today, #trends, #notes) and follow browser back/forward.
  useEffect(() => {
    const read = () => { const h = window.location.hash.slice(1); if (h === "today" || h === "trends" || h === "notes") setTabState(h); };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const leaveDraft = () => !dirty || confirm("Discard the open draft?");
  const setTab = (next: Tab) => {
    if (next === tab || (next !== "notes" && !leaveDraft())) return;
    if (next !== "notes") { setCreating(false); setEditing(false); }
    setTabState(next);
    window.history.pushState(null, "", `#${next}`);
  };

  useEffect(() => {
    let active = true;
    const load = () => api.activity().then(s => { if (active) setActivityStatus(s); }).catch(e => { if (active) setError(String(e)); });
    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    setSelectedType("");
    if (selectedId != null) api.node(selectedId).then(n => { if (active) setSelectedType(n.type); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [selectedId, revision]);
  useEffect(() => {
    let active = true;
    Promise.all([api.settings(), api.history()]).then(([s, h]) => {
      if (active) { setSettings(s); setThreshold(String(s.min_auto_edge_strength)); setHistory(h); }
    }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const hasQuery = !!search.trim() || Object.values(filters).some(Boolean);
    setHits([]);
    if (!hasQuery) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      api.search(search, filters).then(r => { if (active) setHits(r); })
        .catch(e => { if (active) setError(`Search failed: ${String(e)}`); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, filters, revision]);
  useEffect(() => {
    if (!selectedEdge) { setEdgeNotes([]); return; }
    let active = true;
    Promise.all([api.edge(selectedEdge.id), api.graph().then(s => s.nodes)])
      .then(([edge, list]) => { if (active) { setSelectedEdge(edge); setEdgeNotes(list); } })
      .catch(e => { if (active) { setError(String(e)); setSelectedEdge(null); } });
    return () => { active = false; };
    // IDs remain stable across unchanged syncs; revision refreshes explanations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEdge?.id, revision]);
  useEffect(() => {
    // "/" or Cmd/Ctrl+K jumps to note search from anywhere outside a text field.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setTabState("notes");
        window.history.replaceState(null, "", "#notes");
        requestAnimationFrame(() => { searchRef.current?.focus(); searchRef.current?.select(); });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectNode = useCallback((id: number | null) => {
    if (dirty && !confirm("Discard the open draft?")) return;
    setSelectedId(id); setSelectedEdge(null); setEditing(false); setCreating(false);
  }, [dirty]);
  const selectEdge = useCallback((edge: Edge | null) => {
    if (dirty && !confirm("Discard the open draft?")) return;
    setSelectedEdge(edge); setSelectedId(null); setEditing(false); setCreating(false);
  }, [dirty]);
  const focusNode = (id: number) => {
    if (!leaveDraft()) return;
    setSelectedId(id); setSelectedEdge(null); setEditing(false); setCreating(false);
    setTabState("notes");
    window.history.pushState(null, "", "#notes");
    requestAnimationFrame(() => graphRef.current?.focusNode(id));
  };
  const refresh = useCallback(async () => {
    setRevision(n => n + 1);
    const [h] = await Promise.all([api.history(), graphRef.current?.refresh()]);
    setHistory(h);
  }, []);
  const handleCreate = async (title: string, content: string) => {
    const note = await api.createNote(title, content);
    setCreating(false); setSelectedId(note.id); setSelectedEdge(null); setStatus(`Created “${note.title}”`);
    try { await refresh(); graphRef.current?.focusNode(note.id); } catch (e) { setError(`Created, but refresh failed: ${String(e)}`); }
  };
  const handleSave = async (id: number | string, title: string, content: string, rev: string) => {
    await api.updateNote(id, title, content, rev);
    setEditing(false); setStatus("Saved");
    try { await refresh(); } catch (e) { setError(`Saved, but refresh failed: ${String(e)}`); }
  };
  const handleDelete = async (id: number | string, rev: string) => {
    await api.deleteNote(id, rev);
    setSelectedId(null); setEditing(false); setStatus("Deleted. Undo is available.");
    try { await refresh(); } catch (e) { setError(`Deleted, but refresh failed: ${String(e)}`); }
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const exportBackup = async () => {
    const data = await api.export();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `dendrite-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported ${data.files.length} Markdown notes`);
  };
  const readImport = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) throw new Error("Import limit is 8 MiB");
    if (file.name.toLowerCase().endsWith(".md")) setBackup({ version: 1, files: [{ path: file.name, content: await file.text() }] });
    else {
      const parsed = JSON.parse(await file.text()) as Backup;
      if (parsed.version !== 1 || !Array.isArray(parsed.files)) throw new Error("Expected a Dendrite backup JSON or a Markdown file");
      setBackup(parsed);
    }
    setOverwrite(false);
  };
  const toggleRecording = () => run(async () => {
    if (!activityStatus) return;
    setActivityStatus(await api.configureActivity({ ...activityStatus.config, enabled: !activityStatus.config.enabled }));
  });
  const closePanel = () => {
    if (!leaveDraft()) return;
    setSelectedId(null); setSelectedEdge(null); setCreating(false); setEditing(false);
  };

  const hasQuery = !!search.trim() || Object.values(filters).some(Boolean);
  const recording = !!activityStatus?.config.enabled;
  const panelOpen = creating || editing || selectedId != null || !!selectedEdge;
  const edgeTitle = (id: number) => edgeNotes.find(n => n.id === id)?.title ?? `Node ${id}`;
  const panelTitle = creating ? "New note" : editing ? "Editing note" : selectedEdge ? "Relationship details" : selectedType && selectedType !== "note" ? "Activity details" : "Note details";

  return <div className="app grid-paper">
    <header className="topbar">
      <a className="brand" href="#today" onClick={e => { e.preventDefault(); setTab("today"); }}>
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <path d="M5 21.5c4-1.2 7.5-1 11-.2s7.5 1 11-.3" stroke="var(--hl-yellow)" strokeWidth="7" strokeLinecap="round" fill="none" />
          <g stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" fill="none"><path d="M16 17 9 10M16 17l8-5M16 17l-6 8M16 17l7 8" /></g>
          <g fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.8"><circle cx="16" cy="17" r="3.4" /><circle cx="9" cy="10" r="2.2" /><circle cx="24" cy="12" r="2.2" /><circle cx="10" cy="25" r="2" /><circle cx="23" cy="25" r="2" /></g>
        </svg>
        <span>Dendrite</span>
      </a>
      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map(t => <button key={t.id} role="tab" id={`tab-${t.id}`} aria-controls={`view-${t.id}`} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
          onKeyDown={e => {
            const i = TABS.findIndex(x => x.id === tab);
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
              setTab(next);
              requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
            }
          }}
          onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>
      {tab === "today" && <p className="span" aria-live="polite">{span}</p>}
      <button role="switch" aria-checked={recording} aria-label="Record activity" className={`rec ${recording ? "on" : ""}`} disabled={!activityStatus || busy} onClick={toggleRecording}
        title={recording ? "Dendrite is noting which app is in front. Select to pause." : "Recording is paused. Select to start."}>
        <span className="rec-dot" aria-hidden="true" />
        <span>{recording ? "Recording" : "Paused"}</span>
      </button>
    </header>

    {error && <div className="errorbar" role="alert"><span>{error}</span><button className="quiet" onClick={() => setError("")}>Dismiss</button></div>}

    <main className="views">
      {tab === "today" && <div id="view-today" role="tabpanel" aria-labelledby="tab-today" className="view">
        <TodayView status={activityStatus} busy={busy} onToggleRecording={toggleRecording} onOpenNode={focusNode} onOpenTrends={() => setTab("trends")} onSpan={setSpan} />
      </div>}

      {tab === "trends" && <div id="view-trends" role="tabpanel" aria-labelledby="tab-trends" className="view">
        <ActivityPanel onOpen={focusNode} onChanged={async () => { setActivityStatus(await api.activity()); await refresh(); }} />
      </div>}

      <div id="view-notes" role="tabpanel" aria-labelledby="tab-notes" className="view notes" hidden={tab !== "notes"}>
        <div className="notes-bar">
          <div className="searchwrap">
            <Icon name="search" size={18} />
            <input ref={searchRef} aria-label="Search notes" className="search" placeholder={'Search notes, or "an exact phrase"'} value={search}
              onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { setSearch(""); e.currentTarget.blur(); } }} />
            {!search && <kbd aria-hidden="true">/</kbd>}
            {hasQuery && <div className="results" role="region" aria-label="Search results">
              {searching ? <p className="results-empty">Searching…</p> : !hits.length ? <p className="results-empty">No matching notes.</p>
                : hits.map(h => <button key={h.node.id} className="result" onClick={() => { focusNode(h.node.id); setSearch(""); setFilters(emptyFilters); }}>
                  <strong>{h.node.title}</strong><small>{h.match_in} match, {h.node.path}</small>{h.snippet && <span>{h.snippet}</span>}
                </button>)}
            </div>}
          </div>
          <div className="bar-actions">
            <button className="primary" disabled={busy} onClick={() => { if (!leaveDraft()) return; setCreating(true); setEditing(false); setSelectedEdge(null); }}><Icon name="plus" /><span className="btn-label">New note</span></button>
            <button disabled={busy} onClick={() => run(async () => { const r = await api.sync(); await refresh(); setStatus(`Synced ${r.scanned} notes and ${r.edges} relationships`); })}><Icon name="sync" /><span className="btn-label">Sync</span></button>
            <button aria-expanded={tools} onClick={() => setTools(!tools)}><Icon name="settings" /><span className="btn-label">Settings & tools</span></button>
          </div>
        </div>

        {tools && <section className="tools" aria-label="Settings and vault tools">
          <fieldset disabled={busy}>
            <legend>How many connections to show</legend>
            <label>Automatic edge threshold (0–150)<input aria-label="Automatic edge threshold" type="number" min="0" max="150" value={threshold} onChange={e => setThreshold(e.target.value)} /></label>
            <button onClick={() => run(async () => {
              const value = Number(threshold);
              if (threshold.trim() === "" || !Number.isFinite(value) || value < 0 || value > 150) throw new Error("Choose a threshold from 0 to 150");
              const s = await api.saveSettings({ min_auto_edge_strength: value }); setSettings(s); await refresh(); setStatus("Settings saved");
            })}>Save settings</button>
            <p className="muted">Weaker connections are kept, just hidden. Links you wrote yourself always show.</p>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Search filters</legend>
            {(["tag", "project", "path"] as const).map(key => <label key={key} className="filter"><span>{key[0].toUpperCase() + key.slice(1)}</span>
              <input aria-label={`Filter by ${key}`} value={filters[key] ?? ""} onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} /></label>)}
            <button onClick={() => setFilters(emptyFilters)}>Clear filters</button>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Backup</legend>
            <button onClick={() => run(exportBackup)}>Export backup</button>
            <label>Import Markdown or backup<input aria-label="Import vault" type="file" accept=".json,.md" onChange={e => { const file = e.target.files?.[0]; if (file) run(() => readImport(file)); e.target.value = ""; }} /></label>
            {backup && <div className="import-ready">
              <p>Ready to import {backup.files.length} notes.</p>
              <label className="check"><input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />Allow overwriting existing paths</label>
              <div className="row">
                <button className="primary" onClick={() => run(async () => {
                  if (overwrite && !confirm("Overwrite matching notes? Export a backup first if needed.")) return;
                  const r = await api.import(backup, overwrite); setBackup(null); await refresh();
                  const s = await api.settings(); setSettings(s); setThreshold(String(s.min_auto_edge_strength)); setStatus(`Imported ${r.imported} notes`);
                })}>Import {backup.files.length} notes</button>
                <button onClick={() => setBackup(null)}>Cancel import</button>
              </div>
            </div>}
            <p className="muted">A backup holds your Markdown notes, graph positions and settings. Keep it private.</p>
          </fieldset>
        </section>}

        <div className="workspace">
          <aside className="sidebar" aria-label="Graph options">
            <section>
              <h2>View</h2>
              <label className="check"><input type="checkbox" checked={showWeak} onChange={e => setShowWeak(e.target.checked)} />Show weak links</label>
            </section>
            <section className="legend">
              <h2>Dots</h2>
              <ul>
                <li><span className="dot" style={{ background: "var(--paper-raised)", borderWidth: 2 }} />A note</li>
                <li><span className="dot pens" />An app or website, in its own highlighter colour</li>
                <li><span className="dot" style={{ background: "var(--hl-grey)" }} />Pages, windows and things you use less</li>
              </ul>
              <p className="ramp"><span className="dot s" /><span className="dot m" /><span className="dot l" />Bigger means better connected</p>
              <p className="muted"><span className="dot pin" /> A double ring means you pinned it in place.</p>
            </section>
            <section>
              <h2>History</h2>
              <div className="row">
                <button disabled={busy || dirty || !history.undo} title={history.undo} onClick={() => run(async () => { await api.undo(); setSelectedId(null); setSelectedEdge(null); await refresh(); setStatus("Undone"); })}><Icon name="undo" size={16} />Undo</button>
                <button disabled={busy || dirty || !history.redo} title={history.redo} onClick={() => run(async () => { await api.redo(); setSelectedId(null); setSelectedEdge(null); await refresh(); setStatus("Redone"); })}><Icon name="redo" size={16} />Redo</button>
              </div>
              {history.undo && <p className="muted small">Undo will reverse: {history.undo}</p>}
            </section>
            <div className="status" role="status">{busy ? "Working…" : status}</div>
          </aside>

          <GraphCanvas ref={graphRef} selectedId={selectedId} selectedEdgeId={selectedEdge?.id ?? null} onSelect={selectNode} onSelectEdge={selectEdge} showWeak={showWeak} threshold={settings.min_auto_edge_strength} onStatus={setStatus} />

          <aside className={`inspector ${panelOpen ? "open" : ""}`} aria-label="Details">
            {panelOpen && <div className="panel-bar">
              <p className="panel-title">{panelTitle}</p>
              <button className="quiet icon-only" aria-label="Close panel" title="Close panel" disabled={busy} onClick={closePanel}><Icon name="close" /></button>
            </div>}
            {creating ? <EditorPanel key="create" onCreate={handleCreate} onCancel={() => setCreating(false)} />
              : editing && selectedId != null ? <EditorPanel key={`edit-${selectedId}`} noteId={selectedId} onSave={handleSave} onCancel={() => setEditing(false)} />
              : selectedEdge ? <div className="edge-panel">
                <h2>Relationship</h2>
                <div className="edge-endpoints">
                  <button onClick={() => focusNode(selectedEdge.source_id)}>{edgeTitle(selectedEdge.source_id)}</button>
                  <span className="muted">and</span>
                  <button onClick={() => focusNode(selectedEdge.target_id)}>{edgeTitle(selectedEdge.target_id)}</button>
                </div>
                <div className="strength">
                  <p><strong>{Math.round(selectedEdge.strength)} / 150</strong> {selectedEdge.source === "explicit" ? "Explicit link" : selectedEdge.source === "activity" ? "From your activity" : "Found automatically"}</p>
                  <span className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, selectedEdge.strength / 150 * 100)}%` }} /></span>
                  <p className="muted small">{selectedEdge.relationship_type}, first noticed {new Date(selectedEdge.created_at).toLocaleString()}</p>
                </div>
                <h3>Why these are connected</h3>
                <ul className="reasons">{explainReason(selectedEdge.reason).map(reason => <li key={reason}>{reason}</li>)}</ul>
                <p className="muted small">Connections go both ways. Links and backlinks are listed in each note.</p>
              </div>
              : selectedId != null && selectedType && selectedType !== "note" ? <ActivityInspector key={selectedId} nodeId={selectedId} onOpen={focusNode} onChanged={async () => { await graphRef.current?.refresh(); }} />
              : selectedId != null && !selectedType ? <p className="loading-panel" aria-busy="true">Loading…</p>
              : selectedId != null && selectedType === "note" ? <InspectorPanel key={`${selectedId}-${revision}`} noteId={selectedId} onEdit={() => setEditing(true)} onDelete={handleDelete} onOpenRelated={focusNode} />
              : <div className="placeholder">
                <h2>Pick a dot or a line</h2>
                <p className="muted">Select a note, app or website to see its details, or a line to see why two things are connected.</p>
                <ul className="hints">
                  <li><span>Move a dot and pin it</span><kbd>drag</kbd></li>
                  <li><span>Unpin a dot</span><kbd>double-click</kbd></li>
                  <li><span>Zoom</span><kbd>scroll</kbd></li>
                  <li><span>Search notes</span><kbd>/</kbd></li>
                </ul>
                <p className="muted small">Prefer the keyboard? Open the list of everything in the graph from the toolbar.</p>
              </div>}
          </aside>
        </div>
      </div>
    </main>

    <style jsx>{`
      .app { display: flex; flex-direction: column; height: 100dvh; }
      .topbar { display: flex; align-items: center; gap: 20px; height: 60px; padding: 0 20px; background: var(--paper); border-bottom: var(--stroke) solid var(--border); position: relative; z-index: 20; }
      .brand { display: flex; align-items: center; gap: 9px; color: var(--ink); text-decoration: none; font-weight: 700; font-size: 18px; letter-spacing: -0.02em; }
      .tabs { display: flex; gap: 2px; }
      .tabs button { border: 0; background: transparent; min-height: 36px; padding: 6px 14px; border-radius: var(--radius-sm); color: var(--ink-2); font-size: 15px; position: relative; }
      .tabs button:hover { background: var(--paper-sunk); color: var(--ink); }
      .tabs button[aria-selected="true"] { color: var(--ink); }
      .tabs button[aria-selected="true"]::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: 3px; height: 7px; border-radius: 3px; background: var(--hl-yellow); z-index: -1; animation: stroke-in .35s var(--ease) both; }
      .span { margin-left: auto; color: var(--ink-2); font-size: 14px; }
      .rec { margin-left: auto; border-radius: 99px; gap: 9px; padding: 6px 14px 6px 12px; }
      .span + .rec { margin-left: 0; }
      .rec-dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--ink-3); }
      .rec.on .rec-dot { background: var(--live); border-color: var(--live); box-shadow: 0 0 0 0 var(--live); animation: live 2.4s ease-out infinite; }
      @keyframes live { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--live) 45%, transparent); } 70%, 100% { box-shadow: 0 0 0 7px transparent; } }
      .errorbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 12px 6px 20px; background: var(--danger-soft); color: var(--danger); border-bottom: var(--stroke) solid var(--danger); font-size: 14px; }
      .views { flex: 1; min-height: 0; position: relative; }
      .view { height: 100%; min-height: 0; }
      .notes { display: flex; flex-direction: column; }
      .notes[hidden] { display: none; }
      .notes-bar { display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: var(--paper); border-bottom: var(--stroke) solid var(--hairline); flex-wrap: wrap; }
      .searchwrap { position: relative; flex: 1; min-width: 220px; max-width: 560px; display: flex; align-items: center; color: var(--ink-3); }
      .searchwrap > :global(svg) { position: absolute; left: 12px; pointer-events: none; }
      .search { width: 100%; padding-left: 38px; padding-right: 40px; }
      .searchwrap kbd { position: absolute; right: 9px; pointer-events: none; }
      .bar-actions { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
      .results { position: absolute; top: 44px; left: 0; right: 0; z-index: 50; max-height: 420px; overflow: auto; padding: 6px; background: var(--paper-raised); border: var(--stroke) solid var(--border); border-radius: var(--radius); box-shadow: var(--lift); color: var(--ink); animation: rise .16s var(--ease); }
      .results-empty { padding: 12px; color: var(--ink-2); }
      .result { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; white-space: normal; border: 0; background: transparent; padding: 10px 12px; border-radius: var(--radius-sm); font-weight: 400; }
      .result:hover:not(:disabled) { background: var(--paper-sunk); }
      .result strong { font-weight: 650; }
      .result small { font-size: 13px; color: var(--ink-3); }
      .result span { font-size: 14px; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .tools { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; padding: 14px 20px; background: var(--paper); border-bottom: var(--stroke) solid var(--hairline); max-height: 48vh; overflow: auto; animation: rise .18s var(--ease); }
      .tools fieldset { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 16px; border: var(--stroke) solid var(--border); border-radius: var(--radius); background: var(--paper-raised); min-width: 0; }
      .tools legend { float: left; width: 100%; font-weight: 650; margin-bottom: 2px; }
      .tools label { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 14px; color: var(--ink-2); }
      .tools input:not([type=checkbox]) { max-width: 200px; }
      .tools .filter { width: 100%; justify-content: space-between; }
      .tools .filter input { flex: 1; }
      .tools p { font-size: 14px; line-height: 1.5; }
      .import-ready { width: 100%; display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: var(--radius-sm); background: var(--warning-soft); }
      .check { display: flex; align-items: center; gap: 10px; cursor: pointer; }
      .row { display: flex; gap: 8px; flex-wrap: wrap; }
      .workspace { flex: 1; display: flex; min-height: 0; position: relative; }
      .sidebar { width: 236px; flex: none; display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; background: var(--paper); border-right: var(--stroke) solid var(--hairline); overflow: auto; }
      .sidebar section { display: flex; flex-direction: column; gap: 10px; padding: 12px 0 16px; border-bottom: 1px dashed var(--grid-strong); }
      .sidebar h2 { font-size: 15px; }
      .legend ul { list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 14px; line-height: 1.35; }
      .legend li { display: flex; align-items: flex-start; gap: 9px; }
      .legend li .dot { margin-top: 3px; }
      .dot.pens { background: conic-gradient(var(--hl-blue) 0 25%, var(--hl-pink) 0 50%, var(--hl-green) 0 75%, var(--hl-orange) 0); }
      .ramp { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--ink-2); }
      .ramp .dot { background: var(--paper-raised); margin-right: 1px; }
      .dot.s { width: 8px; height: 8px; } .dot.m { width: 12px; height: 12px; } .dot.l { width: 17px; height: 17px; margin-right: 6px; }
      .dot.pin { width: 13px; height: 13px; background: transparent; box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--ink); vertical-align: -2px; margin: 0 4px 0 2px; }
      .legend p, .small { font-size: 13px; line-height: 1.5; }
      .history .row button, .sidebar .row button { flex: 1; }
      .status { margin-top: auto; padding-top: 12px; font-size: 13px; color: var(--ink-2); }
      .inspector { width: 380px; flex: none; background: var(--paper-raised); border-left: var(--stroke) solid var(--border); overflow: auto; }
      .panel-bar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 10px 20px; background: var(--paper-raised); border-bottom: 1px solid var(--hairline); }
      .panel-title { font-size: 14px; color: var(--ink-2); font-weight: 600; }
      .loading-panel { padding: 24px 20px; color: var(--ink-2); }
      .placeholder { padding: 40px 28px; display: flex; flex-direction: column; gap: 14px; }
      .placeholder h2 { font-size: 20px; }
      .hints { list-style: none; display: flex; flex-direction: column; gap: 10px; font-size: 14px; padding: 14px 0; border-top: 1px dashed var(--grid-strong); border-bottom: 1px dashed var(--grid-strong); }
      .hints li { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .edge-panel { padding: 20px; display: flex; flex-direction: column; gap: 16px; animation: rise .2s var(--ease); }
      .edge-panel h2 { font-size: 21px; }
      .edge-panel h3 { margin-bottom: -6px; }
      .edge-endpoints { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .edge-endpoints button { white-space: normal; text-align: left; }
      .strength { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: var(--stroke) solid var(--border); border-radius: var(--radius); }
      .strength strong { font-size: 18px; margin-right: 6px; }
      .meter { height: 12px; border-radius: 3px; background: var(--paper-sunk); overflow: hidden; }
      .meter i { display: block; height: 100%; background: var(--hl-blue); box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--hl-blue) 70%, var(--ink)); }
      .reasons { list-style: none; display: flex; flex-direction: column; gap: 8px; }
      .reasons li { padding: 10px 12px 10px 30px; position: relative; border-radius: var(--radius-sm); background: var(--paper); border: 1px solid var(--hairline); font-size: 14px; line-height: 1.45; }
      .reasons li::before { content: ""; position: absolute; left: 12px; top: 17px; width: 9px; height: 4px; border-radius: 2px; background: var(--hl-yellow); box-shadow: 0 0 0 1px color-mix(in srgb, var(--hl-yellow) 60%, var(--ink)); }
      @media (max-width: 1100px) { .sidebar { width: 200px; } .inspector { width: 330px; } .span { display: none; } .span + .rec { margin-left: auto; } }
      @media (max-width: 760px) {
        .topbar { gap: 10px; padding: 0 10px; height: 56px; }
        .brand span { display: none; }
        .tabs button { padding: 6px 10px; }
        .rec { padding: 6px 10px; }
        .notes-bar { padding: 10px; }
        .notes-bar { flex-wrap: nowrap; gap: 8px; }
        .searchwrap { flex: 1; min-width: 0; max-width: none; }
        .searchwrap kbd { display: none; }
        .bar-actions { margin-left: 0; gap: 6px; flex-wrap: nowrap; }
        .bar-actions button { width: 40px; padding: 0; }
        .btn-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        .results { width: calc(100vw - 20px); }
        .sidebar { position: absolute; left: 10px; right: 10px; bottom: 10px; width: auto; z-index: 2; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 8px 12px; border: var(--stroke) solid var(--border); border-radius: var(--radius); box-shadow: var(--lift); }
        .sidebar section { border: 0; padding: 0; flex-direction: row; align-items: center; }
        .sidebar h2, .sidebar .legend, .sidebar .small { display: none; }
        .status { flex-basis: 100%; margin: 0; padding: 0; }
        .inspector { display: none; }
        .inspector.open { display: block; position: absolute; inset: 0 0 0 auto; width: min(380px, 94vw); z-index: 5; box-shadow: var(--lift); animation: rise .2s var(--ease); }
        .tools { grid-template-columns: 1fr; max-height: 55vh; }
      }
    `}</style>
  </div>;
}
