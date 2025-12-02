export const dbConfig = {
  host: process.env.PGHOST || "localhost",
  user: process.env.PGUSER || "cs_user",
  password: process.env.PGPASSWORD || "password",
  database: process.env.PGDATABASE || "cs",
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
};

// blockchain settings.
export const tonConfig = {
  multiQueueAddress: process.env.MULTI_QUEUE_ADDRESS ?? "",
  processorMnemonic: process.env.PROCESSOR_MNEMONIC ?? "",
  tonCenterEndpoint: process.env.TONCENTER_ENDPOINT ?? "https://toncenter.com/api/v2/jsonRPC",
  tonCenterApiKey:process.env.TONCENTER_API_KEY ?? "",
};
