import { z } from 'zod';

// Username validation
export const usernameSchema = z.object({
  username: z.string().trim().min(2, 'Username must be at least 2 characters')
    .max(24, 'Username must be at most 24 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores')
});

// Post validation
export const createPostSchema = z.object({
  content: z.string().trim().max(2000, 'Post content exceeds 2000 characters').default(''),
  image_url: z.string()
    .url('Invalid image URL')
    .regex(/^https:\/\/res\.cloudinary\.com\/[\w-]+\//, 'Image must be from Cloudinary')
    .nullable()
    .optional(),
  tag: z.string().trim().max(32, 'Tag exceeds 32 characters').default('General')
}).refine(
  data => (data.content && data.content.length > 0) || data.image_url,
  { message: 'Post must have either text content or an image' }
);

// Connection request validation
export const createConnectionSchema = z.object({
  receiver_id: z.string().uuid('Invalid receiver ID format')
});

export const updateConnectionSchema = z.object({
  status: z.enum(['accepted', 'rejected'])
});

// Message validation
export const createMessageSchema = z.object({
  body: z.string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message exceeds 2000 characters')
});

// Report validation
export const createReportSchema = z.object({
  target_type: z.enum(['post', 'profile', 'message']),
  target_id: z.string().uuid('Invalid target ID format'),
  reason: z.string().trim().min(1, 'Reason is required').max(200, 'Reason exceeds 200 characters'),
  details: z.string().trim().max(1000, 'Details exceed 1000 characters').optional()
});

// Block validation
export const createBlockSchema = z.object({
  blocked_user_id: z.string().uuid('Invalid user ID format')
});

// Query parameter validation
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  sort: z.enum(['latest']).optional().default('latest')
});

export const messagesPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

// Cloudinary signature validation helpers
export const cloudinaryUrlPattern = /^https:\/\/res\.cloudinary\.com\/[\w-]+\//;

export function validateCloudinaryUrl(url: string, userId: string): boolean {
  if (!cloudinaryUrlPattern.test(url)) return false;
  const expectedFolder = `sway/${userId}`;
  return url.includes(`/${expectedFolder}/`);
}
