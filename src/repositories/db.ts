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
    .then(() => {
      logger.info("PostgreSQL pool connected");
    })
    .catch((err) => {
      logger.error("PostgreSQL pool connection failed:", err);
    });

  pool.on("error", (err) => {
    logger.error("Unexpected PostgreSQL pool error:", err);
  });

  return pool;
};

export const pool = createPool();
