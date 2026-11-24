import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MusicScreen } from "./MusicScreen";

export function FullscreenPlayerReplacer() {
  const [modalEl, setModalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const checkModal = () => {
      const el = document.querySelector(
        'div[data-test-id="FULLSCREEN_PLAYER_MODAL"]'
      ) as HTMLElement | null;
      if (el !== modalEl) {
        setModalEl(el);
      }
    };

    checkModal();
    const observer = new MutationObserver(checkModal);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = setInterval(checkModal, 150);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [modalEl]);

  if (!modalEl) {
    return null;
  }

  return createPortal(<MusicScreen />, modalEl);
}
