import React, { useEffect, useState } from "react";
import { usePlayerMetadata } from "@ui/hooks/usePlayerState";
import { VisualBackground } from "./VisualBackground";

export function BackgroundLayer() {
  const { track, playing } = usePlayerMetadata();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      const val = await window.yandexMusicMod.getStorageValue("visual/visualBackgroundEnabled");
      if (val !== undefined && val !== null) {
        setEnabled(val);
      }
    })();

    const cleanup = window.yandexMusicMod.onStorageChanged((key: string, value: any) => {
      if (key === "visual/visualBackgroundEnabled") {
        setEnabled(value);
      }
    });

    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  if (!enabled || !track?.coverUrl) return null;

  return (
    <div
      id="yandex-music-mod-ambient-bg"
      className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden opacity-35 transition-opacity duration-1000"
      aria-hidden="true"
    >
      <VisualBackground album={track.coverUrl} playing={playing} className="w-full h-full" />
      <div className="absolute inset-0 bg-black/40 backdrop-blur-3xl" />
    </div>
  );
}
