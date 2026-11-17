"use client";

import { useCallback, useEffect, useState } from "react";
import type { NoteDetail, RelatedNode } from "@/lib/types";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";

interface Props {
  noteId: number;
  onEdit: () => void;
  onDelete: (idOrPath: number | string, revision: string) => Promise<void>;
  onOpenRelated: (id: number, edit?: boolean) => void;
}

export function InspectorPanel({ noteId, onEdit, onDelete, onOpenRelated }: Props) {
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [related, setRelated] = useState<RelatedNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedEdge, setExpandedEdge] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [n, r] = await Promise.all([
        api.note(noteId),
        api.related(noteId),
      ]);
      setNote(n);
      setRelated(r);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [noteId]);

  useEffect(() => {
    let active = true;
    setNote(null);
    setError(null);
    Promise.all([api.note(noteId), api.related(noteId)]).then(([n,r]) => { if (active) { setNote(n); setRelated(r); } }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [load]);

  if (error && !note) {
    return <div className="placeholder" role="alert">Error: {error}<button onClick={load}>Retry</button></div>;
  }
  if (!note) {
    return <div className="placeholder">Loading…</div>;
  }

  const created = new Date(note.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const edited = new Date(note.updated_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="inspector-content">
      <header>
        <h2>{note.title}</h2>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="meta">Created {created}, edited {edited}</p>
        <div className="importance">
          <span>Connectedness</span>
          <span className="meter" aria-hidden="true"><i style={{ width: `${Math.round(note.importance * 100)}%` }} /></span>
          <strong>{Math.round(note.importance * 100)}%</strong>
        </div>
        <div className="btnrow">
          <button className="primary" onClick={onEdit}><Icon name="edit" size={16} />Edit</button>
          <button className="danger" disabled={busy} onClick={async () => {
            if (!confirm(`Delete "${note.title}"? You can undo this.`)) return;
            setBusy(true); setError(null);
            try { await onDelete(note.id, note.revision); } catch (e) { setError(String(e)); } finally { setBusy(false); }
          }}>Delete</button>
        </div>
      </header>

      {note.tags.length > 0 && <section>
        <h3>Tags</h3>
        <div className="tags">{note.tags.map(t => <span key={t} className="tag">#{t}</span>)}</div>
      </section>}

      <section>
        <h3>Links in this note <span className="count">{note.links.length}</span></h3>
        {note.links.length === 0 ? <p className="muted">None yet. Type [[ and a note title to link one.</p> :
          <ul className="links">{note.links.map(l => <li key={l}>{l}</li>)}</ul>}
      </section>

      {note.backlinks.length > 0 && <section>
        <h3>Notes that link here <span className="count">{note.backlinks.length}</span></h3>
        <ul className="links">{note.backlinks.map(b => <li key={b.id}><button className="linklike" onClick={() => onOpenRelated(b.id)}>{b.title}</button></li>)}</ul>
      </section>}

      <section>
        <h3>Connected ({related.length})</h3>
        {related.length === 0 && <p className="muted">Nothing connected yet.</p>}
        <ul className="related">
          {related.map(({ node, edge }) => (
            <li key={edge.id} className={expandedEdge === edge.id ? "open" : ""}>
              <button className="related-item" onClick={() => onOpenRelated(node.id)}>
                <span className={`kind ${edge.source}`} aria-hidden="true" />
                <span className="related-title">{node.title}</span>
                <span className="strength">{Math.round(edge.strength)}{edge.source === "automatic" ? ", found automatically" : ""}</span>
              </button>
              {edge.reason && <div className="why">
                <button className="why-toggle" aria-expanded={expandedEdge === edge.id} onClick={() => setExpandedEdge(expandedEdge === edge.id ? null : edge.id)}>
                  <Icon name="chevron" size={14} />Why?
                </button>
                {expandedEdge === edge.id && <ul className="why-list">{edge.reason.split("; ").map((r, i) => <li key={i}>{r}</li>)}</ul>}
              </div>}
            </li>
          ))}
        </ul>
      </section>

      {note.entities.length > 0 && <section>
        <h3>People, places and things mentioned</h3>
        <div className="tags">{note.entities.map(entity => <span key={entity.name} className="tag plain" title={`${entity.kind}, weight ${entity.weight}`}>{entity.name}</span>)}</div>
      </section>}

      <section>
        <h3>Content</h3>
        <pre className="content">{note.content}</pre>
      </section>

      <style jsx>{`
        .inspector-content { padding: 20px 20px 32px; display: flex; flex-direction: column; gap: 22px; animation: rise .2s var(--ease); }
        header { display: flex; flex-direction: column; gap: 10px; }
        header h2 { font-size: 23px; letter-spacing: -0.02em; overflow-wrap: anywhere; }
        .meta { font-size: 14px; color: var(--ink-2); }
        .importance { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; font-size: 14px; color: var(--ink-2); }
        .importance strong { color: var(--ink); }
        .meter { height: 10px; border-radius: 3px; background: var(--paper-sunk); box-shadow: inset 0 0 0 1px var(--hairline); overflow: hidden; }
        .meter i { display: block; height: 100%; background: var(--hl-blue); }
        .btnrow { display: flex; gap: 8px; margin-top: 2px; }
        section { padding-top: 16px; border-top: 1px dashed var(--grid-strong); }
        h3 { display: flex; align-items: center; gap: 8px; font-size: 15px; margin-bottom: 10px; }
        .count { font-size: 12px; font-weight: 650; min-width: 22px; text-align: center; padding: 0 6px; border: 1.25px solid var(--ink); border-radius: 4px; }
        .muted { color: var(--ink-2); font-size: 14px; }
        .tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag { padding: 1px 9px; border-radius: 4px; font-size: 14px; font-weight: 550; background: linear-gradient(transparent 20%, var(--hl-yellow) 20%, var(--hl-yellow) 88%, transparent 88%); color: var(--on-hl); }
        .tag.plain { background: var(--paper-sunk); color: var(--ink); box-shadow: inset 0 0 0 1px var(--hairline); }
        ul { list-style: none; display: flex; flex-direction: column; gap: 4px; }
        .links li { font-size: 15px; padding-left: 14px; position: relative; }
        .links li::before { content: ""; position: absolute; left: 0; top: 10px; width: 6px; height: 1.5px; background: var(--ink-3); }
        .linklike { border: 0; background: none; padding: 0; min-height: 0; color: var(--rule); font-weight: 550; white-space: normal; text-align: left; }
        .linklike:hover:not(:disabled) { background: none; text-decoration: underline; text-underline-offset: 3px; }
        .related { gap: 6px; }
        .related > li { border: var(--stroke) solid var(--border); border-radius: var(--radius-sm); background: var(--paper); overflow: hidden; }
        .related > li.open { box-shadow: var(--lift); }
        .related-item { width: 100%; display: flex; align-items: center; gap: 10px; border: 0; border-radius: 0; background: transparent; padding: 10px 12px 6px; justify-content: flex-start; }
        .related-item:hover:not(:disabled) { background: var(--paper-sunk); }
        .kind { width: 18px; height: 6px; border-radius: 2px; flex: none; background: var(--edge-inferred); }
        .kind.explicit { background: var(--ink); }
        .kind.activity { background: var(--edge-usage); height: 8px; opacity: .75; }
        .related-title { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .strength { font-size: 13px; color: var(--ink-3); font-weight: 450; }
        .why { padding: 0 12px 8px 40px; }
        .why-toggle { border: 0; background: none; padding: 0; min-height: 28px; gap: 4px; font-size: 13px; color: var(--ink-2); }
        .why-toggle:hover:not(:disabled) { background: none; color: var(--rule); }
        .why-toggle[aria-expanded="true"] :global(svg) { transform: rotate(90deg); }
        .why-toggle :global(svg) { transition: transform .16s var(--ease); }
        .why-list { gap: 4px; margin-top: 2px; }
        .why-list li { font-size: 14px; line-height: 1.45; color: var(--ink-2); padding-left: 14px; position: relative; }
        .why-list li::before { content: ""; position: absolute; left: 0; top: 8px; width: 8px; height: 4px; border-radius: 2px; background: var(--hl-yellow); }
        .content { font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; max-height: 340px; overflow-y: auto; padding: 14px 16px; border: var(--stroke) solid var(--border); border-radius: var(--radius-sm); background: var(--paper); }
      `}</style>
    </div>
  );
}
