// Type definitions for the application
export interface User {
  id: number;
  public_id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'viewer';
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface DiscordServer {
  id: number;
  public_id: string;
  guild_id: string;
  guild_name: string;
  bot_configured: boolean;
  mirror_webhook_configured: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CommandConfig {
  id: number;
  public_id: string;
  discord_server_id: number;
  command_name: string;
  enabled: boolean;
  response_template: string;
  mirror_enabled: boolean;
  ai_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Interaction {
  id: number;
  interaction_id: string;
  discord_server_id: number | null;
  command_name: string;
  interaction_type: number;
  user_id: string | null;
  username: string | null;
  input_text: string | null;
  status: 'pending' | 'completed' | 'failed' | 'duplicate';
  response_status: 'pending' | 'sent' | 'failed' | null;
  mirror_status: 'pending' | 'sent' | 'failed' | 'skipped' | null;
  error_message: string | null;
  received_at: Date;
  completed_at: Date | null;
}

export interface ActionLog {
  id: number;
  interaction_id: number;
  action_type: string;
  status: 'success' | 'failed' | 'skipped';
  details: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

// Auth types
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    public_id: string;
    email: string;
    role: string;
  };
}

// Discord types
export type DiscordInteractionType = 1 | 2 | 3 | 4 | 5;

export interface DiscordInteractionUser {
  id: string;
  username: string;
  discriminator?: string;
  global_name?: string | null;
}

export interface DiscordInteractionMember {
  user: DiscordInteractionUser;
  roles?: string[];
}

export interface DiscordInteractionOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: DiscordInteractionOption[];
}

export interface DiscordInteractionData {
  id: string;
  name: string;
  type?: number;
  options?: DiscordInteractionOption[];
  custom_id?: string;
  component_type?: number;
}

export interface DiscordInteractionPayload {
  id: string;
  application_id: string;
  type: DiscordInteractionType;
  data?: DiscordInteractionData;
  guild_id?: string;
  channel_id?: string;
  member?: DiscordInteractionMember;
  user?: DiscordInteractionUser;
  token: string;
  version: number;
  message?: Record<string, unknown>;
}

export interface DiscordInteractionResponse {
  type: number;
  data?: {
    content?: string;
    embeds?: DiscordEmbed[];
    components?: DiscordComponent[];
    flags?: number;
  };
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordComponent {
  type: number;
  components?: DiscordButton[];
}

export interface DiscordButton {
  type: 2;
  style: number;
  label: string;
  custom_id: string;
  disabled?: boolean;
}
