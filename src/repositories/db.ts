import { Pool } from "pg";
import { dbConfig } from "../config";
import { logger } from "../logger";

const createPool = (): Pool => {
  const pool = new Pool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    port: dbConfig.port,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  pool
    .query("SELECT 1")
    .then(async () => {
      await logger.info("PostgreSQL pool connected");
    })
    .catch(async (err) => {
      await logger.error("PostgreSQL pool connection failed:", err);
    });

  pool.on("error", async (err) => {
    await logger.error("Unexpected PostgreSQL pool error:", err);
  });

  return pool;
};

export const pool = createPool();
