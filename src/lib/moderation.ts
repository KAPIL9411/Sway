/**
 * Content Moderation Integration
 * 
 * This module provides content moderation using OpenAI's Moderation API.
 * For production, configure OPENAI_API_KEY as a Cloudflare Worker secret.
 * 
 * Alternative services:
 * - Perspective API (Google)
 * - Azure Content Safety
 * - AWS Rekognition (for images)
 * - Sightengine
 */

export interface ModerationResult {
  flagged: boolean;
  categories: {
    sexual: boolean;
    hate: boolean;
    harassment: boolean;
    'self-harm': boolean;
    'sexual/minors': boolean;
    'hate/threatening': boolean;
    'violence/graphic': boolean;
    violence: boolean;
  };
  category_scores: Record<string, number>;
  action: 'allow' | 'block' | 'review';
  reason?: string;
}

export interface ModerationConfig {
  enabled: boolean;
  apiKey?: string;
  blockThreshold: number;  // Score threshold for auto-block (0-1)
  reviewThreshold: number; // Score threshold for manual review (0-1)
  autoBlock: boolean;      // If false, all flagged content goes to review queue
}

/**
 * Moderate text content using OpenAI Moderation API
 */
export async function moderateText(
  content: string,
  config: ModerationConfig
): Promise<ModerationResult> {
  // If moderation is disabled, allow all content
  if (!config.enabled) {
    return {
      flagged: false,
      categories: {
        sexual: false,
        hate: false,
        harassment: false,
        'self-harm': false,
        'sexual/minors': false,
        'hate/threatening': false,
        'violence/graphic': false,
        violence: false
      },
      category_scores: {},
      action: 'allow'
    };
  }

  // Require API key if moderation is enabled
  if (!config.apiKey) {
    console.error('[Moderation] API key not configured but moderation is enabled');
    // Fail open (allow content) rather than fail closed to avoid breaking the service
    // In production, you may want to fail closed (block content) instead
    return {
      flagged: true,
      categories: {
        sexual: false,
        hate: false,
        harassment: false,
        'self-harm': false,
        'sexual/minors': false,
        'hate/threatening': false,
        'violence/graphic': false,
        violence: false
      },
      category_scores: {},
      action: 'review',
      reason: 'Moderation service unavailable'
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        input: content,
        model: 'text-moderation-latest'
      })
    });

    if (!response.ok) {
      console.error('[Moderation] API error:', response.status, await response.text());
      return {
        flagged: true,
        categories: {
          sexual: false,
          hate: false,
          harassment: false,
          'self-harm': false,
          'sexual/minors': false,
          'hate/threatening': false,
          'violence/graphic': false,
          violence: false
        },
        category_scores: {},
        action: 'review',
        reason: 'Moderation service error'
      };
    }

    const data = await response.json() as {
      results: Array<{
        flagged: boolean;
        categories: ModerationResult['categories'];
        category_scores: Record<string, number>;
      }>;
    };

    const result = data.results[0];
    if (!result) {
      throw new Error('No moderation result returned');
    }

    // Determine action based on severity
    let action: 'allow' | 'block' | 'review' = 'allow';
    let reason: string | undefined;

    if (result.flagged) {
      // Check for critical categories that should always block
      if (result.categories['sexual/minors'] || result.categories['hate/threatening']) {
        action = 'block';
        reason = 'Critical policy violation';
      } else {
        // Calculate max score
        const maxScore = Math.max(...Object.values(result.category_scores));

        if (config.autoBlock && maxScore >= config.blockThreshold) {
          action = 'block';
          reason = 'Content policy violation';
        } else if (maxScore >= config.reviewThreshold) {
          action = 'review';
          reason = 'Flagged for manual review';
        } else {
          action = 'allow';
        }
      }
    }

    return {
      flagged: result.flagged,
      categories: result.categories,
      category_scores: result.category_scores,
      action,
      reason
    };
  } catch (err) {
    console.error('[Moderation] Error:', err);
    // Fail open on error to avoid breaking the service
    return {
      flagged: true,
      categories: {
        sexual: false,
        hate: false,
        harassment: false,
        'self-harm': false,
        'sexual/minors': false,
        'hate/threatening': false,
        'violence/graphic': false,
        violence: false
      },
      category_scores: {},
      action: 'review',
      reason: 'Moderation service unavailable'
    };
  }
}

/**
 * Moderate image content
 * 
 * This is a placeholder for image moderation integration.
 * Recommended services:
 * - AWS Rekognition (detect inappropriate content)
 * - Azure Content Safety (comprehensive image analysis)
 * - Sightengine (specialized in NSFW detection)
 * - Google Cloud Vision (SafeSearch detection)
 */
export async function moderateImage(
  imageUrl: string,
  config: ModerationConfig
): Promise<ModerationResult> {
  // Placeholder implementation
  // In production, integrate with an image moderation service
  
  if (!config.enabled) {
    return {
      flagged: false,
      categories: {
        sexual: false,
        hate: false,
        harassment: false,
        'self-harm': false,
        'sexual/minors': false,
        'hate/threatening': false,
        'violence/graphic': false,
        violence: false
      },
      category_scores: {},
      action: 'allow'
    };
  }

  // For now, send all images to review queue
  return {
    flagged: true,
    categories: {
      sexual: false,
      hate: false,
      harassment: false,
      'self-harm': false,
      'sexual/minors': false,
      'hate/threatening': false,
      'violence/graphic': false,
      violence: false
    },
    category_scores: {},
    action: 'review',
    reason: 'Image moderation not yet configured'
  };
}

/**
 * Create a moderation queue entry
 * This should be stored in your database for admin review
 */
export interface ModerationQueueEntry {
  id: string;
  content_type: 'post' | 'message' | 'profile';
  content_id: string;
  user_id: string;
  content: string;
  image_url?: string;
  moderation_result: ModerationResult;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

/**
 * Default moderation configuration
 * Override these in your environment
 */
export const defaultModerationConfig: ModerationConfig = {
  enabled: false,  // Set to true in production
  blockThreshold: 0.8,
  reviewThreshold: 0.5,
  autoBlock: false  // Send all flagged content to review queue for now
};
