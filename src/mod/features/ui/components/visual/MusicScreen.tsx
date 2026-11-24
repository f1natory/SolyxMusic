import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Pause,
  Play,
  MessageSquareQuote,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ChevronDown,
} from "lucide-react";
import { VisualBackground } from "./VisualBackground";
import { VisualLyrics } from "./VisualLyrics";
import { LyricsPlayer } from "./LyricsPlayer";
import {
  getRootStore,
  getNativeSyncLyricsLines,
  requestNativeLyrics,
  isSameTrackId,
  type NativeLyricLine,
} from "./extractNativeLyrics";
import type { SimpleLyricLine as LyricLine } from "@ui/lib/lyrics";
import type { LyricLine as VisualLyricLine } from "@visual/interfaces.ts";
import { cn, formatTime } from "@ui/lib/utils";
import { usePlayerState } from "@ui/hooks/usePlayerState";
import { getActiveAudioElement } from "~/mod/features/utils/player";

const EASE = [0.16, 1, 0.3, 1] as const;

export function MusicScreen({ onClose }: { onClose?: () => void }) {
  const { track, playing, position, duration, togglePlay, nextTrack, prevTrack, seek } =
    usePlayerState();

  const [cur, setCur] = useState(position);
  const [dur, setDur] = useState(duration);
  const [vol, setVol] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const [cover, setCover] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[] | null>(null);
  const [visualLines, setVisualLines] = useState<VisualLyricLine[]>([]);
  const [lyricsTrackId, setLyricsTrackId] = useState<string | null>(null);
  const [lyricsOpen, setLyricsOpen] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [wideLayout, setWideLayout] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });

  const activeTrackRef = useRef<string | null>(null);
  const cachedLyricsByTrack = useRef<Record<string, LyricLine[]>>({});
  const cachedVisualByTrack = useRef<Record<string, VisualLyricLine[]>>({});

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const updateLayout = () => setWideLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    const updatePlayerControls = () => {
      const store = (window as any).__yandexMusicStore || getRootStore();
      const storeVol = store?.playerState?.volume?.value;
      if (typeof storeVol === "number" && Number.isFinite(storeVol)) {
        setVol(storeVol);
      }
      const storeShuffle =
        store?.playQueue?.isShuffle ??
        store?.playlist?.shuffle?.value ??
        store?.playerState?.shuffle?.value;
      if (typeof storeShuffle === "boolean") {
        setShuffle(storeShuffle);
      }
      const storeRepeat =
        store?.playQueue?.isRepeat ??
        store?.playlist?.repeat?.value ??
        store?.playerState?.repeat?.value;
      if (typeof storeRepeat === "boolean") {
        setRepeat(storeRepeat);
      }
    };

    updatePlayerControls();
    const interval = setInterval(updatePlayerControls, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCur(position);
    setDur(duration);
  }, [position, duration]);

  const getActiveTrackId = (): string | null => {
    const store = (window as any).__yandexMusicStore || getRootStore();
    const id = store?.sonataState?.entityMeta?.id ?? track?.id;
    return id !== undefined && id !== null ? String(id) : null;
  };

  const activeTrackId = getActiveTrackId();
  activeTrackRef.current = activeTrackId;

  useEffect(() => {
    const store = (window as any).__yandexMusicStore || getRootStore();
    const meta = store?.sonataState?.entityMeta;
    let url: string | null = null;
    if (meta && String(meta.id) === activeTrackId) {
      if (meta?.coverUri) {
        url = "https://" + meta.coverUri.replace("%%", "600x600");
      } else if (meta?.ogImage) {
        url = "https://" + meta.ogImage.replace("%%", "600x600");
      }
    } else if (track && String(track.id) === activeTrackId && track?.coverUrl) {
      url = track.coverUrl;
    }
    setCover(url);
  }, [track?.id, track?.coverUrl, activeTrackId]);

  useEffect(() => {
    if (!activeTrackId) {
      setLyrics(null);
      setVisualLines([]);
      setLyricsTrackId(null);
      return;
    }

    setLyrics(null);
    setVisualLines([]);
    setLyricsTrackId(null);

    const store = (window as any).__yandexMusicStore || getRootStore();
    const meta = store?.sonataState?.entityMeta;
    if (meta && isSameTrackId(meta.id, activeTrackId) && meta.isSyncLyricsAvailable === false) {
      return;
    }

    const cached = cachedLyricsByTrack.current[activeTrackId];
    if (cached && cached.length > 0) {
      setLyrics(cached);
      setVisualLines(cachedVisualByTrack.current[activeTrackId] || []);
      setLyricsTrackId(activeTrackId);
      return;
    }

    let alive = true;

    const tryExtractNative = (): boolean => {
      const nativeLines = getNativeSyncLyricsLines(activeTrackId);
      if (nativeLines && nativeLines.length > 0) {
        const mapped: LyricLine[] = nativeLines.map((l) => ({
          t: l.fromSec,
          text: l.text,
        }));
        const visualParsed: VisualLyricLine[] = nativeLines.map((l, idx) => {
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

        if (mapped.length > 0 && alive && activeTrackRef.current === activeTrackId) {

          if (Object.keys(cachedLyricsByTrack.current).length >= 30) {
            const oldest = Object.keys(cachedLyricsByTrack.current)[0];
            if (oldest) {
              delete cachedLyricsByTrack.current[oldest];
              delete cachedVisualByTrack.current[oldest];
            }
          }
          cachedLyricsByTrack.current[activeTrackId] = mapped;
          cachedVisualByTrack.current[activeTrackId] = visualParsed;
          setLyrics(mapped);
          setVisualLines(visualParsed);
          setLyricsTrackId(activeTrackId);
          return true;
        }
      }
      return false;
    };

    if (tryExtractNative()) return;

    requestNativeLyrics(activeTrackId);

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryExtractNative() || attempts >= 40) {
        clearInterval(interval);
        return;
      }
      if (attempts === 5 || attempts === 15) {
        requestNativeLyrics(activeTrackId);
      }
    }, 100);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [activeTrackId, track?.id, track?.title, track?.artistName]);

  const handleVolume = (newVol: number) => {
    setVol(newVol);
    setMuted(newVol === 0);
    const audio = getActiveAudioElement();
    if (audio) audio.volume = newVol;
    const store = (window as any).__yandexMusicStore || getRootStore();
    if (typeof store?.playerState?.volume?.setVolume === "function") {
      store.playerState.volume.setVolume(newVol);
    }
  };

  const handleMute = () => {
    if (muted) {
      setMuted(false);
      handleVolume(vol > 0 ? vol : 0.5);
    } else {
      setMuted(true);
      const audio = getActiveAudioElement();
      if (audio) audio.volume = 0;
      const store = (window as any).__yandexMusicStore || getRootStore();
      if (typeof store?.playerState?.volume?.setVolume === "function") {
        store.playerState.volume.setVolume(0);
      }
    }
  };

  const handleShuffle = () => {
    const store = (window as any).__yandexMusicStore || getRootStore();
    let handled = false;
    if (typeof store?.playQueue?.toggleShuffle === "function") {
      try {
        store.playQueue.toggleShuffle();
        handled = true;
      } catch {}
    } else if (typeof store?.playlist?.toggleShuffle === "function") {
      try {
        store.playlist.toggleShuffle();
        handled = true;
      } catch {}
    }
    if (!handled) {
      const playerbar = document.querySelector('section[data-test-id="PLAYERBAR_DESKTOP"]');
      const btn = playerbar?.querySelector(
        'button[data-test-id*="SHUFFLE"], button[aria-label*="Случайн"], button[aria-label*="Shuffle"]'
      ) as HTMLElement | null;
      btn?.click();
    }
    setShuffle((v) => !v);
  };

  const handleRepeat = () => {
    const store = (window as any).__yandexMusicStore || getRootStore();
    let handled = false;
    if (typeof store?.playQueue?.toggleRepeat === "function") {
      try {
        store.playQueue.toggleRepeat();
        handled = true;
      } catch {}
    } else if (typeof store?.playlist?.toggleRepeat === "function") {
      try {
        store.playlist.toggleRepeat();
        handled = true;
      } catch {}
    }
    if (!handled) {
      const playerbar = document.querySelector('section[data-test-id="PLAYERBAR_DESKTOP"]');
      const btn = playerbar?.querySelector(
        'button[data-test-id*="REPEAT"], button[aria-label*="Повтор"], button[aria-label*="Repeat"]'
      ) as HTMLElement | null;
      btn?.click();
    }
    setRepeat((v) => !v);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    const store = (window as any).__yandexMusicStore || getRootStore();
    if (typeof store?.fullscreenPlayer?.modal?.close === "function") {
      store.fullscreenPlayer.modal.close();
    } else {
      const closeBtn = document.querySelector(
        'div[data-test-id="FULLSCREEN_PLAYER_MODAL"] header button[aria-label*="close"], div[data-test-id="FULLSCREEN_PLAYER_MODAL"] header button'
      ) as HTMLElement | null;
      closeBtn?.click();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const currentLyrics = lyricsTrackId === activeTrackId ? lyrics : null;
  const currentVisual = lyricsTrackId === activeTrackId ? visualLines : [];
  const hasLyrics = currentVisual.length > 0 || (!!currentLyrics && currentLyrics.length > 0);
  const showLyrics = lyricsOpen;
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  const remaining = dur > 0 ? Math.max(0, dur - cur) : 0;

  const currentStore = (window as any).__yandexMusicStore || getRootStore();
  const sonataMeta = currentStore?.sonataState?.entityMeta;
  const currentTitle =
    (sonataMeta && String(sonataMeta.id) === activeTrackId ? sonataMeta.title : null) ||
    (track && String(track.id) === activeTrackId ? track.title : null) ||
    track?.title ||
    "···";
  const currentArtist =
    (sonataMeta && String(sonataMeta.id) === activeTrackId
      ? Array.isArray(sonataMeta.artists)
        ? sonataMeta.artists.map((a: any) => a.name).join(", ")
        : sonataMeta.artists?.[0]?.name
      : null) ||
    (track && String(track.id) === activeTrackId ? track.artistName : null) ||
    track?.artistName ||
    "";

  return (
    <div className="fixed inset-0 z-[9999] h-screen w-screen overflow-hidden bg-black text-white select-none music-screen flex flex-col justify-center items-center">

          <motion.figure
            animate={{ scale: playing ? 1 : 0.97 }}
            transition={{ duration: 0.42, ease: EASE }}
            className="relative m-0 aspect-square w-[400px] h-[400px] max-w-full mx-auto"
            style={{ width: "400px", height: "400px", aspectRatio: "1 / 1" }}
          >
            <div className="absolute inset-0 overflow-hidden rounded-xl bg-black/40 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
              <AnimatePresence mode="sync" initial={false}>
                {cover ? (
                  <motion.img
                    key={`${activeTrackId}-${cover}`}
                    src={cover}
                    alt={`${track?.title} — ${track?.artistName}`}
                    initial={{ opacity: 0, scale: 1.06, filter: "blur(16px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.97, filter: "blur(12px)" }}
                    transition={{ duration: 0.68, ease: EASE }}
                    className="absolute inset-0 h-full w-full object-cover will-change-[opacity,transform,filter]"
                  />
                ) : (
                  <motion.div
                    key={activeTrackId ?? "loading"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center bg-white/5"
                  >
                    <div className="h-8 w-8 animate-pulse rounded-full bg-white/20" />
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="music-cover-edge-fade" aria-hidden />
            </div>
          </motion.figure>

          <div className="mt-7 w-full px-0.5">
            <input
              type="range"
              min={0}
              max={dur || 1}
              step={0.25}
              value={cur}
              onChange={(e) => seek(Number(e.target.value))}
              className="slider-apple w-full"
              style={{ ["--fill" as string]: `${pct}%` }}
              aria-label="Прогресс"
            />
            <div className="mt-1.5 flex justify-between text-[11px] font-medium tabular-nums text-white/60">
              <span>{formatTime(cur)}</span>
              <span>{dur > 0 ? `-${formatTime(remaining)}` : "-0:00"}</span>
            </div>
          </div>

        {lyricsOpen && wideLayout && (
          <div className="hidden lg:flex min-w-0 h-[65vh] items-center">
            <motion.div
              key={activeTrackId}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
              transition={{ duration: 0.48, ease: EASE }}
              className="w-full h-full flex flex-col justify-center"
            >
              {currentVisual.length > 0 ? (
                <VisualLyrics
                  key={`Visual-${activeTrackId}`}
                  lines={currentVisual}
                  currentTime={cur}
                  playing={playing}
                  onSeek={seek}
                  className="h-[60vh] w-full"
                />
              ) : currentLyrics && currentLyrics.length > 0 ? (
                <LyricsPlayer
                  key={`lp-${activeTrackId}`}
                  lines={currentLyrics}
                  currentTime={cur}
                  playing={playing}
                  onSeek={seek}
                  className="h-[60vh] w-full"
                />
              ) : lyricsTrackId !== activeTrackId ? (
                <div className="flex flex-col gap-6 py-8 px-4 opacity-40">
                  <div className="h-9 w-3/4 rounded-lg bg-white/20 animate-pulse" />
                  <div className="h-11 w-1/2 rounded-lg bg-white/20 animate-pulse" />
                  <div className="h-9 w-2/3 rounded-lg bg-white/20 animate-pulse" />
                  <div className="h-9 w-4/5 rounded-lg bg-white/20 animate-pulse" />
                </div>
              ) : (
                <div className="flex h-[56vh] w-full items-center justify-center text-center">
                  <p className="text-xl font-medium tracking-tight text-white/40">
                    Текст песни отсутствует
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </div>
  );
}
