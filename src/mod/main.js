const electron = require("electron");
const fs = require("fs");
const path = require("path");
const process = require("process");
const sanitize = require("sanitize-filename");
const axios = require("axios");

const pathToFfmpeg = require("ffmpeg-static").replaceAll("app.asar", "app.asar.unpacked");
const { exec } = require("child_process");
console.log("bundled ffmpeg binary path:", pathToFfmpeg);

const appFolder = electron.app.getPath("userData");
const settingsFilePath = path.join(appFolder, "mod_settings.json");
const defaultDownloadPath = path.join(appFolder, "Downloads");

fs.mkdir(appFolder, { recursive: true }, (err) => {
  if (err) return console.error(err);
  console.log("mod_settings directory created successfully!");
});

fs.mkdir(defaultDownloadPath, { recursive: true }, (err) => {
  if (err) return console.error(err);
  console.log("Default download directory created successfully!");
});

if (!fs.existsSync(settingsFilePath)) {

  const initialSettings = {
    downloadFolderPath: defaultDownloadPath,
  };
  fs.writeFileSync(settingsFilePath, JSON.stringify(initialSettings, null, 2));
} else {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFilePath, "utf8"));

    if (!settings.downloadFolderPath) {
      settings.downloadFolderPath = defaultDownloadPath;
      fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
    }
  } catch (e) {

    const initialSettings = {
      downloadFolderPath: defaultDownloadPath,
    };
    fs.writeFileSync(settingsFilePath, JSON.stringify(initialSettings, null, 2));
  }
}

let cachedModSettings = null;
function getModSettings() {
  if (cachedModSettings) return cachedModSettings;
  try {
    const raw = fs.readFileSync(settingsFilePath, "utf8");
    cachedModSettings = JSON.parse(raw);
  } catch (e) {
    cachedModSettings = {};
  }
  return cachedModSettings;
}

electron.ipcMain.handle("yandexMusicMod.getStorageValue", (_ev, key) => {
  const settings = getModSettings();
  return settings[key] !== undefined ? settings[key] : null;
});

electron.ipcMain.on("yandexMusicMod.setStorageValue", (_ev, key, value) => {
  const settings = getModSettings();
  settings[key] = value;
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("Failed to write settings:", e);
  }

  electron.BrowserWindow.getAllWindows().forEach((window) =>
    window.webContents.send("yandexMusicMod.storageValueUpdated", key, value),
  );
});

electron.ipcMain.handle("yandexMusicMod.selectDownloadFolder", async (_ev) => {
  const result = await electron.dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Выберите папку для загрузки треков",
  });

  if (result.canceled || !result.filePaths.length) {
    return { success: false, path: null };
  }

  return { success: true, path: result.filePaths[0] };
});

electron.ipcMain.handle("yandexMusicMod.openFolder", async (_ev, folderPath) => {
  try {
    await electron.openPath(folderPath);
    return { success: true };
  } catch (error) {
    console.error("Failed to open folder:", error);
    return { success: false, error: error.message };
  }
});

electron.ipcMain.handle(
  "yandexMusicMod.downloadTrack",
  async (_ev, downloadInfo, trackMeta, customDownloadPath = null) => {
    console.log("Backend get download request: ", downloadInfo.url);

    let saveFolder;
    if (process.platform === "win32") {
      saveFolder = process.env.USERPROFILE + "\\YandexMod Download";
    } else {
      saveFolder = (process.env.HOME || process.env.USERPROFILE) + "/YandexMod Download";
    }

    if (customDownloadPath) {
      saveFolder = customDownloadPath;
    } else {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsFilePath, "utf8"));
        saveFolder = settings.downloadFolderPath || saveFolder;
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }

    if (!fs.existsSync(saveFolder)) {
      fs.mkdirSync(saveFolder, { recursive: true });
    }

    const fileExtension = downloadInfo.codec.includes("flac") ? "flac" : "mp3";
    const trackFileName = sanitize(
      `${trackMeta.artists.map((a) => a.name).join(", ")} - ${trackMeta.title} ${trackMeta.version || ""}`,
    )
      .trim()
      .substring(0, 250);
    const trackFilePath = path.join(saveFolder, `${trackFileName}.${fileExtension}`);
    const trackTempFilePath = path.join(saveFolder, `${Math.random().toString(36).substring(2, 7)}.${fileExtension}`);
    const trackCoverPath = path.join(saveFolder, `${trackFileName}.jpg`);

    try {

      const response = await axios.get(downloadInfo.url, {
        responseType: "stream",
        validateStatus: () => true,
      });
      if (response.status !== 200) {
        response.data.destroy();
        return { ok: false, error: "Download failed" };
      }
      await decryptYandexAudioToFile(response.data, downloadInfo.key, trackTempFilePath);

      const ffmpegArgs = ["-i", JSON.stringify(trackTempFilePath)];

      if (trackMeta.coverUri) {
        try {
          const url = `https://${trackMeta.coverUri.replaceAll("%%", "orig")}`;
          const coverResponse = await axios.get(url, { responseType: "arraybuffer" });
          fs.writeFileSync(trackCoverPath, coverResponse.data);

          ffmpegArgs.push("-i", JSON.stringify(trackCoverPath));
          ffmpegArgs.push("-map", "0:a", "-map", "1:v", "-y");
        } catch (err) {
          console.warn("Failed to download cover art:", err);
        }
      }

      ffmpegArgs.push("-c", "copy");
      ffmpegArgs.push("-id3v2_version", "3");

      if (trackMeta.title) {
        ffmpegArgs.push("-metadata", JSON.stringify(`title=${trackMeta.title}`));
      }
      if (trackMeta.version) {
        ffmpegArgs.push("-metadata", JSON.stringify(`subtitle=${trackMeta.version}`));
      }
      if (trackMeta.artists && trackMeta.artists.length > 0) {
        ffmpegArgs.push("-metadata", JSON.stringify(`artist=${trackMeta.artists.map((a) => a.name).join("/")}`));
      }
      if (trackMeta.albums?.[0]?.title) {
        ffmpegArgs.push("-metadata", JSON.stringify(`album=${trackMeta.albums[0].title}`));
      }
      if (trackMeta.albums?.[0]?.genre) {
        ffmpegArgs.push("-metadata", JSON.stringify(`genre=${trackMeta.albums[0].genre}`));
      }
      if (trackMeta.albums?.[0]?.trackPosition?.index) {
        ffmpegArgs.push("-metadata", JSON.stringify(`track=${trackMeta.albums[0].trackPosition.index}`));
      }
      if (trackMeta.albums?.[0]?.year) {
        ffmpegArgs.push("-metadata", JSON.stringify(`date=${trackMeta.albums[0].year}`));
      }
      if (trackMeta.albums?.[0]?.releaseDate) {
        ffmpegArgs.push("-metadata", JSON.stringify(`releaseDate=${trackMeta.albums[0].releaseDate}`));
      }
      ffmpegArgs.push("-metadata", JSON.stringify("encoded_by=yandexMusicMod"));

      ffmpegArgs.push(JSON.stringify(trackFilePath));

      console.log("ffmpegArgs", ffmpegArgs);

      await new Promise((resolve, reject) => {
        const command = `${JSON.stringify(pathToFfmpeg)} ${ffmpegArgs.join(" ")}`;

        console.log("Executing FFmpeg metadata command:", command);

        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error("FFmpeg metadata stderr:", stderr);
            console.error("FFmpeg metadata error:", error);
            reject(new Error(`FFmpeg metadata process failed. Command: ${command}. Error: ${error.message}`));
          } else {

            if (fs.existsSync(trackTempFilePath)) {
              fs.unlinkSync(trackTempFilePath);
            }

            resolve();
          }
        });

        console.log("Download completed.");
      });
    } catch (err) {
      console.error("Download or decryption failed:", err);
      return { ok: false, error: "Download or decryption failed: " + err };
    } finally {
      await fs.promises.rm(trackTempFilePath, { force: true }).catch(() => {});
    }

    return { ok: true };
  },
);

electron.ipcMain.on("yandexMusicMod.openDownloadDirectory", async (_ev) => {
  let saveFolder;
  if (process.platform === "win32") {
    saveFolder = process.env.USERPROFILE + "\\YandexMod Download";
  } else {
    saveFolder = (process.env.HOME || process.env.USERPROFILE) + "/YandexMod Download";
  }

  if (customDownloadPath) {
    saveFolder = customDownloadPath;
  } else {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsFilePath, "utf8"));
      saveFolder = settings.downloadFolderPath || saveFolder;
    } catch (e) {
      console.log("failed to parse settings", e)
    }
  }

  await electron.openPath(saveFolder)
});

electron.ipcMain.handle("yandexMusicMod.axios", async (_ev, config) => {
  const client = axios.create({
    validateStatus: () => true,
  });

  const response = await client(config);

  return {
    success: true,
    data: response.data,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  };
});

async function decryptYandexAudioToFile(source, secretKey, destination) {
  const { createDecipheriv } = require("node:crypto");
  const { pipeline } = require("node:stream/promises");
  try {
    if (typeof secretKey !== "string" || !/^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{48}|[a-fA-F0-9]{64})$/.test(secretKey)) {
      throw new Error("Invalid AES key");
    }
    const key = Buffer.from(secretKey, "hex");
    const decipher = createDecipheriv(`aes-${key.length * 8}-ctr`, key, Buffer.alloc(16));
    await pipeline(source, decipher, fs.createWriteStream(destination));
  } catch (error) {
    source.destroy();
    await fs.promises.rm(destination, { force: true }).catch(() => {});
    throw error;
  }
}
