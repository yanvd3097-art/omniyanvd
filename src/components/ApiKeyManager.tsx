import React, { useState } from 'react';
import { KeyRound, CheckCircle2, AlertCircle, RefreshCw, X, ShieldAlert, Plus, Trash2, HelpCircle } from 'lucide-react';

interface ApiKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
  keys: string[];
  onSaveKeys: (newKeys: string[]) => void;
  activeKeyIndex?: number;
}

interface KeyTestResult {
  index: number;
  status: 'valid' | 'rate_limited' | 'invalid' | 'empty';
  prefix: string;
  message: string;
}

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({
  isOpen,
  onClose,
  keys,
  onSaveKeys,
  activeKeyIndex = 0,
}) => {
  const [keyInputList, setKeyInputList] = useState<string[]>(() => {
    return keys.length > 0 ? [...keys] : ['', '', '', '', '']; // 5 empty slots default
  });
  const [bulkInput, setBulkInput] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<KeyTestResult[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleKeyChange = (index: number, val: string) => {
    const next = [...keyInputList];
    next[index] = val;
    setKeyInputList(next);
  };

  const handleAddSlot = () => {
    setKeyInputList([...keyInputList, '']);
  };

  const handleRemoveSlot = (index: number) => {
    const next = keyInputList.filter((_, i) => i !== index);
    setKeyInputList(next.length > 0 ? next : ['']);
  };

  const handleApplyBulk = () => {
    const extracted = bulkInput
      .split(/[\n,;]+/)
      .map(k => k.trim())
      .filter(Boolean);
    if (extracted.length > 0) {
      setKeyInputList(extracted);
      setShowBulk(false);
      setBulkInput('');
    }
  };

  const handleTestKeys = async () => {
    const validCandidates = keyInputList.map(k => k.trim()).filter(Boolean);
    if (validCandidates.length === 0) {
      setTestError('Please enter at least one API key to test 🌸');
      return;
    }

    setTesting(true);
    setTestResults(null);
    setTestError(null);
    try {
      const res = await fetch('/api/test-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: validCandidates }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.results);
      } else {
        setTestError(data.error || 'Failed to test keys');
      }
    } catch (e: any) {
      setTestError('Key test failed: ' + (e?.message || 'Network error'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const cleaned = keyInputList.map(k => k.trim()).filter(Boolean);
    onSaveKeys(cleaned);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-neutral-100">Gemini Multi-Key Manager</h2>
              <p className="text-xs text-neutral-400">Rotate across 5+ keys to avoid rate limits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Info Banner */}
          <div className="p-3 rounded-lg bg-neutral-950/80 border border-neutral-800 text-xs text-neutral-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Full compatibility with AQ... & AIza... keys</span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              When translating large webnovels, MegaTXT automatically round-robins across your configured keys. If a key hits rate limit (429), it switches to the next project instantly without stopping your translation.
            </p>
          </div>

          {/* Toggle between slots or bulk paste */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider font-mono">
              Configured Keys ({keyInputList.filter(k => k.trim()).length})
            </span>
            <button
              onClick={() => setShowBulk(!showBulk)}
              className="text-xs text-emerald-400 hover:text-emerald-300 underline font-mono"
            >
              {showBulk ? 'Switch to Individual Slots' : '⚡ Bulk Paste (All 5 Keys)'}
            </button>
          </div>

          {showBulk ? (
            <div className="space-y-2">
              <p className="text-xs text-neutral-400">Paste multiple keys, one per line or separated by commas:</p>
              <textarea
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                placeholder={"AQ...\nAQ...\nAQ...\nAQ...\nAQ..."}
                rows={5}
                className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-hidden focus:border-emerald-500"
              />
              <button
                onClick={handleApplyBulk}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-neutral-950 font-semibold text-xs transition-colors"
              >
                Apply Pasted Keys
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {keyInputList.map((keyVal, idx) => {
                const isActive = idx === activeKeyIndex && keyVal.trim().length > 0;
                const result = testResults?.find(r => r.index === idx);

                return (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-mono text-xs w-6 text-neutral-500 text-right shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="relative flex-1">
                      <input
                        type="password"
                        value={keyVal}
                        onChange={e => handleKeyChange(idx, e.target.value)}
                        placeholder={`Gemini API Key #${idx + 1} (starts with AQ... or AIza...)`}
                        className={`w-full px-3 py-2 rounded-lg bg-neutral-950 border text-xs font-mono text-neutral-200 placeholder:text-neutral-600 focus:outline-hidden transition-colors ${
                          isActive
                            ? 'border-emerald-500/80 ring-1 ring-emerald-500/30'
                            : 'border-neutral-800 focus:border-neutral-600'
                        }`}
                      />
                      {isActive && (
                        <span className="absolute right-2.5 top-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                          Active
                        </span>
                      )}
                    </div>

                    {result && (
                      <span
                        title={result.message}
                        className={`text-xs px-2 py-1 rounded shrink-0 font-mono text-[11px] ${
                          result.status === 'valid'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : result.status === 'rate_limited'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {result.status === 'valid' ? '✓ OK' : result.status === 'rate_limited' ? '429 Rate' : 'Error'}
                      </span>
                    )}

                    <button
                      onClick={() => handleRemoveSlot(idx)}
                      className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 rounded transition-colors shrink-0"
                      title="Remove key"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              <button
                onClick={handleAddSlot}
                className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded border border-dashed border-neutral-800 hover:border-neutral-700 w-full justify-center mt-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add another key slot</span>
              </button>
            </div>
          )}

          {/* Test Error Message */}
          {testError && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{testError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between gap-2">
          <button
            onClick={handleTestKeys}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? 'Testing...' : 'Test Connectivity'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-sm transition-colors cursor-pointer"
            >
              Save Keys
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
