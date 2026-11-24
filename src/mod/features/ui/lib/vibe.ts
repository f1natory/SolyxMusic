function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(r: number, g: number, b: number) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;

  if (delta) {
    saturation = delta / (1 - Math.abs(2 * light - 1));
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }

  return { hue, saturation, light };
}

function ambientColor(r: number, g: number, b: number) {
  const { hue, saturation, light } = rgbToHsl(r, g, b);
  const vividness = saturation < 0.08 ? saturation : clamp(saturation * 0.9, 0.12, 0.58);
  const brightness = saturation < 0.08
    ? clamp(28 + (light - 0.1) * 44, 24, 64)
    : clamp(light * 64, 12, 44);
  return `hsl(${Math.round(hue)} ${Math.round(vividness * 100)}% ${Math.round(brightness)}%)`;
}

function quadrantColor(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  left: boolean,
  top: boolean,
) {
  const buckets = new Map<string, { red: number; green: number; blue: number; count: number }>();
  const halfWidth = imageWidth / 2;
  const halfHeight = imageHeight / 2;
  const startX = left ? 0 : halfWidth;
  const startY = top ? 0 : halfHeight;
  const endX = startX + halfWidth;
  const endY = startY + halfHeight;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * imageWidth + x) * 4;
      if (pixels[offset + 3] < 160) continue;

      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const key = `${red >> 4}-${green >> 4}-${blue >> 4}`;
      const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, count: 0 };
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
  }

  const allColors = [...buckets.values()].sort((a, b) => b.count - a.count);
  const chromaticColors = allColors.filter((color) => {
    const { saturation, light } = rgbToHsl(
      color.red / color.count,
      color.green / color.count,
      color.blue / color.count,
    );
    return saturation >= 0.12 && light >= 0.12 && light <= 0.82;
  });
  const colors = (chromaticColors.length ? chromaticColors : allColors).slice(0, 2);
  if (!colors.length) return 'hsl(220 10% 24%)';

  const total = colors.reduce((sum, color) => sum + color.count, 0);
  const merged = colors.reduce(
    (sum, color) => ({
      red: sum.red + color.red,
      green: sum.green + color.green,
      blue: sum.blue + color.blue,
    }),
    { red: 0, green: 0, blue: 0 },
  );
  return ambientColor(merged.red / total, merged.green / total, merged.blue / total);
}

export async function extractCoverPalette(src: string): Promise<readonly string[] | null> {
  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('cover not loaded'));
      image.src = src;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    return [
      quadrantColor(pixels, canvas.width, canvas.height, true, true),
      quadrantColor(pixels, canvas.width, canvas.height, false, true),
      quadrantColor(pixels, canvas.width, canvas.height, false, false),
      quadrantColor(pixels, canvas.width, canvas.height, true, false),
    ];
  } catch {
    return null;
  }
}
