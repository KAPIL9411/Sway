import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { uploadSignLimit } from '../middleware/ratelimit';

const route = new Hono<AppEnv>();

// Apply rate limiting to upload signature requests
route.post('/sign', uploadSignLimit);

async function sha1Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

route.post('/sign', async c => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const userId = c.get('user').id;
    const folder = `sway/${userId}`;
    
    // Add file restrictions to signature params
    const restrictions = [
      `folder=${folder}`,
      `timestamp=${timestamp}`,
      `upload_preset=${c.env.CLOUDINARY_UPLOAD_PRESET}`,
      'allowed_formats=jpg,png,webp',
      'max_file_size=5000000', // 5MB
      'resource_type=image'
    ];
    
    const paramsForSignature = restrictions.join('&') + c.env.CLOUDINARY_API_SECRET;
    const signature = await sha1Hex(paramsForSignature);
    
    return c.json({
      cloud_name: c.env.CLOUDINARY_CLOUD_NAME,
      api_key: c.env.CLOUDINARY_API_KEY,
      timestamp,
      folder,
      upload_preset: c.env.CLOUDINARY_UPLOAD_PRESET,
      signature,
      // Return restrictions so client knows limits
      allowed_formats: 'jpg,png,webp',
      max_file_size: 5000000,
      resource_type: 'image'
    });
  } catch (err) {
    console.error('[Upload Sign Error]', err);
    return c.json({ error: 'Could not generate upload signature' }, 500);
  }
});

export default route;
