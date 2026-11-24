import { AnimatePresence, motion, useSpring } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { activeLyricIndex, type SimpleLyricLine as LyricLine } from "@ui/lib/lyrics";
import { cn } from "@ui/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const FADE =
  "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 7%, #000 20%, #000 80%, rgba(0,0,0,0.35) 93%, transparent 100%)";

export function LyricsPlayer({
  lines,
  currentTime,
  playing,
  onSeek,
  className,
}: {
  lines: LyricLine[];
  currentTime: number;
  playing: boolean;
  onSeek: (value: number) => void;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const preStartRef = useRef<HTMLDivElement | null>(null);
  const touchYRef = useRef<number | null>(null);

  const activeIdx = useMemo(() => {
    if (!lines || !lines.length) return -1;
    const first = lines[0]?.t;
    if (first !== null && first !== undefined && currentTime < first) return -1;
    return activeLyricIndex(lines, currentTime);
  }, [lines, currentTime]);

  const [offset, setOffset] = useState(0);
  const y = useSpring(0, { stiffness: 160, damping: 28, mass: 0.85 });

  useLayoutEffect(() => {
    const compute = () => {
      const box = boxRef.current;
      const row = activeIdx < 0 ? preStartRef.current : rowRefs.current[activeIdx];
      if (!box || !row) return;
      const anchor = box.clientHeight * 0.38;
      const desired = row.offsetTop + row.offsetHeight * 0.5 - anchor;
      const firstRow = preStartRef.current ?? rowRefs.current[0];
      const lastRow = rowRefs.current[lines.length ? lines.length - 1 : 0];
      const minOffset = firstRow
        ? Math.min(0, firstRow.offsetTop + firstRow.offsetHeight * 0.5 - anchor)
        : 0;
      const maxOffset = lastRow
        ? Math.max(0, lastRow.offsetTop + lastRow.offsetHeight - box.clientHeight * 0.62)
        : 0;
      setOffset(Math.max(minOffset, Math.min(maxOffset, desired)));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [activeIdx, lines]);

  useEffect(() => {
    y.set(-offset);
  }, [offset, y]);

  const autoReturnTimerRef = useRef<number | null>(null);

  const clearAutoReturn = () => {
    if (autoReturnTimerRef.current !== null) {
      window.clearTimeout(autoReturnTimerRef.current);
      autoReturnTimerRef.current = null;
    }
  };

  const scheduleAutoReturn = () => {
    clearAutoReturn();
    autoReturnTimerRef.current = window.setTimeout(() => {
      autoReturnTimerRef.current = null;

      const box = boxRef.current;
      const row = activeIdx < 0 ? preStartRef.current : rowRefs.current[activeIdx];
      if (!box || !row) return;
      const anchor = box.clientHeight * 0.38;
      const desired = row.offsetTop + row.offsetHeight * 0.5 - anchor;
      const firstRow = preStartRef.current ?? rowRefs.current[0];
      const lastRow = rowRefs.current[lines.length ? lines.length - 1 : 0];
      const minOffset = firstRow
        ? Math.min(0, firstRow.offsetTop + firstRow.offsetHeight * 0.5 - anchor)
        : 0;
      const maxOffset = lastRow
        ? Math.max(0, lastRow.offsetTop + lastRow.offsetHeight - box.clientHeight * 0.62)
        : 0;
      setOffset(Math.max(minOffset, Math.min(maxOffset, desired)));
    }, 2500);
  };

  useEffect(() => {
    return () => clearAutoReturn();
  }, []);

  const scrollBy = (delta: number) => {
    const box = boxRef.current;
    if (!box) return;
    const anchor = box.clientHeight * 0.38;
    const firstRow = preStartRef.current ?? rowRefs.current[0];
    const lastRow = rowRefs.current[lines.length - 1];
    const minOffset = firstRow
      ? Math.min(0, firstRow.offsetTop + firstRow.offsetHeight * 0.5 - anchor)
      : 0;
    const maxOffset = lastRow
      ? Math.max(0, lastRow.offsetTop + lastRow.offsetHeight - box.clientHeight * 0.62)
      : 0;
    setOffset((value) => Math.max(minOffset, Math.min(maxOffset, value + delta)));
    scheduleAutoReturn();
  };

  const timed = lines.some((line) => line.t !== null);
  const anchorIdx = activeIdx >= 0 ? activeIdx : -1;

  return (
    <div
      ref={boxRef}
      className={cn("relative h-[56vh] min-w-0 overflow-hidden", className)}
      data-lyrics-scroll
      onWheel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        scrollBy(event.deltaY);
      }}
      onTouchStart={(event) => {
        touchYRef.current = event.touches[0]?.clientY ?? null;
        event.stopPropagation();
      }}
      onTouchMove={(event) => event.stopPropagation()}
      onTouchEnd={(event) => {
        const startY = touchYRef.current;
        const endY = event.changedTouches[0]?.clientY;
        if (startY !== null && endY !== undefined) scrollBy(startY - endY);
        touchYRef.current = null;
        event.stopPropagation();
      }}
      style={{
        touchAction: "pan-x",
        maskImage: FADE,
        WebkitMaskImage: FADE,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key="lyrics-lines"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <motion.div className="relative will-change-transform" style={{ y }}>
            {timed && (
              <div ref={preStartRef} className="music-lyric-dots">
                <AnimatePresence initial={false}>
                  {activeIdx < 0 && (
                    <motion.div
                      key="music-lyric-dots"
                      className="music-lyric-dots-inner"
                      data-playing={playing}
                      aria-hidden
                      initial={false}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.5, ease: EASE }}
                    >
                      <span />
                      <span />
                      <span />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {lines.map((line, i) => {
              const isActive = i === activeIdx && line.text.trim() !== "";
              const isGap = i === activeIdx && line.text.trim() === "" && line.t !== null;
              const synced = line.t !== null;

              const cleaned = line.text.replace(/^\(\S{1,4}\)\s+/u, "");
              const distance = anchorIdx < 0 ? 3 : Math.abs(i - anchorIdx);
              const opacity =
                line.text.trim() === ""
                  ? isGap
                    ? 1
                    : 0.18
                  : isActive
                    ? 1
                    : Math.max(0.28, 0.62 - distance * 0.11);
              const blur = isActive || !synced ? 0 : Math.min(3, Math.max(0, (distance - 1) * 0.9));
              return (
                <motion.button
                  key={`${i}-${line.t}`}
                  ref={(el: HTMLButtonElement | null) => {
                    rowRefs.current[i] = el;
                  }}
                  type="button"
                  disabled={!synced}
                  onClick={() => {
                    if (line.t !== null) onSeek(line.t);
                  }}
                  initial={false}
                  animate={{ opacity, filter: `blur(${blur}px)` }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className={cn(
                    "block w-full py-1.5 text-left font-semibold leading-[1.24] tracking-[-0.035em] text-[#E8EAF2] break-words whitespace-normal",
                    synced && "cursor-pointer",
                    !isActive && synced && "hover:!opacity-100"
                  )}
                  style={{
                    fontSize: "clamp(1.65rem, 3.2vw, 2.5rem)",
                    fontFamily:
                      '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif',
                  }}
                  aria-current={isActive}
                >
                  {line.text.trim() === "" ? (isGap ? <LyricDots playing={playing} /> : null) : cleaned}
                </motion.button>
              );
            })}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function LyricDots({ playing }: { playing: boolean }) {
  return (
    <span className="music-lyric-dots-inner" data-playing={playing} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}
