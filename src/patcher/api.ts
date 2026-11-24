import axios from "axios";
import yaml from "js-yaml";
import { z } from "zod";
import { ok, err, Result } from "neverthrow";

import type { AppBuild } from "~/types/AppBuild";

const UPDATE_DOMAIN = "https://music-desktop-application.s3.yandex.net";

const UpdateInfoSchema = z.object({
  files: z.array(
    z.object({
      url: z.string(),
      sha512: z.string(),
      size: z.number(),
    })
  ),
  releaseDate: z.string().optional(),
  updateProbability: z.number().optional(),
  version: z.string(),
  commonConfig: z.object({
    DEPRECATED_VERSIONS: z.string().optional(),
  }),
});

export async function getStableBuild(): Promise<Result<AppBuild[], Error>> {
  try {
    const response = await axios.get(`${UPDATE_DOMAIN}/stable/latest.yml`, {
      responseType: "text",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const rawInfo = yaml.load(response.data);

    const parseResult = UpdateInfoSchema.safeParse(rawInfo);
    if (!parseResult.success) {

      return err(parseResult.error);
    }

    const info = parseResult.data;

    const files = info.files.map((file) => ({
      path: file.url,
      hash: file.sha512,
      size: file.size,
      releaseDate: info.releaseDate,
      updateProbability: info.updateProbability,
      version: info.version,
      deprecatedVersions: info.commonConfig.DEPRECATED_VERSIONS,
    })) as AppBuild[];

    return ok(files);
  } catch (error) {
    return err(error as Error);
  }
}

export async function downloadBuild(
  build: AppBuild,
  filePath: string
): Promise<Result<void, Error>> {
  try {
    const response = await axios.get(`${UPDATE_DOMAIN}/stable/${build.path}`, {
      responseType: "arraybuffer",
    });

    await Bun.write(filePath, response.data);

    return ok();
  } catch (error) {
    return err(error as Error);
  }
}
