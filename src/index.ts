import express from "express";
import { TaskProcessor } from "./services/taskProcessor";
import { appConfig } from "./config";
import { logger } from "./logger";


const app = express();

app.use(express.json());

// Disable caching for all responses
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

const allowedOrigins = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/cryptostylematrix\.github\.io\/?$/i,
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.some((allowed) => allowed.test(origin))) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});



app.get("/", (_req, res) => {
  res.send("API is well working!");
});

// Global error handler to surface uncaught route errors
app.use(
  async (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    await logger.error(`Unhandled error: ${err}`);
    res.status(500).json({ error: "Internal server error" });
  },
);

//if (process.env.NODE_ENV === "production") 
{
  const taskProcessor = new TaskProcessor();
  void taskProcessor.run();
}


app.listen(appConfig.port, async () => {
  await logger.info(`Server running at http://localhost:${appConfig.port}`);
});
