import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import pino from "pino";
import pinoHttp from "pino-http";
import { config } from "./config";
import { HttpError } from "./errors";
import { healthRouter } from "./routes/health";
import { workflowsRouter } from "./routes/workflows";

const logger = pino({
  level: config.logLevel,
  serializers: {
    req(value: IncomingMessage) {
      const serialized = pino.stdSerializers.req(value);
      if (serialized?.headers && typeof serialized.headers === "object") {
        const h = serialized.headers as Record<string, unknown>;
        if ("authorization" in h) h.authorization = "[Redacted]";
        if ("Authorization" in h) h.Authorization = "[Redacted]";
      }
      return serialized;
    },
  },
});

export const app = express();

app.use(
  cors(
    config.corsAllowedOrigins === null
      ? {}
      : { origin: config.corsAllowedOrigins },
  ),
);

app.use(
  pinoHttp({
    logger,
    autoLogging: true,
    genReqId: (req) => {
      const raw = req.headers["x-request-id"];
      if (typeof raw === "string" && raw.trim()) {
        return raw.trim();
      }
      return randomUUID();
    },
  }),
);
app.use(express.json());

const workflowsStack: express.RequestHandler[] = [];
if (config.workflowRateLimitPerMinute !== null) {
  workflowsStack.push(
    rateLimit({
      windowMs: 60_000,
      max: config.workflowRateLimitPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
}
workflowsStack.push(workflowsRouter);
app.use("/workflows", ...workflowsStack);
app.use("/health", healthRouter);

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    return;
  }

  if (err instanceof HttpError) {
    req.log?.warn({ err }, "request failed");
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  req.log?.error({ err }, "request failed");
  const message = err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({
    error: message,
    code: "INTERNAL_ERROR",
  });
};

app.use(errorHandler);
