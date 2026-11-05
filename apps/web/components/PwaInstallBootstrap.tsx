"use client";

import { useEffect } from "react";
import {
  ensurePwaInstallListeners,
  ensureServiceWorkerControlled,
} from "../lib/pwa-install";

// Module scope: attach BIP listener before React effects run.
ensurePwaInstallListeners();

/** Boots SW control + install listeners for the whole app. */
export function PwaInstallBootstrap() {
  useEffect(() => {
    ensurePwaInstallListeners();
    void ensureServiceWorkerControlled();
  }, []);

  return null;
}
