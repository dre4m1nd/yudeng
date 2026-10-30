import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isAuthenticated, registerAuthRoutes } from "./auth";
import { config } from "./config";
import { registerApiRoutes } from "./routes";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cookie, { secret: config.COOKIE_SECRET });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    if (request.url.startsWith("/api/auth/")) return;
    if (request.url === "/api/health") return;

    if (!isAuthenticated(request)) {
      return reply.code(401).send({ message: "未登录" });
    }
  });

  await registerAuthRoutes(app);
  await registerApiRoutes(app);

  const webDist = resolve(__dirname, "../../web/dist");

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ message: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}