import { Logger } from "seq-logging";
import { seqConfig } from "./config";

const seq = new Logger({
  serverUrl: seqConfig.url,
  apiKey: seqConfig.apiKey,
  onError: (e) => console.error("Seq Logging Error:", e),
});

// Define string-based log levels expected by Seq
const LogLevels = {
  Verbose: "Verbose",
  Debug: "Debug",
  Information: "Information",
  Warning: "Warning",
  Error: "Error",
  Fatal: "Fatal",
} as const;

function emit(level: string, message: string, properties?: Record<string, any>) {
  seq.emit({
    timestamp: new Date(),
    level,                 // <- now matches the expected type: string
    messageTemplate: message,
    properties,
  });
}

export const logger = {
  verbose(message: string, properties?: Record<string, any>) {
    emit(LogLevels.Verbose, message, properties);
  },

  debug(message: string, properties?: Record<string, any>) {
    emit(LogLevels.Debug, message, properties);
  },

  info(message: string, properties?: Record<string, any>) {
    emit(LogLevels.Information, message, properties);
  },

  warn(message: string, properties?: Record<string, any>) {
    emit(LogLevels.Warning, message, properties);
  },

  error(message: string, properties?: Record<string, any>) {
    emit(LogLevels.Error, message, properties);
  },

  fatal(message: string, properties?: Record<string, any>) {
    emit(LogLevels.Fatal, message, properties);
  },

  flush() {
    return seq.flush();
  },
};
