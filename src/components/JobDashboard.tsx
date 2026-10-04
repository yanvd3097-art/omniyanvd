import React, { useState } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Download,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  ListFilter,
  FileDown,
  Clock,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import { JobStatus } from '../types/index.js';
import { formatNumber, formatTimeAgo } from '../utils/formatters.js';

interface JobDashboardProps {
  status: JobStatus;
  dataSaver: boolean;
  onRefresh: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onOpenReader: () => void;
  onOpenChapterList: () => void;
  onOpenKeysModal: () => void;
  isRefreshing: boolean;
}

export const JobDashboard: React.FC<JobDashboardProps> = ({
  status,
  dataSaver,
  onRefresh,
  onPause,
  onResume,
  onDelete,
  onOpenReader,
  onOpenChapterList,
  onOpenKeysModal,
  isRefreshing,
}) => {
  const [downloadingEpub, setDownloadingEpub] = useState(false);
  const [downloadingTxt, setDownloadingTxt] = useState(false);

  const percent = status.totalChapters > 0
    ? Math.min(100, Math.round((status.completedChapters / status.totalChapters) * 100))
    : 0;

  const isRunning = status.status === 'running';
  const isCompleted = status.status === 'completed';
  const has20kWords = status.translatedWords >= 20000;
  const canDownloadPartial = status.completedChapters > 0;

  const handleDownloadEpub = async (partial: boolean) => {
    setDownloadingEpub(true);
    try {
      const url = `/api/jobs/${status.id}/download/epub?partial=${partial}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('EPUB generation failed');
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const sanitized = status.title.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
      a.download = partial
        ? `${sanitized}_ch1-${status.completedChapters}.epub`
        : `${sanitized}_full.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert('Download error: ' + err.message);
    } finally {
      setDownloadingEpub(false);
    }
  };

  const handleDownloadTxt = async (partial: boolean) => {
    setDownloadingTxt(true);
    try {
      const url = `/api/jobs/${status.id}/download/txt?partial=${partial}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('TXT export failed');
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const sanitized = status.title.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
      a.download = `${sanitized}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert('Download error: ' + err.message);
    } finally {
      setDownloadingTxt(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Main Status Container */}
      <div className="p-4 sm:p-6 rounded-xl bg-neutral-900/90 border border-neutral-800 shadow-xl space-y-5">
        {/* Title & Status Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800/80 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                isRunning
                  ? 'bg-emerald-400 animate-ping'
                  : isCompleted
                  ? 'bg-emerald-400'
                  : 'bg-amber-400'
              }`} />
              <h2 className="text-base sm:text-lg font-bold text-neutral-100 truncate max-w-[280px] sm:max-w-md">
                {status.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="font-mono">{status.sourceLang} → {status.targetLang}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-neutral-500" />
                Updated {formatTimeAgo(status.updatedAt)}
              </span>
              <span>•</span>
              <span className="text-[11px] text-emerald-400/90 font-mono">
                ~0.2 KB check
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Manual status check (only ~200 bytes)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-mono transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Check</span>
            </button>

            {isRunning ? (
              <button
                onClick={onPause}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            ) : !isCompleted ? (
              <button
                onClick={onResume}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume</span>
              </button>
            ) : null}

            <button
              onClick={onDelete}
              title="Delete translation job"
              className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-neutral-800/80 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Big Progress Bar & Key Numbers */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-xs">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
                {percent}%
              </span>
              <span className="text-neutral-400 font-mono">
                ({status.completedChapters} / {status.totalChapters} chapters)
              </span>
            </div>

            <div className="text-right">
              <span className="font-mono text-neutral-200 font-semibold text-sm">
                {formatNumber(status.translatedWords)}
              </span>
              <span className="text-neutral-400 text-xs ml-1 font-mono">words ready</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-neutral-950 rounded-full h-3 border border-neutral-800 overflow-hidden relative">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500 relative"
              style={{ width: `${percent}%` }}
            >
              {isRunning && (
                <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
              )}
            </div>
          </div>

          {/* Current chapter status ticker */}
          <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 font-mono">
            <span className="truncate max-w-[260px] sm:max-w-md">
              {isRunning ? (
                <>
                  <span className="text-emerald-400">Currently translating:</span>{' '}
                  {status.currentChapterTitle || `Chapter ${status.currentChapterIndex || ''}`}
                </>
              ) : isCompleted ? (
                <span className="text-emerald-400">✓ All chapters translated successfully!</span>
              ) : (
                <span className="text-amber-400">Paused • Tap resume to continue translation</span>
              )}
            </span>

            {/* Key rotation badge */}
            <button
              onClick={onOpenKeysModal}
              className="flex items-center gap-1 hover:text-amber-300 transition-colors shrink-0 text-amber-400/90 font-mono"
            >
              <KeyRound className="w-3 h-3" />
              <span>Key #{status.activeKeyIndex + 1}/{Math.max(status.totalKeys, 1)}</span>
            </button>
          </div>
        </div>

        {/* Sensitive Chapters Notification (Google Translate Fallback) */}
        {status.sensitiveChaptersCount > 0 && (
          <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-xs text-amber-300 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-amber-200">
                {status.sensitiveChaptersCount} Sensitive Chapter(s) Translated with Google Translate
              </span>
              <p className="text-neutral-400 text-[11px] leading-relaxed">
                Gemini content filters flagged specific sensitive scenes. As instructed, only those sensitive chapters were automatically translated via Google Translate without missing a single sentence, while all other chapters continue using Gemini.
              </p>
            </div>
          </div>
        )}

        {/* 20k Words Notice & Instant Download Highlight */}
        {canDownloadPartial && (
          <div className={`p-4 rounded-xl border transition-all ${
            has20kWords
              ? 'bg-gradient-to-r from-emerald-950/50 to-neutral-900 border-emerald-500/50 shadow-emerald-950/40 shadow-lg'
              : 'bg-neutral-950/60 border-neutral-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs sm:text-sm font-bold text-neutral-100">
                    {has20kWords ? '🔥 Milestone: Over 20k English Words Ready!' : 'Chapters Ready for Immediate Reading'}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/60">
                    Live Stream
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Download chapters 1 through {status.completedChapters} right now into your e-reader or phone without stopping the ongoing background translation!
                </p>
              </div>

              {/* Download Partial EPUB Button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadEpub(true)}
                  disabled={downloadingEpub}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs shadow-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Download className={`w-4 h-4 ${downloadingEpub ? 'animate-bounce' : ''}`} />
                  <span>
                    {downloadingEpub
                      ? 'Building EPUB...'
                      : `Download EPUB (${status.completedChapters} Ch)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Row: Read in App, Chapter List, TXT Download */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <button
            onClick={onOpenReader}
            disabled={status.completedChapters === 0}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 text-xs font-semibold text-neutral-200 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>Read in App (Offline)</span>
          </button>

          <button
            onClick={onOpenChapterList}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 text-xs font-semibold text-neutral-200 transition-colors cursor-pointer"
          >
            <ListFilter className="w-4 h-4 text-neutral-400" />
            <span>View Chapters ({status.totalChapters})</span>
          </button>

          <button
            onClick={() => handleDownloadTxt(true)}
            disabled={downloadingTxt || status.completedChapters === 0}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 text-xs font-semibold text-neutral-200 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <FileDown className="w-4 h-4 text-neutral-400" />
            <span>Download .TXT</span>
          </button>
        </div>

        {/* Cloud Persistence Guarantee Card */}
        <div className="p-3 rounded-lg bg-neutral-950/40 border border-neutral-800/60 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Cloud background worker is active. You can safely close this tab or your phone.</span>
          </div>
          <span className="font-mono text-[11px] text-neutral-500 hidden sm:inline">
            Status checks: ~0.2 KB
          </span>
        </div>
      </div>
    </div>
  );
};
