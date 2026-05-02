import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS: by default the web app and API are served from the same origin via
// Replit's path-based proxy, so no CORS headers are needed. If a deployment
// needs to allow specific cross-origin frontends, set
// `CORS_ALLOWED_ORIGINS` to a comma-separated allowlist; we *never* reflect
// arbitrary Origin headers because the API uses session cookies.
const corsAllowlist = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
if (corsAllowlist.length > 0) {
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || corsAllowlist.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed by CORS"));
      },
    }),
  );
}
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

export default app;
