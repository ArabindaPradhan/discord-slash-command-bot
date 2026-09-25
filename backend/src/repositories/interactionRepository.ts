import { query, queryOne, execute } from '../config/database';
import { Interaction, ActionLog } from '../types';

export const interactionRepository = {
  /**
   * Try to insert an interaction. Returns the row if inserted, null if duplicate.
   * The UNIQUE constraint on interaction_id is the authoritative idempotency guard.
   */
  async tryInsert(data: {
    interaction_id: string;
    discord_server_id: number | null;
    command_name: string;
    interaction_type: number;
    user_id: string | null;
    username: string | null;
    input_text: string | null;
  }): Promise<{ row: Interaction; isDuplicate: boolean }> {
    try {
      const row = await queryOne<Interaction>(
        `INSERT INTO interactions
           (interaction_id, discord_server_id, command_name, interaction_type,
            user_id, username, input_text, status, response_status, mirror_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'pending', 'pending')
         RETURNING *`,
        [
          data.interaction_id,
          data.discord_server_id,
          data.command_name,
          data.interaction_type,
          data.user_id,
          data.username,
          data.input_text,
        ],
      );
      if (!row) throw new Error('Insert returned no row');
      return { row, isDuplicate: false };
    } catch (err: unknown) {
      // PostgreSQL unique violation code is '23505'
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === '23505'
      ) {
        // Duplicate — fetch the existing row
        const existing = await queryOne<Interaction>(
          'SELECT * FROM interactions WHERE interaction_id = $1',
          [data.interaction_id],
        );
        if (!existing) throw new Error('Failed to fetch duplicate interaction');
        return { row: existing, isDuplicate: true };
      }
      throw err;
    }
  },

  async updateStatus(
    id: number,
    updates: Partial<Pick<Interaction, 'status' | 'response_status' | 'mirror_status' | 'error_message' | 'completed_at'>>,
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.response_status !== undefined) {
      fields.push(`response_status = $${paramIndex++}`);
      values.push(updates.response_status);
    }
    if (updates.mirror_status !== undefined) {
      fields.push(`mirror_status = $${paramIndex++}`);
      values.push(updates.mirror_status);
    }
    if (updates.error_message !== undefined) {
      fields.push(`error_message = $${paramIndex++}`);
      values.push(updates.error_message);
    }
    if (updates.completed_at !== undefined) {
      fields.push(`completed_at = $${paramIndex++}`);
      values.push(updates.completed_at);
    }

    if (fields.length === 0) return;

    values.push(id);
    await execute(
      `UPDATE interactions SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values,
    );
  },

  async findAll(opts: {
    limit?: number;
    offset?: number;
    discordServerId?: number;
  } = {}): Promise<{ rows: Interaction[]; total: number }> {
    const { limit = 50, offset = 0, discordServerId } = opts;

    const whereClause = discordServerId ? 'WHERE discord_server_id = $3' : '';
    const params: unknown[] = [limit, offset];
    if (discordServerId) params.push(discordServerId);

    const rows = await query<Interaction>(
      `SELECT * FROM interactions
       ${whereClause}
       ORDER BY received_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    );

    const countParams: unknown[] = discordServerId ? [discordServerId] : [];
    const countWhere = discordServerId ? 'WHERE discord_server_id = $1' : '';
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM interactions ${countWhere}`,
      countParams,
    );

    return { rows, total: parseInt(countResult?.count ?? '0', 10) };
  },

  async findById(id: number): Promise<Interaction | null> {
    return queryOne<Interaction>(
      'SELECT * FROM interactions WHERE id = $1',
      [id],
    );
  },

  async getStats(discordServerId?: number): Promise<{
    total: number;
    completed: number;
    failed: number;
    duplicate: number;
    byCommand: Array<{ command_name: string; count: number }>;
  }> {
    const where = discordServerId ? 'WHERE discord_server_id = $1' : '';
    const params = discordServerId ? [discordServerId] : [];

    const stats = await queryOne<{
      total: string;
      completed: string;
      failed: string;
      duplicate: string;
    }>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) FILTER (WHERE status = 'duplicate') as duplicate
       FROM interactions ${where}`,
      params,
    );

    const byCommand = await query<{ command_name: string; count: string }>(
      `SELECT command_name, COUNT(*) as count
       FROM interactions ${where}
       GROUP BY command_name
       ORDER BY count DESC`,
      params,
    );

    return {
      total: parseInt(stats?.total ?? '0', 10),
      completed: parseInt(stats?.completed ?? '0', 10),
      failed: parseInt(stats?.failed ?? '0', 10),
      duplicate: parseInt(stats?.duplicate ?? '0', 10),
      byCommand: byCommand.map(r => ({
        command_name: r.command_name,
        count: parseInt(r.count, 10),
      })),
    };
  },
};

export const actionLogRepository = {
  async create(data: {
    interaction_id: number;
    action_type: string;
    status: 'success' | 'failed' | 'skipped';
    details?: Record<string, unknown>;
    error_message?: string;
  }): Promise<ActionLog> {
    const row = await queryOne<ActionLog>(
      `INSERT INTO action_logs (interaction_id, action_type, status, details, error_message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.interaction_id,
        data.action_type,
        data.status,
        data.details ? JSON.stringify(data.details) : null,
        data.error_message ?? null,
      ],
    );
    if (!row) throw new Error('Failed to create action log');
    return row;
  },

  async findByInteractionId(interactionId: number): Promise<ActionLog[]> {
    return query<ActionLog>(
      'SELECT * FROM action_logs WHERE interaction_id = $1 ORDER BY created_at',
      [interactionId],
    );
  },
};
