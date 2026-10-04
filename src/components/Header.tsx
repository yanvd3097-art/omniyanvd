import React from 'react';
import { KeyRound, Shield, Wifi, Bell, PlusCircle, Lock } from 'lucide-react';

interface HeaderProps {
  apiKeysCount: number;
  dataSaver: boolean;
  onToggleDataSaver: () => void;
  onOpenKeysModal: () => void;
  onOpenTelegramModal: () => void;
  onOpenPasscodeModal: () => void;
  onNewTranslation: () => void;
  isLocked: boolean;
  passcodeConfigured: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  apiKeysCount,
  dataSaver,
  onToggleDataSaver,
  onOpenKeysModal,
  onOpenTelegramModal,
  onOpenPasscodeModal,
  onNewTranslation,
  isLocked,
  passcodeConfigured,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800/80 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm tracking-wider font-mono">
            M
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-neutral-100">
                MegaTXT <span className="text-emerald-400 font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/50">LITE</span>
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Cloud Worker Ready" />
            </div>
            <p className="text-[11px] text-neutral-400 hidden sm:block">
              Cloud Background Novel Translator • Zero-Data Bloat
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Data Saver Mode Toggle */}
          <button
            onClick={onToggleDataSaver}
            title={dataSaver ? "Data Saver: ON (Polls 0.2 KB every 25s)" : "Data Saver: OFF (Polls every 8s)"}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors border ${
              dataSaver
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Data Saver:</span>
            <span>{dataSaver ? 'ON' : 'OFF'}</span>
          </button>

          {/* API Keys Manager */}
          <button
            onClick={onOpenKeysModal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-neutral-100 hover:border-neutral-700 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono text-amber-400">{apiKeysCount}</span>
            <span className="hidden sm:inline">Keys</span>
          </button>

          {/* Telegram Alerts */}
          <button
            onClick={onOpenTelegramModal}
            title="Configure Telegram Notifications"
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors"
          >
            <Bell className="w-3.5 h-3.5" />
          </button>

          {/* PIN Lock */}
          <button
            onClick={onOpenPasscodeModal}
            title={passcodeConfigured ? "Passcode Lock Active" : "Configure PIN Lock"}
            className={`p-1.5 rounded-md border transition-colors ${
              passcodeConfigured
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Shield className="w-3.5 h-3.5" />}
          </button>

          {/* New Translation Button */}
          <button
            onClick={onNewTranslation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-sm transition-colors cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
        </div>
      </div>
    </header>
  );
};
