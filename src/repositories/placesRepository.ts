import { type Pool } from "pg";
import { pool } from "./db";

export type NewPlace = {
  m: number;
  profile_addr: string;
  address: string;
  parent_address: string | null;
  parent_id: number | null;
  mp: string;
  pos: 0 | 1;
  place_number: number;
  created_at: number;
  clone: number;
  login: string;
  task_key: number;
  task_query_id: number;
  task_source_addr: string | null | undefined;
  inviter_profile_addr: string | null | undefined;
  confirmed: boolean;
};

export type PlaceRow = {
  id: number;
  parent_id?: number | null;
  m: number;
  mp: string;
  pos: number;
  addr: string;
  profile_addr: string;
  inviter_profile_addr: string | null;
  parent_addr: string | null;
  place_number: number;
  craeted_at: number;
  filling: number;
  filling2: number;
  clone: number;
  profile_login: string;
  index: string;
};

class PlacesRepository {
  constructor(private readonly client: Pool) {}

  async getRootPlace(m: number, profile_addr: string): Promise<PlaceRow | null> {
    const result = await this.client.query<PlaceRow>(
      `SELECT id, parent_id, m, mp, pos, addr, parent_addr, profile_addr, inviter_profile_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
       FROM multi_places
       WHERE m = $1 AND profile_addr = $2 AND place_number = 1
       LIMIT 1`,
      [m, profile_addr],
    );

    return result.rows[0] ?? null;
  }

  async getPlaceByTaskKey(task_key: number): Promise<PlaceRow | null> {
    const result = await this.client.query<PlaceRow>(
      `SELECT id, parent_id, m, mp, pos, addr, parent_addr, profile_addr, inviter_profile_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
       FROM multi_places
       WHERE task_key = $1
       LIMIT 1`,
      [task_key],
    );

    return result.rows[0] ?? null;
  }

  async getMaxPlaceNumber(m: number, profile_addr: string): Promise<number> {
    const result = await this.client.query<{ max: string | null }>(
      `SELECT MAX(place_number) AS max FROM multi_places WHERE m = $1 AND profile_addr = $2`,
      [m, profile_addr],
    );
    const value = result.rows[0]?.max;
    return value ? Number(value) : 0;
  }

  async incrementFilling(id: number): Promise<void> {
    await this.client.query(`UPDATE multi_places SET filling = filling + 1 WHERE id = $1`, [id]);
  }

  async incrementFilling2(id: number): Promise<void> {
    await this.client.query(`UPDATE multi_places SET filling2 = filling2 + 1 WHERE id = $1`, [id]);
  }

  async updatePlaceAddressAndConfirm(id: number, address: string): Promise<PlaceRow> {
    const query = `UPDATE multi_places
       SET addr = $1, confirmed = TRUE
       WHERE id = $2
       RETURNING id, parent_id, m, mp, pos, addr, parent_addr, profile_addr, inviter_profile_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index`;
    const values = [address, id];
    //await logger.info("[PlacesRepository] updatePlaceAddressAndConfirm SQL:", query, "values:", values);

    const result = await this.client.query<PlaceRow>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Failed to update place ${id} with address ${address}`);
    }
    return row;
  }

  async getPlaceByAddress(place_addr: string): Promise<PlaceRow | null> {
    const result = await this.client.query<PlaceRow>(
      `SELECT id, parent_id, m, mp, pos, addr, parent_addr, profile_addr, inviter_profile_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
       FROM multi_places
       WHERE addr = $1
       LIMIT 1`,
      [place_addr],
    );

    return result.rows[0] ?? null;
  }

  async getOpenPlacesByMpPrefix(
    m: number,
    mpPrefix: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: PlaceRow[]; total: number }> {
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 10;

    const totalResult = await this.client.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count
       FROM multi_places
       WHERE m = $1 AND mp LIKE $2 AND filling < 2`,
      [m, `${mpPrefix}%`],
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);

    if (total === 0) {
      return { items: [], total: 0 };
    }

    const result = await this.client.query<PlaceRow>(
      `SELECT id, parent_id, m, mp, pos, addr, parent_addr, profile_addr, inviter_profile_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
       FROM multi_places
       WHERE m = $1 AND mp LIKE $2 AND filling < 2
       ORDER BY length(mp) ASC, mp ASC
       LIMIT $3 OFFSET $4`,
      [m, `${mpPrefix}%`, safePageSize, (safePage - 1) * safePageSize],
    );

    return { items: result.rows, total };
  }

  async addPlace(place: NewPlace): Promise<PlaceRow> {
    const indexValue = `${place.login}${place.place_number}`;
    const inviterProfile = place.inviter_profile_addr ?? null;
    const taskSourceAddr = place.task_source_addr ?? null;

    const query = {
      text: `INSERT INTO multi_places (
             m, profile_addr, addr, parent_addr, parent_id, mp, pos, place_number, craeted_at,
              filling, filling2, clone, profile_login, index,
              task_key, task_query_id, task_source_addr, inviter_profile_addr, confirmed
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, $10, $11, $12, $13, $14, $15, $16, $17)
             RETURNING id, parent_id, m, mp, pos, addr, parent_addr, profile_addr, inviter_profile_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index`,
      values: [
        place.m,
        place.profile_addr,
        place.address,
        place.parent_address,
        place.parent_id,
        place.mp,
        place.pos,
        place.place_number,
        place.created_at,
        place.clone,
        place.login,
        indexValue,
        place.task_key,
        place.task_query_id,
        taskSourceAddr,
        inviterProfile,
        place.confirmed,
      ],
    };

    const result = await this.client.query<PlaceRow>(query);
    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert place");
    }
    return row;
  }
}

export const placesRepository = new PlacesRepository(pool);
