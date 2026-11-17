"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Edge, Note } from "@/lib/types";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { usePens } from "@/lib/pens";

export interface GraphHandle { focusNode: (id: number) => void; refresh: () => Promise<void>; fit: () => void }
interface SimNode extends Omit<Note, "x" | "y"> { x: number; y: number; vx: number; vy: number; fx: number | null; fy: number | null }
interface SimEdge { edge: Edge; a: SimNode; b: SimNode }
interface Props { selectedId: number | null; selectedEdgeId: number | null; onSelect: (id: number | null) => void; onSelectEdge: (edge: Edge | null) => void; showWeak: boolean; threshold: number; onStatus: (s: string) => void }
const radius = (n: SimNode) => 8 + n.importance * 16;
export const GraphCanvas = forwardRef<GraphHandle, Props>(function GraphCanvas({ selectedId, selectedEdgeId, onSelect, onSelectEdge, showWeak, threshold, onStatus }, ref) {
 const canvasRef = useRef<HTMLCanvasElement>(null);
 const wrapRef = useRef<HTMLDivElement>(null);
 const nodes = useRef(new Map<number, SimNode>());
 const edges = useRef<SimEdge[]>([]);
 const view = useRef({ scale: 1, tx: 0, ty: 0 });
 const initialized = useRef(false);
 const active = useRef(false);
 const sequence = useRef(0);
 const settle = useRef(0);
 // Once the person pans, zooms, drags or focuses, the view is theirs: no more auto-fit.
 const touched = useRef(false);
 const pending = useRef<number | null>(null);
 const hover = useRef<number | null>(null);
 const signature = useRef("");
 const [showActivity,setShowActivity]=useState(true),[showBrowser,setShowBrowser]=useState(true),[scope,setScope]=useState("all");
 const filters=useRef({showActivity,showBrowser,scope}); filters.current={showActivity,showBrowser,scope};
 const visibleNode=(n:Note | undefined)=>{
  if (!n) return false;
  const f=filters.current;
  if (!f.showBrowser && (n.type==="domain"||n.type==="page")) return false;
  if (f.scope==="domains") return n.type==="domain" || n.type==="note";
  if (f.scope==="pages") return n.type==="page" || n.type==="note";
  if (f.scope==="connected") return n.type!=="note" || edges.current.some(e=>e.edge.source==="activity" && (e.a.id===n.id||e.b.id===n.id));
  return true;
 };
 const palette=useRef<Record<string,string>>({});
 const edgeColor=(e:Edge)=>{const c=palette.current;return e.source==="explicit"?c["edge-explicit"]:e.source!=="activity"?c["edge-inferred"]:e.relationship_type==="context switch"?c["edge-switch"]:e.relationship_type==="activity concept"?c["edge-concept"]:c["edge-usage"];};
 // Notes are open ink circles; apps and websites wear their own highlighter pen
 // (the same pen as on Today and Trends); pages, windows and the rest are grey.
 const pens=usePens(); const pensRef=useRef(pens); pensRef.current=pens;
 const nodeColor=(n:Note)=>{const c=palette.current;if(n.type==="note")return c["paper-raised"];if(n.type==="app"||n.type==="domain")return c[pensRef.current.token(n.title)]??c["hl-grey"];return c["hl-grey"];};
 const dotFill=(n:Note)=>n.type==="note"?"var(--paper-raised)":n.type==="app"||n.type==="domain"?pens.css(n.title):"var(--hl-grey)";
 const [list, setList] = useState<Note[]>([]);
 const [edgeList, setEdgeList] = useState<Edge[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const props = useRef({ selectedId, selectedEdgeId, onSelect, onSelectEdge, showWeak, threshold, onStatus });
 props.current = { selectedId, selectedEdgeId, onSelect, onSelectEdge, showWeak, threshold, onStatus };
 const drag = useRef<{ id: number; node: SimNode | null; edge: Edge | null; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null);
 const visible = (e: Edge) => (filters.current.showActivity || e.source!=="activity") && visibleNode(nodes.current.get(e.source_id)!) && visibleNode(nodes.current.get(e.target_id)!) && (props.current.showWeak || e.source === "explicit" || e.strength >= props.current.threshold);
 const fit = useCallback(() => {
  const wrap = wrapRef.current; const all = [...nodes.current.values()].filter(visibleNode); if (!wrap || !all.length || !wrap.clientWidth) return;
  // Generous side margins so centred labels are never clipped at the edges.
  const minX = Math.min(...all.map(n => n.x)) - 120, maxX = Math.max(...all.map(n => n.x)) + 120;
  const minY = Math.min(...all.map(n => n.y)) - 70, maxY = Math.max(...all.map(n => n.y)) + 70;
  const raw = Math.min(1.5, Math.max(0.1, Math.min(wrap.clientWidth / (maxX - minX), wrap.clientHeight / (maxY - minY)) * 0.9));
  // On a phone, never shrink below a zoom where dots and labels stay readable.
  // If the whole graph can't fit at that zoom, centre on the notes and let people pan.
  const floor = wrap.clientWidth < 600 ? 0.62 : 0.1;
  const scale = Math.max(raw, floor);
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  if (scale > raw) {
   const notes = all.filter(n => n.type === "note"), focusSet = notes.length ? notes : all;
   cx = focusSet.reduce((s, n) => s + n.x, 0) / focusSet.length; cy = focusSet.reduce((s, n) => s + n.y, 0) / focusSet.length;
  }
  view.current = { scale, tx: wrap.clientWidth / 2 - cx * scale, ty: wrap.clientHeight / 2 - cy * scale };
 }, []);
 const focus = useCallback((id: number) => {
  const n = nodes.current.get(id), wrap = wrapRef.current;
  if (!n || !wrap || !wrap.clientWidth) { pending.current = id; return; }
  touched.current = true;
  view.current = { scale: 1.2, tx: wrap.clientWidth / 2 - n.x * 1.2, ty: wrap.clientHeight / 2 - n.y * 1.2 };
  pending.current = null;
 }, []);
 const load = useCallback(async () => {
  const seq = ++sequence.current;
  try {
   const snap = await api.graph(); if (!active.current || seq !== sequence.current) return;
   const byID = new Map<number, SimNode>();
   snap.nodes.forEach((n, i) => {
    const old = nodes.current.get(n.id), angle = i / Math.max(1, snap.nodes.length) * 2 * Math.PI;
    const x = n.x ?? old?.x ?? 160 * Math.cos(angle), y = n.y ?? old?.y ?? 160 * Math.sin(angle);
    const sim = { ...n, x, y, vx: old?.vx ?? 0, vy: old?.vy ?? 0, fx: n.x, fy: n.y };
    // Never replace an in-progress drag with an older poll result.
    byID.set(n.id, drag.current?.node?.id === n.id ? drag.current.node : sim);
   });
   nodes.current = byID;
   edges.current = snap.edges.flatMap(edge => { const a = byID.get(edge.source_id), b = byID.get(edge.target_id); return a && b ? [{ edge, a, b }] : []; });
   const next = JSON.stringify(snap); if (next !== signature.current) { settle.current = 180; signature.current = next; }
   setList(snap.nodes); setEdgeList(snap.edges); setLoading(false); setError("");
   if (!initialized.current && snap.nodes.length) { fit(); initialized.current = true; }
   if (pending.current != null) focus(pending.current);
   props.current.onStatus(`${snap.nodes.length} nodes (${snap.nodes.filter(n=>n.type==="note").length} notes) · ${snap.edges.length} relationships`);
  } catch (e) { if (active.current && seq === sequence.current) { setError(String(e)); setLoading(false); props.current.onStatus(`Graph refresh failed: ${String(e)}`); } throw e; }
 }, [fit, focus]);
 useImperativeHandle(ref, () => ({ focusNode: focus, refresh: load, fit }), [focus, load, fit]);
 useEffect(() => {
  active.current = true; load().catch(() => {}); const timer = setInterval(() => { load().catch(() => {}); }, 6000);
  return () => { active.current = false; sequence.current++; clearInterval(timer); };
 }, [load]);
 useEffect(() => { settle.current = 120; }, [showWeak, threshold, showActivity, showBrowser, scope]);
 useEffect(() => {
  // The canvas cannot use CSS variables directly, so snapshot the planner tokens
  // and refresh them whenever the colour scheme flips.
  const keys = ["node-note","node-app","node-domain","node-page","node-window","node-outline","node-selected","edge-explicit","edge-inferred","edge-usage","edge-concept","edge-switch","canvas-label","canvas-halo","canvas-grid","paper","paper-raised","ink","ink-2","rule","hairline","hl-blue","hl-pink","hl-green","hl-orange","hl-grey"];
  const read = () => {
   const css = getComputedStyle(document.documentElement), next: Record<string,string> = {};
   for (const k of keys) next[k] = css.getPropertyValue(`--${k}`).trim();
   next["font"] = css.getPropertyValue("--font").trim() || "system-ui, sans-serif";
   palette.current = next;
  };
  read(); const mq = window.matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", read);
  return () => mq.removeEventListener("change", read);
 }, []);

 useEffect(() => {
  const wrap = wrapRef.current; if (!wrap) return;
  const observer = new ResizeObserver(entries => {
   const { width, height } = entries[0].contentRect;
   const old = (wrap as HTMLDivElement & { previousSize?: { w: number; h: number } }).previousSize;
   // The Notes tab mounts hidden; fit the first time the canvas gets a real size.
   if (old && old.w > 0 && old.h > 0) { view.current.tx += (width - old.w) / 2; view.current.ty += (height - old.h) / 2; }
   else if (width > 0 && height > 0) { if (pending.current != null) focus(pending.current); else fit(); }
   (wrap as HTMLDivElement & { previousSize?: { w: number; h: number } }).previousSize = { w: width, h: height };
  }); observer.observe(wrap); return () => observer.disconnect();
 }, [fit, focus]);

 useEffect(() => {
  let raf = 0;
  const loop = () => {
   const canvas = canvasRef.current, wrap = wrapRef.current;
   if (!canvas || !wrap) { raf = requestAnimationFrame(loop); return; }
   if (document.hidden) { raf=requestAnimationFrame(loop); return; }
   const all = [...nodes.current.values()].filter(visibleNode);
   if (settle.current > 0) {
    // Re-fit once when the first layout settles, so labels aren't left off-screen.
    if (settle.current === 1 && !touched.current) { fit(); touched.current = true; }
    settle.current--;
    // Spatial buckets bound repulsion for large vaults instead of all-pairs.
    const buckets = new Map<string, SimNode[]>(), cell = 240;
    for (const n of all) { const key = `${Math.floor(n.x/cell)},${Math.floor(n.y/cell)}`; const group = buckets.get(key) ?? []; group.push(n); buckets.set(key,group); }
    for (const a of all) {
     const gx = Math.floor(a.x/cell), gy = Math.floor(a.y/cell);
     for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) {
      for (const b of buckets.get(`${gx+ix},${gy+iy}`) ?? []) {
       if (a.id >= b.id) continue;
       let dx = b.x-a.x, dy = b.y-a.y; if (dx === 0 && dy === 0) { dx = 1; dy = 0.5; }
       const d2 = Math.max(dx*dx+dy*dy, 25), d = Math.sqrt(d2), force = 2400/d2;
       a.vx -= dx/d*force; a.vy -= dy/d*force; b.vx += dx/d*force; b.vy += dy/d*force;
      }
     }
    }
    for (const { a, b, edge } of edges.current) {
     if (!visible(edge)) continue;
     const dx=b.x-a.x, dy=b.y-a.y, d=Math.max(1,Math.hypot(dx,dy)), f=(d-135)*0.012*Math.min(edge.strength/60,2);
     a.vx+=dx/d*f; a.vy+=dy/d*f; b.vx-=dx/d*f; b.vy-=dy/d*f;
    }
    for (const n of all) {
     if (n.fx!=null && n.fy!=null) { n.x=n.fx; n.y=n.fy; n.vx=n.vy=0; }
     else { n.vx=(n.vx-n.x*0.0005)*0.86; n.vy=(n.vy-n.y*0.0005)*0.86; n.x+=n.vx; n.y+=n.vy; }
    }
   }
   const dpr=window.devicePixelRatio||1,w=wrap.clientWidth,h=wrap.clientHeight;
   if(!w||!h){raf=requestAnimationFrame(loop);return;}
   if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
   const ctx=canvas.getContext("2d");if(!ctx){raf=requestAnimationFrame(loop);return;}
   const c=palette.current,v=view.current,sel=props.current.selectedId,selEdge=props.current.selectedEdgeId,hov=hover.current;
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   // Planner grid that pans and zooms with the view: fine cells, a stronger rule every fourth.
   const step=24*v.scale;
   if(step>=7){ctx.lineWidth=1;const ox=((v.tx%step)+step)%step,oy=((v.ty%step)+step)%step;
    ctx.strokeStyle=c["canvas-grid"];ctx.beginPath();
    for(let x=ox;x<w;x+=step){ctx.moveTo(Math.round(x)+.5,0);ctx.lineTo(Math.round(x)+.5,h);}
    for(let y=oy;y<h;y+=step){ctx.moveTo(0,Math.round(y)+.5);ctx.lineTo(w,Math.round(y)+.5);}
    ctx.stroke();}
   // Focus set: the selected (or hovered) node, its neighbours, or the selected edge's endpoints.
   const focusId=sel??hov,focusSet=new Set<number>();
   const shown=edges.current.filter(e=>visible(e.edge));
   if(focusId!=null){focusSet.add(focusId);for(const {a,b} of shown){if(a.id===focusId)focusSet.add(b.id);else if(b.id===focusId)focusSet.add(a.id);}}
   else if(selEdge!=null){const se=shown.find(e=>e.edge.id===selEdge);if(se){focusSet.add(se.a.id);focusSet.add(se.b.id);}}
   const focused=focusSet.size>0;
   ctx.save();ctx.translate(v.tx,v.ty);ctx.scale(v.scale,v.scale);
   const px=1/v.scale; // one screen pixel in world units
   ctx.lineCap="round";
   for(const {edge,a,b} of shown){
    const hot=selEdge===edge.id||(focusId!=null&&(a.id===focusId||b.id===focusId)),dim=focused&&!hot;
    if(edge.source==="activity"){
     // Activity connections are highlighter swipes: wide, translucent, no dash.
     ctx.globalAlpha=dim?0.1:hot?0.75:0.42;ctx.strokeStyle=edgeColor(edge);ctx.lineWidth=(hot?9:6)*Math.max(px,0.7);ctx.setLineDash([]);
    }else{
     ctx.globalAlpha=dim?0.15:hot?1:edge.source==="explicit"?0.85:0.6;ctx.strokeStyle=edgeColor(edge);
     ctx.lineWidth=(hot?2.4:edge.source==="explicit"?1.6:1.2)*Math.max(px,0.6);
     ctx.setLineDash(edge.source==="explicit"?[]:[5*Math.max(px,0.6),5*Math.max(px,0.6)]);
    }
    if(selEdge===edge.id){ctx.strokeStyle=c["rule"];ctx.globalAlpha=1;}
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
   }
   ctx.globalAlpha=1;
   // Strength tags on highlighted edges, written in ink on a paper slip.
   if(sel!=null||selEdge!=null){
    ctx.font=`650 ${11.5*px}px ${c["font"]}`;ctx.textAlign="center";ctx.textBaseline="middle";
    for(const {edge,a,b} of shown){
     if(!(selEdge===edge.id||sel===a.id||sel===b.id))continue;
     const label=`${Math.round(edge.strength)}`,mx=(a.x+b.x)/2,my=(a.y+b.y)/2,tw=ctx.measureText(label).width+12*px,th=18*px;
     ctx.fillStyle=c["paper-raised"];ctx.strokeStyle=selEdge===edge.id?c["rule"]:c["ink"];ctx.lineWidth=1.25*px;
     ctx.beginPath();ctx.roundRect(mx-tw/2,my-th/2,tw,th,4*px);ctx.fill();ctx.stroke();
     ctx.fillStyle=c["ink"];ctx.fillText(label,mx,my+0.5*px);
    }
   }
   const order=[...all].sort((p,q)=>(focusSet.has(p.id)?1:0)-(focusSet.has(q.id)?1:0)||(p.id===sel?1:0)-(q.id===sel?1:0));
   for(const n of order){
    const selected=sel===n.id,isHover=hov===n.id,inFocus=!focused||focusSet.has(n.id),r=radius(n),col=nodeColor(n);
    ctx.globalAlpha=inFocus?1:0.25;
    // A highlighter halo marks what you are pointing at.
    if(selected||isHover){ctx.beginPath();ctx.arc(n.x,n.y,r+8*px,0,Math.PI*2);ctx.fillStyle=col;ctx.globalAlpha=0.35;ctx.fill();ctx.globalAlpha=1;}
    ctx.beginPath();ctx.arc(n.x,n.y,r,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
    ctx.lineWidth=(n.type==="note"?2.2:1.6)*px;ctx.strokeStyle=c["node-outline"];ctx.stroke();
    // Pinned: a second ink ring drawn just outside, like a circled entry.
    if(n.fx!=null){ctx.beginPath();ctx.arc(n.x,n.y,r+3.5*px,0,Math.PI*2);ctx.strokeStyle=c["node-outline"];ctx.lineWidth=1.25*px;ctx.stroke();}
    if(selected){ctx.beginPath();ctx.arc(n.x,n.y,r+(n.fx!=null?7:4)*px,0,Math.PI*2);ctx.strokeStyle=c["node-selected"];ctx.lineWidth=2.6*px;ctx.stroke();}
    // Labels stay a constant on-screen size; minor ones hide when zoomed far out.
    const showLabel=selected||isHover||(focused&&focusSet.has(n.id))||v.scale>0.55||n.importance>0.5;
    if(showLabel){
     const fs=(selected||isHover?13:12)*px;ctx.font=`${selected||isHover?650:550} ${fs}px ${c["font"]}`;ctx.textAlign="center";ctx.textBaseline="top";
     const ly=n.y+r+6*px;ctx.lineJoin="round";ctx.lineWidth=5*px;ctx.strokeStyle=c["canvas-halo"];ctx.strokeText(n.title,n.x,ly);
     ctx.fillStyle=c["canvas-label"];ctx.fillText(n.title,n.x,ly);
    }
   }
   ctx.globalAlpha=1;
   canvas.style.cursor=drag.current?.moved?"grabbing":hov!=null?"pointer":"grab";
   ctx.restore();raf=requestAnimationFrame(loop);
  };raf=requestAnimationFrame(loop);return()=>cancelAnimationFrame(raf);
 }, []);
 const world=(x:number,y:number)=>{const r=canvasRef.current!.getBoundingClientRect(),v=view.current;return{x:(x-r.left-v.tx)/v.scale,y:(y-r.top-v.ty)/v.scale};};
 const pick=(x:number,y:number)=>{const p=world(x,y);return[...nodes.current.values()].filter(visibleNode).find(n=>Math.hypot(n.x-p.x,n.y-p.y)<radius(n)+6)??null;};
 const pickEdge=(x:number,y:number)=>{
  const p=world(x,y);let best:Edge|null=null,bestD=8/view.current.scale;
  for(const {edge,a,b} of edges.current){if(!visible(edge))continue;const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;if(!len)continue;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len));const d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(d<bestD){bestD=d;best=edge;}}
  return best;
 };
 const selectNode=(id:number)=>{props.current.onSelect(id);};
 const release=async(e:React.PointerEvent<HTMLCanvasElement>)=>{
  const current=drag.current;if(!current||current.id!==e.pointerId)return;drag.current=null;
  if(current.node&&current.moved){const n=current.node;try{await api.setPosition(n.id,n.fx,n.fy);}catch(err){props.current.onStatus(`Position save failed: ${String(err)}`);load().catch(()=>{});}}
  else if(!current.moved){if(current.node)selectNode(current.node.id);else{props.current.onSelectEdge(current.edge);}}
 };
 const zoomBy=(factor:number)=>{const wrap=wrapRef.current;if(!wrap)return;touched.current=true;const v=view.current,s=Math.min(4,Math.max(0.1,v.scale*factor)),mx=wrap.clientWidth/2,my=wrap.clientHeight/2;v.tx=mx-(mx-v.tx)*s/v.scale;v.ty=my-(my-v.ty)*s/v.scale;v.scale=s;};
 const legend:[string,string,"solid"|"dashed"|"swipe"][]=[["edge-explicit","Links you wrote","solid"],["edge-inferred","Found automatically","dashed"],["edge-usage","Used together","swipe"],["edge-concept","Shared topic","swipe"],["edge-switch","Switched between","swipe"]];
 const visibleList=list.filter(visibleNode);
 return <div ref={wrapRef} className="graphwrap">
  <canvas ref={canvasRef} aria-label="Interactive knowledge graph" onPointerDown={e=>{
   if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);const node=pick(e.clientX,e.clientY);
   drag.current={id:e.pointerId,node,edge:node?null:pickEdge(e.clientX,e.clientY),startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
  }} onPointerMove={e=>{
   hover.current=pick(e.clientX,e.clientY)?.id??null;const d=drag.current;if(!d||d.id!==e.pointerId)return;
   if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>4){d.moved=true;touched.current=true;}
   if(d.moved){if(d.node){const p=world(e.clientX,e.clientY);d.node.x=d.node.fx=p.x;d.node.y=d.node.fy=p.y;settle.current=120;}else{view.current.tx+=e.clientX-d.lastX;view.current.ty+=e.clientY-d.lastY;}}
   d.lastX=e.clientX;d.lastY=e.clientY;
  }} onPointerLeave={()=>{if(!drag.current)hover.current=null;}} onPointerUp={release} onPointerCancel={()=>{drag.current=null;load().catch(()=>{});}} onWheel={e=>{
   touched.current=true;const r=e.currentTarget.getBoundingClientRect(),v=view.current,mx=e.clientX-r.left,my=e.clientY-r.top,s=Math.min(4,Math.max(0.1,v.scale*Math.exp(-e.deltaY*0.001)));
   v.tx=mx-(mx-v.tx)*s/v.scale;v.ty=my-(my-v.ty)*s/v.scale;v.scale=s;
  }} onDoubleClick={async e=>{const n=pick(e.clientX,e.clientY);if(!n)return;try{await api.setPosition(n.id,null,null);n.fx=n.fy=null;settle.current=180;}catch(err){props.current.onStatus(`Unpin failed: ${String(err)}`);}}}/>
  <div className="graph-tools">
   <div className="tool-group">
    <button className="tool" onClick={fit}><Icon name="fit" size={16} /><span className="btn-label">Fit graph</span></button>
    <button className="tool icon-only" aria-label="Zoom out" title="Zoom out" onClick={()=>zoomBy(1/1.25)}><Icon name="zoomOut" size={16} /></button>
    <button className="tool icon-only" aria-label="Zoom in" title="Zoom in" onClick={()=>zoomBy(1.25)}><Icon name="zoomIn" size={16} /></button>
   </div>
   <details className="pop"><summary><span className="full">Graph filters & legend</span><span className="short" aria-hidden="true">Filters</span></summary><div className="browse filters">
    <label className="check"><input type="checkbox" checked={showActivity} onChange={e=>setShowActivity(e.target.checked)}/>Show activity edges</label>
    <label className="check"><input type="checkbox" checked={showBrowser} onChange={e=>setShowBrowser(e.target.checked)}/>Show browser nodes</label>
    <label className="scope">Show <select aria-label="Graph node scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">Everything</option><option value="domains">Websites and notes</option><option value="pages">Pages and notes</option><option value="connected">Notes connected to activity</option></select></label>
    <h3>Lines</h3>
    <ul className="edge-legend">{legend.map(([k,label,form])=><li key={k}><svg width="30" height="12" aria-hidden="true"><line x1="3" x2="27" y1="6" y2="6" stroke={`var(--${k})`} strokeWidth={form==="swipe"?7:2} strokeOpacity={form==="swipe"?.55:1} strokeLinecap="round" strokeDasharray={form==="dashed"?"4 4":undefined}/></svg>{label}</li>)}</ul>
   </div></details>
   <details className="pop"><summary><span className="full">Browse graph ({visibleList.length})</span><span className="short" aria-hidden="true">Browse ({visibleList.length})</span></summary><div className="browse">
    {visibleList.map(n=><button key={n.id} className="item" onClick={()=>{selectNode(n.id);focus(n.id);}}><span className="dot" style={{background:dotFill(n)}} aria-hidden="true"/>{n.title} {n.type!=="note"?`(${n.type})`:""}</button>)}
    {edgeList.filter(visible).map(e=><button key={`edge-${e.id}`} className="item edge-item" onClick={()=>{onSelectEdge(e);}}>Inspect relationship: {list.find(n=>n.id===e.source_id)?.title} and {list.find(n=>n.id===e.target_id)?.title} ({e.source} · {e.relationship_type})</button>)}
   </div></details>
  </div>
  {(loading||error||!list.length)&&<div className="graph-message" role="status">{loading?<><span className="spinner" aria-hidden="true"/>Loading graph…</>:error?<> {error} <button onClick={()=>{load().catch(()=>{});}}>Retry</button></>:"Your graph is empty. Create a note to add the first dot."}</div>}
  <style jsx>{`
   .graphwrap{flex:1;position:relative;min-width:0;min-height:260px;overflow:hidden;background:var(--paper)}
   canvas{width:100%;height:100%;display:block;touch-action:none;cursor:grab}
   .graph-tools{position:absolute;left:14px;top:14px;right:14px;display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;pointer-events:none}
   .graph-tools>*{pointer-events:auto}
   .tool-group,.pop{background:var(--paper-raised);border:var(--stroke) solid var(--border);border-radius:var(--radius);box-shadow:var(--lift)}
   .tool-group{display:flex;align-items:center;overflow:hidden}
   .tool{border:0;border-radius:0;background:transparent;min-height:36px}
   .tool+.tool{border-left:var(--stroke) solid var(--border)}
   .tool:hover:not(:disabled){background:var(--paper-sunk)}
   .pop{max-width:330px;min-width:0}
   .pop summary{font-size:14px;font-weight:550;padding:8px 12px;min-height:36px}
   .short{display:none}
   .pop[open] summary{border-bottom:1px solid var(--hairline)}
   .browse{display:flex;flex-direction:column;gap:2px;max-height:min(360px,55vh);overflow:auto;overscroll-behavior:contain;padding:6px}
   .browse>*{flex:none}
   .filters{gap:12px;padding:14px}
   .check{display:flex;align-items:center;gap:10px;font-size:14px;cursor:pointer}
   .scope{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--ink-2)}
   .scope select{width:100%}
   h3{font-size:14px;margin-top:4px}
   .edge-legend{list-style:none;display:flex;flex-direction:column;gap:8px;font-size:14px}
   .edge-legend li{display:flex;align-items:center;gap:10px}
   .item{justify-content:flex-start;text-align:left;font-size:14px;font-weight:450;background:transparent;border:0;border-radius:var(--radius-sm);padding:7px 9px;white-space:normal;min-height:0;gap:9px}
   .item:hover:not(:disabled){background:var(--paper-sunk)}
   .edge-item{color:var(--ink-2);font-size:13px}
   .graph-message{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;background:var(--paper-raised);border:var(--stroke) solid var(--border);box-shadow:var(--lift);padding:10px 16px;border-radius:var(--radius);max-width:90%;font-size:14px;color:var(--ink-2)}
   .spinner{width:14px;height:14px;border-radius:50%;border:2px solid var(--hairline);border-top-color:var(--rule);animation:spin .8s linear infinite}
   @keyframes spin{to{transform:rotate(360deg)}}
   @media(max-width:760px){
    .graph-tools{left:8px;top:8px;right:8px;gap:6px}
    .tool .btn-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
    .tool{padding:0 10px}
    .pop{max-width:calc(100vw - 16px)}
    .pop summary{font-size:14px;padding:6px 10px;min-height:36px}
    .graph-tools{flex-wrap:nowrap}
    .pop[open]{position:absolute;left:0;right:0;top:44px;max-width:none;z-index:2}
    .full{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
    .short{display:inline}
   }
  `}</style>
 </div>;
});
