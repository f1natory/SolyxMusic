import { $ } from "bun";
import path from "path";
import fs from "fs";

await $`bun run ui:build`;

const versionsDir = ".versions";
let activeVer = "5.126.1";
if (fs.existsSync(versionsDir)) {
  const dirs = fs.readdirSync(versionsDir);
  if (dirs.length > 0) activeVer = dirs[dirs.length - 1];
}
const modPath = `.versions/${activeVer}/mod/app/yandexMusicMod/`;
const sourcesPath = "src/mod/dist/";

fs.mkdirSync(modPath, { recursive: true });

function copyRecursively(src, dest) {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);

    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      copyRecursively(srcPath, destPath);
    }
  } else if (stats.isFile()) {

    fs.copyFileSync(src, dest);
    console.log(`Copied: ${path.relative(sourcesPath, src)}`);
  }
}

console.log(`Copying all files and directories from ${sourcesPath} to ${modPath}`);
copyRecursively(sourcesPath, modPath);

const rendererPath = path.join(modPath, "renderer.js");
if (fs.existsSync(rendererPath)) {
  console.log("Wrapping renderer.js with async function...");

  const originalContent = fs.readFileSync(rendererPath, "utf8");
  const wrappedContent = `(async function() {
${originalContent}
})();`;

  fs.writeFileSync(rendererPath, wrappedContent, "utf8");
  console.log("Successfully wrapped renderer.js with async function");
} else {
  console.error("renderer.js not found in modPath after copying");
}

console.log("Copy and wrap operation completed!");
