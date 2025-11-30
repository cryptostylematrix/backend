import { Pool } from "pg";
import { dbConfig } from "../config";
import { MatrixPlace } from "../types/matrix";

export type MatrixKey = `${number}:${string}`;
export const matrixKey = (m: number, profile: string): MatrixKey => `${m}:${profile}`;

export type StorePlace = MatrixPlace & { id: number; parent_id: number | null; mp: string };
export type PlacesResult<T extends MatrixPlace = MatrixPlace> = { items: T[]; total: number };

export interface MatrixStore {
  getPlaces: (
    m: number,
    profile_addr: string,
    page: number,
    pageSize: number,
  ) => Promise<PlacesResult<StorePlace>>;
  getPlacesCount: (m: number, profile_addr: string) => Promise<number>;
  searchPlaces: (
    m: number,
    profile_addr: string,
    query: string,
    page: number,
    pageSize: number,
  ) => Promise<PlacesResult<StorePlace>>;
  getPlaceByAddress: (place_addr: string) => Promise<StorePlace | null>;
  getPlacesByMpPrefix: (
    m: number,
    mpPrefix: string,
    depthLevels: number,
    page: number,
    pageSize: number,
  ) => Promise<PlacesResult<StorePlace>>;
  getPlaceByMp: (m: number, mp: string) => Promise<StorePlace | null>;
  getOpenPlacesByMpPrefix: (
    m: number,
    mpPrefix: string,
    page: number,
    pageSize: number,
  ) => Promise<PlacesResult<StorePlace>>;
  getRootPlace: (m: number, profile_addr: string) => Promise<StorePlace | null>;
  getLocks: (
    m: number,
    profile_addr: string,
    page: number,
    pageSize: number,
  ) => Promise<PlacesResult<MatrixPlace>>;
}

type PlaceRow = {
  id: number;
  parent_id?: number | null;
  m: number;
  mp: string;
  pos: number;
  addr: string;
  parent_addr: string | null;
  place_number: number;
  craeted_at: number;
  filling: number;
  filling2: number;
  clone: number;
  profile_login: string;
  index: string;
};

type LockRow = {
  mp: string;
  m: number;
  place_addr: string;
  place_parent_addr: string | null;
  place_number: number;
  craeted_at: number;
  place_clone: number;
  place_profile_login: string;
  place_index: string;
  place_pos: number;
};

const mapPlaceRow = (row: PlaceRow): StorePlace => ({
  id: row.id,
  parent_id: row.parent_id ?? null,
  address: row.addr,
  parent_address: row.parent_addr,
  place_number: row.place_number,
  created_at: row.craeted_at,
  fill_count: row.filling2,
  clone: row.clone,
  pos: (row.pos as 0 | 1) ?? 0,
  login: row.profile_login,
  index: row.index,
  m: row.m,
  mp: row.mp,
});

const mapLockRow = (row: LockRow, fallbackM?: number): MatrixPlace & { mp?: string } => ({
  address: row.place_addr,
  parent_address: row.place_parent_addr,
  place_number: row.place_number,
  created_at: row.craeted_at,
  fill_count: 0,
  clone: row.place_clone,
  pos: row.place_pos as 0 | 1,
  login: row.place_profile_login,
  index: row.place_index,
  m: row.m ?? fallbackM ?? 0,
  mp: row.mp,
});

export class PostgresMatrixStore implements MatrixStore {
  private pool: Pool;

  constructor() {

    this.pool = new Pool({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      port: dbConfig.port,
      ssl: {
        rejectUnauthorized: false
      }
    });

  }

  async getPlaces(
    m: number,
    profile_addr: string,
    page: number,
    pageSize: number,
  ): Promise<PlacesResult<StorePlace>> {
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 10;

    const total = await this.getPlacesCount(m, profile_addr);
    if (total === 0) {
      return { items: [], total: 0 };
    }

    const query = {
      text: `SELECT id, parent_id, m, mp, pos, addr, parent_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
             FROM multi_places
             WHERE m = $1 AND profile_addr = $2
             ORDER BY place_number ASC
             LIMIT $3 OFFSET $4`,
      values: [m, profile_addr, safePageSize, (safePage - 1) * safePageSize],
    };

    const result = await this.pool.query<PlaceRow>(query);
    return { items: result.rows.map(mapPlaceRow), total };
  }

  async getPlacesCount(m: number, profile_addr: string): Promise<number> {
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM multi_places WHERE m = $1 AND profile_addr = $2`,
      [m, profile_addr],
    );
    return Number(countResult.rows[0]?.count ?? 0);
  }

  async getRootPlace(m: number, profile_addr: string): Promise<StorePlace | null> {
    const result = await this.pool.query<PlaceRow>(
      `SELECT id, parent_id, m, mp, pos, addr, parent_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
       FROM multi_places
       WHERE m = $1 AND profile_addr = $2 AND place_number = 1
       LIMIT 1`,
      [m, profile_addr],
    );

    const row = result.rows[0];
    return row ? mapPlaceRow(row) : null;
  }

  async getLocks(
    m: number,
    profile_addr: string,
    page: number,
    pageSize: number,
  ): Promise<PlacesResult<MatrixPlace>> {
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 10;

    const totalResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count
       FROM multi_locks
       WHERE m = $1 AND profile_addr = $2`,
      [m, profile_addr],
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);

    if (total === 0) {
      return { items: [], total: 0 };
    }

    const result = await this.pool.query<LockRow>(
      `SELECT m, mp, place_addr, place_parent_addr, place_number, craeted_at, place_clone, place_profile_login, place_index, place_pos
       FROM multi_locks
       WHERE m = $1 AND profile_addr = $2
       ORDER BY place_number ASC
       LIMIT $3 OFFSET $4`,
      [m, profile_addr, safePageSize, (safePage - 1) * safePageSize],
    );

    return { items: result.rows.map((row) => mapLockRow(row, m)), total };
  }

  async searchPlaces(
    m: number,
    profile_addr: string,
    query: string,
    page: number,
    pageSize: number,
  ): Promise<PlacesResult<StorePlace>> {
    const rootMp = await this.getRootMp(m, profile_addr);
    if (!rootMp) {
      return { items: [], total: 0 };
    }

    const prefix = `${rootMp}%`;
    const indexPrefix = `${query}%`;

    const totalResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count
       FROM multi_places
       WHERE m = $1 AND mp LIKE $2 AND index LIKE $3`,
      [m, prefix, indexPrefix],
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);
    if (total === 0) {
      return { items: [], total: 0 };
    }

    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 10;
    const queryConfig = {
      text: `SELECT id, parent_id, m, mp, pos, addr, parent_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
             FROM multi_places
             WHERE m = $1 AND mp LIKE $2 AND index LIKE $3
             ORDER BY index ASC
             LIMIT $4 OFFSET $5`,
      values: [m, prefix, indexPrefix, safePageSize, (safePage - 1) * safePageSize],
    };

    const result = await this.pool.query<PlaceRow>(queryConfig);
    return { items: result.rows.map(mapPlaceRow), total };
  }

  private async getRootMp(m: number, profile_addr: string): Promise<string | null> {
    const root = await this.pool.query<{ mp: string }>(
      `SELECT mp FROM multi_places WHERE m = $1 AND profile_addr = $2 AND place_number = 1 LIMIT 1`,
      [m, profile_addr],
    );
    return root.rows[0]?.mp ?? null;
  }

  async getPlaceByAddress(place_addr: string): Promise<StorePlace | null> {
    const result = await this.pool.query<PlaceRow>(
      `SELECT id, parent_id, m, mp, addr, parent_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
       FROM multi_places
       WHERE addr = $1
       LIMIT 1`,
      [place_addr],
    );

    const row = result.rows[0];
    return row ? mapPlaceRow(row) : null;
  }

  async getPlacesByMpPrefix(
    m: number,
    mpPrefix: string,
    depthLevels: number,
    page: number,
    pageSize: number,
  ): Promise<PlacesResult<StorePlace>> {
    const maxLength = mpPrefix.length + depthLevels;
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 10;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count
       FROM multi_places
       WHERE m = $1 AND mp LIKE $2 AND length(mp) <= $3`,
      [m, `${mpPrefix}%`, maxLength],
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    if (total === 0) {
      return { items: [], total: 0 };
    }

    const result = await this.pool.query<PlaceRow>(
      `SELECT id, parent_id, m, mp, pos, addr, parent_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
       FROM multi_places
       WHERE m = $1 AND mp LIKE $2 AND length(mp) <= $3
       ORDER BY length(mp) ASC, mp ASC
       LIMIT $4 OFFSET $5`,
      [m, `${mpPrefix}%`, maxLength, safePageSize, (safePage - 1) * safePageSize],
    );

    return { items: result.rows.map(mapPlaceRow), total };
  }

  async getPlaceByMp(m: number, mp: string): Promise<StorePlace | null> {
    const result = await this.pool.query<PlaceRow>(
      `SELECT id, parent_id, m, mp, pos, addr, parent_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
       FROM multi_places
       WHERE m = $1 AND mp = $2
       LIMIT 1`,
      [m, mp],
    );

    const row = result.rows[0];
    return row ? mapPlaceRow(row) : null;
  }

  async getOpenPlacesByMpPrefix(
    m: number,
    mpPrefix: string,
    page: number,
    pageSize: number,
  ): Promise<PlacesResult<StorePlace>> {
    const safePage = page > 0 ? page : 1;
    const safePageSize = pageSize > 0 ? pageSize : 10;

    const totalResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count
       FROM multi_places
       WHERE m = $1 AND mp LIKE $2 AND filling < 2`,
      [m, `${mpPrefix}%`],
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);

    if (total === 0) {
      return { items: [], total: 0 };
    }

    const result = await this.pool.query<PlaceRow>(
      `SELECT id, parent_id, m, mp, pos, addr, parent_addr, place_number, craeted_at, filling, filling2, clone, profile_login, index
       FROM multi_places
       WHERE m = $1 AND mp LIKE $2 AND filling < 2
       ORDER BY length(mp) ASC, mp ASC
       LIMIT $3 OFFSET $4`,
      [m, `${mpPrefix}%`, safePageSize, (safePage - 1) * safePageSize],
    );

    return { items: result.rows.map(mapPlaceRow), total };
  }
}
