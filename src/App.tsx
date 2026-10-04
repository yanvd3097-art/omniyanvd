import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header.js';
import { UploadSection } from './components/UploadSection.js';
import { JobDashboard } from './components/JobDashboard.js';
import { ApiKeyManager } from './components/ApiKeyManager.js';
import { ChapterListModal } from './components/ChapterListModal.js';
import { LightweightReader } from './components/LightweightReader.js';
import { PasscodeModal } from './components/PasscodeModal.js';
import { TelegramModal } from './components/TelegramModal.js';
import { JobStatus, JobDetail } from './types/index.js';
import {
  getStoredApiKeys,
  saveStoredApiKeys,
  getDataSaverMode,
  setDataSaverMode,
  getPasscode,
  setPasscode,
  getLastActiveJobId,
  setLastActiveJobId,
} from './utils/storage.js';
import { BookOpen, History, Layers, PlusCircle, ShieldCheck } from 'lucide-react';

export default function App() {
  // Stored preferences
  const [apiKeys, setApiKeys] = useState<string[]>(getStoredApiKeys);
  const [dataSaver, setDataSaver] = useState<boolean>(getDataSaverMode);
  const [passcode, setStoredPasscode] = useState<string | null>(getPasscode);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(!getPasscode());

  // Job state
  const [activeJobId, setActiveJobId] = useState<string | null>(getLastActiveJobId);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [allJobs, setAllJobs] = useState<JobStatus[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'upload' | 'dashboard' | 'reader'>('upload');

  // Modals state
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [showChapterList, setShowChapterList] = useState(false);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [readerChapterIndex, setReaderChapterIndex] = useState(1);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch lightweight status (~200 bytes)
  const fetchStatus = useCallback(async (jobId: string) => {
    if (!jobId) return;
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.status) {
          setJobStatus(data.status);
        }
      }
    } catch (err) {
      console.error('Error fetching job status:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // 2. Fetch full chapter list details (without full texts)
  const fetchJobDetail = useCallback(async (jobId: string) => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/details`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.job) {
          setJobDetail(data.job);
        }
      }
    } catch (err) {
      console.error('Error fetching job detail:', err);
    }
  }, []);

  // 3. Fetch all jobs summary
  const fetchAllJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.jobs)) {
          setAllJobs(data.jobs.filter(Boolean));
          // If no active job but jobs exist, pick the most recent
          if (!activeJobId && data.jobs.length > 0) {
            setActiveJobId(data.jobs[0].id);
            setLastActiveJobId(data.jobs[0].id);
            setViewMode('dashboard');
          }
        }
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  }, [activeJobId]);

  // Initial load
  useEffect(() => {
    fetchAllJobs();
  }, [fetchAllJobs]);

  // Handle active job changes
  useEffect(() => {
    if (activeJobId) {
      fetchStatus(activeJobId);
      setViewMode('dashboard');
    }
  }, [activeJobId, fetchStatus]);

  // Polling logic:
  // When activeJobId is running, poll every 25s (if dataSaver=true) or 8s (if dataSaver=false).
  // When tab is hidden / browser closed, pause polling to save mobile data!
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (!activeJobId) return;

    const intervalMs = dataSaver ? 25000 : 8000;

    const poll = () => {
      // Don't poll if browser tab is hidden to save mobile data!
      if (document.visibilityState === 'hidden') return;
      if (jobStatus?.status === 'running') {
        fetchStatus(activeJobId);
      }
    };

    pollTimerRef.current = setInterval(poll, intervalMs);

    // On visibility change (e.g. user unlocks phone or re-opens tab after 15 mins):
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeJobId) {
        // Immediate data-saving single check
        fetchStatus(activeJobId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeJobId, dataSaver, jobStatus?.status, fetchStatus]);

  // Handlers
  const handleJobCreated = (newJobId: string) => {
    setActiveJobId(newJobId);
    setLastActiveJobId(newJobId);
    setViewMode('dashboard');
    fetchStatus(newJobId);
    fetchAllJobs();
  };

  const handlePauseJob = async () => {
    if (!activeJobId) return;
    try {
      const res = await fetch(`/api/jobs/${activeJobId}/pause`, { method: 'POST' });
      if (res.ok) {
        fetchStatus(activeJobId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResumeJob = async () => {
    if (!activeJobId) return;
    try {
      const res = await fetch(`/api/jobs/${activeJobId}/start`, { method: 'POST' });
      if (res.ok) {
        fetchStatus(activeJobId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteJob = async () => {
    if (!activeJobId) return;
    if (!confirm('Are you sure you want to delete this translation job?')) return;
    try {
      await fetch(`/api/jobs/${activeJobId}`, { method: 'DELETE' });
      setActiveJobId(null);
      setLastActiveJobId(null);
      setJobStatus(null);
      setViewMode('upload');
      fetchAllJobs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveApiKeys = async (newKeys: string[]) => {
    setApiKeys(newKeys);
    saveStoredApiKeys(newKeys);
    // If there is an active job, also update its keys on the server
    if (activeJobId) {
      try {
        await fetch(`/api/jobs/${activeJobId}/keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: newKeys }),
        });
        fetchStatus(activeJobId);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleToggleDataSaver = () => {
    const next = !dataSaver;
    setDataSaver(next);
    setDataSaverMode(next);
  };

  const handleOpenReader = (chapterIndex: number = 1) => {
    setReaderChapterIndex(chapterIndex);
    setViewMode('reader');
  };

  const handleOpenChapterList = () => {
    if (activeJobId) {
      fetchJobDetail(activeJobId);
    }
    setShowChapterList(true);
  };

  // If passcode enabled and locked, show passcode modal blocking content
  if (passcode && !isUnlocked) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <PasscodeModal
          isOpen={true}
          onClose={() => {}}
          currentPin={passcode}
          onSetPin={p => setStoredPasscode(p)}
          isUnlocked={false}
          onUnlockSuccess={() => setIsUnlocked(true)}
        />
      </div>
    );
  }

  // Reader View Mode
  if (viewMode === 'reader' && activeJobId && jobStatus) {
    return (
      <>
        <LightweightReader
          jobId={activeJobId}
          bookTitle={jobStatus.title}
          initialChapterIndex={readerChapterIndex}
          totalChapters={jobStatus.totalChapters}
          onClose={() => setViewMode('dashboard')}
          onOpenChapterList={handleOpenChapterList}
        />
        <ChapterListModal
          isOpen={showChapterList}
          onClose={() => setShowChapterList(false)}
          chapters={jobDetail?.chapters || []}
          onSelectChapter={idx => setReaderChapterIndex(idx)}
          title={jobStatus.title}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* App Header */}
      <Header
        apiKeysCount={apiKeys.length}
        dataSaver={dataSaver}
        onToggleDataSaver={handleToggleDataSaver}
        onOpenKeysModal={() => setShowKeysModal(true)}
        onOpenTelegramModal={() => setShowTelegramModal(true)}
        onOpenPasscodeModal={() => setShowPasscodeModal(true)}
        onNewTranslation={() => setViewMode('upload')}
        isLocked={!isUnlocked}
        passcodeConfigured={!!passcode}
      />

      {/* Main App Body */}
      <main className="max-w-4xl mx-auto w-full px-3 sm:px-6 py-6 flex-1 space-y-6">
        {/* Previous Jobs Selector Bar (if jobs exist) */}
        {allJobs.length > 0 && (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-xs overflow-x-auto">
            <div className="flex items-center gap-1.5 shrink-0 text-neutral-400 font-medium">
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>Novels:</span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {allJobs.map(j => {
                const isSelected = activeJobId === j.id && viewMode === 'dashboard';
                return (
                  <button
                    key={j.id}
                    onClick={() => {
                      setActiveJobId(j.id);
                      setLastActiveJobId(j.id);
                      setViewMode('dashboard');
                      fetchStatus(j.id);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold'
                        : 'bg-neutral-950/80 text-neutral-400 hover:text-neutral-200 border border-neutral-800/80'
                    }`}
                  >
                    <span className="truncate max-w-[120px]">{j.title}</span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      ({j.completedChapters}/{j.totalChapters})
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setViewMode('upload')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 whitespace-nowrap shrink-0 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>
        )}

        {/* View Switcher: Upload Section vs Active Job Dashboard */}
        {viewMode === 'upload' ? (
          <UploadSection
            onJobCreated={handleJobCreated}
            apiKeys={apiKeys}
            onOpenKeysModal={() => setShowKeysModal(true)}
          />
        ) : jobStatus ? (
          <JobDashboard
            status={jobStatus}
            dataSaver={dataSaver}
            onRefresh={() => activeJobId && fetchStatus(activeJobId)}
            onPause={handlePauseJob}
            onResume={handleResumeJob}
            onDelete={handleDeleteJob}
            onOpenReader={() => handleOpenReader(1)}
            onOpenChapterList={handleOpenChapterList}
            onOpenKeysModal={() => setShowKeysModal(true)}
            isRefreshing={isRefreshing}
          />
        ) : (
          <div className="text-center py-16 space-y-3">
            <p className="text-xs font-mono text-neutral-500">No active job selected.</p>
            <button
              onClick={() => setViewMode('upload')}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-neutral-950 font-bold text-xs"
            >
              Upload a Novel
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 py-4 text-center text-xs text-neutral-500 font-mono">
        <p>MegaTXT Lite • Cloud Background Worker • Safe Fallback • Zero Data Waste</p>
      </footer>

      {/* Modals */}
      <ApiKeyManager
        isOpen={showKeysModal}
        onClose={() => setShowKeysModal(false)}
        keys={apiKeys}
        onSaveKeys={handleSaveApiKeys}
        activeKeyIndex={jobStatus?.activeKeyIndex || 0}
      />

      <ChapterListModal
        isOpen={showChapterList}
        onClose={() => setShowChapterList(false)}
        chapters={jobDetail?.chapters || []}
        onSelectChapter={idx => handleOpenReader(idx)}
        title={jobStatus?.title || 'Novel Chapters'}
      />

      <PasscodeModal
        isOpen={showPasscodeModal}
        onClose={() => setShowPasscodeModal(false)}
        currentPin={passcode}
        onSetPin={p => {
          setStoredPasscode(p);
          setPasscode(p);
        }}
        isUnlocked={isUnlocked}
        onUnlockSuccess={() => setIsUnlocked(true)}
      />

      <TelegramModal
        isOpen={showTelegramModal}
        onClose={() => setShowTelegramModal(false)}
        onConfigSaved={() => {}}
      />
    </div>
  );
}
