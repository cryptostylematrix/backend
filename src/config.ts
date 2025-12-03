import dotenv from "dotenv";
dotenv.config({ path: process.env.NODE_ENV === "production" ? ".env" : ".env.development" });

// app settings
export const appConfig = {
  port: Number(process.env.PORT || 3000)
};

// database settings 
export const dbConfig = {
  host: process.env.PGHOST || "localhost",
  user: process.env.PGUSER || "cs_user",
  password: process.env.PGPASSWORD || "password",
  database: process.env.PGDATABASE || "cs",
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
};

// blockchain settings
export const tonConfig = {
  multiQueueAddress: process.env.MULTI_QUEUE_ADDRESS ?? "",
  processorMnemonic: process.env.PROCESSOR_MNEMONIC ?? "",
  tonCenterEndpoint: process.env.TONCENTER_ENDPOINT ?? "https://toncenter.com/api/v2/jsonRPC",
  tonCenterApiKey: process.env.TONCENTER_API_KEY ?? "",
};

// seq logging settings
export const seqConfig = {
  url: process.env.SEQ_URL || "http://localhost:5341",
  apiKey: process.env.SEQ_API_KEY || undefined,
};
