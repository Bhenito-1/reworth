"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const THRESHOLD_PX = 52;
const MAX_PULL_PX = 64;

type Props = {
  onRefresh: () => void | Promise<void>;
  children: ReactNode;
  className?: string;
  enabled?: boolean;
};

function windowScrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

/**
 * Pull-to-refresh with rubber-band page motion. Touch, mouse drag, and
 * trackpad/wheel overscroll at the top of the page.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className = "",
  enabled = true,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const pointerKind = useRef<"touch" | "mouse" | "wheel" | null>(null);
  const offsetRef = useRef(0);
  const refreshingRef = useRef(false);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const applyOffset = useCallback((value: number, animate: boolean) => {
    offsetRef.current = value;
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    const arrow = arrowRef.current;
    if (content) {
      content.style.transition = animate
        ? "transform 180ms cubic-bezier(0.2, 0.85, 0.25, 1)"
        : "none";
      content.style.transform = `translateY(${value}px)`;
    }
    if (indicator) {
      indicator.style.transition = animate
        ? "transform 160ms cubic-bezier(0.2, 0.85, 0.25, 1), opacity 120ms ease"
        : "opacity 60ms linear";
      indicator.style.transform = `translateY(${Math.max(value - 28, 0)}px)`;
      indicator.style.opacity =
        value > 8 || refreshingRef.current ? "1" : "0";
    }
    if (arrow && !refreshingRef.current) {
      arrow.style.transition = animate ? "transform 140ms ease" : "none";
      arrow.style.transform = `rotate(${Math.min(180, (value / THRESHOLD_PX) * 180)}deg)`;
    }
    setArmed(value >= THRESHOLD_PX);
    setShowHint(value > 8);
  }, []);

  const finishPull = useCallback(() => {
    const current = offsetRef.current;
    pulling.current = false;
    pointerKind.current = null;
    if (current < THRESHOLD_PX || refreshingRef.current) {
      applyOffset(0, true);
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    applyOffset(Math.min(THRESHOLD_PX, 40), true);
    void Promise.resolve(onRefresh())
      .catch(() => undefined)
      .finally(() => {
        refreshingRef.current = false;
        setRefreshing(false);
        applyOffset(0, true);
      });
  }, [applyOffset, onRefresh]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;

    const begin = (y: number, kind: "touch" | "mouse") => {
      if (refreshingRef.current) return;
      if (windowScrollTop() > 2) return;
      startY.current = y;
      pulling.current = true;
      pointerKind.current = kind;
    };

    const move = (y: number, event?: Event) => {
      if (!pulling.current || refreshingRef.current) return;
      if (windowScrollTop() > 2) {
        pulling.current = false;
        pointerKind.current = null;
        applyOffset(0, true);
        return;
      }
      const delta = y - startY.current;
      if (delta <= 0) {
        applyOffset(0, false);
        return;
      }
      const resisted = Math.min(MAX_PULL_PX, delta * 0.28);
      applyOffset(resisted, false);
      if (resisted > 6 && event && "cancelable" in event && event.cancelable) {
        event.preventDefault();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      begin(e.touches[0]?.clientY ?? 0, "touch");
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pointerKind.current !== "touch") return;
      move(e.touches[0]?.clientY ?? 0, e);
    };
    const onTouchEnd = () => {
      if (pointerKind.current !== "touch") return;
      finishPull();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, button, a, select, [role='button']")) {
        return;
      }
      begin(e.clientY, "mouse");
    };
    const onMouseMove = (e: MouseEvent) => {
      if (pointerKind.current !== "mouse") return;
      move(e.clientY, e);
    };
    const onMouseUp = () => {
      if (pointerKind.current !== "mouse") return;
      finishPull();
    };

    const onWheel = (e: WheelEvent) => {
      if (refreshingRef.current) return;
      if (windowScrollTop() > 2 && offsetRef.current <= 0) return;

      // Pulling down = scrolling "up" (negative deltaY) while already at top.
      if (e.deltaY < 0 || offsetRef.current > 0) {
        const next = Math.min(
          MAX_PULL_PX,
          Math.max(0, offsetRef.current + -e.deltaY * 0.22),
        );
        if (next > 0 || offsetRef.current > 0) {
          e.preventDefault();
          pointerKind.current = "wheel";
          pulling.current = true;
          applyOffset(next, false);
          if (wheelTimer.current) clearTimeout(wheelTimer.current);
          wheelTimer.current = setTimeout(() => {
            if (pointerKind.current === "wheel") finishPull();
          }, 120);
        }
      }
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchEnd);
    root.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    root.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
      root.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      root.removeEventListener("wheel", onWheel);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, [enabled, applyOffset, finishPull]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div
        ref={indicatorRef}
        aria-hidden={!showHint && !refreshing}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
        style={{ opacity: 0 }}
      >
        <div
          className={[
            "mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--rw-border)] bg-[var(--rw-bg-elevated)] shadow-sm text-sm",
            refreshing || armed
              ? "text-[var(--rw-accent)]"
              : "text-[var(--rw-ink-muted)]",
          ].join(" ")}
        >
          <span
            ref={arrowRef}
            className={[
              "inline-block text-lg leading-none",
              refreshing ? "animate-spin" : "",
            ].join(" ")}
            aria-hidden
          >
            {refreshing ? "⟳" : "↓"}
          </span>
        </div>
      </div>

      <div ref={contentRef} style={{ willChange: "transform" }}>
        {children}
      </div>
    </div>
  );
}
