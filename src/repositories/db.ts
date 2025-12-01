import { Pool } from "pg";
import { dbConfig } from "../config";

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
      console.log("PostgreSQL pool connected");
    })
    .catch((err) => {
      console.error("PostgreSQL pool connection failed:", err);
    });

  pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err);
  });

  return pool;
};

export const pool = createPool();
