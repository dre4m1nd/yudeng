import { LoginInputSchema } from "@yudeng/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "./config";

export function isAuthenticated(request: FastifyRequest): boolean {
  const raw = request.cookies.yudeng_session;
  if (!raw) return false;
  const result = request.unsignCookie(raw);
  return result.valid && result.value === "ok";
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = LoginInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: "请输入访问密码" });
    }

    if (parsed.data.password !== config.APP_PASSWORD) {
      return reply.code(401).send({ message: "密码错误" });
    }

    reply.setCookie("yudeng_session", "ok", {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return { ok: true };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("yudeng_session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!isAuthenticated(request)) {
      return reply.code(401).send({ message: "未登录" });
    }
    return { ok: true };
  });
}