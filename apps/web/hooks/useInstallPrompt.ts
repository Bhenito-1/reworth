"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectInstallPlatform,
  ensurePwaInstallListeners,
  ensureServiceWorkerControlled,
  getDeferredInstall,
  getInstallGuide,
  isInstalledApp,
  promptNativeInstall,
  subscribePwaInstall,
  type InstallGuide,
  type InstallPlatform,
} from "../lib/pwa-install";

export type UseInstallPromptResult = {
  /** Already running as an installed app (or user preference). */
  isInstalled: boolean;
  /** Chrome has given us a fresh beforeinstallprompt event. */
  canPrompt: boolean;
  platform: InstallPlatform;
  guide: InstallGuide;
  /** Native prompt when available; otherwise caller should show `guide`. */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

/**
 * Step 1 — install prompt hook.
 * Keeps deferredPrompt in memory only; never localStorage.
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const [isInstalled, setIsInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");

  useEffect(() => {
    ensurePwaInstallListeners();
    const sync = () => {
      setIsInstalled(isInstalledApp());
      setCanPrompt(Boolean(getDeferredInstall()));
      setPlatform(detectInstallPlatform());
    };
    sync();
    const unsubscribe = subscribePwaInstall(sync);
    void ensureServiceWorkerControlled().then(sync);
    return unsubscribe;
  }, []);

  const promptInstall = useCallback(() => promptNativeInstall(), []);

  return {
    isInstalled,
    canPrompt,
    platform,
    guide: getInstallGuide(platform),
    promptInstall,
  };
}
