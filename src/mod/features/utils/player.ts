import { searchProperty } from "./react-fiber-search.js";
import { z } from "zod";
import { ok, err, Result } from "neverthrow";
import { getRootStore } from "../ui/components/visual/extractNativeLyrics";

const PLAYER_SELECTOR = 'section[data-test-id="PLAYERBAR_DESKTOP"]';
const PLAY_BUTTON_SELECTOR = 'button[data-test-id="PLAY_BUTTON"], button[aria-label*="Воспроизве"], button[aria-label*="Play"]';
const PAUSE_BUTTON_SELECTOR = 'button[data-test-id="PAUSE_BUTTON"], button[aria-label*="Пауз"], button[aria-label*="Pause"]';
const NEXT_BUTTON_SELECTOR = 'button[data-test-id="CONTROL_FORWARD_BUTTON"], button[data-test-id="NEXT_BUTTON"], button[aria-label*="Следующ"], button[aria-label*="Вперёд"], button[aria-label*="Next"]';
const PREV_BUTTON_SELECTOR = 'button[data-test-id="CONTROL_BACK_BUTTON"], button[data-test-id="PREV_BUTTON"], button[aria-label*="Предыдущ"], button[aria-label*="Назад"], button[aria-label*="Previous"]';

let hasAdsInPlayer = false;

function getStore(): any | null {
  return (window as any).__yandexMusicStore || getRootStore() || null;
}

if (typeof window !== "undefined" && typeof HTMLMediaElement !== "undefined") {
  const origPlay = HTMLMediaElement.prototype.play;
  if (!(HTMLMediaElement.prototype as any).__modHooked) {
    (HTMLMediaElement.prototype as any).__modHooked = true;
    HTMLMediaElement.prototype.play = function (...args) {
      (window as any).__activeMediaElement = this;
      return origPlay.apply(this, args);
    };
  }
}

let lastAudioScan = -Infinity;

export function getActiveAudioElement(): HTMLMediaElement | null {
  const active = (window as any).__activeMediaElement;
  if (active && !active.paused && Number.isFinite(active.currentTime)) {
    return active;
  }

  if (typeof document !== "undefined" && performance.now() - lastAudioScan >= 1000) {
    lastAudioScan = performance.now();
    const elements = document.querySelectorAll<HTMLAudioElement>("audio");
    for (let index = 0; index < elements.length; index++) {
      const a = elements[index]!;
      if (!a.paused && Number.isFinite(a.currentTime)) {
        (window as any).__activeMediaElement = a;
        return a;
      }
    }
  }
  return active || null;
}

export function isPlaying(): Result<boolean, string> {

  const audio = getActiveAudioElement();
  if (audio && typeof audio.paused === "boolean") {
    if (!audio.paused) return ok(true);
  }

  const store = getStore();
  const statusVal = store?.playerState?.status?.value;
  if (typeof statusVal === "string") {
    const s = statusVal.toLowerCase();
    if (s === "playing" || s === "buffering" || s === "loadingmediasource") {
      return ok(true);
    }
    if (s === "paused" || s === "stopped" || s === "idle" || s === "ended") {
      return ok(false);
    }
  }

  const player = document.querySelector(PLAYER_SELECTOR) || document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
  if (player) {
    const pauseButton = player.querySelector(PAUSE_BUTTON_SELECTOR);
    if (pauseButton) return ok(true);
    const playButton = player.querySelector(PLAY_BUTTON_SELECTOR);
    if (playButton) return ok(false);
  }

  return ok(false);
}

export function togglePlayPause(): boolean {
  const store = getStore();
  if (typeof store?.playerState?.controls?.togglePlayPause === "function") {
    try {
      store.playerState.controls.togglePlayPause();
      return true;
    } catch {}
  }
  if (typeof store?.playback?.togglePlayPause === "function") {
    try {
      store.playback.togglePlayPause();
      return true;
    } catch {}
  }
  if (typeof store?.playerAction?.togglePlayPause === "function") {
    try {
      store.playerAction.togglePlayPause();
      return true;
    } catch {}
  }

  const playerbar = document.querySelector(PLAYER_SELECTOR) || document.querySelector('section[class*="player"]');
  if (playerbar) {
    const button = (playerbar.querySelector(PAUSE_BUTTON_SELECTOR) || playerbar.querySelector(PLAY_BUTTON_SELECTOR)) as HTMLElement | null;
    if (button) {
      button.click();
      return true;
    }
  }

  const audio = getActiveAudioElement();
  if (audio) {
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    return true;
  }

  return false;
}

export function skipNext(): boolean {
  const store = getStore();
  if (typeof store?.playerState?.controls?.skipNext === "function") {
    try {
      store.playerState.controls.skipNext();
      return true;
    } catch {}
  }
  if (typeof store?.playQueue?.nextTrack === "function") {
    try {
      store.playQueue.nextTrack();
      return true;
    } catch {}
  }
  if (typeof store?.playback?.next === "function") {
    try {
      store.playback.next();
      return true;
    } catch {}
  }
  if (typeof store?.player?.next === "function") {
    try {
      store.player.next();
      return true;
    } catch {}
  }

  const playerbar = document.querySelector(PLAYER_SELECTOR) || document.querySelector('section[class*="player"]');
  if (playerbar) {
    const button = playerbar.querySelector(NEXT_BUTTON_SELECTOR) as HTMLElement | null;
    if (button) {
      button.click();
      return true;
    }
  }

  try {
    (navigator as any).mediaSession?.metadata;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, bubbles: true }));
  } catch {}

  return false;
}

export function skipPrev(): boolean {
  const store = getStore();
  if (typeof store?.playerState?.controls?.skipPrev === "function") {
    try {
      store.playerState.controls.skipPrev();
      return true;
    } catch {}
  }
  if (typeof store?.playQueue?.prevTrack === "function") {
    try {
      store.playQueue.prevTrack();
      return true;
    } catch {}
  }
  if (typeof store?.playback?.prev === "function") {
    try {
      store.playback.prev();
      return true;
    } catch {}
  }
  if (typeof store?.player?.prev === "function") {
    try {
      store.player.prev();
      return true;
    } catch {}
  }

  const playerbar = document.querySelector(PLAYER_SELECTOR) || document.querySelector('section[class*="player"]');
  if (playerbar) {
    const button = playerbar.querySelector(PREV_BUTTON_SELECTOR) as HTMLElement | null;
    if (button) {
      button.click();
      return true;
    }
  }

  try {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: true, bubbles: true }));
  } catch {}

  return false;
}

export function seekTo(seconds: number): boolean {
  const audio = getActiveAudioElement();
  if (audio && Number.isFinite(seconds)) {
    try {
      audio.currentTime = seconds;
    } catch {}
  }

  const store = getStore();
  if (typeof store?.playerState?.controls?.seek === "function") {
    try {
      store.playerState.controls.seek(seconds);
      return true;
    } catch {}
  }
  if (typeof store?.playback?.setProgress === "function") {
    try {
      store.playback.setProgress(seconds);
      return true;
    } catch {}
  }
  if (typeof store?.player?.setProgress === "function") {
    try {
      store.player.setProgress(seconds);
      return true;
    } catch {}
  }

  const playerbar = document.querySelector(PLAYER_SELECTOR);
  if (playerbar) {
    const slider = playerbar.querySelector('input[type="range"], [role="slider"]') as HTMLInputElement | HTMLElement | null;
    if (slider instanceof HTMLInputElement) {
      slider.value = seconds.toString();
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }

  return true;
}

export function getProgress(): Result<{ duration: number; progress: number; position: number }, string> {

  const audio = getActiveAudioElement();
  if (audio && Number.isFinite(audio.currentTime) && Number.isFinite(audio.duration) && audio.duration > 0) {
    return ok({
      duration: audio.duration,
      position: audio.currentTime,
      progress: (audio.currentTime / audio.duration) * 100,
    });
  }

  const store = getStore();
  if (store?.playerState?.progress?.value) {
    const val = store.playerState.progress.value;
    return ok({
      duration: Number(val.duration) || 0,
      position: Number(val.position) || 0,
      progress: Number(val.progress) || 0,
    });
  }

  const player = document.querySelector(PLAYER_SELECTOR) || document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
  if (!player) {
    return err("Player element not found in DOM");
  }

  const fiber = searchProperty(player, "timecodeClassName") || searchProperty(player, "currentTimecodeClassName");
  if (!fiber) {
    return err("Fiber not found");
  }

  return ok({
    duration: Number((fiber as any).duration) || 0,
    position: Number((fiber as any).position) || 0,
    progress: Number((fiber as any).progress) || 0,
  });
}

export function getTrackMeta(): Result<any, string> {

  const store = getStore();
  const storeMeta = store?.sonataState?.entityMeta;
  if (storeMeta && storeMeta.id) {
    return ok(JSON.parse(JSON.stringify(storeMeta)));
  }

  const player = document.querySelector(PLAYER_SELECTOR) || document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
  if (!player) {
    return err("Player element not found in DOM");
  }

  const fiber = searchProperty(player, "entityMeta");
  if (!fiber || !fiber.entityMeta) {
    return err("Fiber not found");
  }

  const meta = fiber.entityMeta;
  if (meta && meta.title === "Промокод Upgrade") {
    if (!hasAdsInPlayer) {
      console.warn("[getTrackMeta] Обнаружена реклама в плеере");
    }
    hasAdsInPlayer = true;
    return err("upgrade_promocode");
  }

  if (meta && meta.id) {
    return ok(JSON.parse(JSON.stringify({ ...meta })));
  }

  return err("Track metadata not found");
}
