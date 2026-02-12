import type { WpComClient } from "./client.js";

/**
 * Upload a media file (image, etc.) to the WordPress site.
 */
export async function uploadMedia(
  client: WpComClient,
  buffer: Buffer,
  filename: string,
  mimeType: string = "image/png"
): Promise<{ id: number; url: string }> {
  return client.uploadMedia(buffer, filename, mimeType);
}
