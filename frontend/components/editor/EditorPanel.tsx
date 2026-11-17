"use client";

import { useEffect, useState } from "react";
import type { NoteDetail } from "@/lib/types";
import { api } from "@/lib/api";

interface Props {
  noteId?: number; // when set, edit existing note
  onSave?: (idOrPath: number | string, title: string, content: string, revision: string) => Promise<void>;
  onCreate?: (title: string, content: string) => Promise<void>;
  onCancel: () => void;
}

export function EditorPanel({ noteId, onSave, onCreate, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(!noteId);
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    setLoaded(!noteId);
    if (!noteId) { setTitle(""); setContent(""); return; }
    api
      .note(noteId)
      .then((n: NoteDetail) => {
        if (!active) return;
        setRevision(n.revision);
        setTitle(n.title);
        setContent(n.content);
        setLoaded(true);
      })
      .catch((e) => { if (active) { setError(String(e)); setLoaded(true); } });
    return () => { active = false; };
  }, [noteId]);

  if (!loaded) return <div className="placeholder">Loading…</div>;
  const submit = async () => {
    setError(null);
		setBusy(true);
		try {
			if (noteId != null) {
				await onSave?.(noteId, title, content, revision);
			} else {
				await onCreate?.(title, content);
			}
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	};

  return (
    <div className="editor">
      <h3>{noteId != null ? "Edit note" : "New note"}</h3>
      {error && <p role="alert" className="error">{error} Your draft is preserved. Copy it before reloading after a conflict.</p>}
      <input
        className="title"
        aria-label="Note title"
        disabled={busy}
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus={noteId == null}
      />
      <div className="body-wrap">
        <textarea
          className="body"
          aria-label="Markdown content"
          disabled={busy}
          placeholder={"Start writing in Markdown…\n\nLink other notes with [[Note Title]]\nTag with #tag"}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && title.trim() && !busy) { e.preventDefault(); submit(); } }}
          rows={14}
        />
        <div className="counter" aria-hidden="true">{content.trim() ? content.trim().split(/\s+/).length : 0} words</div>
      </div>
      <div className="hint">
        Tip: type <code>[[</code> to link notes, <code>#tag</code> for tags.
        Connections are detected automatically.
      </div>
      <div className="btnrow">
        <button className="primary" disabled={busy || !title.trim()} onClick={submit}>
          {busy ? "Saving…" : noteId != null ? "Save" : "Create"}
        </button>
        <button disabled={busy} onClick={() => { if (!content || confirm("Discard this draft?")) onCancel(); }}>Cancel</button>
        <span className="shortcut" aria-hidden="true"><kbd>⌘</kbd><kbd>Enter</kbd></span>
      </div>

      <style jsx>{`
        .editor { padding: 20px; display: flex; flex-direction: column; gap: 14px; animation: rise .2s var(--ease); }
        h3 { font-size: 15px; color: var(--ink-2); }
        .title { width: 100%; font-size: 23px; font-weight: 650; letter-spacing: -0.02em; padding: 6px 2px; background: transparent; border: 0; border-bottom: var(--stroke) solid var(--border); border-radius: 0; }
        .title:focus { box-shadow: none; border-color: var(--rule); }
        .body-wrap { position: relative; }
        .body { width: 100%; resize: vertical; min-height: 300px; font-family: var(--font-mono); font-size: 14px; line-height: 1.7; padding: 14px 16px 32px; border-radius: var(--radius-sm);
          background-color: var(--paper); background-image: linear-gradient(var(--grid) 1px, transparent 1px); background-size: 100% 23.8px; background-position: 0 37px; background-attachment: local; }
        .counter { position: absolute; right: 12px; bottom: 10px; font-size: 13px; color: var(--ink-3); pointer-events: none; }
        .hint { font-size: 14px; line-height: 1.55; color: var(--ink-2); }
        code { font-size: 13px; padding: 0 4px; border-radius: 3px; background: linear-gradient(transparent 25%, var(--hl-yellow) 25%, var(--hl-yellow) 85%, transparent 85%); color: var(--on-hl); }
        .btnrow { display: flex; gap: 8px; align-items: center; }
        .shortcut { margin-left: auto; display: inline-flex; gap: 3px; }
      `}</style>
    </div>
  );
}
