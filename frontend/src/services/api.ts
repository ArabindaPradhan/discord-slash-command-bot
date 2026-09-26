// API base URL — format VITE_API_URL or default to relative /api/v1
export function formatApiBaseUrl(envUrl?: string): string {
  const trimmed = envUrl?.trim();
  if (!trimmed) {
    return '/api/v1';
  }
  const cleanUrl = trimmed.replace(/\/+$/, '');
  if (cleanUrl.endsWith('/api/v1')) {
    return cleanUrl;
  }
  return `${cleanUrl}/api/v1`;
}

export const API_BASE = formatApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  total?: number;
  page?: number;
  limit?: number;
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',  // Send cookies for session auth
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const data = await res.json() as ApiResponse<T>;

  if (res.status === 401) {
    // Redirect to login on auth failure
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  return data;
}

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: { public_id: string; email: string; role: string }; token: string; expiresAt: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    ),

  logout: () => request('/auth/logout', { method: 'POST' }),

  me: () =>
    request<{ public_id: string; email: string; role: string }>('/auth/me'),
};

// Dashboard API
export const dashboardApi = {
  getStats: () =>
    request<{
      total: number;
      completed: number;
      failed: number;
      duplicate: number;
      byCommand: Array<{ command_name: string; count: number }>;
    }>('/dashboard/stats'),

  listInteractions: (page = 1, limit = 50) =>
    request<Interaction[]>(`/interactions?page=${page}&limit=${limit}`),

  getInteraction: (id: number) =>
    request<{ interaction: Interaction; actionLogs: ActionLog[] }>(`/interactions/${id}`),
};

// Commands API
export const commandsApi = {
  list: () =>
    request<Array<{ server: DiscordServer; configs: CommandConfig[] }>>('/commands'),

  update: (id: string, updates: Partial<CommandConfig>) =>
    request<CommandConfig>(`/commands/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
};

// Discord servers API
export const discordApi = {
  getServers: () => request<DiscordServer[]>('/discord/servers'),

  connectServer: (guildId: string, guildName: string) =>
    request<DiscordServer>('/discord/servers', {
      method: 'POST',
      body: JSON.stringify({ guild_id: guildId, guild_name: guildName }),
    }),

  updateServer: (
    id: string,
    updates: { mirror_webhook_url?: string | null },
  ) =>
    request<DiscordServer>(`/discord/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  registerCommands: (guildId?: string) =>
    request('/discord/register-commands', {
      method: 'POST',
      body: JSON.stringify({ guild_id: guildId }),
    }),
};

// Types shared with backend
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
  received_at: string;
  completed_at: string | null;
}

export interface ActionLog {
  id: number;
  interaction_id: number;
  action_type: string;
  status: 'success' | 'failed' | 'skipped';
  details: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface DiscordServer {
  id: number;
  public_id: string;
  guild_id: string;
  guild_name: string;
  bot_configured: boolean;
  mirror_webhook_configured: boolean;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}
