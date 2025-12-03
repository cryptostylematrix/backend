import { TonClient } from "@ton/ton";
import { tonConfig } from "../config";
import { logger } from "../logger";

let tonClient: TonClient | null = null;

export const getTonClient = (): TonClient => {
  if (tonClient) {
    return tonClient;
  }

  const endpoint = tonConfig.tonCenterEndpoint;
  const apiKey = tonConfig.tonCenterApiKey;

  tonClient = new TonClient({ endpoint, apiKey });

  logger.info(`[TaskProcessor] TON client initialized for endpoint ${endpoint}`);

  return tonClient;
};
