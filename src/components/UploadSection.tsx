import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Sparkles, BookOpen, Layers, ArrowRight, BookA, Check, AlertCircle } from 'lucide-react';
import { ChapterSummary } from '../types/index.js';
import { formatNumber } from '../utils/formatters.js';

interface UploadSectionProps {
  onJobCreated: (jobId: string) => void;
  apiKeys: string[];
  onOpenKeysModal: () => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  onJobCreated,
  apiKeys,
  onOpenKeysModal,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState('');
  const [title, setTitle] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('English');
  const [model, setModel] = useState('gemini-3.8-flash');
  
  // Glossary / Terminology dictionary (e.g. MC names, cultivation stages)
  const [glossaryText, setGlossaryText] = useState('');
  const [showGlossary, setShowGlossary] = useState(false);

  // Parsing state
  const [parsing, setParsing] = useState(false);
  const [parsedChapters, setParsedChapters] = useState<ChapterSummary[] | null>(null);
  const [rawChapters, setRawChapters] = useState<any[] | null>(null);
  const [totalWords, setTotalWords] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      // Clean title from filename
      const cleanTitle = selected.name.replace(/\.[^/.]+$/, '').replace(/[_+-]/g, ' ');
      setTitle(cleanTitle);

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setTextInput(content);
        triggerParse(content, cleanTitle);
      };
      reader.readAsText(selected);
    }
  };

  const triggerParse = async (content: string, bookTitle: string) => {
    if (!content.trim()) return;
    setParsing(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, title: bookTitle }),
      });
      const data = await res.json();
      if (data.success) {
        setParsedChapters(data.chapters);
        setRawChapters(data.rawChapters);
        setTotalWords(data.totalWords);
      } else {
        setErrorMsg(data.error || 'Failed to detect chapters');
      }
    } catch (e: any) {
      setErrorMsg('Parsing error: ' + e.message);
    } finally {
      setParsing(false);
    }
  };

  const handleManualParse = () => {
    if (!textInput.trim()) {
      setErrorMsg('Please paste novel text or select a file first.');
      return;
    }
    triggerParse(textInput, title || 'Uploaded Novel');
  };

  const parseGlossary = (): Record<string, string> => {
    const dict: Record<string, string> = {};
    if (!glossaryText.trim()) return dict;
    const lines = glossaryText.split('\n');
    for (const line of lines) {
      const parts = line.split(/[=:,->]+/);
      if (parts.length >= 2) {
        const k = parts[0].trim();
        const v = parts.slice(1).join('=').trim();
        if (k && v) dict[k] = v;
      }
    }
    return dict;
  };

  const handleStartTranslation = async () => {
    if (!rawChapters || rawChapters.length === 0) {
      setErrorMsg('Please parse your novel text into chapters first.');
      return;
    }

    if (apiKeys.length === 0) {
      // Suggest opening API keys modal
      onOpenKeysModal();
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'Untitled Novel',
          chapters: rawChapters,
          sourceLang,
          targetLang,
          model,
          apiKeys,
          glossary: parseGlossary(),
          autoStart: true,
        }),
      });

      const data = await res.json();
      if (data.success && data.job) {
        onJobCreated(data.job.id);
      } else {
        setErrorMsg(data.error || 'Failed to start translation job');
      }
    } catch (e: any) {
      setErrorMsg('Error creating translation job: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="p-4 sm:p-6 rounded-xl bg-neutral-900/90 border border-neutral-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
          <div>
            <h1 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-400" />
              <span>Translate Novel / TXT File</span>
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Cloud background execution • Close browser & check back anytime
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-neutral-400">Gemini Keys:</span>
            <button
              onClick={onOpenKeysModal}
              className={`px-2 py-0.5 rounded font-mono font-semibold transition-colors ${
                apiKeys.length > 0
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
              }`}
            >
              {apiKeys.length > 0 ? `${apiKeys.length} Ready` : 'Configure Keys'}
            </button>
          </div>
        </div>

        {/* Upload Dropzone & Title */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider font-mono">
              Novel Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Martial God Asura / Lord of Mysteries"
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 placeholder:text-neutral-600 focus:outline-hidden focus:border-emerald-500 font-sans"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 uppercase tracking-wider font-mono">
              Target Language
            </label>
            <select
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 focus:outline-hidden focus:border-emerald-500 font-sans"
            >
              <option value="English">English</option>
              <option value="Spanish">Spanish (Español)</option>
              <option value="Indonesian">Indonesian (Bahasa)</option>
              <option value="Portuguese">Portuguese (Português)</option>
              <option value="French">French (Français)</option>
              <option value="Russian">Russian (Русский)</option>
              <option value="German">German (Deutsch)</option>
              <option value="Vietnamese">Vietnamese (Tiếng Việt)</option>
            </select>
          </div>
        </div>

        {/* File Picker or Paste Area */}
        <div className="space-y-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".txt,.text"
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-neutral-800 hover:border-emerald-500/50 hover:bg-neutral-950/60 rounded-xl p-5 text-center cursor-pointer transition-colors"
          >
            <UploadCloud className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
            <p className="text-xs font-medium text-neutral-200">
              {file ? (
                <span className="text-emerald-400 font-mono">Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
              ) : (
                <>Tap to select a <span className="text-emerald-400 font-mono">.txt</span> novel file, or drag & drop</>
              )}
            </p>
            <p className="text-[11px] text-neutral-500 mt-1">
              Supports large light novels and webnovel raw text files
            </p>
          </div>

          {/* Or Paste Raw Text Toggle */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-neutral-400">Or paste raw text directly:</span>
            {textInput && !parsedChapters && (
              <button
                onClick={handleManualParse}
                disabled={parsing}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-mono underline"
              >
                {parsing ? 'Detecting Chapters...' : 'Auto-detect Chapters'}
              </button>
            )}
          </div>

          {!file && (
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Paste raw chapters here (e.g. 第1章 / Chapter 1...)..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-hidden focus:border-neutral-700"
            />
          )}
        </div>

        {/* Glossary / Terms Drawer Toggle */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowGlossary(!showGlossary)}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <BookA className="w-3.5 h-3.5 text-emerald-400" />
            <span>Custom Glossary / Name Dictionary ({Object.keys(parseGlossary()).length} terms)</span>
            <span className="text-[10px] text-neutral-500 font-mono">[{showGlossary ? 'Hide' : 'Expand'}]</span>
          </button>

          {showGlossary && (
            <div className="mt-2 p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1.5">
              <p className="text-[11px] text-neutral-400">
                Specify character names, cultivation ranks, or spells (one per line):
              </p>
              <textarea
                value={glossaryText}
                onChange={e => setGlossaryText(e.target.value)}
                placeholder={"Lin Dong = Lin Dong\nQiankun Bag = Cosmos Bag\nNirvana Stage = Nirvana Realm"}
                rows={3}
                className="w-full px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-hidden"
              />
            </div>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/80 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Parsed Preview Card */}
        {parsedChapters && parsedChapters.length > 0 && (
          <div className="p-3.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-neutral-100">
                  {parsedChapters.length} Chapters Detected
                </span>
                <span className="text-neutral-400 font-mono">
                  • {formatNumber(totalWords)} original words
                </span>
              </div>
              <span className="text-[11px] text-emerald-300 font-mono bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/60">
                Ready for Background Cloud Run
              </span>
            </div>

            {/* Quick snippet list */}
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
              {parsedChapters.slice(0, 5).map(c => (
                <div
                  key={c.index}
                  className="flex items-center justify-between p-1.5 rounded bg-neutral-950/80 border border-neutral-800/60 text-neutral-300 text-[11px]"
                >
                  <span className="font-medium text-emerald-300 truncate max-w-[200px]">
                    {c.title}
                  </span>
                  <span className="text-neutral-500 shrink-0">
                    {formatNumber(c.wordCount)} words
                  </span>
                </div>
              ))}
              {parsedChapters.length > 5 && (
                <p className="text-[11px] text-neutral-500 text-center py-1">
                  ...and {parsedChapters.length - 5} more chapters
                </p>
              )}
            </div>

            {/* Start Translation Button */}
            <button
              onClick={handleStartTranslation}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs tracking-wide uppercase transition-colors shadow-lg cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <span>Starting Background Translation...</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Start Cloud Translation ({parsedChapters.length} Chapters)</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
