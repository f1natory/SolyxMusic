import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayerState } from "@ui/hooks/usePlayerState";
import { VisualLyrics } from "./VisualLyrics";
import { LyricsPlayer } from "./LyricsPlayer";
import {
  getRootStore,
  getNativeSyncLyricsLines,
  requestNativeLyrics,
  isSameTrackId,
  type NativeLyricLine,
} from "./extractNativeLyrics";
import type { SimpleLyricLine } from "@ui/lib/lyrics";
import type { LyricLine as VisualLyricLine } from "@visual/interfaces.ts";

const EASE = [0.16, 1, 0.3, 1] as const;

class BoundedCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }
}

function convertNativeToVisual(nativeLines: NativeLyricLine[]): {
  visual: VisualLyricLine[];
  simple: SimpleLyricLine[];
} {
  const simple: SimpleLyricLine[] = nativeLines.map((l) => ({
    t: l.fromSec,
    text: l.text,
  }));

  const visual: VisualLyricLine[] = nativeLines.map((l, idx) => {
    const startMs = Math.round(l.fromSec * 1000);
    const nextLine = nativeLines[idx + 1];
    let endMs: number;
    if (l.toSec && l.toSec > l.fromSec) {
      endMs = Math.round(l.toSec * 1000);
    } else if (nextLine && nextLine.fromSec > l.fromSec) {
      endMs = Math.round(nextLine.fromSec * 1000);
    } else {
      endMs = startMs + 4000;
    }

    const words =
      l.words && l.words.length > 0
        ? l.words
        : [
            {
              startTime: startMs,
              endTime: endMs,
              word: l.text,
            },
          ];

    return {
      startTime: startMs,
      endTime: endMs,
      words,
      translatedLyric: "",
      romanLyric: "",
      isBG: false,
      isDuet: false,
    };
  });

  return { visual, simple };
}

export function NativeLyricsEnhancer() {
  const { track, playing, position, seek } = usePlayerState();
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  const [currentVisual, setCurrentVisual] = useState<VisualLyricLine[]>([]);
  const [currentSimple, setCurrentSimple] = useState<SimpleLyricLine[] | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [hasNoLyrics, setHasNoLyrics] = useState(false);
  const [lyricsEnabled, setLyricsEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      const val = await window.yandexMusicMod?.getStorageValue("visual/visualLyricsEnabled");
      if (val !== undefined && val !== null) {
        setLyricsEnabled(val !== false);
      }
    })();

    const cleanup = window.yandexMusicMod?.onStorageChanged((key: string, value: any) => {
      if (key === "visual/visualLyricsEnabled") {
        setLyricsEnabled(value !== false);
      }
    });

    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  const cachedVisualByTrack = useRef(new BoundedCache<string, VisualLyricLine[]>(30));
  const cachedSimpleByTrack = useRef(new BoundedCache<string, SimpleLyricLine[]>(30));
  const activeTrackRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerEl) return;
    if (lyricsEnabled) {
      containerEl.classList.add("has-visual-lyrics");
    } else {
      containerEl.classList.remove("has-visual-lyrics");
    }
    return () => {
      containerEl.classList.remove("has-visual-lyrics");
    };
  }, [containerEl, lyricsEnabled]);

  useEffect(() => {
    let prevEl: HTMLElement | null = null;
    let rafId = 0;

    const checkTarget = () => {
      const el = document.querySelector('div[data-test-id="SYNC_LYRICS_CONTENT"]') as HTMLElement | null;
      if (el !== prevEl) {
        if (prevEl && !el) {
          prevEl.classList.remove("has-visual-lyrics");
        }
        prevEl = el;
        setContainerEl(el);
      }
    };

    checkTarget();

    const scheduleCheck = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        checkTarget();
      });
    };

    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (prevEl) {
        prevEl.classList.remove("has-visual-lyrics");
      }
    };
  }, []);

  const getActiveTrackId = useCallback((): string | null => {
    const store = (window as any).__yandexMusicStore || getRootStore();
    const id = store?.sonataState?.entityMeta?.id ?? store?.playerState?.track?.id ?? track?.id;
    return id !== undefined && id !== null ? String(id) : null;
  }, [track?.id]);

  const activeTrackId = getActiveTrackId();
  activeTrackRef.current = activeTrackId;

  const lastKnownTrackIdRef = useRef<string | null>(null);
  if (activeTrackId) {
    lastKnownTrackIdRef.current = activeTrackId;
  }
  const effectiveTrackId = activeTrackId || lastKnownTrackIdRef.current;

  useEffect(() => {
    if (!activeTrackId) {
      setCurrentVisual([]);
      setCurrentSimple(null);
      setCurrentTrackId(null);
      setHasNoLyrics(false);
      return;
    }

    if (currentTrackId !== activeTrackId) {
      setCurrentTrackId(activeTrackId);
      setHasNoLyrics(false);
      const cachedVisual = cachedVisualByTrack.current.get(activeTrackId);
      if (cachedVisual && cachedVisual.length > 0) {
        setCurrentVisual(cachedVisual);
        setCurrentSimple(cachedSimpleByTrack.current.get(activeTrackId) || null);
        return;
      } else {
        setCurrentVisual([]);
        setCurrentSimple(null);
      }
    }

    const store = (window as any).__yandexMusicStore || getRootStore();
    const meta = store?.sonataState?.entityMeta;
    if (meta && isSameTrackId(meta.id, activeTrackId) && meta.isSyncLyricsAvailable === false) {
      setCurrentVisual([]);
      setCurrentSimple(null);
      setHasNoLyrics(true);
      return;
    }

    const cachedVisual = cachedVisualByTrack.current.get(activeTrackId);
    if (cachedVisual && cachedVisual.length > 0) {
      const cachedSimple = cachedSimpleByTrack.current.get(activeTrackId) || null;
      setCurrentVisual(cachedVisual);
      setCurrentSimple(cachedSimple);
      return;
    }

    let alive = true;

    const tryExtractNative = (): boolean => {
      if (!alive || activeTrackRef.current !== activeTrackId) return true;

      const store = (window as any).__yandexMusicStore || getRootStore();
      const meta = store?.sonataState?.entityMeta;
      const syncLyrics = store?.fullscreenPlayer?.syncLyrics || store?.syncLyrics;

      if (meta && isSameTrackId(meta.id, activeTrackId) && meta.isSyncLyricsAvailable === false) {
        setCurrentVisual([]);
        setCurrentSimple(null);
        setHasNoLyrics(true);
        return true;
      }

      if (syncLyrics) {
        if (
          isSameTrackId(syncLyrics.currentTrackId, activeTrackId) &&
          (syncLyrics.isRejected || syncLyrics.hasInvalidLyrics)
        ) {
          setCurrentVisual([]);
          setCurrentSimple(null);
          setHasNoLyrics(true);
          return true;
        }
        if (syncLyrics.loadingState === "REJECT" || syncLyrics.isRejected) {
          setCurrentVisual([]);
          setCurrentSimple(null);
          setHasNoLyrics(true);
          return true;
        }
      }

      const nativeLines = getNativeSyncLyricsLines(activeTrackId);
      if (nativeLines && nativeLines.length > 0) {
        const { visual, simple } = convertNativeToVisual(nativeLines);
        cachedVisualByTrack.current.set(activeTrackId, visual);
        cachedSimpleByTrack.current.set(activeTrackId, simple);
        setCurrentVisual(visual);
        setCurrentSimple(simple);
        setHasNoLyrics(false);
        return true;
      }

      return false;
    };

    if (tryExtractNative()) {
      return;
    }

    requestNativeLyrics(activeTrackId);

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryExtractNative()) {
        clearInterval(interval);
        return;
      }
      if (attempts === 5 || attempts === 15 || attempts === 30) {
        requestNativeLyrics(activeTrackId);
      }
      if (attempts >= 300) {
        clearInterval(interval);
        setHasNoLyrics(true);
      }
    }, 100);

    let containerObserver: MutationObserver | null = null;
    if (containerEl) {
      containerObserver = new MutationObserver(() => {
        if (tryExtractNative()) {
          clearInterval(interval);
        }
      });
      containerObserver.observe(containerEl, { childList: true, subtree: true });
    }

    return () => {
      alive = false;
      clearInterval(interval);
      if (containerObserver) {
        containerObserver.disconnect();
      }
    };
  }, [activeTrackId, containerEl, currentTrackId]);

  const handleSeek = useCallback(
    (sec: number) => {
      seek(sec);
    },
    [seek]
  );

  if (!lyricsEnabled || !containerEl || !effectiveTrackId) {
    return null;
  }

  const store = (window as any).__yandexMusicStore || getRootStore();
  const statusVal = store?.playerState?.status?.value;
  const isCurrentlyPlaying =
    (typeof statusVal === "string" &&
      (statusVal.toLowerCase() === "playing" ||
        statusVal.toLowerCase() === "buffering" ||
        statusVal.toLowerCase() === "loadingmediasource")) ||
    playing;

  return createPortal(
    <div
      className="visual-native-lyrics-wrapper"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        zIndex: 20,
        overflow: "hidden",
        visibility: "visible",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {currentVisual.length > 0 ? (
          <motion.div
            key={`visual-wrap-${effectiveTrackId}`}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
            transition={{ duration: 0.35, ease: EASE }}
            className="w-full h-full flex flex-col justify-center"
          >
            <VisualLyrics
              key={`visual-${effectiveTrackId}`}
              lines={currentVisual}
              currentTime={position}
              playing={isCurrentlyPlaying}
              onSeek={handleSeek}
              className="w-full h-full"
            />
          </motion.div>
        ) : currentSimple && currentSimple.length > 0 ? (
          <motion.div
            key={`lp-wrap-${effectiveTrackId}`}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
            transition={{ duration: 0.35, ease: EASE }}
            className="w-full h-full flex flex-col justify-center"
          >
            <LyricsPlayer
              key={`lp-${effectiveTrackId}`}
              lines={currentSimple}
              currentTime={position}
              playing={isCurrentlyPlaying}
              onSeek={handleSeek}
              className="w-full h-full"
            />
          </motion.div>
        ) : hasNoLyrics ? (
          <motion.div
            key={`nolyrics-${effectiveTrackId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full h-full flex flex-col items-center justify-center select-none"
          >
            <span className="text-white/40 text-lg font-medium">Текст песни отсутствует</span>
          </motion.div>
        ) : (
          <motion.div
            key={`loading-${effectiveTrackId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full h-full flex flex-col justify-center items-center px-8"
          >
            <div className="flex flex-col gap-6 w-full max-w-lg opacity-25">
              <div className="h-8 w-3/4 rounded-xl bg-white/30 animate-pulse" />
              <div className="h-10 w-1/2 rounded-xl bg-white/30 animate-pulse" />
              <div className="h-8 w-2/3 rounded-xl bg-white/30 animate-pulse" />
              <div className="h-8 w-4/5 rounded-xl bg-white/30 animate-pulse" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    containerEl
  );
}
