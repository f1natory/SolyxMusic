import { describe, it, expect } from "bun:test";
import {
  isSameTrackId,
  parseRawNativeLines,
  nativeLinesToVisualLines,
  extractNativeLyricsFromStore,
} from "../extractNativeLyrics";

describe("extractNativeLyrics", () => {
  describe("isSameTrackId", () => {
    it("matches exact identical track IDs", () => {
      expect(isSameTrackId("12345", "12345")).toBe(true);
      expect(isSameTrackId("track-abc", "track-abc")).toBe(true);
    });

    it("matches track ID formatted with album context (${trackId}:${albumId})", () => {

      expect(isSameTrackId("12345:67890", "12345")).toBe(true);
      expect(isSameTrackId("12345", "12345:67890")).toBe(true);
    });

    it("matches same track ID with different album contexts", () => {
      expect(isSameTrackId("12345:67890", "12345:99999")).toBe(true);
    });

    it("does NOT match different tracks in the same album", () => {

      expect(isSameTrackId("12345:67890", "54321:67890")).toBe(false);
    });

    it("does NOT match completely different tracks", () => {
      expect(isSameTrackId("12345", "67890")).toBe(false);
      expect(isSameTrackId("song-a", "song-b")).toBe(false);
    });

    it("handles numeric input properly", () => {
      expect(isSameTrackId(12345, "12345:67890")).toBe(true);
      expect(isSameTrackId("12345:67890", 12345)).toBe(true);
      expect(isSameTrackId(12345, 12345)).toBe(true);
      expect(isSameTrackId(12345, 67890)).toBe(false);
    });

    it("handles whitespace and padding cleanly", () => {
      expect(isSameTrackId("  12345:67890  ", " 12345 ")).toBe(true);
    });

    it("rejects null, undefined, or empty values", () => {
      expect(isSameTrackId(null, "12345")).toBe(false);
      expect(isSameTrackId("12345", undefined)).toBe(false);
      expect(isSameTrackId(null, null)).toBe(false);
      expect(isSameTrackId(undefined, undefined)).toBe(false);
      expect(isSameTrackId("", "")).toBe(false);
      expect(isSameTrackId("   ", "   ")).toBe(false);
      expect(isSameTrackId(":", ":")).toBe(false);
      expect(isSameTrackId(":::", ":::")).toBe(false);
    });
  });

  describe("Fiber key parsing & React 18 prefix stripping", () => {
    it("strips React 18 array map prefix ('.$') and parses timestamps without NaN", () => {
      const raw = [
        { key: ".$14.5:18.2", text: "First line of lyrics" },
        { key: ".$18.5:22.0", text: "Second line of lyrics" },
      ];

      const parsed = parseRawNativeLines(raw);
      expect(parsed).toHaveLength(2);

      expect(parsed[0]?.fromSec).toBe(14.5);
      expect(parsed[0]?.toSec).toBe(18.2);
      expect(Number.isFinite(parsed[0]?.fromSec)).toBe(true);
      expect(Number.isNaN(parsed[0]?.fromSec)).toBe(false);

      expect(parsed[1]?.fromSec).toBe(18.5);
      expect(parsed[1]?.toSec).toBe(22.0);
    });

    it("parses standard fiber key formats (${fromSec}:${toSec})", () => {
      const raw = [{ key: "10.0:14.25", text: "Standard key line" }];
      const parsed = parseRawNativeLines(raw);

      expect(parsed[0]?.fromSec).toBe(10.0);
      expect(parsed[0]?.toSec).toBe(14.25);
    });

    it("parses single timestamp in key format", () => {
      const raw = [
        { key: ".$25.5", text: "Single timestamp with prefix" },
        { key: ".$30.0", text: "Next line" },
      ];
      const parsed = parseRawNativeLines(raw);

      expect(parsed[0]?.fromSec).toBe(25.5);

      expect(parsed[0]?.toSec).toBe(30.0);
    });

    it("infers missing toSec from next line's fromSec", () => {
      const raw = [
        { fromSec: 10, text: "Line 1" },
        { fromSec: 15, text: "Line 2" },
        { fromSec: 22, text: "Line 3" },
      ];
      const parsed = parseRawNativeLines(raw);

      expect(parsed[0]?.toSec).toBe(15);
      expect(parsed[1]?.toSec).toBe(22);

      expect(parsed[2]?.toSec).toBe(26);
    });
  });

  describe("Store line conversion", () => {
    it("parses direct numerical fromSec and toSec", () => {
      const raw = [
        { fromSec: 5.25, toSec: 9.75, text: "Direct numbers" },
      ];
      const parsed = parseRawNativeLines(raw);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.fromSec).toBe(5.25);
      expect(parsed[0]?.toSec).toBe(9.75);
      expect(parsed[0]?.text).toBe("Direct numbers");
    });

    it("parses string numerical fromSec and toSec", () => {
      const raw = [
        { fromSec: "12.3", toSec: "16.8", text: "String numbers" },
      ];
      const parsed = parseRawNativeLines(raw);

      expect(parsed[0]?.fromSec).toBe(12.3);
      expect(parsed[0]?.toSec).toBe(16.8);
    });

    it("handles millisecond fallbacks (fromMs / toMs)", () => {
      const raw = [
        { fromMs: 12500, toMs: 16800, text: "Milliseconds" },
      ];
      const parsed = parseRawNativeLines(raw);

      expect(parsed[0]?.fromSec).toBe(12.5);
      expect(parsed[0]?.toSec).toBe(16.8);
    });

    it("correctly converts native words array to millisecond timestamps", () => {
      const raw = [
        {
          fromSec: 10,
          toSec: 14,
          text: "Hello beautiful world",
          words: [
            { text: "Hello", fromSec: 10.0, toSec: 10.8 },
            { text: "beautiful", fromSec: 10.9, toSec: 12.0 },
            { word: "world", fromMs: 12100, toMs: 13500 },
          ],
        },
      ];
      const parsed = parseRawNativeLines(raw);

      expect(parsed[0]?.words).toBeDefined();
      expect(parsed[0]?.words).toHaveLength(3);
      expect(parsed[0]?.words?.[0]).toEqual({
        startTime: 10000,
        endTime: 10800,
        word: "Hello",
      });
      expect(parsed[0]?.words?.[1]).toEqual({
        startTime: 10900,
        endTime: 12000,
        word: "beautiful",
      });
      expect(parsed[0]?.words?.[2]).toEqual({
        startTime: 12100,
        endTime: 13500,
        word: "world",
      });
    });

    it("sorts lines chronologically by fromSec", () => {
      const raw = [
        { fromSec: 20, toSec: 25, text: "Third" },
        { fromSec: 5, toSec: 10, text: "First" },
        { fromSec: 12, toSec: 18, text: "Second" },
      ];
      const parsed = parseRawNativeLines(raw);

      expect(parsed[0]?.text).toBe("First");
      expect(parsed[1]?.text).toBe("Second");
      expect(parsed[2]?.text).toBe("Third");
    });

    it("deduplicates identical consecutive lines within 0.5s", () => {
      const raw = [
        { fromSec: 10.0, text: "Echo" },
        { fromSec: 10.1, text: "Echo" },
        { fromSec: 15.0, text: "Next line" },
      ];
      const parsed = parseRawNativeLines(raw);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]?.text).toBe("Echo");
      expect(parsed[1]?.text).toBe("Next line");
    });

    it("converts native lines into VisualLyricLine structures", () => {
      const nativeLines = [
        { fromSec: 10.5, toSec: 14.5, text: "Karaoke line 1" },
        { fromSec: 15.0, toSec: 20.0, text: "Karaoke line 2" },
      ];

      const visual = nativeLinesToVisualLines(nativeLines);
      expect(visual).toHaveLength(2);
      expect(visual[0]?.startTime).toBe(10500);
      expect(visual[0]?.endTime).toBe(14500);
      expect(visual[0]?.words).toHaveLength(1);
      expect(visual[0]?.words?.[0]?.word).toBe("Karaoke line 1");
      expect(visual[0]?.translatedLyric).toBe("");
      expect(visual[0]?.isBG).toBe(false);
    });
  });

  describe("extractNativeLyricsFromStore", () => {
    it("extracts and parses lyrics from MobX store when trackId matches", () => {
      const syntheticStore = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "12345",
            lines: [
              { fromSec: 1.5, toSec: 4.5, text: "Store line 1" },
              { fromSec: 5.0, toSec: 9.0, text: "Store line 2" },
            ],
          },
        },
      };

      const result = extractNativeLyricsFromStore(syntheticStore, "12345");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result?.[0]?.startTime).toBe(1500);
      expect(result?.[0]?.endTime).toBe(4500);
      expect(result?.[0]?.words?.[0]?.word).toBe("Store line 1");
    });

    it("matches track ID with album context against store track ID", () => {
      const syntheticStore = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "12345",
            lines: [{ fromSec: 0, toSec: 3, text: "Context test" }],
          },
        },
      };

      const result = extractNativeLyricsFromStore(syntheticStore, "12345:98765");
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
    });

    it("returns null when currentTrackId does not match expectedTrackId", () => {
      const syntheticStore = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "99999",
            lines: [{ fromSec: 0, toSec: 3, text: "Wrong track" }],
          },
        },
      };

      const result = extractNativeLyricsFromStore(syntheticStore, "12345");
      expect(result).toBeNull();
    });

    it("returns null when currentTrackId does not match expectedTrackId even if sonataState matches", () => {

      const syntheticStore = {
        fullscreenPlayer: {
          syncLyrics: {
            currentTrackId: "12345",
            lines: [
              { fromSec: 0, toSec: 4, text: "Track A line (e.g. 17 - CUPSIZE)" },
            ],
          },
        },
        sonataState: {
          entityMeta: { id: "67890" },
        },
        playerState: {
          track: { id: "67890" },
        },
      };

      const result = extractNativeLyricsFromStore(syntheticStore, "67890");
      expect(result).toBeNull();
    });

    it("returns null when store or lines are missing", () => {
      expect(extractNativeLyricsFromStore(null, "12345")).toBeNull();
      expect(extractNativeLyricsFromStore({}, "12345")).toBeNull();
      expect(
        extractNativeLyricsFromStore(
          { fullscreenPlayer: { syncLyrics: { lines: [] } } },
          "12345"
        )
      ).toBeNull();
    });
  });
});
