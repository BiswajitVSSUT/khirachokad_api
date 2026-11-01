import { randomUUID } from "node:crypto";
import pino from "pino";
import { pinoHttp } from "pino-http";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-hub-signature-256']",
      "res.headers['set-cookie']",
      "body",
    ],
    censor: "[Redacted]",
  },
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const requestId = req.headers["x-request-id"];
    const id = typeof requestId === "string" ? requestId : randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  autoLogging: {
    ignore: (req) => req.url === "/",
  },
});
