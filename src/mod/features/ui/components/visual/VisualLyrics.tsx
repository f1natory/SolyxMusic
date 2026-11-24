import { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { LayoutReason } from "@visual/lyric-player/base/consts.ts";
import { DomLyricPlayer } from "@visual/lyric-player/dom/index.ts";
import type { LyricLine as VisualLyricLine } from "@visual/interfaces.ts";
import { cn } from "@ui/lib/utils";
import { getActiveAudioElement } from "~/mod/features/utils/player";

const FADE =
  "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 7%, #000 20%, #000 80%, rgba(0,0,0,0.35) 93%, transparent 100%)";

export const VisualLyrics = memo(function VisualLyrics({
  lines,
  currentTime,
  playing,
  onSeek,
  className,
}: {
  lines: VisualLyricLine[];
  currentTime: number;
  playing: boolean;
  onSeek: (value: number) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [player, setPlayer] = useState<DomLyricPlayer | null>(null);
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const instance = new DomLyricPlayer();
    host.appendChild(instance.getElement());
    instance.setEnableSpring(true);
    instance.setEnableScale(true);
    instance.setEnableBlur(true);
    instance.setWordFadeWidth(0.5);
    instance.calcLayout(LayoutReason.ConfigChange);

    let canceled = false;
    let rafId = 0;
    let lastTime = -1;
    let lastAudioTime = -1;
    let lastAudioWallTime = performance.now();
    let smoothSec = 0;
    let wasPaused = false;
    let lastStorePos = -1;
    let lastStoreWallTime = performance.now();
    let wasStorePaused = false;

    const frame = (time: number) => {
      if (canceled) return;
      rafId = 0;
      if (document.hidden) return;
      if (lastTime === -1 || time - lastTime > 1000) lastTime = time;
      const delta = time - lastTime;
      lastTime = time;

      let currentSec: number | null = null;
      const audio = getActiveAudioElement();
      const now = performance.now();

      if (audio && Number.isFinite(audio.currentTime)) {
        const raw = audio.currentTime;
        const isPaused = audio.paused;

        if (wasPaused && !isPaused) {
          lastAudioWallTime = now;
        }
        wasPaused = isPaused;

        if (raw !== lastAudioTime) {

          if (lastAudioTime >= 0 && (Math.abs(raw - lastAudioTime) > 1.0 || raw < lastAudioTime)) {
            smoothSec = raw;
          } else if (lastAudioTime < 0) {
            smoothSec = raw;
          } else {

            if (raw > smoothSec) {
              smoothSec = raw;
            }
          }
          lastAudioTime = raw;
          lastAudioWallTime = now;
        } else if (!isPaused) {

          const elapsed = (now - lastAudioWallTime) / 1000;
          smoothSec = lastAudioTime + Math.min(elapsed, 0.35);
        } else {

          smoothSec = Math.max(raw, smoothSec);
          lastAudioWallTime = now;
        }
        currentSec = smoothSec;
      } else {
        const store = (window as any).__yandexMusicStore;
        const pos = store?.playerState?.progress?.value?.position;
        const statusVal = store?.playerState?.status?.value;
        const isSongPlaying =
          (typeof statusVal === "string" &&
            (statusVal.toLowerCase() === "playing" ||
              statusVal.toLowerCase() === "buffering" ||
              statusVal.toLowerCase() === "loadingmediasource")) ||
          playingRef.current;
        const isStorePaused = !isSongPlaying;

        if (wasStorePaused && !isStorePaused) {
          lastStoreWallTime = now;
        }
        wasStorePaused = isStorePaused;

        if (typeof pos === "number" && Number.isFinite(pos)) {
          if (pos !== lastStorePos) {
            if (lastStorePos >= 0 && (Math.abs(pos - lastStorePos) > 1.0 || pos < lastStorePos)) {
              smoothSec = pos;
            } else if (lastStorePos < 0) {
              smoothSec = pos;
            } else if (pos > smoothSec) {
              smoothSec = pos;
            }
            lastStorePos = pos;
            lastStoreWallTime = now;
          } else if (isSongPlaying) {
            const elapsed = (now - lastStoreWallTime) / 1000;
            smoothSec = lastStorePos + Math.min(Math.max(0, elapsed), 0.35);
          } else {
            smoothSec = Math.max(pos, smoothSec);
            lastStoreWallTime = now;
          }
          currentSec = smoothSec;
        } else if (Number.isFinite(timeRef.current)) {
          currentSec = timeRef.current;
        }
      }

      if (currentSec !== null && currentSec >= 0) {
        instance.setCurrentTime(currentSec * 1000);
      }

      instance.update(delta);
      rafId = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      lastTime = -1;
      if (!document.hidden) rafId = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    setPlayer(instance);

    return () => {
      canceled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      instance.dispose();
      setPlayer(null);
      lastAppliedRef.current = { player: null, hash: "" };
    };
  }, []);

  const linesHash = useMemo(() => {
    if (!lines || lines.length === 0) return "";
    const firstWord = lines[0]?.words?.[0]?.word || "";
    const firstStart = lines[0]?.startTime ?? 0;
    const lastStart = lines[lines.length - 1]?.startTime ?? 0;
    return `${lines.length}:${firstStart}:${firstWord}:${lastStart}`;
  }, [lines]);

  const lastAppliedRef = useRef<{ player: DomLyricPlayer | null; hash: string }>({
    player: null,
    hash: "",
  });

  useEffect(() => {
    if (!player) return;

    if (!lines || lines.length === 0) {
      if (lastAppliedRef.current.hash !== "") {
        lastAppliedRef.current = { player, hash: "" };
        try {
          player.setLyricLines([], 0);
          player.update(0);
        } catch {}
      }
      return;
    }

    if (lastAppliedRef.current.player === player && lastAppliedRef.current.hash === linesHash) {
      return;
    }
    lastAppliedRef.current = { player, hash: linesHash };

    const initialTimeMs = Math.max(
      0,
      Math.round((Number.isFinite(timeRef.current) ? timeRef.current : 0) * 1000)
    );
    player.setLyricLines(lines, initialTimeMs);
    if (playing) {
      player.resume();
    } else {
      player.pause();
    }
    player.update(0);
  }, [player, linesHash, lines, playing]);

  useEffect(() => {
    if (!player) return;
    if (playing) {
      player.resume();
    } else {
      player.pause();
    }
  }, [player, playing]);

  useEffect(() => {
    if (!player) return;
    const handler = (event: Event) => {
      const line = (event as Event & { line?: { getLine(): { startTime: number } } }).line;
      const start = line?.getLine().startTime;
      if (typeof start === "number" && Number.isFinite(start)) {
        player.resetScroll();
        player.setCurrentTime(start, true);
        onSeek(start / 1000);
      }
    };
    player.addEventListener("line-click", handler);
    return () => player.removeEventListener("line-click", handler);
  }, [player, onSeek]);

  return (
    <div
      ref={hostRef}
      className={cn("relative h-full w-full min-w-0 overflow-hidden", className)}
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
    />
  );
});
