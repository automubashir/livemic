import { useCallback, useEffect, useRef, useState } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (t: string, cb: () => void) => void;
};

/**
 * Keeps the phone screen awake while `active` is true.
 * Re-acquires the lock when the tab returns to the foreground.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [held, setHeld] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  const request = useCallback(async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    if (sentinelRef.current && !sentinelRef.current.released) return;
    try {
      const wl = navigator as unknown as {
        wakeLock: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      };
      const sentinel = await wl.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setHeld(true);
      sentinel.addEventListener("release", () => {
        setHeld(false);
      });
    } catch {
      setHeld(false);
    }
  }, []);

  const release = useCallback(async () => {
    const s = sentinelRef.current;
    sentinelRef.current = null;
    setHeld(false);
    if (s && !s.released) {
      try { await s.release(); } catch { /* noop */ }
    }
  }, []);

  useEffect(() => {
    if (active) void request();
    else void release();
  }, [active, request, release]);

  useEffect(() => {
    const onVisible = () => {
      if (active && document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active, request]);

  useEffect(() => () => { void release(); }, [release]);

  return { held, supported };
}