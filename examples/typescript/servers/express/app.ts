import { randomUUID } from "crypto";
import express from "express";

import { buildErrorEnvelope } from "./server-utils";

type PaymentGuard = express.RequestHandler;

const defaultPaymentGuard: PaymentGuard = (_req, _res, next) => {
  next();
};

export const createApp = (paymentGuard: PaymentGuard = defaultPaymentGuard) => {
  const app = express();

  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") || randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });

  app.use(express.json({ limit: "256kb" }));
  app.use(paymentGuard);

  app
    .route("/weather")
    .get((_req, res) => {
      res.send({
        report: {
          weather: "sunny",
          temperature: 70,
        },
      });
    })
    .all((_req, res) => {
      res
        .status(405)
        .json(buildErrorEnvelope("METHOD_NOT_ALLOWED", "method not allowed", res.locals.requestId));
    });

  app.use(
    (
      error: { type?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (error.type === "entity.parse.failed") {
        res
          .status(400)
          .json(buildErrorEnvelope("BAD_REQUEST", "invalid json payload", res.locals.requestId));
        return;
      }

      next(error);
    },
  );

  app.use((_req, res) => {
    res.status(404).json(buildErrorEnvelope("NOT_FOUND", "route not found", res.locals.requestId));
  });

  return app;
};
