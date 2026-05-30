import { v2 as cloudinary } from 'cloudinary';

// Configured lazily from env so the server boots even without Cloudinary keys
// (uploads just fail with a clear error then, instead of crashing on import).
let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error('Cloudinary credentials missing — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  configured = true;
}

export interface UploadResult {
  url: string;       // delivered https URL
  publicId: string;  // Cloudinary id (for future deletions)
}

/**
 * Upload an image buffer to Cloudinary under the household's recipe folder.
 * Resizes to max 1200px wide and converts to webp on delivery via eager
 * transformation — keeps the stored asset original but serves it light.
 */
export async function uploadRecipeImage(buf: Buffer, householdId: string): Promise<UploadResult> {
  ensureConfigured();
  return new Promise<UploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `veckis/recipes/${householdId}`,
        resource_type: 'image',
        // Cap the stored asset at 1600px wide; delivered with auto format + quality.
        transformation: [{ width: 1600, crop: 'limit' }, { fetch_format: 'auto', quality: 'auto' }],
      },
      (err, res) => {
        if (err || !res) return reject(err ?? new Error('Cloudinary upload failed'));
        resolve({ url: res.secure_url, publicId: res.public_id });
      },
    );
    stream.end(buf);
  });
}

/**
 * Best-effort delete of a previously uploaded Cloudinary asset. Swallows errors
 * so a failed cleanup never blocks the user-visible operation that triggered it
 * (image replace / recipe delete). The next sweep / manual prune can mop up.
 */
export async function deleteRecipeImage(publicId: string): Promise<void> {
  try {
    ensureConfigured();
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (e) {
    console.error('cloudinary destroy failed for', publicId, e instanceof Error ? e.message : e);
  }
}
