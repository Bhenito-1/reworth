/**
 * Shared PWA install state. beforeinstallprompt is kept in memory only —
 * never localStorage. Chrome must provide a fresh event to call prompt().
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPlatform = "android" | "ios" | "desktop";

export type InstallGuide = {
  title: string;
  steps: string[];
};

type Listener = () => void;

declare global {
  interface Window {
    __rwDeferredInstall?: BeforeInstallPromptEvent | null;
    __rwPwaListenersInstalled?: boolean;
  }
}

const INSTALLED_PREF_KEY = "rw-pwa-installed";

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function getInstallPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(INSTALLED_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setInstallPreference(installed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (installed) localStorage.setItem(INSTALLED_PREF_KEY, "1");
    else localStorage.removeItem(INSTALLED_PREF_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export function isInstalledApp(): boolean {
  return isStandaloneDisplay() || getInstallPreference();
}

export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Mac") && "ontouchend" in document)
  ) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function getInstallGuide(platform: InstallPlatform = detectInstallPlatform()): InstallGuide {
  if (platform === "ios") {
    return {
      title: "Install ReWorth on iPhone",
      steps: [
        "Open ReWorth in Safari.",
        "Tap the Share icon.",
        "Select Add to Home Screen.",
        "Tap Add.",
      ],
    };
  }
  if (platform === "android") {
    return {
      title: "Install ReWorth on Android",
      steps: [
        "Open ReWorth in Chrome.",
        "Tap the three-dot menu.",
        "Select Install app or Add to Home screen.",
        "Confirm installation.",
      ],
    };
  }
  return {
    title: "Install ReWorth on desktop",
    steps: [
      "Open ReWorth in Chrome.",
      "Open the Chrome menu (⋮).",
      "Select Cast, save and share (or the equivalent menu section).",
      "Select Install ReWorth or Install page as app, if available.",
    ],
  };
}

export function getDeferredInstall(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__rwDeferredInstall ?? null;
}

export function subscribePwaInstall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Idempotent. Captures BIP in memory only (never localStorage). */
export function ensurePwaInstallListeners(): void {
  if (typeof window === "undefined") return;
  if (window.__rwPwaListenersInstalled) return;
  window.__rwPwaListenersInstalled = true;
  if (window.__rwDeferredInstall === undefined) {
    window.__rwDeferredInstall = null;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__rwDeferredInstall = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    window.__rwDeferredInstall = null;
    setInstallPreference(true);
    emit();
  });
}

/**
 * Register SW and claim this tab. Required for Chrome installability.
 */
export async function ensureServiceWorkerControlled(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  ensurePwaInstallListeners();

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    await navigator.serviceWorker.ready;

    if (navigator.serviceWorker.controller) {
      emit();
      return true;
    }

    if (reg.active) {
      reg.active.postMessage({ type: "CLAIM_CLIENTS" });
      await new Promise((r) => setTimeout(r, 300));
      if (navigator.serviceWorker.controller) {
        emit();
        return true;
      }
      if (!sessionStorage.getItem("rw-sw-control-reload")) {
        sessionStorage.setItem("rw-sw-control-reload", "1");
        const url = new URL(window.location.href);
        url.searchParams.set("sw", String(Date.now()));
        window.location.replace(url.toString());
        return false;
      }
    }

    emit();
    return Boolean(navigator.serviceWorker.controller);
  } catch {
    emit();
    return false;
  }
}

/**
 * Call only from a user gesture. Uses the in-memory deferred prompt if present.
 */
export async function promptNativeInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const event = getDeferredInstall();
  if (!event) return "unavailable";
  try {
    await event.prompt();
    const choice = await event.userChoice;
    window.__rwDeferredInstall = null;
    if (choice.outcome === "accepted") {
      setInstallPreference(true);
      emit();
      return "accepted";
    }
    emit();
    return "dismissed";
  } catch {
    emit();
    return "unavailable";
  }
}

if (typeof window !== "undefined") {
  ensurePwaInstallListeners();
}
