const SAMPLE_SIZE = 64;
const CHANNEL_BUCKET_SIZE = 32;

interface ColorBucket {
  count: number;
  red: number;
  green: number;
  blue: number;
}

export async function extractDominantColor(src: string): Promise<string | undefined> {
  const image = new Image();
  image.src = src;
  await image.decode();

  const scale = Math.min(1, SAMPLE_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;

  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const buckets = new Map<string, ColorBucket>();

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = [
      Math.floor(red / CHANNEL_BUCKET_SIZE),
      Math.floor(green / CHANNEL_BUCKET_SIZE),
      Math.floor(blue / CHANNEL_BUCKET_SIZE)
    ].join("-");
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  }

  const dominant = [...buckets.values()].reduce<ColorBucket | undefined>(
    (largest, bucket) => (!largest || bucket.count > largest.count ? bucket : largest),
    undefined
  );
  if (!dominant) return undefined;

  const hex = (value: number) =>
    Math.round(value / dominant.count).toString(16).padStart(2, "0");
  return `#${hex(dominant.red)}${hex(dominant.green)}${hex(dominant.blue)}`;
}
