import { TonClient } from "@ton/ton";
import { tonConfig } from "../config";
import Bottleneck from "bottleneck";

let tonClient: TonClient | null = null;

// Create a limiter: 20 requests per second, sequential execution
const limiter = new Bottleneck({
  reservoir: 20,
  reservoirRefreshAmount: 20,
  reservoirRefreshInterval: 1000,
  maxConcurrent: 1
});

// A helper that schedules TON calls through limiter
export const limited = <T>(fn: () => Promise<T>): Promise<T> => {
  return limiter.schedule(fn);
};

export const getTonClient = (): TonClient => {
  if (tonClient) return tonClient;

  tonClient = new TonClient({
    endpoint: tonConfig.tonCenterEndpoint,
    apiKey: tonConfig.tonCenterApiKey,
  });

  return tonClient;
};
