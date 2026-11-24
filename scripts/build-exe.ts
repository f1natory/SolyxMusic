import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { $ } from "bun";
import { matchUpstreamAuth } from "./upstream-auth";

const root = path.resolve(import.meta.dir, "..");
const project = path.join(root, ".versions", "5.126.1", "mod");
const output = path.join(root, ".versions", "release");
if (!fs.existsSync(path.join(project, "package.json"))) throw new Error("Prepared 5.126.1 sources are required");
const releaseVersion = JSON.parse(fs.readFileSync(path.join(root, ".meta/meta.json"), "utf8")).modStable;
await $`bun run ui:build`.cwd(root).env({ ...process.env, VITE_MOD_VERSION: releaseVersion });

const target = path.join(project, "app", "yandexMusicMod");
fs.cpSync(path.join(root, "src/mod/dist"), target, { recursive: true });
const renderer = fs.readFileSync(path.join(target, "renderer.js"), "utf8");
fs.writeFileSync(path.join(target, "renderer.js"), `(function () {\n${renderer}\n})();`);

const preload = await Bun.build({
  target: "browser", format: "cjs", sourcemap: "none", minify: false,
  entrypoints: [path.join(root, "src/mod/preload.ts")],
});
if (!preload.success) throw new AggregateError(preload.logs, "Preload build failed");
const preloadFile = path.join(project, "preload.js");
const nativePreload = fs.readFileSync(path.join(project, "..", "src", "preload.js"), "utf8");
fs.writeFileSync(preloadFile, nativePreload + `\n// yandexMusicMod preload.js\n(async () => {\n${await preload.outputs[0]!.text()}\n})();`);

const mainFile = path.join(project, "index.js");
const oldMain = fs.readFileSync(mainFile, "utf8");
const mainMarker = oldMain.indexOf("// yandexMusicMod main.js");
if (mainMarker < 0) throw new Error("Main injection marker missing");
let main = oldMain.slice(0, mainMarker).replace(
  /\s*\/\/ Trim memory\/cache on minimize\s*window\.on\("minimize", \(\) => \{[\s\S]*?\n    \}\);/, "",
);
main = matchUpstreamAuth(main);
const modMain = fs.readFileSync(path.join(root, "src/mod/main.js"), "utf8").replace(
  'mod_require("discordRPC");',
  `(async () => {\n${fs.readFileSync(path.join(root, "src/mod/features/utils/discordRPC.js"), "utf8")}\n})();`,
);
fs.writeFileSync(mainFile, main + `// yandexMusicMod main.js\n(async () => {\n${modMain}\n})();`);
await $`node --check ${mainFile}`;
await $`node --check ${preloadFile}`;

const runtime = path.join(root, ".versions", "electron-runtime");
const localRuntime = path.join(root, "Яндекс Музыка (Portable)", "win-unpacked");
if (!fs.existsSync(path.join(runtime, "electron.exe"))) {
fs.mkdirSync(runtime, { recursive: true });
for (const entry of fs.readdirSync(localRuntime, { withFileTypes: true })) {
  if (entry.name === "resources" || (entry.name.endsWith(".exe") && entry.name !== "electron.exe")) continue;
  fs.cpSync(path.join(localRuntime, entry.name), path.join(runtime, entry.name), { recursive: true });
}
}
if (!fs.existsSync(path.join(runtime, "electron.exe"))) throw new Error("Local Electron runtime missing");
const cache = path.join(root, ".versions", "builder-cache");
const localCache = path.join(os.homedir(), "AppData", "Local", "electron-builder", "Cache");
if (!fs.existsSync(cache)) fs.cpSync(localCache, cache, { recursive: true });

const configFile = path.join(root, ".versions", "optimized-builder.json");
const packageJson = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
fs.writeFileSync(configFile, JSON.stringify({
  ...packageJson.build,
  electronVersion: "37.10.3", electronDist: runtime, npmRebuild: false,
  directories: { output },
  files: ["**/*", "!dist/**", "!**/*.map", "!bun.lock"],
  win: { ...packageJson.build.win, target: ["portable", "nsis"] },
  portable: { artifactName: "Яндекс Музыка (Portable).exe" },
  nsis: { artifactName: "Яндекс Музыка Setup 5.126.1.exe" },
}, null, 2));
await $`node ${path.join(root, "node_modules/electron-builder/cli.js")} --projectDir ${project} --config ${configFile} --win --x64 --publish never`
  .env({ ...process.env, ELECTRON_BUILDER_CACHE: cache, CSC_IDENTITY_AUTO_DISCOVERY: "false" });
for (const name of ["Яндекс Музыка (Portable).exe", "Яндекс Музыка Setup 5.126.1.exe"]) {
  const builtFile = path.join(output, name);
  if (!fs.existsSync(builtFile)) throw new Error(`Missing executable: ${builtFile}`);
  let destination = path.join(root, name);
  try {
    fs.copyFileSync(builtFile, destination);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") throw error;
    destination = path.join(root, name.replace(/\.exe$/, ` ${releaseVersion} SolyxClub.exe`));
    fs.copyFileSync(builtFile, destination);
  }
  console.log(`Built executable: ${destination}`);
}
