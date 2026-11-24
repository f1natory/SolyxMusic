import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MeshGradientRenderer } from "@visual/bg-render/mesh-renderer/index.ts";
import { cn } from "@ui/lib/utils";

export function VisualBackground({
  album,
  playing,
  className,
}: {
  album?: string | null;
  playing: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<MeshGradientRenderer | null>(null);
  const currentSpeedRef = useRef(playing ? 2.0 : 0.0);
  const animRef = useRef<number>(0);
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!MeshGradientRenderer.isSupported()) {
      setFailed(true);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";

    let renderer: MeshGradientRenderer;
    try {
      renderer = new MeshGradientRenderer(canvas);
      host.appendChild(canvas);
    } catch {
      canvas.remove();
      setFailed(true);
      return;
    }

    renderer.setFPS(30);
    renderer.setRenderScale(0.5);
    renderer.setFlowSpeed(playing ? 2.0 : 0.0);
    renderer.setStaticMode(!playing);
    rendererRef.current = renderer;
    if (document.hidden) renderer.pause();
    else renderer.resume();

    const onVisibilityChange = () => {
      if (document.hidden) {
        renderer.pause();
      } else {
        renderer.resume();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = 0;
      }
      renderer.dispose();
      canvas.remove();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!album || !rendererRef.current) return;
    void rendererRef.current.setAlbum(album);
  }, [album]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = 0;
    }

    const startSpeed = currentSpeedRef.current;
    const targetSpeed = playing ? 2.0 : 0.0;
    const duration = playing ? 800 : 1200;
    const startTime = performance.now();

    if (playing) {
      renderer.setStaticMode(false);
      if (!document.hidden) renderer.resume();
    }

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const speed = startSpeed + (targetSpeed - startSpeed) * ease;
      currentSpeedRef.current = speed;
      renderer.setFlowSpeed(speed);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = 0;
        if (!playing) {
          renderer.setStaticMode(true);
        }
      }
    };

    animRef.current = requestAnimationFrame(step);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = 0;
      }
    };
  }, [playing]);

  if (failed) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={cn("pointer-events-none", className)}
      style={{ filter: "brightness(0.5) saturate(1.3)" }}
    />
  );
}
