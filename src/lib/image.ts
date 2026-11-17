export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

/** Downscales an image data URL to a reasonable avatar size. Falls back to the original. */
export async function shrinkDataUrl(dataUrl: string, max = 320): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  if (dataUrl.length < 80_000) return dataUrl;
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
    const width = Math.max(1, Math.round((img.naturalWidth || max) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || max) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    const out = canvas.toDataURL('image/png');
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

export interface CompressOptions {
  /** Longest side kept, in pixels. */
  maxSize?: number;
  /** JPEG quality, 0–1. */
  quality?: number;
  /** Below this many characters the original is used as is. */
  keepBelow?: number;
}

/**
 * Compresses a picture for use as a chat background.
 *
 * Backgrounds live in the same IndexedDB document as the messages, so a phone
 * photo must not be stored at full size: 1920 px on the long side and JPEG q0.82
 * keeps a 4K photo around 200–400 KB while still filling a desktop window.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  { maxSize = 1920, quality = 0.82, keepBelow = 260_000 }: CompressOptions = {},
): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  if (dataUrl.length < keepBelow) return dataUrl;
  try {
    const img = await loadImage(dataUrl);
    const longest = Math.max(img.naturalWidth || maxSize, img.naturalHeight || maxSize);
    const scale = Math.min(1, maxSize / longest);
    const width = Math.max(1, Math.round((img.naturalWidth || maxSize) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || maxSize) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.imageSmoothingQuality = 'high';
    // JPEG has no alpha: paint the canvas background so transparent PNGs turn
    // into a solid picture instead of a black hole.
    ctx.fillStyle = '#12100f';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const out = canvas.toDataURL('image/jpeg', quality);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}
