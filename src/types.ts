export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_UPLOAD_PRESET: string;
  CLOUDINARY_API_SECRET: string;
  CLOUDINARY_API_KEY: string;
  ALLOWED_ORIGINS: string;
  OPENAI_API_KEY?: string;  // Optional: for content moderation
  MODERATION_ENABLED?: string;  // "true" or "false"
};

export type AuthUser = { id: string; aud?: string; role?: string };
export type AppEnv = { Bindings: Bindings; Variables: { user: AuthUser } };

// Domain types
export interface Profile {
  id: string;
  username: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  tag: string;
  created_at: string;
  profiles?: { username: string | null };
}

export interface Connection {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export interface Conversation {
  id: string;
  created_at: string;
  last_message_at: string;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  joined_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: 'post' | 'profile' | 'message';
  target_id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface Block {
  blocker_id: string;
  blocked_user_id: string;
  created_at: string;
}
