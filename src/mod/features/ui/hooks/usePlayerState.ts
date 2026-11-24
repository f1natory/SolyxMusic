import { useSyncExternalStore } from "react";
import {
  isPlaying,
  getProgress,
  getTrackMeta,
  togglePlayPause,
  skipNext as skipNextPlayer,
  skipPrev as skipPrevPlayer,
  seekTo as seekToPlayer,
} from "~/mod/features/utils/player";

export interface CurrentTrack {
  id: string;
  title: string;
  artistName: string;
  artists: { id: string; name: string }[];
  albumTitle?: string;
  coverUrl?: string;
  durationMs: number;
  durationSec: number;
}

interface PlayerSnapshot {
  playing: boolean;
  position: number;
  duration: number;
  track: CurrentTrack | null;
}

let snapshot: PlayerSnapshot = { playing: false, position: 0, duration: 0, track: null };
let metadataSnapshot = { playing: false, track: null as CurrentTrack | null };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function publish(next: PlayerSnapshot) {
  if (next.playing === snapshot.playing && next.position === snapshot.position &&
      next.duration === snapshot.duration && next.track === snapshot.track) return;
  snapshot = next;
  if (metadataSnapshot.playing !== next.playing || metadataSnapshot.track !== next.track) {
    metadataSnapshot = { playing: next.playing, track: next.track };
  }
  listeners.forEach(listener => listener());
}

function sample() {
  const play = isPlaying();
  const progress = getProgress();
  const meta = getTrackMeta();
  let track = snapshot.track;
  if (meta.isOk() && meta.value?.id != null) {
    const value = meta.value;
    const id = String(value.id);
    const uri = value.ogImage || value.coverUri;
    const coverUrl = uri ? (uri.startsWith('http') ? uri : uri.startsWith('//') ? 'https:' + uri : 'https://' + uri).replace('%%', '400x400') : undefined;
    const artistName = Array.isArray(value.artists)
      ? value.artists.map((artist: any) => artist.name).join(', ')
      : 'Неизвестный исполнитель';
    if (!track || track.id !== id || track.title !== value.title ||
        track.coverUrl !== coverUrl || track.artistName !== artistName ||
        track.durationMs !== (value.durationMs || 0) || track.albumTitle !== value.albums?.[0]?.title) {
      track = { id, title: value.title, artistName, artists: value.artists || [],
        albumTitle: value.albums?.[0]?.title, coverUrl,
        durationMs: value.durationMs || 0, durationSec: (value.durationMs || 0) / 1000 };
    }
  }
  publish({
    playing: play.isOk() ? play.value : snapshot.playing,
    position: progress.isOk() ? progress.value.position : snapshot.position,
    duration: progress.isOk() ? progress.value.duration : snapshot.duration,
    track,
  });
}

function tick() {
  sample();
  if (listeners.size) timer = setTimeout(tick, document.hidden ? 1500 : snapshot.playing ? 350 : 1000);
}

function onVisibility() {
  clearTimeout(timer);
  tick();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibility);
    tick();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearTimeout(timer);
      timer = undefined;
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}

const getSnapshot = () => snapshot;
const getMetadataSnapshot = () => metadataSnapshot;
const togglePlay = () => { togglePlayPause(); };
const nextTrack = () => { skipNextPlayer(); };
const prevTrack = () => { skipPrevPlayer(); };
const seek = (seconds: number) => {
  seekToPlayer(seconds);
  publish({ ...snapshot, position: seconds });
};

export function usePlayerState() {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  return { ...state, togglePlay, nextTrack, prevTrack, seek };
}

export function usePlayerMetadata() {
  return useSyncExternalStore(subscribe, getMetadataSnapshot);
}
