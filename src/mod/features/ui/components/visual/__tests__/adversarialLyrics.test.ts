import { describe, it, expect } from "bun:test";
import {
  isSameTrackId,
  parseRawNativeLines,
  nativeLinesToVisualLines,
  extractNativeLyricsFromStore,
  extractNativeLyricsFromDom,
  extractNativeLyrics,
} from "../extractNativeLyrics";

describe("Adversarial Stress Test: extractNativeLyrics", () => {

  describe("1. isSameTrackId Adversarial Suite", () => {
    it("1.1 Standard matching cases", () => {
      expect(isSameTrackId("12345", "12345")).toBe(true);
      expect(isSameTrackId("track-abc", "track-abc")).toBe(true);
      expect(isSameTrackId("0", "0")).toBe(true);
      expect(isSameTrackId("9999999999", "9999999999")).toBe(true);
    });

    it("1.2 Context cases (${trackId}:${albumId})", () => {

      expect(isSameTrackId("12345:67890", "12345")).toBe(true);
      expect(isSameTrackId("12345", "12345:67890")).toBe(true);
      expect(isSameTrackId("12345", "12345:99999")).toBe(true);

      expect(isSameTrackId("12345:67890", "12345:99999")).toBe(true);

      expect(isSameTrackId("12345:67890", "12345:67890")).toBe(true);
    });

    it("1.3 CRITICAL FALSE POSITIVE CHECK: Same album, different track MUST BE FALSE", () => {

      expect(isSameTrackId("12345:67890", "99999:67890")).toBe(false);
      expect(isSameTrackId("trackA:album1", "trackB:album1")).toBe(false);
      expect(isSameTrackId("1:999", "2:999")).toBe(false);
      expect(isSameTrackId("12345:12345", "99999:12345")).toBe(false);
    });

    it("1.4 Multi-colon / hierarchical contexts", () => {

      expect(isSameTrackId("abc:def:ghi", "abc")).toBe(true);
      expect(isSameTrackId("abc:def:ghi", "abc:xyz")).toBe(true);
      expect(isSameTrackId("abc:def:ghi", "abc:def:ghi")).toBe(true);
      expect(isSameTrackId("abc:def:ghi", "def:def:ghi")).toBe(false);
    });

    it("1.5 Numeric inputs", () => {
      expect(isSameTrackId(12345, "12345")).toBe(true);
      expect(isSameTrackId("12345", 12345)).toBe(true);
      expect(isSameTrackId(12345, "12345:67890")).toBe(true);
      expect(isSameTrackId("12345:67890", 12345)).toBe(true);
      expect(isSameTrackId(12345, 12345)).toBe(true);
      expect(isSameTrackId(12345, 67890)).toBe(false);
      expect(isSameTrackId(0, 0)).toBe(true);
      expect(isSameTrackId(0, "0")).toBe(true);
      expect(isSameTrackId(0, "0:album")).toBe(true);
      expect(isSameTrackId(0, 1)).toBe(false);
    });

    it("1.6 Whitespace handling", () => {
      expect(isSameTrackId("  12345  ", "12345")).toBe(true);
      expect(isSameTrackId("  12345:67890  ", " 12345 ")).toBe(true);
      expect(isSameTrackId("  12345 : 67890  ", " 12345 ")).toBe(true);
      expect(isSameTrackId("\t12345\n", "12345")).toBe(true);
    });

    it("1.7 Null, undefined, empty, and falsy values", () => {
      expect(isSameTrackId(null, "12345")).toBe(false);
      expect(isSameTrackId("12345", null)).toBe(false);
      expect(isSameTrackId(undefined, "12345")).toBe(false);
      expect(isSameTrackId("12345", undefined)).toBe(false);
      expect(isSameTrackId(null, null)).toBe(false);
      expect(isSameTrackId(undefined, undefined)).toBe(false);
      expect(isSameTrackId("", "")).toBe(false);
      expect(isSameTrackId("", "12345")).toBe(false);
      expect(isSameTrackId("12345", "")).toBe(false);
      expect(isSameTrackId("   ", "   ")).toBe(false);
      expect(isSameTrackId("   ", "12345")).toBe(false);
      expect(isSameTrackId("\t\n", "")).toBe(false);
    });

    it("1.8 Colon-only edge cases", () => {

      expect(isSameTrackId(":67890", ":99999")).toBe(false);
      expect(isSameTrackId(":67890", "12345:67890")).toBe(false);
      expect(isSameTrackId(":", ":12345")).toBe(false);
      expect(isSameTrackId(":::", ":::12345")).toBe(false);
      expect(isSameTrackId(" : ", "12345")).toBe(false);
    });

    it("1.9 Non-string primitives and objects", () => {
      expect(isSameTrackId(false, "12345")).toBe(false);
      expect(isSameTrackId(true, "12345")).toBe(false);
      expect(isSameTrackId({}, "12345")).toBe(false);
      expect(isSameTrackId([], "12345")).toBe(false);
    });

    it("1.10 Edge case behavior: identical colon-only strings and NaN", () => {

      expect(isSameTrackId(":", ":")).toBe(false);
      expect(isSameTrackId(":::", ":::")).toBe(false);
      expect(isSameTrackId(Number.NaN, Number.NaN)).toBe(false);
    });
  });

  describe("2. Fiber Key Parsing & NaN Prevention Suite", () => {
    it("2.1 React 18 map keys with '.$' prefix", () => {
      const cases = [
        { key: ".$12.3:15.8", expFrom: 12.3, expTo: 15.8 },
        { key: ".$0:4", expFrom: 0, expTo: 4 },
        { key: ".$0.0:0.5", expFrom: 0.0, expTo: 0.5 },
        { key: ".$999.999:1005.12", expFrom: 999.999, expTo: 1005.12 },
        { key: ".$100:200", expFrom: 100, expTo: 200 },
        { key: ".$3.14159:6.28318", expFrom: 3.14159, expTo: 6.28318 },
      ];

      for (const c of cases) {
        const parsed = parseRawNativeLines([{ key: c.key, text: "Lyrics" }]);
        expect(parsed).toHaveLength(1);
        expect(parsed[0]!.fromSec).toBe(c.expFrom);
        expect(parsed[0]!.toSec).toBe(c.expTo);
        expect(Number.isFinite(parsed[0]!.fromSec)).toBe(true);
        expect(Number.isFinite(parsed[0]!.toSec!)).toBe(true);
      }
    });

    it("2.2 Unusual prefixes and separator variations", () => {
      const cases = [
        { key: "line-12.5:16.0", expFrom: 12.5, expTo: 16.0 },
        { key: "prefix_99.1:105.4", expFrom: 99.1, expTo: 105.4 },
        { key: "$$$15:20", expFrom: 15, expTo: 20 },
        { key: "...42.0:48.0", expFrom: 42.0, expTo: 48.0 },
        { key: "item#7:11", expFrom: 7, expTo: 11 },
      ];

      for (const c of cases) {
        const parsed = parseRawNativeLines([{ key: c.key, text: "Lyrics" }]);
        expect(parsed).toHaveLength(1);
        expect(parsed[0]!.fromSec).toBe(c.expFrom);
        expect(parsed[0]!.toSec).toBe(c.expTo);
        expect(Number.isFinite(parsed[0]!.fromSec)).toBe(true);
      }
    });

    it("2.3 Single timestamp format without colon", () => {
      const parsed = parseRawNativeLines([
        { key: "12.5", text: "Line 1" },
        { key: ".$25.0", text: "Line 2" },
        { key: "line-40", text: "Line 3" },
      ]);

      expect(parsed).toHaveLength(3);
      expect(parsed[0]!.fromSec).toBe(12.5);
      expect(parsed[0]!.toSec).toBe(25.0);
      expect(parsed[1]!.fromSec).toBe(25.0);
      expect(parsed[1]!.toSec).toBe(40.0);
      expect(parsed[2]!.fromSec).toBe(40.0);
      expect(parsed[2]!.toSec).toBe(44.0);
    });

    it("2.4 Corrupted, non-numerical, or NaN keys MUST NEVER produce NaN", () => {
      const adversarialKeys = [
        "",
        "invalid",
        ".$NaN:NaN",
        "NaN:NaN",
        ".$undefined:undefined",
        "null",
        "---",
        ":::",
        ".$Infinity:Infinity",
        "abc:def",
        "line-NaN",
      ];

      for (let i = 0; i < adversarialKeys.length; i++) {
        const parsed = parseRawNativeLines([
          { key: adversarialKeys[i], text: `Line ${i}` },
        ]);
        expect(parsed).toHaveLength(1);
        expect(Number.isFinite(parsed[0]!.fromSec)).toBe(true);
        expect(Number.isNaN(parsed[0]!.fromSec)).toBe(false);
        expect(Number.isFinite(parsed[0]!.toSec!)).toBe(true);
        expect(Number.isNaN(parsed[0]!.toSec)).toBe(false);
      }
    });

    it("2.5 Partial NaN in colon keys (e.g. '.$12.5:NaN' or '.$NaN:15.5')", () => {

      const parsed1 = parseRawNativeLines([
        { key: ".$12.5:NaN", text: "Line 1" },
      ]);
      expect(parsed1).toHaveLength(1);
      expect(parsed1[0]!.fromSec).toBe(12.5);
      expect(parsed1[0]!.toSec).toBe(16.5);
      expect(Number.isFinite(parsed1[0]!.fromSec)).toBe(true);
      expect(Number.isFinite(parsed1[0]!.toSec!)).toBe(true);

      const parsed2 = parseRawNativeLines([
        { key: ".$NaN:15.5", text: "Line 2" },
      ]);
      expect(parsed2).toHaveLength(1);
      expect(Number.isFinite(parsed2[0]!.fromSec)).toBe(true);
      expect(Number.isFinite(parsed2[0]!.toSec!)).toBe(true);
    });

    it("2.6 Negative timestamps in keys", () => {

      const parsed = parseRawNativeLines([
        { key: "-5:10", text: "Intro line" },
      ]);
      expect(parsed).toHaveLength(1);
      expect(Number.isFinite(parsed[0]!.fromSec)).toBe(true);
      expect(Number.isFinite(parsed[0]!.toSec!)).toBe(true);
      expect(parsed[0]!.toSec!).toBeGreaterThan(parsed[0]!.fromSec);
    });
  });

  describe("3. Synthetic MobX Store Data Suite", () => {
    it("3.1 Standard store shape with fullscreenPlayer.syncLyrics", () => {
      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "1001",
            lines: [
              { fromSec: 0, toSec: 3.5, text: "Verse 1 line 1" },
              { fromSec: 4.0, toSec: 7.2, text: "Verse 1 line 2" },
              { fromSec: 8.0, toSec: 12.0, text: "Chorus line 1" },
            ],
          },
        },
      };

      const result = extractNativeLyricsFromStore(store, "1001");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(3);
      expect(result![0]!.startTime).toBe(0);
      expect(result![0]!.endTime).toBe(3500);
      expect(result![0]!.words[0]!.word).toBe("Verse 1 line 1");
      expect(result![1]!.startTime).toBe(4000);
      expect(result![1]!.endTime).toBe(7200);
      expect(result![2]!.startTime).toBe(8000);
      expect(result![2]!.endTime).toBe(12000);
    });

    it("3.2 Missing toSec in store lines (auto inference)", () => {
      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "1002",
            lines: [
              { fromSec: 10, text: "No toSec Line 1" },
              { fromSec: 18, text: "No toSec Line 2" },
              { fromSec: 25, text: "No toSec Line 3" },
            ],
          },
        },
      };

      const result = extractNativeLyricsFromStore(store, "1002");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(3);
      expect(result![0]!.startTime).toBe(10000);
      expect(result![0]!.endTime).toBe(18000);
      expect(result![1]!.startTime).toBe(18000);
      expect(result![1]!.endTime).toBe(25000);
      expect(result![2]!.startTime).toBe(25000);
      expect(result![2]!.endTime).toBe(29000);
    });

    it("3.3 Overlapping and inverted timestamps", () => {
      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "1003",
            lines: [

              { fromSec: 20, toSec: 10, text: "Inverted time" },

              { fromSec: 15, toSec: 30, text: "Overlap line" },
            ],
          },
        },
      };

      const result = extractNativeLyricsFromStore(store, "1003");
      expect(result).not.toBeNull();

      expect(result).toHaveLength(2);
      expect(result![0]!.startTime).toBe(15000);
      expect(result![0]!.endTime).toBe(30000);
      expect(result![1]!.startTime).toBe(20000);
      expect(result![1]!.endTime).toBe(24000);
      expect(result![1]!.endTime).toBeGreaterThan(result![1]!.startTime);
    });

    it("3.4 Empty line arrays and null lines", () => {
      const storeEmpty = {
        fullscreenPlayer: {
          syncLyrics: { currentTrackId: "1004", lines: [] },
        },
      };
      expect(extractNativeLyricsFromStore(storeEmpty, "1004")).toBeNull();

      const storeNullLines = {
        fullscreenPlayer: {
          syncLyrics: { currentTrackId: "1004", lines: null },
        },
      };
      expect(extractNativeLyricsFromStore(storeNullLines, "1004")).toBeNull();

      const storeUndefinedLines = {
        fullscreenPlayer: {
          syncLyrics: { currentTrackId: "1004" },
        },
      };
      expect(extractNativeLyricsFromStore(storeUndefinedLines, "1004")).toBeNull();
    });

    it("3.5 Corrupted / sparse array elements in lines", () => {
      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "1005",
            lines: [
              null,
              undefined,
              {},
              { text: "" },
              { text: "   " },
              { fromSec: "not-a-number", toSec: "invalid", text: "" },
              { fromSec: 10, toSec: 14, text: "Only valid line" },
              null,
            ],
          },
        },
      };

      const result = extractNativeLyricsFromStore(store, "1005");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]!.words[0]!.word).toBe("Only valid line");
      expect(result![0]!.startTime).toBe(10000);
      expect(result![0]!.endTime).toBe(14000);
    });

    it("3.6 MobX ObservableArray emulation", () => {

      const mockObservableArray = {
        0: { fromSec: 1.0, toSec: 3.0, text: "MobX line 1" },
        1: { fromSec: 3.5, toSec: 6.0, text: "MobX line 2" },
        length: 2,
        [Symbol.iterator]: function* () {
          yield this[0];
          yield this[1];
        },
      };

      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "1006",
            lines: mockObservableArray,
          },
        },
      };

      const result = extractNativeLyricsFromStore(store, "1006");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0]!.words[0]!.word).toBe("MobX line 1");
      expect(result![1]!.words[0]!.word).toBe("MobX line 2");
    });

    it("3.7 Fallback track ID locations: sonataState and playerState", () => {

      const storeSonata = {
        fullscreenPlayer: {
          syncLyrics: {
            lines: [{ fromSec: 0, toSec: 4, text: "Sonata line" }],
          },
        },
        sonataState: {
          entityMeta: { id: "track-sonata" },
        },
      };
      expect(
        extractNativeLyricsFromStore(storeSonata, "track-sonata")
      ).not.toBeNull();

      const storePlayer = {
        fullscreenPlayer: {
          syncLyrics: {
            lines: [{ fromSec: 0, toSec: 4, text: "Player line" }],
          },
        },
        playerState: {
          track: { id: "track-player" },
        },
      };
      expect(
        extractNativeLyricsFromStore(storePlayer, "track-player")
      ).not.toBeNull();
    });

    it("3.8 Alternative store root (store.syncLyrics instead of store.fullscreenPlayer)", () => {
      const store = {
        syncLyrics: {
          currentTrackId: "alt-root",
          lines: [{ fromSec: 5, toSec: 10, text: "Alt root line" }],
        },
      };

      const result = extractNativeLyricsFromStore(store, "alt-root");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]!.words[0]!.word).toBe("Alt root line");
    });

    it("3.9 String numerical timestamps (fromSec as string)", () => {
      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "str-time",
            lines: [
              { fromSec: "12.34", toSec: "16.78", text: "String floats" },
              { fromMs: 20000, toMs: 25000, text: "Millisecond values" },
            ],
          },
        },
      };

      const result = extractNativeLyricsFromStore(store, "str-time");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0]!.startTime).toBe(12340);
      expect(result![0]!.endTime).toBe(16780);
      expect(result![1]!.startTime).toBe(20000);
      expect(result![1]!.endTime).toBe(25000);
    });

    it("3.10 Word-level timestamps parsing and safety", () => {
      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "words-track",
            lines: [
              {
                fromSec: 10,
                toSec: 15,
                text: "One two three",
                words: [
                  { word: "One", fromSec: 10.0, toSec: 11.2 },
                  { word: "two", fromSec: 11.3, toSec: 12.8 },
                  { word: "three", fromSec: 13.0, toSec: 14.9 },
                ],
              },
            ],
          },
        },
      };

      const result = extractNativeLyricsFromStore(store, "words-track");
      expect(result).not.toBeNull();
      expect(result![0]!.words).toHaveLength(3);
      expect(result![0]!.words[0]!).toEqual({
        startTime: 10000,
        endTime: 11200,
        word: "One",
      });
      expect(result![0]!.words[1]!).toEqual({
        startTime: 11300,
        endTime: 12800,
        word: "two",
      });
      expect(result![0]!.words[2]!).toEqual({
        startTime: 13000,
        endTime: 14900,
        word: "three",
      });
    });

    it("3.11 Word-level timestamps with empty or invalid words", () => {
      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "words-empty",
            lines: [
              {
                fromSec: 10,
                toSec: 15,
                text: "Fallback line",
                words: [
                  null,
                  undefined,
                  { word: "" },
                  { word: "   " },
                  { invalid: true },
                ],
              },
            ],
          },
        },
      };

      const result = extractNativeLyricsFromStore(store, "words-empty");
      expect(result).not.toBeNull();

      expect(result![0]!.words).toHaveLength(1);
      expect(result![0]!.words[0]!.word).toBe("Fallback line");
      expect(result![0]!.words[0]!.startTime).toBe(10000);
      expect(result![0]!.words[0]!.endTime).toBe(15000);
    });

    it("3.12 Large scale volume stress test (1,000 lines)", () => {
      const lines = [];
      for (let i = 0; i < 1000; i++) {
        lines.push({
          fromSec: i * 3,
          toSec: i * 3 + 2.5,
          text: `Lyrics line #${i}`,
        });
      }

      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "large-track",
            lines,
          },
        },
      };

      const start = performance.now();
      const result = extractNativeLyricsFromStore(store, "large-track");
      const elapsed = performance.now() - start;

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1000);
      expect(elapsed).toBeLessThan(100);
    });

    it("3.13 Non-matching track ID returns null", () => {
      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "track-123",
            lines: [{ fromSec: 0, toSec: 4, text: "Lyrics" }],
          },
        },
      };

      expect(extractNativeLyricsFromStore(store, "track-999")).toBeNull();
    });

    it("3.14 Omitted trackId in store query matches any loaded track", () => {
      const store = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "track-123",
            lines: [{ fromSec: 0, toSec: 4, text: "Lyrics" }],
          },
        },
      };

      const result = extractNativeLyricsFromStore(store, undefined);
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
    });
  });

  describe("4. Synthetic DOM & Fiber Extraction Suite", () => {
    it("4.1 Extracts lines from DOM elements with React 18 fiber key", () => {
      const mockContainer = {
        querySelectorAll: (selector: string) => {
          if (selector === 'div[data-test-id="SYNC_LYRICS_LINE"]') {
            return [
              {
                textContent: "DOM line 1",
                __reactFiber$test: {
                  key: ".$10.2:14.5",
                  return: null,
                },
              },
              {
                textContent: "DOM line 2",
                __reactFiber$test: {
                  key: ".$15.0:19.8",
                  return: null,
                },
              },
            ];
          }
          return [];
        },
      } as any;

      const result = extractNativeLyricsFromDom(mockContainer);
      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0]!.startTime).toBe(10200);
      expect(result![0]!.endTime).toBe(14500);
      expect(result![0]!.words[0]!.word).toBe("DOM line 1");
      expect(result![1]!.startTime).toBe(15000);
      expect(result![1]!.endTime).toBe(19800);
      expect(result![1]!.words[0]!.word).toBe("DOM line 2");
    });

    it("4.2 Extracts lines from container React fiber ancestor props", () => {
      const mockContainer = {
        __reactFiber$root: {
          memoizedProps: {
            syncLyrics: {
              lines: [
                { fromSec: 5, toSec: 8, text: "Fiber ancestor line 1" },
                { fromSec: 8.5, toSec: 12, text: "Fiber ancestor line 2" },
              ],
            },
          },
          return: null,
        },
        querySelectorAll: () => [],
      } as any;

      const result = extractNativeLyricsFromDom(mockContainer);
      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0]!.words[0]!.word).toBe("Fiber ancestor line 1");
      expect(result![1]!.words[0]!.word).toBe("Fiber ancestor line 2");
    });

    it("4.3 Null / empty container handling", () => {
      expect(extractNativeLyricsFromDom(null as any)).toBeNull();
      expect(extractNativeLyricsFromDom(undefined as any)).toBeNull();

      const emptyContainer = {
        querySelectorAll: () => [],
      } as any;
      expect(extractNativeLyricsFromDom(emptyContainer)).toBeNull();
    });
  });

  describe("5. VisualLyricLine Output Contract Invariants", () => {
    it("5.1 Invariant: startTime and endTime must always be finite non-negative numbers", () => {
      const rawLines = [
        { key: ".$0:2", text: "Zero" },
        { key: "invalid", text: "Invalid key" },
        { fromSec: "15.7", toSec: "20.3", text: "Float string" },
        { fromMs: 30000, text: "Ms line" },
      ];

      const parsed = parseRawNativeLines(rawLines);
      const visual = nativeLinesToVisualLines(parsed);

      for (const line of visual) {
        expect(Number.isFinite(line.startTime)).toBe(true);
        expect(Number.isFinite(line.endTime)).toBe(true);
        expect(Number.isNaN(line.startTime)).toBe(false);
        expect(Number.isNaN(line.endTime)).toBe(false);
        expect(line.startTime).toBeGreaterThanOrEqual(0);
        expect(line.endTime).toBeGreaterThan(line.startTime);
        expect(line.translatedLyric).toBe("");
        expect(line.romanLyric).toBe("");
        expect(line.isBG).toBe(false);
        expect(line.isDuet).toBe(false);
        expect(Array.isArray(line.words)).toBe(true);
        expect(line.words.length).toBeGreaterThan(0);
        for (const w of line.words) {
          expect(Number.isFinite(w.startTime)).toBe(true);
          expect(Number.isFinite(w.endTime)).toBe(true);
          expect(typeof w.word).toBe("string");
          expect(w.word.length).toBeGreaterThan(0);
        }
      }
    });

    it("5.2 Invariant: Chronological ordering strictly preserved", () => {
      const rawLines = [
        { fromSec: 50, toSec: 55, text: "Line 4" },
        { fromSec: 10, toSec: 15, text: "Line 1" },
        { fromSec: 30, toSec: 35, text: "Line 3" },
        { fromSec: 20, toSec: 25, text: "Line 2" },
      ];

      const parsed = parseRawNativeLines(rawLines);
      const visual = nativeLinesToVisualLines(parsed);

      for (let i = 0; i < visual.length - 1; i++) {
        expect(visual[i]!.startTime).toBeLessThanOrEqual(visual[i + 1]!.startTime);
      }
    });
  });

  describe("6. Empirical Failure Mode Demonstrations", () => {
    it("6.1 DEFENSE VERIFIED: null or undefined element in raw.words is safely handled without throwing", () => {
      const rawLinesWithNullWord = [
        {
          fromSec: 10,
          toSec: 15,
          text: "Line with null word token",
          words: [null],
        },
      ];

      let threw = false;
      let parsed: any = null;
      try {
        parsed = parseRawNativeLines(rawLinesWithNullWord);
      } catch (err: any) {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(parsed).toBeDefined();
      expect(parsed[0].text).toBe("Line with null word token");
    });

    it("6.2 DEFECT CONFIRMED: NaN in word timestamps propagates NaN into startTime/endTime", () => {
      const rawLinesWithNaNWord = [
        {
          fromSec: 10,
          toSec: 15,
          text: "Line with NaN word timestamp",
          words: [
            { word: "Corrupted", fromSec: Number.NaN, toSec: 12 },
          ],
        },
      ];

      const parsed = parseRawNativeLines(rawLinesWithNaNWord);
      expect(parsed).toHaveLength(1);

      const wordToken = parsed[0]!.words?.[0];
      expect(wordToken).toBeDefined();
      expect(Number.isNaN(wordToken!.startTime)).toBe(true);
    });

    it("6.3 DEFECT CONFIRMED: string numerical fromSec in words array is ignored, falling back to line start", () => {
      const rawLinesWithStringWord = [
        {
          fromSec: 10,
          toSec: 15,
          text: "Word with string time",
          words: [
            { word: "StringTime", fromSec: "12.5" as any, toSec: "14.0" as any },
          ],
        },
      ];

      const parsed = parseRawNativeLines(rawLinesWithStringWord);
      const wordToken = parsed[0]!.words?.[0];

      expect(wordToken!.startTime).toBe(10000);
    });
  });
});
