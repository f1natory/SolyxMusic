import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePlayerMetadata } from "@ui/hooks/usePlayerState";
import { VisualBackground } from "./VisualBackground";

function normalizeCoverUrl(uri?: string | null, size = "600x600"): string | null {
  if (!uri) return null;
  let url = uri.replace("%%", size);
  if (url.startsWith("//")) return "https:" + url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return "https://" + url;
  }
  return url;
}

export function FullscreenVisualBackground() {
  const { track, playing } = usePlayerMetadata();
  const [modalEl, setModalEl] = useState<HTMLElement | null>(null);
  const [resolvedCover, setResolvedCover] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      const val = await window.yandexMusicMod?.getStorageValue("visual/visualBackgroundEnabled");
      if (val !== undefined && val !== null) {
        setEnabled(val !== false);
      }
    })();

    const cleanup = window.yandexMusicMod?.onStorageChanged((key: string, value: any) => {
      if (key === "visual/visualBackgroundEnabled") {
        setEnabled(value !== false);
      }
    });

    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  useEffect(() => {
    let prevModal: HTMLElement | null = null;
    let rafId = 0;

    const checkModal = () => {
      const el = document.querySelector('div[data-test-id="FULLSCREEN_PLAYER_MODAL"]') as HTMLElement | null;
      if (el !== prevModal) {
        prevModal = el;
        setModalEl(el);
      }
    };

    checkModal();

    const scheduleCheck = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        checkModal();
      });
    };

    const observer = new MutationObserver(scheduleCheck);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || !modalEl) {
      setResolvedCover(null);
      return;
    }

    const resolveCover = (): boolean => {

      const store = (window as any).__yandexMusicStore;
      const meta = store?.sonataState?.entityMeta;
      const normalizedMetaCover = normalizeCoverUrl(meta?.coverUri || meta?.ogImage);
      if (normalizedMetaCover) {
        setResolvedCover(normalizedMetaCover);
        return true;
      }

      if (track?.coverUrl) {
        setResolvedCover(normalizeCoverUrl(track.coverUrl));
        return true;
      }

      const img = modalEl.querySelector(
        'img[src*="get-music-content"], img[src*="avatars.yandex.net"]'
      ) as HTMLImageElement | null;
      if (img?.src) {
        setResolvedCover(img.src);
        return true;
      }

      return false;
    };

    if (resolveCover()) {
      return;
    }

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (resolveCover() || attempts >= 25) {
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [enabled, modalEl, track?.coverUrl, track?.id]);

  const activeCover = resolvedCover || normalizeCoverUrl(track?.coverUrl);

  useEffect(() => {
    if (!modalEl) return;
    if (enabled && activeCover) {
      modalEl.classList.add("has-visual-bg");
    } else {
      modalEl.classList.remove("has-visual-bg");
    }
    return () => {
      modalEl.classList.remove("has-visual-bg");
    };
  }, [modalEl, enabled, activeCover]);

  if (!enabled || !modalEl || !activeCover) {
    return null;
  }

  return createPortal(
    <div
      className="visual-fullscreen-bg-wrapper"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <VisualBackground
        album={activeCover}
        playing={playing}
        className="w-full h-full scale-105"
      />
    </div>,
    modalEl
  );
}
