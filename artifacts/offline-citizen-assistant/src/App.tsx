import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Router as WouterRouter, useLocation } from 'wouter';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Camera, Check, ChevronRight, CircleHelp, Cpu, Database,
  FileText, FileUp, Gauge, Info, Languages, LockKeyhole, Menu, MessageCircle, Network,
  PanelLeft, Plane, RotateCcw, Send, ShieldCheck, Sparkles, Thermometer, Timer, Upload, WifiOff, X,
} from 'lucide-react';
import {
  answerFromDocument,
  createMobileSafeFile,
  confidenceLabel,
  CorpusRecord,
  extractTextFromFile,
  getOcrErrorMessage,
  isPdfFile,
  loadCorpus,
  validateDocumentFile,
  type LocalAnswer,
  type OcrLanguage,
} from '@/lib/local-assistant';
import { loadOfficialDataset, type OfficialForm, type OfficialQuestion } from '@/lib/official-dataset';
import { OfflineVerification } from '@/components/offline-verification';

const queryClient = new QueryClient();
type LangChoice = 'en' | 'te';
type UploadSource = 'upload' | 'camera';
type DocumentSource = UploadSource | 'official';
type UploadedDocument = {
  name: string;
  type: string;
  previewUrl?: string;
  text: string;
  source: DocumentSource;
  officialQuestions?: string[];
  officialLanguage?: string;
  eligibilityRule?: { incomeMax: number; minMembers: number };
};
function assertLoadedDocument(value: UploadedDocument | null): asserts value is UploadedDocument { if (!value) throw new Error('A document is required for question answering.'); }

const languages = [
  { id: 'en' as LangChoice, label: 'English', note: 'OCR and questions ready offline' },
  { id: 'te' as LangChoice, label: 'తెలుగు', note: 'OCR and questions ready offline' },
];

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const readPreference = (key: string) => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};
const writePreference = (key: string, value: string) => {
  try { window.localStorage.setItem(key, value); } catch { /* Storage is optional; the app continues in memory. */ }
};

function AppShell({ children, document, selectedLang, corpusReady }: { children: ReactNode; document: UploadedDocument | null; selectedLang: LangChoice; corpusReady: boolean }) {
  const [path] = useLocation();
  const [open, setOpen] = useState(false);
  const nav = [
    { href: '/', label: 'Add a form', icon: FileUp },
    { href: '/official-dataset', label: 'Official dataset', icon: Database },
    { href: '/form', label: 'Review OCR', icon: PanelLeft },
    { href: '/ask', label: 'Ask locally', icon: MessageCircle },
    { href: '/offline', label: 'Offline verification', icon: WifiOff },
  ];

  return <div className="grain min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[278px] flex-col border-r border-border bg-[#f3efe5] px-5 py-6 transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-start justify-between">
        <Link href="/" onClick={() => setOpen(false)} className="group flex items-center gap-3" data-testid="link-brand">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><LockKeyhole size={19} strokeWidth={2.2} /></span>
          <span><span className="block font-display text-[20px] font-bold leading-none tracking-tight">Sahaay AI</span><span className="mt-1 block font-data text-[9px] uppercase tracking-[.18em] text-muted-foreground">local citizen assistant</span></span>
        </Link>
        <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted-foreground lg:hidden" aria-label="Close menu" data-testid="button-close-menu"><X size={18} /></button>
      </div>
      <div className="mt-12">
        <p className="mb-3 px-3 font-data text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Your workspace</p>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold transition-colors ${path === href ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:bg-background/70 hover:text-foreground'}`}><Icon size={17} /><span>{label}</span>{path === href && <ChevronRight size={15} className="ml-auto opacity-70" />}</Link>)}
        </nav>
      </div>
      <div className="mt-auto rounded-2xl border border-primary/15 bg-primary/[.07] p-4">
        <div className="mb-3 flex items-center gap-2 text-primary"><Plane size={15} /><span className="font-data text-[10px] font-bold uppercase tracking-[.14em]">Aeroplane mode</span></div>
        <p className="text-[12px] leading-relaxed text-foreground/70">Your form and questions stay on this device. No account or upload required.</p>
        <div className="mt-4 flex items-center gap-2 font-data text-[10px] text-primary"><span className={`h-1.5 w-1.5 rounded-full ${corpusReady ? 'bg-emerald-600' : 'bg-amber-500'}`} />{corpusReady ? 'EVALUATION CORPUS READY' : 'LOADING EVALUATION DATA'}</div>
      </div>
    </aside>
    <div className="lg:pl-[278px]">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8 lg:px-12">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-foreground lg:hidden" aria-label="Open menu" data-testid="button-open-menu"><Menu size={21} /></button>
        <div className="hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex"><span className="font-data text-[10px] uppercase tracking-[.14em]">Device local</span><span className="h-1 w-1 rounded-full bg-accent" /><span>{document ? `${document.name} · ${selectedLang === 'en' ? 'English' : 'Telugu'}` : 'No form loaded'}</span></div>
        <div className="ml-auto flex items-center gap-2"><button onClick={() => window.history.back()} className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary" aria-label="Go back"><ArrowLeft size={16} /> Back</button><span className="hidden rounded-full border border-emerald-700/20 bg-emerald-700/[.07] px-3 py-1.5 font-data text-[10px] font-bold tracking-wide text-emerald-800 sm:block">OFFLINE READY</span></div>
      </header>
      <main className="mx-auto max-w-[1380px] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</main>
    </div>
  </div>;
}

function HomePage({ document, selectedLang, setSelectedLang, onSelectFile, onOpenOfficialDataset, isProcessing, progress, processingLabel, error }: {
  document: UploadedDocument | null;
  selectedLang: LangChoice;
  setSelectedLang: (language: LangChoice) => void;
  onSelectFile: (file: File, source: UploadSource) => void;
  onOpenOfficialDataset: () => void;
  isProcessing: boolean;
  progress: number;
  processingLabel: string;
  error: string | null;
}) {
  const [, navigate] = useLocation();
  return <div className="space-y-10">
    <section className="rise grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
      <div><div className="mb-5 flex items-center gap-2 font-data text-[10px] font-bold uppercase tracking-[.2em] text-primary"><Sparkles size={14} /> a quieter way through paperwork</div><h1 className="max-w-[680px] font-display text-[clamp(44px,6vw,82px)] font-bold leading-[.94] tracking-[-.045em] text-foreground">Understand your form.<br /><span className="text-primary">Keep your data.</span></h1><p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-muted-foreground">Upload a government form from your device. Sahaay AI extracts the text locally, then helps you ask questions without sending personal information anywhere.</p></div>
      <div className="paper-grid relative overflow-hidden rounded-[22px] border border-border bg-[#e4e8dc] p-6 sm:p-8"><div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border-[18px] border-accent/20" /><div className="relative"><div className="mb-10 flex items-center justify-between"><span className="font-data text-[10px] uppercase tracking-[.18em] text-primary">LOCAL / INTAKE</span><ShieldCheck size={23} className="text-primary" /></div><div className="font-display text-[31px] font-bold leading-tight text-primary">Your document<br />stays with you.</div><div className="mt-8 flex items-center gap-3 text-[12px] text-primary/70"><span className="h-px w-8 bg-primary/40" />OCR and questions run locally</div></div></div>
    </section>

    <section className="rise-2 space-y-5"><div><p className="font-data text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground">Step 01 / add your document</p><h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Bring a form from your device.</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Use a JPG, PNG, WEBP, or PDF.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="group flex min-h-[190px] cursor-pointer flex-col justify-between rounded-2xl border border-border bg-card p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-sm" data-testid="dropzone-upload"><input type="file" accept="image/*,.pdf,application/pdf" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onSelectFile(file, 'upload'); event.currentTarget.value = ''; }} /><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Upload size={20} /></span><span><span className="mt-8 block font-display text-[25px] font-bold">Upload a form</span><span className="mt-2 block text-[12px] text-muted-foreground">Choose an image or PDF from this device.</span></span></label>
        <label className="group flex min-h-[190px] cursor-pointer flex-col justify-between rounded-2xl border border-border bg-card p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-sm" data-testid="dropzone-camera"><input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onSelectFile(file, 'camera'); event.currentTarget.value = ''; }} /><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Camera size={20} /></span><span><span className="mt-8 block font-display text-[25px] font-bold">Take photo</span><span className="mt-2 block text-[12px] text-muted-foreground">Capture a document with the device camera.</span></span></label>
      </div>
      <button onClick={onOpenOfficialDataset} data-testid="button-load-official-dataset" className="flex w-full items-center justify-between rounded-2xl border border-primary/25 bg-primary/[.05] p-5 text-left transition-colors hover:bg-primary/[.09]"><span className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Database size={19} /></span><span><span className="block text-sm font-bold">Load Official PS-I2 Dataset</span><span className="mt-1 block text-xs text-muted-foreground">Browse bundled forms and ask their official evaluation questions without OCR.</span></span></span><ArrowRight size={17} className="text-primary" /></button>
    </section>

    <section className="rise-3 grid gap-5 border-t border-border pt-8 md:grid-cols-[1fr_1fr]"><div><p className="font-data text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground">Step 02 / language</p><h2 className="mt-2 font-display text-2xl font-bold">Choose the document language.</h2></div><div className="space-y-2">{languages.map((language) => <button key={language.id} onClick={() => setSelectedLang(language.id)} data-testid={`button-language-${language.id}`} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${selectedLang === language.id ? 'border-primary bg-primary/[.07]' : 'border-border bg-card hover:border-primary/40'}`}><span className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-lg ${selectedLang === language.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary'}`}><Languages size={16} /></span><span><span className="block text-sm font-semibold">{language.label}</span><span className="block text-[11px] text-muted-foreground">{language.note}</span></span></span>{selectedLang === language.id ? <Check size={17} className="text-primary" /> : <span className="font-data text-[10px] text-muted-foreground">SELECT</span>}</button>)}<div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground"><Info size={13} /> Other languages are supported by the data model and can be added to the OCR bundle.</div></div></section>

    {isProcessing && <section className="rounded-2xl border border-primary/20 bg-primary/[.06] p-5" data-testid="ocr-progress"><div className="flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> {processingLabel || 'Preparing local OCR'}</span><span className="font-data text-xs">{Math.round(progress * 100)}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, progress * 100)}%` }} /></div><p className="mt-3 text-xs text-muted-foreground">The file stays in this browser. No OCR request is sent to a server.</p></section>}
    {error && <div className="rounded-xl border border-destructive/20 bg-destructive/[.06] px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
    {document && !isProcessing && <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/[.06] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><FileText size={18} /></span><div className="min-w-0"><div className="truncate text-sm font-bold">{document.name}</div><div className="mt-1 font-data text-[10px] uppercase tracking-wide text-primary/70">{document.source === 'official' ? 'official text layer ready' : 'OCR text ready · local upload'}</div></div></div><button onClick={() => navigate('/form')} data-testid="button-review-uploaded-form" className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Review document text <ArrowRight size={15} /></button></section>}
    <div className="border-t border-border pt-6 text-[11px] leading-relaxed text-muted-foreground"><span className="font-data uppercase tracking-wide text-primary">Evaluation corpus stays separate.</span> The uploaded PSI-2 CSV is used only on Local metrics to evaluate the assistant; it is never treated as a user form or used as the document you ask about.</div>
  </div>;
}

function OfficialDatasetPage({ forms, questions, onLoadForm }: { forms: OfficialForm[]; questions: OfficialQuestion[]; onLoadForm: (form: OfficialForm, language: string, formQuestions: string[]) => void }) {
  const [, navigate] = useLocation();
  const [language, setLanguage] = useState('en');
  const [category, setCategory] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const labels: Record<string, string> = { en: 'English', hi: 'Hindi', bn: 'Bengali', te: 'Telugu', ta: 'Tamil', mr: 'Marathi', kn: 'Kannada' };
  const categories = [...new Set(forms.map((form) => form.formType))].sort();
  const categoryForms = category ? forms.filter((form) => form.formType === category) : [];
  return <div className="space-y-8"><PageHeading eyebrow="Official PS-I2 dataset / no OCR" title={category ? `${category.replaceAll('_', ' ')} forms` : 'Choose a form category.'} description="Official text layers load directly into the same local retrieval and QA pipeline. Upload validation and OCR are not involved." action={<div className="flex items-center gap-2 font-data text-[10px] font-bold uppercase tracking-wide text-primary"><Database size={14} /> {forms.length} local forms</div>} />
    <section className="rounded-2xl border border-border bg-card p-5"><label className="text-sm font-semibold" htmlFor="official-dataset-language">Question and text-layer language</label><select id="official-dataset-language" value={language} onChange={(event) => { setLanguage(event.target.value); setNotice(''); }} className="ml-3 rounded-lg border border-input bg-background px-3 py-2 text-sm">{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><p className="mt-3 text-xs text-muted-foreground">Select a category, then a form. Its official questions for this language appear as clickable chips in Ask locally; custom questions remain available.</p></section>
    {notice && <div role="alert" className="rounded-xl border border-amber-600/25 bg-amber-500/10 px-4 py-3 text-sm text-foreground">{notice}</div>}
    {!category ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{categories.map((name) => { const categoryForms = forms.filter((form) => form.formType === name); const categoryQuestions = questions.filter((question) => categoryForms.some((form) => form.formId === question.formId)); return <button key={name} onClick={() => setCategory(name)} className="rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"><span className="font-display text-xl font-bold capitalize">{name.replaceAll('_', ' ')}</span><span className="mt-3 block text-xs text-muted-foreground">Category</span><span className="mt-1 block text-sm font-semibold">{categoryForms.length} forms · {categoryQuestions.length} official questions</span><span className="mt-5 flex items-center gap-2 text-xs font-bold text-primary">View forms <ArrowRight size={14} /></span></button>; })}</section> : <><button onClick={() => { setCategory(null); setNotice(''); }} className="text-sm font-semibold text-primary hover:underline">← All categories</button><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{categoryForms.map((form) => { const formQuestions = questions.filter((question) => question.formId === form.formId && question.language === language).map((question) => question.question); const available = Boolean(form.textLayers[language]) && formQuestions.length > 0; return <button key={form.formId} onClick={() => { if (!available) { setNotice('This form is not available in the selected language. Choose another language to continue.'); return; } onLoadForm(form, language, formQuestions); navigate('/ask'); }} className="rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"><span className="font-data text-[10px] font-bold uppercase tracking-[.16em] text-primary">{form.formId}</span><span className="mt-2 block font-display text-xl font-bold capitalize">{form.formType.replaceAll('_', ' ')}</span><span className="mt-3 block text-xs text-muted-foreground">{available ? `${formQuestions.length} official questions · text layer ready` : 'Not available in selected language'}</span><span className="mt-5 flex items-center gap-2 text-xs font-bold text-primary">{available ? 'Load without OCR' : 'Show availability message'} <ArrowRight size={14} /></span></button>; })}</section></>}
  </div>;
}

function FormPage({ document, selectedLang, onSelectFile, onReset }: { document: UploadedDocument | null; selectedLang: LangChoice; onSelectFile: (file: File, source: UploadSource) => void; onReset: () => void }) {
  const [, navigate] = useLocation();
  if (!document) return <EmptyState title="Add a form first" body="Upload a government form before reviewing OCR text." action="Add a form" onClick={() => navigate('/')} />;
  return <div className="space-y-8"><PageHeading eyebrow="Review OCR / local document" title="Check what was read." description="Review and edit the extracted text before asking a question. This is the text the local assistant will use." action={<div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[.06] px-3 py-2 font-data text-[10px] font-bold uppercase tracking-wide text-primary"><Plane size={13} /> offline / aeroplane mode</div>} /><div className="grid gap-6 lg:grid-cols-[1fr_300px]"><div className="rounded-2xl border border-border bg-card p-5 sm:p-8">{document.previewUrl && document.type.startsWith('image/') && <img src={document.previewUrl} alt={`Captured preview of ${document.name}`} className="mb-6 max-h-[280px] w-full rounded-xl border border-border object-contain bg-secondary/30" />}<div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5"><div><div className="font-data text-[10px] uppercase tracking-[.16em] text-muted-foreground">Extracted document text</div><div className="mt-1 flex items-center gap-2 font-display text-2xl font-bold"><FileText size={20} className="text-primary" />{document.name}</div></div><span className="rounded-full bg-secondary px-3 py-1.5 font-data text-[9px] uppercase tracking-wide text-muted-foreground">{document.type === 'application/pdf' ? 'PDF' : 'IMAGE'} · LOCAL OCR</span></div><textarea value={document.text} onChange={(event) => window.dispatchEvent(new CustomEvent('namma-form-text-change', { detail: event.target.value }))} data-testid="textarea-ocr-text" className="min-h-[390px] w-full resize-y rounded-xl border border-input bg-background px-4 py-4 font-mono text-[13px] leading-relaxed outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10" aria-label="Extracted document text" placeholder="OCR text will appear here..." /><div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-5"><button onClick={onReset} data-testid="button-reset-form" className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary"><RotateCcw size={14} /> Clear uploaded form</button><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary"><input type="file" accept="image/*,.pdf,application/pdf" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onSelectFile(file, 'upload'); event.currentTarget.value = ''; }} /><FileUp size={14} /> Replace document</label><button onClick={() => navigate('/ask')} data-testid="button-ask-form" className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground">Ask about this form <ArrowRight size={14} /></button></div></div><aside className="space-y-4"><StatusCard icon={LockKeyhole} title="Private by design" body="The uploaded file and reviewed text stay in this page's browser state. They are not added to the evaluation CSV." /><StatusCard icon={FileText} title="OCR adapter" body="This demo uses bundled Tesseract.js for images and renders up to five PDF pages locally before recognition." /></aside></div></div>;
}

function AskPage({ document: uploadedDocument, selectedLang }: { document: UploadedDocument | null; selectedLang: LangChoice }) {
  const document = uploadedDocument as UploadedDocument;
  const [, navigate] = useLocation(); const [question, setQuestion] = useState(''); const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string; meta?: LocalAnswer }[]>([]); const [thinking, setThinking] = useState(false);
  const prompts = document?.source === 'official' ? (document.officialQuestions ?? []) : [];
  const ask = (value = question) => { const activeDocument = document; if (!value.trim() || !activeDocument?.text.trim()) return; setQuestion(''); setMessages((m) => [...m, { role: 'user', text: value }]); setThinking(true); window.setTimeout(() => { const meta = answerFromDocument(activeDocument.text, value, { fileName: activeDocument.name, language: selectedLang, fileType: activeDocument.type, eligibilityRule: activeDocument.eligibilityRule }); setMessages((m) => [...m, { role: 'assistant', text: meta.answer, meta }]); setThinking(false); }, 360); };
  if (!document) return <EmptyState title="Add a form first" body="Local question answering needs an uploaded form and its extracted text." action="Add a form" onClick={() => navigate('/')} />;
  assertLoadedDocument(document);
  return <div className="mx-auto max-w-[980px] space-y-7"><PageHeading eyebrow="Ask locally / grounded answers" title="A second pair of eyes." description={`Every answer is restricted to ${document.name}, its local metadata, and retrieved document chunks.`} action={<div className="flex items-center gap-2 font-data text-[10px] font-bold uppercase tracking-wide text-primary"><Cpu size={14} /> device local</div>} /><div className="rounded-2xl border border-border bg-card"><div className="min-h-[330px] space-y-5 p-5 sm:p-8">{messages.length === 0 && <div className="flex min-h-[250px] flex-col items-center justify-center text-center"><CircleHelp size={25} className="mb-4 text-primary" /><h3 className="font-display text-2xl font-bold">Ask about this document</h3><p className="mt-2 max-w-[440px] text-sm text-muted-foreground">Try a field, a heading, a table label, or file metadata. Unsupported questions return a clear no-answer result.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{[...prompts, 'How many pages are there?', 'What language is the document?', 'What file name was uploaded?'].map((prompt) => <button key={prompt} onClick={() => ask(prompt)} className="rounded-full border border-border px-3 py-2 text-xs text-foreground/75 hover:border-primary hover:text-primary">{prompt}</button>)}</div></div>}{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-secondary/80 text-foreground'}`}><div>{message.text}</div>{message.meta && <div className="mt-3 border-t border-foreground/10 pt-3"><div className="flex flex-wrap gap-2 font-data text-[9px] uppercase tracking-wide opacity-70"><span>{message.meta.type}</span><span>confidence {confidenceLabel(message.meta.confidence)}</span><span>{message.meta.sourcePages?.length ? `page ${message.meta.sourcePages.join(', ')}` : 'document metadata'}</span></div><details className="mt-3 rounded-lg border border-border/70 bg-background/50 px-3 py-2"><summary className="cursor-pointer text-xs font-semibold">Supporting evidence</summary><mark className="mt-2 block whitespace-pre-wrap bg-accent/15 px-2 py-1 text-xs leading-relaxed text-foreground">{message.meta.supportingText || 'Answer derived from local document metadata.'}</mark></details></div>}</div></div>)}{thinking && <div className="text-xs text-muted-foreground">Retrieving only local document chunks…</div>}</div><form onSubmit={(event) => { event.preventDefault(); ask(); }} className="flex gap-2 border-t border-border bg-background/60 p-4 sm:p-5"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this document..." className="min-w-0 flex-1 rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /><button type="submit" disabled={!question.trim() || thinking} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground disabled:opacity-40"><Send size={17} /></button></form></div></div>;
  return <div className="mx-auto max-w-[980px] space-y-7"><PageHeading eyebrow="Ask locally / OCR text + reasoning" title="A second pair of eyes." description={`Ask about ${document.name}. Answers are grounded in the reviewed OCR text, using ${selectedLang === 'en' ? 'English' : 'Telugu'} prompts and a local deterministic reasoning layer.`} action={<div className="flex items-center gap-2 font-data text-[10px] font-bold uppercase tracking-wide text-primary"><Cpu size={14} /> no network inference</div>} /><div className="rounded-2xl border border-border bg-card"><div className="flex items-center gap-3 border-b border-border px-5 py-4"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><MessageCircle size={16} /></span><div><div className="text-sm font-bold">Form companion</div><div className="font-data text-[9px] uppercase tracking-[.14em] text-muted-foreground">Context: {document.name} / {selectedLang === 'en' ? 'English' : 'Telugu'}</div></div><span className="ml-auto flex items-center gap-1.5 font-data text-[9px] text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> OCR READY</span></div><div className="min-h-[330px] space-y-5 p-5 sm:p-8">{messages.length === 0 && <div className="flex min-h-[250px] flex-col items-center justify-center text-center"><div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><CircleHelp size={25} /></div><h3 className="font-display text-2xl font-bold">What would you like to understand?</h3><p className="mt-2 max-w-[440px] text-sm text-muted-foreground">Try an extraction question or ask the eligibility rule. The answer, source line, and confidence stay visible.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{prompts.map((prompt) => <button key={prompt} onClick={() => ask(prompt)} data-testid={`button-prompt-${prompt.slice(0, 5)}`} className="rounded-full border border-border px-3 py-2 text-xs text-foreground/75 transition-colors hover:border-primary hover:text-primary">{prompt}</button>)}</div></div>}{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-secondary/80 text-foreground'}`}><div>{message.text}</div>{message.meta && <div className="mt-3 flex flex-wrap gap-2 border-t border-foreground/10 pt-2 font-data text-[9px] uppercase tracking-wide opacity-65"><span>{message.meta.type}</span><span>confidence {Math.round(message.meta.confidence * 100)}%</span><span>source {message.meta.source}</span></div>}</div></div>)}{thinking && <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" /></span>Searching only the reviewed OCR text</div>}</div><form onSubmit={(event) => { event.preventDefault(); ask(); }} className="flex gap-2 border-t border-border bg-background/60 p-4 sm:p-5"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this form..." data-testid="input-question" className="min-w-0 flex-1 rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" /><button type="submit" disabled={!question.trim() || thinking} data-testid="button-send-question" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground disabled:opacity-40"><Send size={17} /></button></form></div></div>;
}

function AnalyticsPage({ corpus }: { corpus: CorpusRecord[] }) {
  // Accuracy and handset data must come from reproducible report inputs; never show invented metrics.
  return <div className="space-y-8"><PageHeading eyebrow="Evaluation / reproducible reports" title="Measure on the device." description="The bundled PSI-2 QA file is available locally. Accuracy, tokenizer and handset reports are generated from real runs outside the app." action={<div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-2 font-data text-[10px] font-bold uppercase tracking-wide text-foreground/70"><Activity size={14} /> report inputs required</div>} /><section className="grid gap-4 sm:grid-cols-3"><Metric icon={Database} label="QA records" value={corpus.length.toLocaleString()} detail="bundled qa_flat.csv equivalent" /><Metric icon={Languages} label="Languages" value={new Set(corpus.map((record) => record.lang)).size.toString()} detail="parallel evaluation corpus" /><Metric icon={Activity} label="Measured results" value="—" detail="run the local report scripts" /></section><section className="rounded-2xl border border-border bg-card p-5 sm:p-7"><p className="font-data text-[10px] uppercase tracking-[.18em] text-muted-foreground">Judge workflow</p><h2 className="mt-1 font-display text-2xl font-bold">No simulated accuracy or hardware claims.</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Provide local-model predictions for each quantization, 30 or more real handset runs per condition, and tokenizer counts before and after the intervention. The repository converts those inputs into per-language, extraction, reasoning, latency, memory, CPU, throughput and fertility reports.</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><StatusCard icon={Gauge} title="Accuracy" body="qid, quantization and answer predictions" /><StatusCard icon={Timer} title="Handset" body="cold, prefill, decode, RSS, CPU and soak runs" /><StatusCard icon={Cpu} title="Tokenizer" body="before/after token counts for all languages" /></div></section></div>;

  const rows = ['en', 'te', 'hi', 'bn', 'ta', 'mr', 'kn'].map((lang) => ({ lang, count: corpus.filter((r) => r.lang === lang).length, accuracy: lang === 'en' ? '96.4%' : lang === 'te' ? '93.1%' : '88.7%' }));
  const types = [{ label: 'Extraction', value: '94.8%', width: '94.8%' }, { label: 'Reasoning', value: '91.2%', width: '91.2%' }];
  return <div className="space-y-8"><PageHeading eyebrow="Evaluation metrics / internal dataset" title="Measure the model, not the citizen." description="The uploaded PSI-2 CSV is kept separate from user forms and used only for evaluation reporting. Device numbers are simulated distributions for the target class." action={<div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-2 font-data text-[10px] font-bold uppercase tracking-wide text-foreground/70"><Activity size={14} /> evaluation only</div>} /><section className="grid gap-4 sm:grid-cols-3"><Metric icon={Gauge} label="Evaluation records" value={corpus.length.toLocaleString()} detail="internal CSV · parsed locally" /><Metric icon={Timer} label="Warm response" value="182 ms" detail="simulated p50" /><Metric icon={Cpu} label="Token throughput" value="18.6 tok/s" detail="simulated median" /></section><div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="mb-6 flex items-end justify-between"><div><p className="font-data text-[10px] uppercase tracking-[.18em] text-muted-foreground">Accuracy by language</p><h2 className="mt-1 font-display text-2xl font-bold">Where answers land</h2></div><span className="font-data text-[10px] text-muted-foreground">N = evaluation corpus</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="font-data text-[9px] uppercase tracking-[.14em] text-muted-foreground"><tr><th className="pb-3">Language</th><th className="pb-3">Records</th><th className="pb-3">Accuracy</th><th className="pb-3">Signal</th></tr></thead><tbody>{rows.map((row) => <tr key={row.lang} className="border-t border-border/70"><td className="py-3 font-semibold">{row.lang === 'te' ? 'Telugu' : row.lang === 'en' ? 'English' : row.lang}</td><td className="py-3 font-data text-xs text-muted-foreground">{row.count}</td><td className="py-3 font-data text-xs">{row.accuracy}</td><td className="py-3"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: row.accuracy }} /></div></td></tr>)}</tbody></table></div></section><section className="rounded-2xl border border-border bg-[#e4e8dc] p-5 sm:p-7"><p className="font-data text-[10px] uppercase tracking-[.18em] text-primary">Question type</p><h2 className="mt-1 font-display text-2xl font-bold text-primary">Reasoning stays visible</h2><div className="mt-7 space-y-6">{types.map((type) => <div key={type.label}><div className="mb-2 flex justify-between text-sm font-semibold text-primary"><span>{type.label}</span><span className="font-data text-xs">{type.value}</span></div><div className="h-2 rounded-full bg-primary/10"><div className="h-full rounded-full bg-accent" style={{ width: type.width }} /></div></div>)}</div><div className="mt-8 border-t border-primary/15 pt-4 text-[12px] leading-relaxed text-primary/70">These scores describe the internal evaluation corpus. They do not read or alter the form uploaded by a citizen.</div></section></div><section className="rounded-2xl border border-border bg-card p-5 sm:p-7"><div className="mb-6 flex items-end justify-between"><div><p className="font-data text-[10px] uppercase tracking-[.18em] text-muted-foreground">Simulated device distributions</p><h2 className="mt-1 font-display text-2xl font-bold">The quiet hardware profile</h2></div><span className="rounded-full border border-border px-3 py-1 font-data text-[9px] uppercase text-muted-foreground">target class ≤ ₹12,000</span></div><div className="grid gap-x-8 gap-y-5 md:grid-cols-2">{[['Cold latency', '1.4 s', '0.9 — 2.2 s', Timer], ['Warm latency', '182 ms', '120 — 310 ms', Gauge], ['RSS memory', '840 MB', '620 — 1,140 MB', Database], ['Thermal throughput', '17.8 tok/s', '12.4 — 22.1 tok/s', Thermometer]].map(([label, value, range, Icon]) => { const MetricIcon = Icon as typeof Cpu; return <div key={String(label)} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-primary"><MetricIcon size={16} /></span><div className="min-w-0 flex-1"><div className="flex justify-between text-sm font-semibold"><span>{String(label)}</span><span className="font-data text-xs">{String(value)}</span></div><div className="mt-2 h-1.5 rounded-full bg-secondary"><div className="h-full w-2/3 rounded-full bg-primary" /></div><div className="mt-1 font-data text-[9px] text-muted-foreground">P10 — P90 {String(range)}</div></div></div>; })}</div></section></div>;
}

function LimitsPage() {
  return <div className="space-y-8"><PageHeading eyebrow="Boundaries / honest by default" title="What is real, what is simulated." description="Uploaded documents are OCR'd and answered locally. The evaluation corpus and simulated device measurements remain separate." action={<div className="flex items-center gap-2 font-data text-[10px] font-bold uppercase tracking-wide text-primary"><Info size={14} /> transparent limits</div>} /><div className="grid gap-5 lg:grid-cols-2"><Boundary title="Real in this demo" icon={Check} tone="good" items={['Images and PDFs are selected or captured in the browser.', 'Bundled Tesseract.js extracts image text locally; PDF pages are rendered and OCR’d locally.', 'The reviewed OCR text is the only context used for user questions.', 'The PSI-2 CSV is used only for evaluation metrics and never as user input.', 'No inference-time network call is made.']} /><Boundary title="Simulated for presentation" icon={Activity} tone="warm" items={['Latency, tokens/sec, RSS memory, and thermal throughput distributions.', 'Per-language and per-type accuracy figures on the internal evaluation corpus.', 'The income and household eligibility rule is a demo policy, not an official government decision.']} /></div><section className="rounded-2xl border border-primary/20 bg-primary p-5 text-primary-foreground sm:p-8"><div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between"><div className="max-w-xl"><div className="mb-4 flex items-center gap-2 font-data text-[10px] font-bold uppercase tracking-[.18em] text-primary-foreground/60"><Network size={14} /> ready for the next layer</div><h2 className="font-display text-3xl font-bold">Bring your own local model.</h2><p className="mt-3 text-sm leading-relaxed text-primary-foreground/72">The assistant's <code className="rounded bg-primary-foreground/10 px-1.5 py-0.5 font-data text-[11px]">answerFromDocument</code> boundary can be replaced by a llama.cpp / GGUF adapter without changing the citizen-facing views.</p></div><div className="grid w-full max-w-[390px] gap-3 sm:grid-cols-2"><Plug title="GGUF / llama.cpp" body="Replace deterministic reasoning with a quantized local model." /><Plug title="OCR adapters" body="The intake shape is ready for native ML Kit or a different local OCR engine." /></div></div></section><section className="grid gap-4 sm:grid-cols-3"><MiniFact title="Device budget" value="≤ ₹12,000" icon={Cpu} /><MiniFact title="Resident memory" value="≤ 1.2 GB" icon={Database} /><MiniFact title="Network at answer time" value="0 calls" icon={LockKeyhole} /></section></div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 font-data text-[10px] font-bold uppercase tracking-[.2em] text-primary">{eyebrow}</div><h1 className="font-display text-[clamp(38px,5vw,61px)] font-bold leading-none tracking-[-.04em]">{title}</h1><p className="mt-4 max-w-[650px] text-[15px] leading-relaxed text-muted-foreground">{description}</p></div>{action}</div>; }
function StatusCard({ icon: Icon, title, body }: { icon: typeof LockKeyhole; title: string; body: string }) { return <div className="rounded-2xl border border-border bg-card p-5"><Icon size={18} className="text-primary" /><h3 className="mt-5 text-sm font-bold">{title}</h3><p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{body}</p></div>; }
function EmptyState({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) { return <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center text-center"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-secondary text-primary"><FileText size={27} /></div><h1 className="mt-6 font-display text-3xl font-bold">{title}</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p><button onClick={onClick} data-testid="button-empty-action" className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">{action}<ArrowRight size={15} /></button></div>; }
function Metric({ icon: Icon, label, value, detail }: { icon: typeof Gauge; label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-border bg-card p-5"><Icon size={18} className="text-primary" /><div className="mt-6 font-data text-[10px] uppercase tracking-[.15em] text-muted-foreground">{label}</div><div className="mt-1 font-display text-3xl font-bold">{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{detail}</div></div>; }
function Boundary({ title, icon: Icon, tone, items }: { title: string; icon: typeof Check; tone: 'good' | 'warm'; items: string[] }) { return <section className={`rounded-2xl border p-5 sm:p-7 ${tone === 'good' ? 'border-emerald-800/15 bg-emerald-800/[.045]' : 'border-accent/20 bg-accent/[.06]'}`}><div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-lg ${tone === 'good' ? 'bg-emerald-800/10 text-emerald-800' : 'bg-accent/15 text-accent'}`}><Icon size={17} /></span><h2 className="font-display text-2xl font-bold">{title}</h2></div><ul className="mt-6 space-y-4">{items.map((item) => <li key={item} className="flex gap-3 text-sm leading-relaxed text-foreground/75"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />{item}</li>)}</ul></section>; }
function Plug({ title, body }: { title: string; body: string }) { return <div className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/[.08] p-4"><div className="font-data text-[10px] font-bold uppercase tracking-wide text-primary-foreground/80">{title}</div><p className="mt-2 text-[11px] leading-relaxed text-primary-foreground/60">{body}</p></div>; }
function MiniFact({ title, value, icon: Icon }: { title: string; value: string; icon: typeof Cpu }) { return <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-primary"><Icon size={16} /></span><div><div className="font-data text-[9px] uppercase tracking-wide text-muted-foreground">{title}</div><div className="mt-1 text-sm font-bold">{value}</div></div></div>; }

function RouterView({ corpus, officialForms, officialQuestions, document, selectedLang, setSelectedLang, onSelectFile, onLoadOfficialForm, onReset, isProcessing, progress, processingLabel, error }: {
  corpus: CorpusRecord[];
  officialForms: OfficialForm[];
  officialQuestions: OfficialQuestion[];
  document: UploadedDocument | null;
  selectedLang: LangChoice;
  setSelectedLang: (language: LangChoice) => void;
  onSelectFile: (file: File, source: UploadSource) => void;
  onLoadOfficialForm: (form: OfficialForm, language: string, formQuestions: string[]) => void;
  onReset: () => void;
  isProcessing: boolean;
  progress: number;
  processingLabel: string;
  error: string | null;
}) {
  const [path, navigate] = useLocation();
  if (path === '/official-dataset') return <OfficialDatasetPage forms={officialForms} questions={officialQuestions} onLoadForm={onLoadOfficialForm} />;
  if (path === '/form') return <FormPage document={document} selectedLang={selectedLang} onSelectFile={onSelectFile} onReset={onReset} />;
  if (path === '/ask') return <AskPage document={document} selectedLang={selectedLang} />;
  if (path === '/offline') return <OfflineVerification />;
  if (path === '/analytics') return <AnalyticsPage corpus={corpus} />;
  if (path === '/limits') return <LimitsPage />;
  return <HomePage document={document} selectedLang={selectedLang} setSelectedLang={setSelectedLang} onSelectFile={onSelectFile} onOpenOfficialDataset={() => navigate('/official-dataset')} isProcessing={isProcessing} progress={progress} processingLabel={processingLabel} error={error} />;
}

function App() {
  const [corpus, setCorpus] = useState<CorpusRecord[]>([]);
  const [officialDataset] = useState(() => loadOfficialDataset());
  const [document, setDocument] = useState<UploadedDocument | null>(null);
  const [selectedLang, setSelectedLang] = useState<LangChoice>(() => readPreference('namma-lang') === 'te' ? 'te' : 'en');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingLabel, setProcessingLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const uploadId = useRef(0);

  useEffect(() => { loadCorpus().then(setCorpus).catch(() => setCorpus([])); }, []);
  useEffect(() => { writePreference('namma-lang', selectedLang); }, [selectedLang]);
  useEffect(() => () => { if (document?.previewUrl) URL.revokeObjectURL(document.previewUrl); }, [document?.previewUrl]);
  useEffect(() => {
    const handleTextChange = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      setDocument((current) => current ? { ...current, text } : current);
    };
    window.addEventListener('namma-form-text-change', handleTextChange);
    return () => window.removeEventListener('namma-form-text-change', handleTextChange);
  }, []);

  const resetDocument = () => {
    uploadId.current += 1;
    if (document?.previewUrl) URL.revokeObjectURL(document.previewUrl);
    setDocument(null);
    setError(null);
    setIsProcessing(false);
    setProgress(0);
    setProcessingLabel('');
  };

  const loadOfficialForm = (form: OfficialForm, language: string, formQuestions: string[]) => {
    uploadId.current += 1;
    if (document?.previewUrl) URL.revokeObjectURL(document.previewUrl);
    const text = form.textLayers[language];
    if (!text) { setError(`The ${language} text layer is unavailable for ${form.formId}.`); return; }
    setError(null);
    setIsProcessing(false);
    setDocument({ name: `${form.formId} · ${form.formType}`, type: 'application/x-ps-i2-text', text, source: 'official', officialLanguage: language, officialQuestions: formQuestions, eligibilityRule: form.eligibilityRule });
  };

  const handleFile = async (file: File, source: UploadSource) => {
    const accepted = file.type.startsWith('image/') || isPdfFile(file);
    if (!accepted) {
      setError('Please choose an image or PDF form.');
      return;
    }
    if (file.size === 0) {
      setError('This file is empty. Choose a readable image or PDF form.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('This file is larger than 15 MB. Use a smaller image or PDF to keep local OCR reliable.');
      return;
    }
    const validationError = await validateDocumentFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    let ocrFile: File;
    try {
      ocrFile = await createMobileSafeFile(file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The selected file could not be read on this device.');
      return;
    }
    const currentUploadId = ++uploadId.current;
    if (document?.previewUrl) URL.revokeObjectURL(document.previewUrl);
    setError(null);
    setIsProcessing(true);
    setProgress(0.03);
    setProcessingLabel(source === 'camera' ? 'Preparing camera image' : 'Preparing local OCR');
    const previewUrl = URL.createObjectURL(ocrFile);
    try {
      const text = await extractTextFromFile(ocrFile, selectedLang as OcrLanguage, ({ status, progress: nextProgress }) => {
        if (currentUploadId !== uploadId.current) return;
        setProcessingLabel(status || 'Running local OCR');
        setProgress(Math.max(0.04, Math.min(0.98, nextProgress)));
      });
      if (!text.trim()) throw new Error('No readable text was found. Try a sharper photo or edit the OCR text manually.');
      if (currentUploadId !== uploadId.current) { URL.revokeObjectURL(previewUrl); return; }
      setDocument({ name: ocrFile.name || (source === 'camera' ? 'camera-capture.jpg' : 'uploaded-form'), type: ocrFile.type || 'application/octet-stream', previewUrl, text, source });
      setProgress(1);
      setProcessingLabel('OCR text ready');
      window.history.replaceState({}, '', `${import.meta.env.BASE_URL}form`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (caught) {
      if (currentUploadId === uploadId.current) URL.revokeObjectURL(previewUrl);
      console.error('[Sahaay AI OCR] Upload OCR failed', { fileName: ocrFile.name, fileType: ocrFile.type, source, error: caught });
      if (currentUploadId === uploadId.current) setError(getOcrErrorMessage(caught, isPdfFile(ocrFile)));
    } finally {
      if (currentUploadId === uploadId.current) setIsProcessing(false);
    }
  };

  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AppShell document={document} selectedLang={selectedLang} corpusReady={corpus.length > 0}><RouterView corpus={corpus} officialForms={officialDataset.forms} officialQuestions={officialDataset.questions} document={document} selectedLang={selectedLang} setSelectedLang={setSelectedLang} onSelectFile={handleFile} onLoadOfficialForm={loadOfficialForm} onReset={resetDocument} isProcessing={isProcessing} progress={progress} processingLabel={processingLabel} error={error} /></AppShell></WouterRouter></TooltipProvider></QueryClientProvider>;
}

export default App;
