import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Mic2,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Sparkles,
} from "lucide-react";
import { usePlayerState } from "@ui/hooks/usePlayerState";
import { loadTrackLyrics, type TrackLyricsResult } from "@ui/lib/lyrics";
import { VisualBackground } from "./VisualBackground";
import { VisualLyrics } from "./VisualLyrics";
import { LyricsPlayer } from "./LyricsPlayer";
import { formatTime, cn } from "@ui/lib/utils";
import { Button } from "@ui/components/ui/button";

interface LyricsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LyricsModal({ isOpen, onClose }: LyricsModalProps) {
  const { playing, position, duration, track, togglePlay, nextTrack, prevTrack, seek } = usePlayerState();
  const [lyricsData, setLyricsData] = useState<TrackLyricsResult | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [useVisualEngine, setUseVisualEngine] = useState(true);

  useEffect(() => {
    if (!track?.title) {
      setLyricsData(null);
      return;
    }

    let isCancelled = false;
    setLoadingLyrics(true);

    loadTrackLyrics(track.title, track.artistName, track.durationSec)
      .then((res) => {
        if (!isCancelled) {
          setLyricsData(res);
          setLoadingLyrics(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLyricsData(null);
          setLoadingLyrics(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [track?.id, track?.title, track?.artistName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const hasVisualLines = useMemo(() => {
    return Boolean(lyricsData?.VisualLines && lyricsData.VisualLines.length > 0);
  }, [lyricsData]);

  const hasSimpleLines = useMemo(() => {
    return Boolean(lyricsData?.lines && lyricsData.lines.length > 0);
  }, [lyricsData]);

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[999999] flex flex-col overflow-hidden bg-black/90 text-white backdrop-blur-2xl"
      >

        <div className="relative z-10 grid flex-1 grid-cols-1 gap-8 px-8 pb-8 pt-2 md:grid-cols-12 md:gap-12 md:px-16 overflow-hidden">

          <div className="flex flex-col justify-center items-center md:items-start md:col-span-5 lg:col-span-4 h-full">

            <div className="relative flex aspect-square w-full max-w-[340px] items-center justify-center">
              <motion.div
                animate={{ scale: playing ? 1 : 0.94 }}
                transition={{ type: "spring", stiffness: 180, damping: 24 }}
                className="relative h-full w-full overflow-hidden rounded-2xl shadow-[0_24px_60px_-15px_rgba(0,0,0,0.8)] ring-1 ring-white/15"
              >
                {track?.coverUrl ? (
                  <img
                    src={track.coverUrl}
                    alt={track.title}
                    className="h-full w-full object-cover select-none"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/5">
                    <Mic2 className="h-16 w-16 text-white/20" />
                  </div>
                )}
                <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10 rounded-2xl" />
              </motion.div>
            </div>

            <div className="mt-6 w-full max-w-[340px] text-left">
              <h2 className="truncate text-2xl font-bold tracking-tight text-white md:text-3xl" title={track?.title}>
                {track?.title || "Нет воспроизведения"}
              </h2>
              <p className="mt-1 truncate text-base font-medium text-white/70" title={track?.artistName}>
                {track?.artistName || "—"}
              </p>
              {track?.albumTitle && (
                <p className="truncate text-xs text-white/40 mt-0.5" title={track.albumTitle}>
                  {track.albumTitle}
                </p>
              )}
            </div>

            <div className="mt-5 w-full max-w-[340px]">
              <div className="relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.5}
                  value={position}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="slider-apple w-full"
                  style={{ "--fill": `${progressPercent}%` } as React.CSSProperties}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs font-medium tabular-nums text-white/50">
                <span>{formatTime(position)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="mt-4 flex w-full max-w-[340px] items-center justify-center gap-6">
              <button
                type="button"
                onClick={prevTrack}
                className="text-white/70 transition-all hover:text-white active:scale-90"
                title="Предыдущий трек"
              >
                <SkipBack className="h-6 w-6" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg transition-all hover:scale-105 active:scale-95"
                title={playing ? "Пауза" : "Воспроизведение"}
              >
                {playing ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={nextTrack}
                className="text-white/70 transition-all hover:text-white active:scale-90"
                title="Следующий трек"
              >
                <SkipForward className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="relative flex flex-col h-full md:col-span-7 lg:col-span-8 overflow-hidden rounded-2xl">
            {loadingLyrics ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-white/50">
                <div className="music-lyric-dots">
                  <div className="music-lyric-dots-inner" data-playing="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <p className="text-sm font-medium">Поиск и синхронизация текста...</p>
              </div>
            ) : hasVisualLines && useVisualEngine ? (
              <VisualLyrics
                lines={lyricsData!.VisualLines}
                currentTime={position}
                playing={playing}
                onSeek={seek}
                className="h-full w-full"
              />
            ) : hasSimpleLines ? (
              <LyricsPlayer
                lines={lyricsData!.lines}
                currentTime={position}
                playing={playing}
                onSeek={seek}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center text-white/40">
                <Mic2 className="h-12 w-12 stroke-[1.5]" />
                <p className="text-lg font-medium text-white/70">Текст для этой песни пока не найден</p>
                <p className="text-xs max-w-sm text-white/40">
                  Синхронизированный текст загружается из Яндекс Музыки при воспроизведении трека.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
