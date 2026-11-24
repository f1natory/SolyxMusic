import { matchUpstreamAuth } from "../../scripts/upstream-auth";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "url";
import asar from "asar";
import { prettifyDirectory } from "./prettier";
const _7z = require("7zip-min");
import { $ } from "bun";

import { downloadBuild } from "./api";
import type { AppBuild } from "~/types/AppBuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __projectRoot = path.resolve(__dirname, "..", "..");

function findFileRecursively(dir: string, fileName: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === fileName) return full;
    if (entry.isDirectory()) {
      const found = findFileRecursively(full, fileName);
      if (found) return found;
    }
  }
  return null;
}

export async function processBuild(build: AppBuild) {
  const isMacOS = process.platform === "darwin";

  const buildDir = path.resolve(path.join(__projectRoot, ".versions", build.version));
  const tempDir = path.join(buildDir, "temp");
  const buildBinaryPath = path.join(tempDir, "build.bin");
  const extractDir = path.join(tempDir, "extracted");
  const buildSourceDir = path.join(buildDir, "src");
  const buildModdedDir = path.join(buildDir, "mod");
  const modSorcesDir = path.join(__projectRoot, "src/mod");
  const modCompiledDir = path.join(__projectRoot, "src/mod/dist");
  const progressArray: string[] = [];

  const logProgress = (message: string) => {
    progressArray.push(message);
    console.log(progressArray.at(-1));
  };

  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }

  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });
  fs.mkdirSync(buildSourceDir, { recursive: true });
  fs.mkdirSync(buildModdedDir, { recursive: true });

  logProgress(`[1] Downloading build ${build.version}`);

  const downloadResult = await downloadBuild(build, buildBinaryPath);

  if (downloadResult.isErr()) {
    logProgress(`❌ Failed to download build ${build.version}: ${downloadResult.error}`);
    return;
  } else {
    logProgress(`✔️   Done`);
  }

  logProgress(`[2] Extracting build ${build.version} to ${extractDir}`);

  try {
    await _7z.unpack(buildBinaryPath, extractDir);
    logProgress(`✔️   Done`);
  } catch (error) {
    logProgress(`❌ Failed to extract build ${build.version}: ${error}`);
    return;
  }

  logProgress(`[3] Find and extract app.asar`);

  let appAsarPath = path.resolve(path.join(extractDir, "resources", "app.asar"));
  if (!fs.existsSync(appAsarPath)) {
    const found = findFileRecursively(extractDir, "app.asar");
    if (found) {
      appAsarPath = found;
    } else {
      const nested7z = findFileRecursively(extractDir, "app-64.7z") || findFileRecursively(extractDir, "app-32.7z");
      if (nested7z) {
        logProgress(`[3.1] Unpacking nested archive ${nested7z}`);
        try {
          await _7z.unpack(nested7z, extractDir);
          const afterUnpack = findFileRecursively(extractDir, "app.asar");
          if (afterUnpack) appAsarPath = afterUnpack;
        } catch (e) {
          logProgress(`⚠️ Failed to unpack nested archive: ${e}`);
        }
      }
    }
  }

  if (fs.existsSync(appAsarPath)) {
    logProgress(`✔️   Found app.asar at ${appAsarPath}`);
  } else {
    logProgress(`❌ app.asar was not found inside the extracted installer for ${build.version}`);
    return;
  }

  try {
    asar.extractAll(appAsarPath, buildSourceDir);
    logProgress(`✔️   Extracted app.asar`);
  } catch (error) {
    logProgress(`❌ Failed to extract app.asar: ${error}`);
    return;
  }

  try {
    fs.mkdirSync(path.join(buildModdedDir, "assets"), { recursive: true });
    let appIconPath = path.resolve(path.join(extractDir, "resources", "assets", "icon.ico"));
    if (!fs.existsSync(appIconPath)) {
      const foundIcon = findFileRecursively(extractDir, "icon.ico");
      if (foundIcon) appIconPath = foundIcon;
    }
    if (fs.existsSync(appIconPath)) {
      fs.copyFileSync(appIconPath, path.join(buildModdedDir, "assets", "icon.ico"));
    }
    if (fs.existsSync(path.join(__projectRoot, "yaicon.png"))) {
      fs.copyFileSync(path.join(__projectRoot, "yaicon.png"), path.join(buildModdedDir, "assets", "icon.png"));
      if (isMacOS) {
        fs.copyFileSync(path.join(__projectRoot, "yaicon.png"), path.join(buildModdedDir, "assets", "icon.icns"));
      }
    }
    logProgress(`✔️   Extracted app icons`);
  } catch (error) {
    logProgress(`⚠️  Warning on app icons extraction: ${error}`);
  }

  logProgress(`[4] Cleaning up temporary files`);

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    logProgress(`✔️   Done`);
  } catch (error) {
    logProgress(`❌ Failed to clean up temporary files: ${error}`);
    return;
  }

  logProgress(`[5] Copy sources before modding`);

  try {
    fs.cpSync(buildSourceDir, buildModdedDir, { recursive: true });
    logProgress(`✔️   Done`);
  } catch (error) {
    logProgress(`❌ Failed to copy sources before modding: ${error}`);
    return;
  }

  logProgress(`[6] Patching app.asar`);

  const staticFiles = {
    packageJson: path.join(buildModdedDir, "package.json"),
    indexJs: path.join(buildModdedDir, "index.js"),
    preloadJs: path.join(buildModdedDir, "preload.js"),
  };

  logProgress(`🛠️  Locate static files [${Object.keys(staticFiles).join(", ")}]`);

  for (const file of Object.keys(staticFiles) as (keyof typeof staticFiles)[]) {
    if (fs.existsSync(staticFiles[file])) {
      logProgress(`✔️   Found ${file}`);
    } else {
      logProgress(`❌ ${file} was not found inside the sources for ${build.version}`);
      return;
    }
  }

  logProgress(`🛠️  Patch package.json`);

  let packageJsonContents = JSON.parse(fs.readFileSync(staticFiles.packageJson, "utf8"));

  packageJsonContents.dependencies = packageJsonContents.dependencies || {};
  packageJsonContents.devDependencies = packageJsonContents.devDependencies || {};

  const isBannedDep = (dep: string) =>
    dep.startsWith("@yandex-chats/") ||
    dep.startsWith("@yandex-music-int/") ||
    dep.startsWith("@yandex-int/") ||
    dep.includes("certificate-verification");

  packageJsonContents.dependencies = Object.fromEntries(
    Object.entries(packageJsonContents.dependencies).filter(([key]) => !isBannedDep(key)),
  );
  packageJsonContents.devDependencies = Object.fromEntries(
    Object.entries(packageJsonContents.devDependencies).filter(([key]) => !isBannedDep(key)),
  );
  packageJsonContents.name = "SolyxMusic";
  packageJsonContents.author = "Solyx Music [github.com/f1natory/SolyxMusic]";
  packageJsonContents.build = {
    appId: "ru.yandex.desktop.music.mod",
    productName: "Яндекс Музыка",
    files: ["**/*", "node_modules/@yandex-music-int/**/*"],
    win: {
      icon: "assets/icon.ico",
      requestedExecutionLevel: "asInvoker",
    },
    mac: {
      icon: "assets/icon.icns",
      category: "public.app-category.music",
      target: "default",
    },
    linux: {
      icon: "assets/icon.png",
    },
    extraResources: [
      {
        from: "assets/",
        to: "assets/",
        filter: ["**/*"],
      },
    ],
  };

  logProgress(`🛠️  Merge dependencies`);

  const rootPackageJsonContents = JSON.parse(fs.readFileSync(path.join(__projectRoot, "package.json"), "utf8"));

  if (!packageJsonContents.dependencies) packageJsonContents.dependencies = {};
  for (const key of Object.keys(rootPackageJsonContents.dependencies)) {
    packageJsonContents.dependencies[key] = rootPackageJsonContents.dependencies[key];
  }

  if (!packageJsonContents.devDependencies) packageJsonContents.devDependencies = {};
  for (const key of Object.keys(rootPackageJsonContents.devDependencies)) {
    packageJsonContents.devDependencies[key] = rootPackageJsonContents.devDependencies[key];
  }

  fs.writeFileSync(staticFiles.packageJson, JSON.stringify(packageJsonContents, null, 2));

  logProgress(`✔️   Done`);

  logProgress(`🛠️  Apply patches to index.js`);

  let indexJsContents = fs.readFileSync(staticFiles.indexJs, "utf8");

  indexJsContents = indexJsContents.replace(
    /require\(['"]@yandex-music-int\/electron-certificate-verification['"]\)/g,
    "({ setupCertificateVerificationCoordinator: () => ({ dispose: () => {} }), CERTIFICATE_VERIFICATION_SESSION_NAMES: { chromium: 'chromium', updater: 'updater' } })",
  );
  indexJsContents = indexJsContents.replace(
    /await setupCertificateVerification\([^)]*\);?/g,
    "void 0;",
  );

  indexJsContents =
    `
    const yandexMusicMod_fs = require("fs");
    const yandexMusicMod_path = require("path");
    const yandexMusicMod_electron = require("electron");

    const yandexMusicMod_appFolder = yandexMusicMod_electron.app.getPath("userData");
    const yandexMusicMod_settingsFilePath = yandexMusicMod_path.join(yandexMusicMod_appFolder, "mod_settings.json");
    let enableSystemToolbar = false;
    try {
      enableSystemToolbar = JSON.parse(yandexMusicMod_fs.readFileSync(yandexMusicMod_settingsFilePath, "utf8"))["devtools/systemToolbar"];
    } catch (e) {}\n\n` + indexJsContents;

  if (/constructor\(\)\s+{\s+this\.logger = new Logger\("UpdateLogger"\)/g.test(indexJsContents)) {
    indexJsContents = indexJsContents.replace(
      /constructor\(\)\s+{\s+this\.logger = new Logger\("UpdateLogger"\)/g,
      "constructor() { return \n",
    );
  } else {
    logProgress(`⚠️  Updater class not found in index.js, skipping`);
  }

  if (/minWidth:\s768/g.test(indexJsContents)) {
    indexJsContents = indexJsContents.replace(/minWidth:\s768/g, "minWidth: 360");
  }

  if (/minHeight:\s650/g.test(indexJsContents)) {
    indexJsContents = indexJsContents.replace(/minHeight:\s650/g, "minHeight: 550");
  }

  if (/titleBarStyle:\s"hidden"/g.test(indexJsContents)) {
    indexJsContents = indexJsContents.replace(
      /titleBarStyle:\s"hidden"/g,
      "titleBarStyle: !enableSystemToolbar ? 'hidden' : 'default'",
    );
  }

  if (/const window = new electron.BrowserWindow\({\s+show: false/g.test(indexJsContents)) {
    indexJsContents = indexJsContents.replace(
      /const window = new electron.BrowserWindow\({\s+show: false/g,
      "const window = new electron.BrowserWindow({\n show: true",
    );
  }

  if (/const webPreferences = {/g.test(indexJsContents)) {
    indexJsContents = indexJsContents.replace(
      /const webPreferences = {/g,
      "const webPreferences = {\n devTools: true, \n",
    );
  }

  if (/return window/g.test(indexJsContents)) {
    if (process.env.AUTO_OPEN_DEVTOOLS?.toLowerCase() === "true")
      indexJsContents = indexJsContents.replace(
        /return window/g,
        "window.webContents.openDevTools();\n" + "return window",
      );
  }

  if (/window.once\("ready-to-show", \(\) => {/g.test(indexJsContents)) {
    indexJsContents = indexJsContents.replace(
      /window.once\("ready-to-show", \(\) => {/g,
      'window.once("ready-to-show", () => {' +
        `
           // Register Ctrl+Shift+I to open DevTools
            electron.globalShortcut.register("CommandOrControl+Shift+I", () => {
              const focusedWindow = electron.BrowserWindow.getFocusedWindow();
              if (focusedWindow) {
                focusedWindow.webContents.toggleDevTools();
              }
            });

          `,
    );
  }

  if (/return window/g.test(indexJsContents)) {
    const blockedAnalyticsUrls = [
      "https://yandex.ru/clck/*",
      "https://mc.yandex.ru/*",
      "https://api.music.yandex.net/dynamic-pages/trigger/*",
      "https://api.music.yandex.net/lyric-views",
      "https://log.strm.yandex.ru/*",
      "https://api.acquisition-gwe.plus.yandex.net/*",
      "https://api.events.plus.yandex.net/*",
      "https://events.plus.yandex.net/*",
      "https://plus.yandex.net/*",
      "https://yandex.ru/ads/*",
      "https://strm.yandex.ru/ping",
      "https://yandex.ru/an/*",
    ];

    indexJsContents = indexJsContents.replace(
      /return window/g,
      `
      window.webContents.session.webRequest.onBeforeRequest(
        {
          urls: ${JSON.stringify(blockedAnalyticsUrls)},
        },
        (details, callback) => {
          callback({ cancel: true });
        },
      );

      ` + "return window",
    );
  }

  indexJsContents = matchUpstreamAuth(indexJsContents);
  fs.writeFileSync(staticFiles.indexJs, indexJsContents);

  logProgress(`✔️   Done`);

  logProgress(`🛠️  Remove startup video intro`);

  const splashScreenPath = path.join(buildModdedDir, "app", "media", "splash_screen");
  if (fs.existsSync(splashScreenPath)) {
    fs.rmSync(splashScreenPath, { recursive: true, force: true });
    logProgress(`✔️   Done`);
  } else {
    logProgress(`ℹ️   Splash screen not found inside sources, skipping`);
  }

  logProgress(`🛠️  Copy mods to build`);

  const modPreloadScript = path.join(modSorcesDir, "preload.ts");
  const modMainScript = path.join(modSorcesDir, "main.js");

  console.log(`\n---- 🚧 Building renderer.js ----`);

  await $`bun ui:build`;

  console.log(`\n---- 🚧 Building preload.js ----`);

  let buildResult = await Bun.build({
    target: "browser",
    format: "cjs",
    sourcemap: "linked",
    minify: false,
    entrypoints: [modPreloadScript],
    outdir: modCompiledDir,
  });

  let preloadJsContents =
    fs.readFileSync(staticFiles.preloadJs, "utf8") +
    `\n\n// yandexMusicMod preload.js\n(async () => {
        ${fs.readFileSync(path.join(modCompiledDir, "preload.js"), "utf8")}
      })();`;

  indexJsContents += `\n\n// yandexMusicMod main.js\n(async () => { 
        ${fs.readFileSync(modMainScript, "utf8")}
      })();`;

  logProgress(`🛠️  Copy discordRPC script to index.js`);

  indexJsContents = indexJsContents.replaceAll(
    'mod_require("discordRPC");',
    `\n\n// yandexMusicMod preload.js\n(async () => {
        ${fs.readFileSync(path.join(__projectRoot, "src/mod/features/utils/discordRPC.js"), "utf8")} 
      })();`,
  );

  logProgress(`✔️   Done`);

  fs.cpSync(path.join(modCompiledDir), path.join(buildModdedDir, "app", "yandexMusicMod"), {
    recursive: true,
  });

  let modRendererContents = fs.readFileSync(path.join(buildModdedDir, "app", "yandexMusicMod", "renderer.js"), "utf8");

  modRendererContents = `(function () {\n${modRendererContents}\n})()`;

  fs.writeFileSync(path.join(buildModdedDir, "app", "yandexMusicMod", "renderer.js"), modRendererContents);

  const appPath = path.join(buildModdedDir, "app");

  const chunksDir = path.join(appPath, "_next", "static", "chunks");
  if (fs.existsSync(chunksDir)) {
    const chunkFiles = (fs.readdirSync(chunksDir, { recursive: true }) as string[]).filter((file) => file.endsWith(".js"));
    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(chunksDir, chunkFile);
      let content = fs.readFileSync(chunkPath, "utf8");
      if (!content.includes("__yandexMusicStore") && content.includes("E_CONTEXT_STORE_NULL")) {
        const needle1 = 'code:"E_CONTEXT_STORE_NULL"';
        const needle2 = 'code: "E_CONTEXT_STORE_NULL"';
        let idx = content.indexOf(needle1);
        if (idx === -1) idx = content.indexOf(needle2);
        if (idx !== -1) {
          const returnIdx = content.indexOf("return e", idx);
          if (returnIdx !== -1 && returnIdx - idx < 100) {
            content =
              content.slice(0, idx) +
              'code: "E_CONTEXT_STORE_NULL" }); try { window.__yandexMusicStore = e; } catch (err) {}\n return e' +
              content.slice(returnIdx + 8);
            fs.writeFileSync(chunkPath, content);
            logProgress(`✔️   Injected __yandexMusicStore exposure into ${chunkFile}`);
          }
        }
      }

    }
  }

  const htmlFiles = (fs.readdirSync(appPath, { recursive: true }) as string[]).filter((file) => file.endsWith(".html"));

  for (const htmlFile of htmlFiles) {
    const fullHtmlPath = path.join(appPath, htmlFile);
    console.log("patching html file", fullHtmlPath);
    const htmlFileContents = fs.readFileSync(fullHtmlPath, "utf8");
    fs.writeFileSync(
      fullHtmlPath,
      htmlFileContents.replace(
        "<head>",
        `<head><script src="/yandexMusicMod/renderer.js"></script>
        <link rel="stylesheet" href="/yandexMusicMod/renderer.css">`,
      ),
    );
  }

  fs.writeFileSync(staticFiles.indexJs, indexJsContents);
  fs.writeFileSync(staticFiles.preloadJs, preloadJsContents);

  logProgress(`✔️   Done`);

  logProgress(`🛠️  Prettify all files in ${buildModdedDir}`);

  await prettifyDirectory(buildModdedDir);

  logProgress(`✔️   Done`);

  logProgress(`🛠️  Build modded app`);

  await $`bun install`.cwd(buildModdedDir);

  const srcYandexInt = path.join(buildSourceDir, "node_modules", "@yandex-music-int");
  const modYandexInt = path.join(buildModdedDir, "node_modules", "@yandex-music-int");
  if (fs.existsSync(srcYandexInt) && !fs.existsSync(modYandexInt)) {
    fs.cpSync(srcYandexInt, modYandexInt, { recursive: true });
  }

  await $`bun run electron-builder`.cwd(buildModdedDir);

  try {
    const distDir = path.join(buildModdedDir, "dist");
    if (fs.existsSync(distDir)) {
      const files = fs.readdirSync(distDir);
      for (const file of files) {
        if (file.endsWith(".exe")) {
          fs.copyFileSync(path.join(distDir, file), path.join(__projectRoot, file));
          logProgress(`✔️   Copied installer ${file} to root workspace`);
        }
      }
    }
  } catch (err) {
    console.error("Failed to copy installer to root:", err);
  }

  logProgress(`✔️   Done`);

  return progressArray;
}
