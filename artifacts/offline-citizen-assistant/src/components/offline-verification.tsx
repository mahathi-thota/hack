import { useEffect, useState } from 'react';
import { Check, CloudOff, Cpu, Database, FileText, Search } from 'lucide-react';

const checks = [
  ['Airplane Mode Compatible', 'Yes — packaged assets and local browser APIs only.', Check],
  ['Model Loaded Locally', 'Grounded local responder; no cloud model or API fallback.', Cpu],
  ['OCR Local', 'Bundled Tesseract worker, WASM, language data, and PDF worker.', FileText],
  ['Retrieval Local', 'In-memory chunks and local hashed-vector ranking.', Search],
  ['QA Local', 'Document-only answer generation runs in this WebView.', Database],
] as const;

export function OfflineVerification() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); };
  }, []);
  return <div className="space-y-8"><div className="flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 font-data text-[10px] font-bold uppercase tracking-[.2em] text-primary">Offline verification</div><h1 className="font-display text-[clamp(38px,5vw,61px)] font-bold leading-none tracking-[-.04em]">Ready without a network.</h1><p className="mt-4 max-w-[650px] text-[15px] leading-relaxed text-muted-foreground">This view reports runtime connectivity only. It does not enable a cloud fallback.</p></div><span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 font-data text-[10px] font-bold uppercase tracking-wide ${online ? 'bg-secondary text-foreground/70' : 'bg-emerald-700/10 text-emerald-800'}`}><CloudOff size={14} /> {online ? 'Internet available — unused' : 'Offline / airplane mode'}</span></div><section className="rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="font-data text-[10px] uppercase tracking-[.18em] text-muted-foreground">Internet Status</div><div className="mt-2 font-display text-3xl font-bold">{online ? 'Online, but no request is required' : 'Offline'}</div><p className="mt-2 text-sm text-muted-foreground">The evaluation CSV, OCR runtime, language files, retrieval index, and QA code are packaged with the application.</p></section><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{checks.map(([title, detail, Icon]) => <article key={title} className="rounded-2xl border border-border bg-card p-5"><Icon size={18} className="text-primary" /><h2 className="mt-5 text-sm font-bold">{title}</h2><p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{detail}</p></article>)}</section></div>;
}
