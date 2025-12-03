import { logger } from "../logger";

export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 300
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await logger.warn(`[TON] retrying after error: ${error}`);
    await new Promise((res) => setTimeout(res, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}

export async function retryExp<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 300 // initial delay
): Promise<T> {
  let attempt = 0;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;

      const delay = baseDelay * Math.pow(2, attempt);

      await logger.warn(`[TON] retry #${attempt + 1} in ${delay}ms (${error})`);
      await new Promise((res) => setTimeout(res, delay));

      attempt++;
    }
  }

  throw new Error("Unexpected exit from retry loop");
}
