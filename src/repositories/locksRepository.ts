import { type Pool } from "pg";
import { pool } from "./db";

export type LockRow = {
  mp: string;
  m: number;
  place_addr: string;
  place_parent_addr: string | null;
  place_profile_addr: string;
  place_number: number;
  craeted_at: number;
  place_clone: number;
  place_profile_login: string;
  place_index: string;
  place_pos: number;
};

class LocksRepository {
  constructor(private readonly client: Pool) {}

  async getLocks(
    m: number,
    profile_addr: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: LockRow[]; total: number }> {
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 10;

    const totalResult = await this.client.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count
       FROM multi_locks
       WHERE m = $1 AND profile_addr = $2`,
      [m, profile_addr],
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);

    if (total === 0) {
      return { items: [], total: 0 };
    }

    const result = await this.client.query<LockRow>(
      `SELECT m, mp, place_addr, place_parent_addr, place_profile_addr, place_number, craeted_at, place_clone, place_profile_login, place_index, place_pos
       FROM multi_locks
       WHERE m = $1 AND profile_addr = $2
       ORDER BY place_number ASC
       LIMIT $3 OFFSET $4`,
      [m, profile_addr, safePageSize, (safePage - 1) * safePageSize],
    );

    return { items: result.rows, total };
  }
}

export const locksRepository = new LocksRepository(pool);
