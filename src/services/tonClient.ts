import { TonClient } from "@ton/ton";
import { tonConfig } from "../config";

let tonClient: TonClient | null = null;

export const getTonClient = (): TonClient => {
  if (tonClient) {
    return tonClient;
  }

  const endpoint = tonConfig.tonCenterEndpoint;
  const apiKey = tonConfig.tonCenterApiKey;

  tonClient = new TonClient({ endpoint, apiKey });

  console.log(`[TaskProcessor] TON client initialized for endpoint ${endpoint}`);

  return tonClient;
};
