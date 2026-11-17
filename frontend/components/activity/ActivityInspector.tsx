"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ActivityNodeDetail } from "@/lib/types";
import { duration } from "./ActivityPanel";
import { explainReason } from "@/lib/reasons";
export function ActivityInspector({
  nodeId,
  onOpen,
  onChanged,
}: {
  nodeId: number;
  onOpen: (id: number) => void;
  onChanged?: () => Promise<void> | void;
}) {
  const [detail, setDetail] = useState<ActivityNodeDetail | null>(null), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  const node = detail?.node, usage = detail;
  const related = [...(detail?.related_notes ?? []), ...(detail?.related_nodes ?? [])];
  useEffect(() => {
    let active = true;
    setDetail(null);
    const load = () =>
      api.activityNode(nodeId)
        .then(d => {
          if (active) {
            setDetail(d);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [nodeId, revision]);
  const mute = async (otherId: number) => {
    setBusy(true);
    try {
      await api.muteConnection(nodeId, otherId);
      setRevision(n => n + 1);
      setError("");
      await onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="activity-inspector">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {node && usage ? (
        <>
          <h2>{node.title}</h2>
          <p className="kind-line"><span className="dot" style={{ background: `var(--node-${["app","domain","page","window"].includes(node.type) ? node.type : "note"})` }} />{{ app: "App", domain: "Website", page: "Web page", window: "Window" }[node.type] ?? node.type}, added automatically from your activity</p>
          <dl>
            {detail?.domain && <><dt>Domain</dt><dd>{detail.domain}</dd></>}
            {detail?.url && <><dt>Sanitized URL</dt><dd><a href={detail.url} target="_blank" rel="noreferrer">{detail.url}</a></dd></>}
            <dt>Seen in</dt><dd>{detail?.browsers.join(", ")}</dd>
            <dt>First seen</dt><dd>{detail && new Date(detail.first_seen).toLocaleString()}</dd>
            <dt>Screen time</dt>
            <dd>{duration(usage.total_seconds)}</dd>
            <dt>Active time</dt>
            <dd>{duration(usage.active_seconds)}</dd>
            <dt>Active share</dt>
            <dd>
              {Math.round(
                usage.total_seconds
                  ? (usage.active_seconds / usage.total_seconds) * 100
                  : 0,
              )}
              %
            </dd>
            <dt>Times used</dt>
            <dd>{usage.sessions}</dd>
            <dt>Last used</dt>
            <dd>{new Date(usage.last_seen).toLocaleString()}</dd>
          </dl>
          <p className="note">
            Active means you typed or moved the mouse recently. It isn&apos;t a
            measure of attention or productivity.
          </p>
          <h3>Connected to</h3>
          {!related.length && <p>Nothing connected yet.</p>}
          {related.map(({ node: n, edge }) => (
            <section key={edge.id}>
              <button className="rel" onClick={() => onOpen(n.id)}>
                {n.title}<span className="score"><span className="sr-only">Strength </span>{Math.round(edge.strength)}<small>/150</small></span>
              </button>
              <p>{edge.source === "activity" ? "From your activity" : edge.source === "explicit" ? "Link you wrote" : "Found automatically"}, {edge.relationship_type}</p>
              <ul>
                {explainReason(edge.reason).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {edge.source === "activity" && (
                <button className="mute" disabled={busy} onClick={() => mute(n.id)}>
                  Mute this connection
                </button>
              )}
            </section>
          ))}
          {!!detail?.muted_connections && (
            <p>
              {detail.muted_connections} muted connection
              {detail.muted_connections === 1 ? "" : "s"} hidden here. Restore them
              under Trends, Connections.
            </p>
          )}
        </>
      ) : (
        <p aria-busy="true">Loading…</p>
      )}
      <style jsx>{`
        .activity-inspector { padding: 20px 20px 32px; display: flex; flex-direction: column; gap: 14px; overflow-wrap: anywhere; animation: rise .2s var(--ease); }
        h2 { font-size: 23px; letter-spacing: -0.02em; }
        h3 { font-size: 15px; margin-top: 8px; }
        p, li { font-size: 14px; color: var(--ink-2); line-height: 1.5; }
        .kind-line { display: flex; align-items: center; gap: 8px; margin-top: -6px; }
        dl { display: grid; grid-template-columns: auto 1fr; border: var(--stroke) solid var(--border); border-radius: var(--radius-sm); background: var(--paper); overflow: hidden; }
        dt, dd { padding: 9px 12px; border-bottom: 1px solid var(--grid); font-size: 14px; }
        dt { color: var(--ink-2); }
        dd { text-align: right; font-weight: 600; }
        dt:last-of-type, dd:last-of-type { border-bottom: 0; }
        dd a { font-weight: 450; font-size: 13px; }
        section { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: var(--stroke) solid var(--border); border-radius: var(--radius-sm); background: var(--paper); }
        .rel { width: 100%; justify-content: space-between; text-align: left; white-space: normal; border: 0; background: none; padding: 0; min-height: 0; font-size: 15px; font-weight: 650; }
        .rel:hover:not(:disabled) { background: none; color: var(--rule); }
        .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        .score small { font-weight: 500; color: var(--ink-3); }
        .score { font-size: 12px; font-weight: 700; padding: 0 7px; border: 1.25px solid var(--ink); border-radius: 4px; color: var(--ink); }
        ul { list-style: none; display: flex; flex-direction: column; gap: 3px; }
        ul li { position: relative; padding-left: 14px; }
        ul li::before { content: ""; position: absolute; left: 0; top: 8px; width: 8px; height: 4px; border-radius: 2px; background: var(--edge-usage); }
        .mute { align-self: flex-start; min-height: 32px; padding: 4px 10px; color: var(--danger); border-color: currentColor; background: transparent; }
      `}</style>
    </div>
  );
}
