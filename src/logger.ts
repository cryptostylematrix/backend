import axios from "axios";
import { seqConfig } from "./config";

const isLocal = process.env.NODE_ENV !== "production";

// Define allowed Seq log levels
export type SeqLevel =
  | "Fatal"
  | "Error"
  | "Warning"
  | "Information"
  | "Debug"
  | "Verbose";

function logToConsole(
  level: SeqLevel,
  message: string,
  properties: Record<string, any> = {}
): Promise<void> {
  const timestamp = new Date().toISOString();
  const logArgs = [`${timestamp} [${level}] ${message}`];

  if (Object.keys(properties).length > 0) {
    logArgs.push(JSON.stringify(properties));
  }

  switch (level) {
    case "Fatal":
    case "Error":
      console.error(...logArgs);
      break;
    case "Warning":
      console.warn(...logArgs);
      break;
    case "Debug":
    case "Verbose":
      console.debug(...logArgs);
      break;
    default:
      console.info(...logArgs);
      break;
  }

  return Promise.resolve();
}

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

function writeLog(
  level: SeqLevel,
  message: string,
  properties: Record<string, any> = {}
): Promise<void> {
  if (isLocal) {
    return logToConsole(level, message, properties);
  }

  return sendToSeq(level, message, properties);
}

// Public logger API
export const logger = {
  info(message: string, props?: Record<string, any>) {
    return writeLog("Information", message, props);
  },

  warn(message: string, props?: Record<string, any>) {
    return writeLog("Warning", message, props);
  },

  error(message: string, props?: Record<string, any>) {
    return writeLog("Error", message, props);
  },

  debug(message: string, props?: Record<string, any>) {
    return writeLog("Debug", message, props);
  },

  fatal(message: string, props?: Record<string, any>) {
    return writeLog("Fatal", message, props);
  },

  verbose(message: string, props?: Record<string, any>) {
    return writeLog("Verbose", message, props);
  },
};
