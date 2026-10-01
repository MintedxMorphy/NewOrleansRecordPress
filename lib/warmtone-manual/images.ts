const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const MAX_HELP_IMAGES = 3;
/** Keep each photo small so 3 images stay under Vercel’s ~4.5MB body limit. */
export const MAX_IMAGE_BYTES = 1.2 * 1024 * 1024;

export type HelpImage = {
  mimeType: string;
  data: string;
};

export function parseHelpImages(raw: unknown): HelpImage[] {
  if (!Array.isArray(raw)) return [];
  const images: HelpImage[] = [];
  for (const item of raw.slice(0, MAX_HELP_IMAGES)) {
    if (!item || typeof item !== 'object') continue;
    const mimeType = String((item as HelpImage).mimeType || '')
      .toLowerCase()
      .split(';')[0]
      .trim();
    let data = String((item as HelpImage).data || '').trim();
    const dataUrl = data.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (dataUrl) {
      data = dataUrl[2];
    }
    data = data.replace(/\s/g, '');
    if (!ALLOWED.has(mimeType) || !data) continue;
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes <= 0 || bytes > MAX_IMAGE_BYTES) continue;
    images.push({ mimeType, data });
  }
  return images;
}

export function imageDataUrl(image: HelpImage) {
  return `data:${image.mimeType};base64,${image.data}`;
}
