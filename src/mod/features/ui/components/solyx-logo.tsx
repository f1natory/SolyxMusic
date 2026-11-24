import type { SVGProps } from "react";
import logoSource from "../../../../../solyx logo.svg?raw";

function attribute(source: string, name: string): string | undefined {
  return source.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "s"))?.[2];
}

const viewBox = attribute(logoSource, "viewBox");
const paths = Array.from(logoSource.matchAll(/<path\b[^>]*>/gs), ([element]) => ({
  d: attribute(element, "d"),
  fillRule: attribute(element, "fill-rule") === "evenodd" ? "evenodd" as const : "nonzero" as const,
  clipRule: attribute(element, "clip-rule") === "evenodd" ? "evenodd" as const : "nonzero" as const,
}));

if (!viewBox || !paths.length || paths.some(path => !path.d)) {
  throw new Error("solyx logo.svg must contain a viewBox and SVG paths");
}

export function SolyxLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={viewBox} fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      {paths.map((path, index) => <path key={index} {...path} />)}
    </svg>
  );
}
