import { type Pool } from "pg";
import { pool } from "./db";
import { logger } from "../logger";

export type LockRow = {
  id: number;
  mp: string;
  m: number;
  profile_addr: string;

  place_addr: string;
  locked_pos: number;

  place_profile_login: string;
  place_number: number;
  craeted_at: number;
};


export type NewLock = {
  mp: string;
  m: number;
  profile_addr: string;

  task_key: number;
  task_query_id: number;
  task_source_addr: string | null;
  confirmed: boolean;

  place_addr: string;
  locked_pos: number;

  place_profile_login: string;
  place_number: number;
  craeted_at: number;
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
       FROM multi_locks2
       WHERE m = $1 AND profile_addr = $2`,
      [m, profile_addr],
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);

    if (total === 0) {
      return { items: [], total: 0 };
    }

    const result = await this.client.query<LockRow>(
      `SELECT id, mp, m, profile_addr, 
          place_addr, locked_pos, 
          place_profile_login, place_number, craeted_at        
       FROM multi_locks2
       WHERE m = $1 AND profile_addr = $2
       ORDER BY place_number ASC
       LIMIT $3 OFFSET $4`,
      [m, profile_addr, safePageSize, (safePage - 1) * safePageSize],
    );

    return { items: result.rows, total };
  }

  async addLock(data: NewLock): Promise<LockRow> {
    const result = await this.client.query<LockRow>(
      `INSERT INTO multi_locks2 (
          task_key,
          task_query_id,
          task_source_addr,
          confirmed,

          mp,
          m,
          profile_addr,

          place_addr,
          locked_pos,
          place_profile_login,
          place_number,
          craeted_at
      )
      VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10, $11, $12
      )
      RETURNING 
          id, mp, m, profile_addr, 
          place_addr, locked_pos, 
          place_profile_login, place_number, craeted_at`,
      [
        data.task_key,
        data.task_query_id,
        data.task_source_addr,
        data.confirmed,

        data.mp,
        data.m,
        data.profile_addr,

        data.place_addr,
        data.locked_pos,
        data.place_profile_login,
        data.place_number,
        data.craeted_at,
      ],
  );

    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to insert lock");
    }

    return row;
  }


  async updateLockConfirm(id: number): Promise<LockRow> {
    const query = `UPDATE multi_locks2
      SET confirmed = TRUE
      WHERE id = $1
      RETURNING 
          id, mp, m, profile_addr, 
          place_addr, locked_pos, 
          place_profile_login, place_number, craeted_at`;

    const values = [id];
    //await logger.info("[LockRepository] updateLockConfirm SQL:", query, "values:", values);

    const result = await this.client.query<LockRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Failed to update lock ${id}`);
    }
    return row;
  }

  async getLockByPlaceAddrAndLockedPos(place_addr: string, locked_pos: number): Promise<LockRow | null> {
  const result = await this.client.query<LockRow>(
    `SELECT 
        id, mp, m, profile_addr, 
        place_addr, locked_pos, 
        place_profile_login, place_number, craeted_at
     FROM multi_locks2
     WHERE place_addr = $1 AND locked_pos = $2
     LIMIT 1`,
    [place_addr, locked_pos],
  );

  const row = result.rows[0] ?? null;
  return row;
}

  async removeLock(id: number): Promise<void> {
    const result = await this.client.query(
      `DELETE FROM multi_locks2
      WHERE id = $1
      RETURNING id`,
      [id],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to remove lock");
    }
}



}



export const locksRepository = new LocksRepository(pool);
