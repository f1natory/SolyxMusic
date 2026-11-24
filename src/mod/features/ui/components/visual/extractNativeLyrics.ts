import type { LyricLine as VisualLyricLine } from "@visual/interfaces.ts";

export interface NativeLyricLine {
  fromSec: number;
  toSec?: number;
  text: string;
  key?: string | number;
  words?: Array<{
    startTime: number;
    endTime: number;
    word: string;
  }>;
}

let cachedStore: any = null;

export function getRootStore(): any | null {
  if (
    typeof window !== "undefined" &&
    typeof (window as any).__yandexMusicStore === "object" &&
    (window as any).__yandexMusicStore !== null
  ) {
    return (window as any).__yandexMusicStore;
  }

  if (cachedStore?.fullscreenPlayer && cachedStore?.sonataState) {
    return cachedStore;
  }

  if (typeof document === "undefined") {
    return null;
  }

  try {
    const candidates = [
      document.querySelector('div[data-test-id="SYNC_LYRICS_CONTENT"]'),
      document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]'),
      document.querySelector('section[data-test-id="PLAYERBAR_DESKTOP"]'),
      document.querySelector("#__next"),
      document.body,
    ].filter(Boolean) as HTMLElement[];

    for (const el of candidates) {
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
      if (!fiberKey) continue;

      let root = (el as any)[fiberKey];
      while (root?.return) root = root.return;

      const stack = [root];
      let iterations = 0;
      while (stack.length > 0 && iterations < 2500) {
        iterations++;
        const f = stack.pop();
        if (!f) continue;

        const val = f.memoizedProps?.value;
        if (val && typeof val === "object") {
          if (val.fullscreenPlayer || val.sonataState || val.playerState) {
            cachedStore = val;
            try {
              (window as any).__yandexMusicStore = val;
            } catch {}
            return val;
          }
        }
        if (f.memoizedProps?.fullscreenPlayer) {
          cachedStore = f.memoizedProps;
          try {
            (window as any).__yandexMusicStore = f.memoizedProps;
          } catch {}
          return f.memoizedProps;
        }

        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
      }
    }
  } catch (err) {
    console.debug("[Visual Mod] getRootStore error:", err);
  }
  return null;
}

export function isSameTrackId(a: any, b: any): boolean {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  if (typeof a === "number" && Number.isNaN(a)) return false;
  if (typeof b === "number" && Number.isNaN(b)) return false;
  const sa = String(a).trim();
  const sb = String(b).trim();
  if (!sa || !sb || sa === "NaN" || sb === "NaN") return false;

  const pa = sa.split(":");
  const pb = sb.split(":");

  const baseA = (pa[0] ?? "").trim();
  const baseB = (pb[0] ?? "").trim();
  return baseA.length > 0 && baseA === baseB;
}

export function requestNativeLyrics(trackId?: string | null): boolean {
  if (!trackId) return false;
  const store = getRootStore();
  const syncLyrics = store?.fullscreenPlayer?.syncLyrics || store?.syncLyrics;
  if (!syncLyrics) return false;

  if (
    isSameTrackId(syncLyrics.currentTrackId, trackId) &&
    (syncLyrics.isResolved || syncLyrics.loadingState === "RESOLVE")
  ) {
    return true;
  }

  if (
    isSameTrackId(syncLyrics.currentTrackId, trackId) &&
    syncLyrics.loadingState === "PENDING"
  ) {
    return true;
  }

  if (typeof syncLyrics.getData === "function") {
    try {
      const targetId = store?.sonataState?.entityMeta?.id ?? trackId;
      syncLyrics.getData(targetId);
      return true;
    } catch {

    }
  }
  return false;
}

export function parseRawNativeLines(rawLines: any[]): NativeLyricLine[] {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return [];

  const parsed: NativeLyricLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (!raw) continue;

    const text = String(raw.text || raw.word || raw.value || raw.line || "").trim();
    if (!text) continue;

    let fromSec: number | undefined;
    let toSec: number | undefined;

    if (typeof raw.fromSec === "number" && Number.isFinite(raw.fromSec)) {
      fromSec = raw.fromSec;
    } else if (typeof raw.fromSec === "string") {
      const p = parseFloat(raw.fromSec);
      if (Number.isFinite(p)) fromSec = p;
    }

    if (typeof raw.toSec === "number" && Number.isFinite(raw.toSec)) {
      toSec = raw.toSec;
    } else if (typeof raw.toSec === "string") {
      const p = parseFloat(raw.toSec);
      if (Number.isFinite(p)) toSec = p;
    }

    if (fromSec === undefined && typeof raw.fromMs === "number" && Number.isFinite(raw.fromMs)) {
      fromSec = raw.fromMs / 1000;
    }
    if (toSec === undefined && typeof raw.toMs === "number" && Number.isFinite(raw.toMs)) {
      toSec = raw.toMs / 1000;
    }

    if (fromSec === undefined && raw.key !== undefined) {
      const cleanKey = String(raw.key).replace(/^[^\d]*/, "");
      const match = cleanKey.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/);
      if (match && match[1] && match[2]) {
        const fSec = parseFloat(match[1]);
        const tSec = parseFloat(match[2]);
        if (Number.isFinite(fSec)) fromSec = fSec;
        if (toSec === undefined && Number.isFinite(tSec)) toSec = tSec;
      } else {
        const single = cleanKey.match(/^(\d+(?:\.\d+)?)/);
        if (single && single[1]) {
          const sSec = parseFloat(single[1]);
          if (Number.isFinite(sSec)) fromSec = sSec;
        }
      }
    }

    if (fromSec === undefined) {
      fromSec = i * 4;
    }

    let words: Array<{ startTime: number; endTime: number; word: string }> | undefined = undefined;
    if (Array.isArray(raw.words) && raw.words.length > 0) {
      const mapped = raw.words
        .map((w: any) => {
          if (!w || typeof w !== "object") return null;
          const wText = String(w.text || w.word || "").trim();
          if (!wText) return null;
          const wFrom =
            typeof w.fromSec === "number"
              ? w.fromSec * 1000
              : typeof w.fromMs === "number"
              ? w.fromMs
              : (fromSec ?? 0) * 1000;
          const wTo =
            typeof w.toSec === "number"
              ? w.toSec * 1000
              : typeof w.toMs === "number"
              ? w.toMs
              : (toSec ?? (fromSec ?? 0) + 4) * 1000;
          return {
            startTime: Math.round(wFrom),
            endTime: Math.round(wTo),
            word: wText,
          };
        })
        .filter((w: any): w is { startTime: number; endTime: number; word: string } => w !== null);
      if (mapped.length > 0) {
        words = mapped;
      }
    }

    parsed.push({
      fromSec,
      toSec: toSec !== undefined && toSec > fromSec ? toSec : undefined,
      text,
      key: raw.key || `${fromSec}:${toSec ?? i}`,
      words,
    });
  }

  if (parsed.length === 0) return [];

  parsed.sort((a, b) => a.fromSec - b.fromSec);

  for (let i = 0; i < parsed.length; i++) {
    const curr = parsed[i];
    if (!curr) continue;
    const next = parsed[i + 1];
    if (curr.toSec === undefined || curr.toSec <= curr.fromSec) {
      if (next && next.fromSec > curr.fromSec) {
        curr.toSec = next.fromSec;
      } else {
        curr.toSec = curr.fromSec + 4;
      }
    }
  }

  const deduped: NativeLyricLine[] = [];
  for (const line of parsed) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.text === line.text && Math.abs(prev.fromSec - line.fromSec) < 0.5) {
      continue;
    }
    deduped.push(line);
  }

  return deduped;
}

export function getNativeSyncLyricsLines(expectedTrackId?: string | null): NativeLyricLine[] | null {
  const store = getRootStore();
  const syncLyrics = store?.fullscreenPlayer?.syncLyrics || store?.syncLyrics;

  if (expectedTrackId) {
    if (!syncLyrics) return null;

    if (syncLyrics.currentTrackId && !isSameTrackId(syncLyrics.currentTrackId, expectedTrackId)) {
      return null;
    }

    const isLoaded = syncLyrics.isResolved === true || syncLyrics.loadingState === "RESOLVE";
    if (!isLoaded || syncLyrics.loadingState === "PENDING") {
      return null;
    }

    if (!isSameTrackId(syncLyrics.currentTrackId, expectedTrackId)) {
      return null;
    }

    if (syncLyrics.lines && syncLyrics.lines.length > 0) {
      const rawLines = Array.from(syncLyrics.lines);
      const parsed = parseRawNativeLines(rawLines);
      if (parsed.length > 0) return parsed;
    }

    return null;
  }

  if (syncLyrics && syncLyrics.lines && (syncLyrics.isResolved || syncLyrics.loadingState === "RESOLVE")) {
    const rawLines = Array.from(syncLyrics.lines);
    if (rawLines.length > 0) {
      const parsed = parseRawNativeLines(rawLines);
      if (parsed.length > 0) return parsed;
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  const syncContent = document.querySelector('div[data-test-id="SYNC_LYRICS_CONTENT"]');
  if (syncContent) {
    const fiberKey = Object.keys(syncContent).find((k) => k.startsWith("__reactFiber$"));
    if (fiberKey) {
      const rootFiber = (syncContent as any)[fiberKey];

      let upNode = rootFiber;
      let upLevels = 0;
      while (upNode && upLevels < 20) {
        upLevels++;
        const props = upNode.memoizedProps;
        if (props) {
          const candidate =
            props.lines ||
            props.syncLyrics?.lines ||
            props.syncLyricsLines ||
            props.store?.fullscreenPlayer?.syncLyrics?.lines;
          if (candidate && Array.isArray(candidate) && candidate.length > 0) {
            const parsed = parseRawNativeLines(Array.from(candidate));
            if (parsed.length > 0) return parsed;
          }
        }
        const state = upNode.memoizedState;
        if (state) {
          const candidate = state.lines || state.syncLyrics?.lines;
          if (candidate && Array.isArray(candidate) && candidate.length > 0) {
            const parsed = parseRawNativeLines(Array.from(candidate));
            if (parsed.length > 0) return parsed;
          }
        }
        upNode = upNode.return;
      }

      const queue = [rootFiber];
      let steps = 0;
      while (queue.length > 0 && steps < 500) {
        steps++;
        const node = queue.shift();
        if (!node) continue;

        const props = node.memoizedProps;
        if (props) {
          const candidate = props.lines || props.syncLyrics?.lines || props.syncLyricsLines;
          if (candidate && Array.isArray(candidate) && candidate.length > 0) {
            const parsed = parseRawNativeLines(Array.from(candidate));
            if (parsed.length > 0) return parsed;
          }
        }

        if (node.child) queue.push(node.child);
        if (node.sibling) queue.push(node.sibling);
      }
    }

    const lineEls = syncContent.querySelectorAll('div[data-test-id="SYNC_LYRICS_LINE"]');
    if (lineEls.length > 0) {
      const rawLineItems: any[] = [];
      lineEls.forEach((el, idx) => {
        const text = el.textContent?.trim() || "";
        if (!text) return;

        let fromSec: number | undefined;
        let toSec: number | undefined;
        let key: string | undefined;

        const fKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
        if (fKey) {
          let f = (el as any)[fKey];
          let depth = 0;
          while (f && depth < 8) {
            depth++;
            if (typeof f.key === "string" && !key) {
              key = f.key;
            }

            if (fromSec === undefined && typeof f.key === "string") {
              const cleanKey = f.key.replace(/^[^\d]*/, "");
              const match = cleanKey.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/);
              if (match && match[1] && match[2]) {
                const fSec = parseFloat(match[1]);
                const tSec = parseFloat(match[2]);
                if (Number.isFinite(fSec)) fromSec = fSec;
                if (Number.isFinite(tSec)) toSec = tSec;
              } else {
                const single = cleanKey.match(/^(\d+(?:\.\d+)?)/);
                if (single && single[1]) {
                  const sSec = parseFloat(single[1]);
                  if (Number.isFinite(sSec)) fromSec = sSec;
                }
              }
            }

            const lineProp = f.memoizedProps?.line || f.memoizedProps?.item;
            if (lineProp && typeof lineProp === "object") {
              if (fromSec === undefined && typeof lineProp.fromSec === "number") {
                fromSec = lineProp.fromSec;
              }
              if (toSec === undefined && typeof lineProp.toSec === "number") {
                toSec = lineProp.toSec;
              }
              if (fromSec === undefined && typeof lineProp.fromMs === "number") {
                fromSec = lineProp.fromMs / 1000;
              }
              if (toSec === undefined && typeof lineProp.toMs === "number") {
                toSec = lineProp.toMs / 1000;
              }
            }

            if (fromSec === undefined && typeof f.memoizedProps?.fromSec === "number") {
              fromSec = f.memoizedProps.fromSec;
            }
            if (toSec === undefined && typeof f.memoizedProps?.toSec === "number") {
              toSec = f.memoizedProps.toSec;
            }

            f = f.return;
          }
        }

        const htmlEl = el as HTMLElement;
        if (fromSec === undefined && htmlEl.dataset?.fromSec) {
          const parsed = parseFloat(htmlEl.dataset.fromSec);
          if (Number.isFinite(parsed)) fromSec = parsed;
        }
        if (toSec === undefined && htmlEl.dataset?.toSec) {
          const parsed = parseFloat(htmlEl.dataset.toSec);
          if (Number.isFinite(parsed)) toSec = parsed;
        }

        rawLineItems.push({
          fromSec,
          toSec,
          text,
          key: key || `${fromSec ?? idx * 4}:${toSec ?? (fromSec ?? idx * 4) + 4}`,
        });
      });

      if (rawLineItems.length > 0) {
        const parsed = parseRawNativeLines(rawLineItems);
        if (parsed.length > 0) return parsed;
      }
    }
  }

  return null;
}

export function nativeLinesToVisualLines(nativeLines: NativeLyricLine[]): VisualLyricLine[] {
  return nativeLines.map((l, idx) => {
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
}

export function extractNativeLyricsFromStore(
  store: any,
  trackId?: string | null
): VisualLyricLine[] | null {
  if (!store) return null;
  const syncLyrics = store.fullscreenPlayer?.syncLyrics || store.syncLyrics;
  if (!syncLyrics || !syncLyrics.lines) return null;

  if (trackId && syncLyrics.currentTrackId && !isSameTrackId(syncLyrics.currentTrackId, trackId)) {
    return null;
  }

  const effectiveStoreTrackId =
    syncLyrics.currentTrackId ??
    store.sonataState?.entityMeta?.id ??
    store.playerState?.track?.id;

  const isMatching = !trackId || isSameTrackId(effectiveStoreTrackId, trackId);
  if (!isMatching) return null;

  const rawLines = Array.from(syncLyrics.lines);
  if (rawLines.length === 0) return null;

  const parsed = parseRawNativeLines(rawLines);
  if (parsed.length === 0) return null;

  return nativeLinesToVisualLines(parsed);
}

export function extractNativeLyricsFromDom(
  container: Element,
  trackId?: string | null
): VisualLyricLine[] | null {
  if (!container) return null;

  if (trackId) {
    const store = getRootStore();
    const syncLyrics = store?.fullscreenPlayer?.syncLyrics || store?.syncLyrics;
    if (syncLyrics?.currentTrackId && !isSameTrackId(syncLyrics.currentTrackId, trackId)) {
      return null;
    }
  }

  const fiberKey = Object.keys(container).find((k) => k.startsWith("__reactFiber$"));
  if (fiberKey) {
    const rootFiber = (container as any)[fiberKey];

    let upNode = rootFiber;
    let upLevels = 0;
    while (upNode && upLevels < 20) {
      upLevels++;
      const props = upNode.memoizedProps;
      if (props) {
        const candidate =
          props.lines ||
          props.syncLyrics?.lines ||
          props.syncLyricsLines ||
          props.store?.fullscreenPlayer?.syncLyrics?.lines;
        if (candidate && Array.isArray(candidate) && candidate.length > 0) {
          const parsed = parseRawNativeLines(Array.from(candidate));
          if (parsed.length > 0) return nativeLinesToVisualLines(parsed);
        }
      }
      const state = upNode.memoizedState;
      if (state) {
        const candidate = state.lines || state.syncLyrics?.lines;
        if (candidate && Array.isArray(candidate) && candidate.length > 0) {
          const parsed = parseRawNativeLines(Array.from(candidate));
          if (parsed.length > 0) return nativeLinesToVisualLines(parsed);
        }
      }
      upNode = upNode.return;
    }

    const queue = [rootFiber];
    let steps = 0;
    while (queue.length > 0 && steps < 500) {
      steps++;
      const node = queue.shift();
      if (!node) continue;

      const props = node.memoizedProps;
      if (props) {
        const candidate = props.lines || props.syncLyrics?.lines || props.syncLyricsLines;
        if (candidate && Array.isArray(candidate) && candidate.length > 0) {
          const parsed = parseRawNativeLines(Array.from(candidate));
          if (parsed.length > 0) return nativeLinesToVisualLines(parsed);
        }
      }

      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
  }

  const lineEls = container.querySelectorAll('div[data-test-id="SYNC_LYRICS_LINE"]');
  if (lineEls.length > 0) {
    const rawLineItems: any[] = [];
    lineEls.forEach((el, idx) => {
      const text = el.textContent?.trim() || "";
      if (!text) return;

      let fromSec: number | undefined;
      let toSec: number | undefined;
      let key: string | undefined;

      const fKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
      if (fKey) {
        let f = (el as any)[fKey];
        let depth = 0;
        while (f && depth < 8) {
          depth++;
          if (typeof f.key === "string" && !key) {
            key = f.key;
          }

          if (fromSec === undefined && typeof f.key === "string") {
            const cleanKey = f.key.replace(/^[^\d]*/, "");
            const match = cleanKey.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/);
            if (match && match[1] && match[2]) {
              const fSec = parseFloat(match[1]);
              const tSec = parseFloat(match[2]);
              if (Number.isFinite(fSec)) fromSec = fSec;
              if (Number.isFinite(tSec)) toSec = tSec;
            } else {
              const single = cleanKey.match(/^(\d+(?:\.\d+)?)/);
              if (single && single[1]) {
                const sSec = parseFloat(single[1]);
                if (Number.isFinite(sSec)) fromSec = sSec;
              }
            }
          }

          const lineProp = f.memoizedProps?.line || f.memoizedProps?.item;
          if (lineProp && typeof lineProp === "object") {
            if (fromSec === undefined && typeof lineProp.fromSec === "number") {
              fromSec = lineProp.fromSec;
            }
            if (toSec === undefined && typeof lineProp.toSec === "number") {
              toSec = lineProp.toSec;
            }
            if (fromSec === undefined && typeof lineProp.fromMs === "number") {
              fromSec = lineProp.fromMs / 1000;
            }
            if (toSec === undefined && typeof lineProp.toMs === "number") {
              toSec = lineProp.toMs / 1000;
            }
          }

          if (fromSec === undefined && typeof f.memoizedProps?.fromSec === "number") {
            fromSec = f.memoizedProps.fromSec;
          }
          if (toSec === undefined && typeof f.memoizedProps?.toSec === "number") {
            toSec = f.memoizedProps.toSec;
          }

          f = f.return;
        }
      }

      const htmlEl = el as HTMLElement;
      if (fromSec === undefined && htmlEl.dataset?.fromSec) {
        const parsed = parseFloat(htmlEl.dataset.fromSec);
        if (Number.isFinite(parsed)) fromSec = parsed;
      }
      if (toSec === undefined && htmlEl.dataset?.toSec) {
        const parsed = parseFloat(htmlEl.dataset.toSec);
        if (Number.isFinite(parsed)) toSec = parsed;
      }

      rawLineItems.push({
        fromSec,
        toSec,
        text,
        key: key || `${fromSec ?? idx * 4}:${toSec ?? (fromSec ?? idx * 4) + 4}`,
      });
    });

    if (rawLineItems.length > 0) {
      const parsed = parseRawNativeLines(rawLineItems);
      if (parsed.length > 0) return nativeLinesToVisualLines(parsed);
    }
  }

  return null;
}

export function extractNativeLyrics(
  container?: Element | null,
  trackId?: string | null
): VisualLyricLine[] | null {
  const store = getRootStore();
  const fromStore = extractNativeLyricsFromStore(store, trackId);
  if (fromStore && fromStore.length > 0) return fromStore;

  const resolvedContainer =
    container || (typeof document !== "undefined" ? document.querySelector('div[data-test-id="SYNC_LYRICS_CONTENT"]') : null);
  if (resolvedContainer) {
    const fromDom = extractNativeLyricsFromDom(resolvedContainer, trackId);
    if (fromDom && fromDom.length > 0) return fromDom;
  }

  return null;
}
