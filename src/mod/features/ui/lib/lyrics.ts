import { parseLrc as parseVisualLrc } from "@visual-formats/formats/lrc/index.ts";
import type { LyricLine as VisualLyricLine } from "@visual/interfaces.ts";

export interface SimpleLyricLine {
  t: number | null;
  text: string;
}
export function parseLrc(lrc: string): SimpleLyricLine[] {
  const lines: SimpleLyricLine[] = [];
  const re = /\[(\d+):(\d+)(?:[.:](\d+))?]/g;
  const wordTag = /<\d+:\d+(?:[.:]\d+)?>/g;

  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = Array.from(raw.matchAll(re));
    if (!stamps.length) continue;
    const text = raw.replace(re, "").replace(wordTag, "").trim();
    for (const m of stamps) {
      const frac = m[3] ?? "0";
      const t = Number(m[1]) * 60 + Number(m[2]) + Number(frac) / 10 ** frac.length;
      lines.push({ t, text });
    }
  }

  return lines.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

export function parsePlainLyrics(text: string): SimpleLyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ t: null, text: line }));
}

interface LrcLibRecord {
  id: number;
  trackName: string;
  artistName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

const withTimeout = async (url: string, ms = 7000) => {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(url, { signal: c.signal });
    if (!res.ok) throw new Error(`LRCLIB request failed: ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(id);
  }
};

const CACHE = new Map<string, SimpleLyricLine[] | null>();
const RAW = new Map<string, string | null>();

export async function fetchLyricsFromLrclib(
  trackName: string,
  artistName: string,
  durationSec?: number
): Promise<{ lines: SimpleLyricLine[]; raw: string | null } | null> {
  if (!trackName) return null;
  const cleanTrack = trackName.trim();
  const cleanArtist = (artistName || "").trim();
  const key = `${cleanArtist}|${cleanTrack}`;
  if (CACHE.has(key)) {
    const cached = CACHE.get(key);
    return cached ? { lines: cached, raw: RAW.get(key) ?? null } : null;
  }

  const qArtist = encodeURIComponent(cleanArtist);
  const qTrack = encodeURIComponent(cleanTrack);
  let lines: SimpleLyricLine[] | null = null;
  let raw: string | null = null;

  try {

    const durParam = durationSec && durationSec > 0 ? `&duration=${Math.round(durationSec)}` : "";
    const get = (await withTimeout(
      `https://lrclib.net/api/get?artist_name=${qArtist}&track_name=${qTrack}${durParam}`
    )) as LrcLibRecord | null;
    if (get?.syncedLyrics) {
      raw = get.syncedLyrics;
      lines = parseLrc(get.syncedLyrics);
    } else if (get?.plainLyrics) {
      lines = parsePlainLyrics(get.plainLyrics);
    }
  } catch {}

  if (!lines?.length) {
    try {

      const list = (await withTimeout(
        `https://lrclib.net/api/search?track_name=${qTrack}&artist_name=${qArtist}`
      )) as LrcLibRecord[];
      const wantDur = durationSec ?? 0;
      const withLyrics = (list ?? []).filter((r) => r.syncedLyrics || r.plainLyrics);
      if (withLyrics.length) {
        const best = withLyrics.slice().sort((a, b) => {
          const syncPreference = Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics);
          if (syncPreference) return syncPreference;
          return wantDur
            ? Math.abs((a.duration ?? 0) - wantDur) - Math.abs((b.duration ?? 0) - wantDur)
            : 0;
        })[0];
        if (best.syncedLyrics) {
          raw = best.syncedLyrics;
          lines = parseLrc(best.syncedLyrics);
        } else if (best.plainLyrics) {
          lines = parsePlainLyrics(best.plainLyrics);
        }
      }
    } catch {}
  }

  if (!lines?.length && cleanArtist.includes("&")) {
    try {
      const primaryArtist = cleanArtist.split("&")[0].trim();
      const list = (await withTimeout(
        `https://lrclib.net/api/search?track_name=${qTrack}&artist_name=${encodeURIComponent(primaryArtist)}`
      )) as LrcLibRecord[];
      const withLyrics = (list ?? []).filter((r) => r.syncedLyrics || r.plainLyrics);
      if (withLyrics.length) {
        const best = withLyrics.find((r) => r.syncedLyrics) || withLyrics[0];
        if (best.syncedLyrics) {
          raw = best.syncedLyrics;
          lines = parseLrc(best.syncedLyrics);
        } else if (best.plainLyrics) {
          lines = parsePlainLyrics(best.plainLyrics);
        }
      }
    } catch {}
  }

  if (CACHE.size > 100) {
    CACHE.clear();
    RAW.clear();
  }

  CACHE.set(key, lines);
  RAW.set(key, raw);
  return lines && lines.length > 0 ? { lines, raw } : null;
}

export interface TrackLyricsResult {
  rawLrc: string | null;
  lines: SimpleLyricLine[];
  VisualLines: VisualLyricLine[];
}

export async function loadTrackLyrics(
  trackName: string,
  artistName: string,
  durationSec?: number,
): Promise<TrackLyricsResult | null> {
  const res = await fetchLyricsFromLrclib(trackName, artistName, durationSec);
  if (!res) return null;
  return {
    rawLrc: res.raw,
    lines: res.lines,
    VisualLines: [],
  };
}

export function activeLyricIndex(lines: SimpleLyricLine[], t: number): number {
  if (!lines.length) return -1;
  if (lines[0]?.t === null) return -1;
  if (t < (lines[0]?.t ?? 0)) return 0;
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const line = lines[mid];
    if (line && line.t !== null && line.t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
