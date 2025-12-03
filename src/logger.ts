import axios from "axios";
import { seqConfig } from "./config";

// Define allowed Seq log levels
export type SeqLevel =
  | "Fatal"
  | "Error"
  | "Warning"
  | "Information"
  | "Debug"
  | "Verbose";

// Logging function (fully typed)
async function sendToSeq(
  level: SeqLevel,
  message: string,
  properties: Record<string, any> = {}
): Promise<void> {
  try {
    await axios.post(
      `${seqConfig.url}/api/events/raw?apiKey=${seqConfig.apiKey}`,
      {
        Events: [
          {
            Timestamp: new Date().toISOString(),
            Level: level,
            MessageTemplate: message,
            Properties: properties,
          },
        ],
      }
    );
  } catch (err) {
    console.error("Seq logging failed:", err);
  }
}

// Public logger API
export const logger = {
  info(message: string, props?: Record<string, any>) {
    return sendToSeq("Information", message, props);
  },

  warn(message: string, props?: Record<string, any>) {
    return sendToSeq("Warning", message, props);
  },

  error(message: string, props?: Record<string, any>) {
    return sendToSeq("Error", message, props);
  },

  debug(message: string, props?: Record<string, any>) {
    return sendToSeq("Debug", message, props);
  },

  fatal(message: string, props?: Record<string, any>) {
    return sendToSeq("Fatal", message, props);
  },

  verbose(message: string, props?: Record<string, any>) {
    return sendToSeq("Verbose", message, props);
  },
};