import {
  AddStudentInputSchema,
  SetOpenIdInputSchema,
  UpdateAlertRuleInputSchema,
  maskOpenId,
} from "@yudeng/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { encryptOpenId, hashOpenId } from "./crypto";
import { prisma } from "./db";
import {
  createDorm,
  getDormDashboard,
  getDormSnapshotPage,
  getDormTimeSeries,
  listDormSummaries,
  parseRange,
} from "./services/dorm-service";
import { runScrape } from "./services/scrape-service";

const DormCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  building: z.string().trim().max(60).optional(),
  room: z.string().trim().max(30).optional(),
  openId: z.string().trim().min(8).max(128),
});

const DormUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  building: z.string().trim().max(60).nullable().optional(),
  room: z.string().trim().max(30).nullable().optional(),
});

const StudentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  email: z.string().email().optional(),
  dormId: z.string().trim().min(1).optional(),
});

const RecipientInputSchema = z.object({
  name: z.string().trim().max(40).optional(),
  email: z.string().email(),
});

const ScrapeRunInputSchema = z.object({
  dormId: z.string().optional(),
});

function pageParams(query: { page?: string; pageSize?: string }) {
  return {
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Math.min(100, Math.max(1, Number(query.pageSize) || 20)),
  };
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function mapAlert(alert: {
  id: string;
  dormId: string;
  accountId: string | null;
  level: string;
  metric: string | null;
  valueCents: number | null;
  valueHundredths: number | null;
  status: string;
  recipients: string;
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
  account?: { displayName: string } | null;
  dorm?: { id: string; name: string } | null;
}) {
  return {
    id: alert.id,
    dormId: alert.dormId,
    dormName: alert.dorm?.name ?? null,
    accountId: alert.accountId,
    accountName: alert.account?.displayName ?? null,
    level: alert.level,
    metric: alert.metric,
    valueCents: alert.valueCents,
    valueHundredths: alert.valueHundredths,
    status: alert.status,
    recipients: alert.recipients,
    error: alert.error,
    createdAt: alert.createdAt,
    sentAt: alert.sentAt,
  };
}

export async function registerApiRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({
    ok: true,
    now: new Date().toISOString(),
  }));

  app.get("/api/dorms", async () => ({
    dorms: await listDormSummaries(),
  }));

  app.post("/api/dorms", async (request, reply) => {
    const parsed = DormCreateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    }

    const duplicate = await prisma.dormToken.findUnique({
      where: { tokenHash: hashOpenId(parsed.data.openId) },
      include: { dorm: { select: { name: true } } },
    });

    if (duplicate) {
      return reply
        .code(409)
        .send({ message: `该 OpenID 已绑定宿舍 ${duplicate.dorm.name}` });
    }

    try {
      return await createDorm(parsed.data);
    } catch (error) {
      if (isUniqueError(error)) {
        return reply.code(409).send({ message: "宿舍名称已存在" });
      }
      throw error;
    }
  });

  app.patch("/api/dorms/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = DormUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    }

    try {
      return await prisma.dorm.update({ where: { id }, data: parsed.data });
    } catch (error) {
      if (isUniqueError(error)) {
        return reply.code(409).send({ message: "宿舍名称已存在" });
      }
      throw error;
    }
  });

  app.delete("/api/dorms/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.dorm.delete({ where: { id } }).catch(() => undefined);
    return { ok: true };
  });

  app.get("/api/dorms/:id/dashboard", async (request, reply) => {
    const { id } = request.params as { id: string };
    const dashboard = await getDormDashboard(id);

    if (!dashboard) {
      return reply.code(404).send({ message: "宿舍不存在" });
    }

    return dashboard;
  });

  app.get("/api/dorms/:id/timeseries", async (request, reply) => {
    const { id } = request.params as { id: string };
    const dorm = await prisma.dorm.findUnique({ where: { id }, select: { id: true } });

    if (!dorm) {
      return reply.code(404).send({ message: "宿舍不存在" });
    }

    const query = request.query as { range?: string };
    return getDormTimeSeries(id, parseRange(query.range));
  });

  app.get("/api/dorms/:id/snapshots", async (request, reply) => {
    const { id } = request.params as { id: string };
    const dorm = await prisma.dorm.findUnique({ where: { id }, select: { id: true } });

    if (!dorm) {
      return reply.code(404).send({ message: "宿舍不存在" });
    }

    const query = request.query as {
      page?: string;
      pageSize?: string;
      accountId?: string;
      from?: string;
      to?: string;
    };
    const { page, pageSize } = pageParams(query);

    return getDormSnapshotPage(id, {
      page,
      pageSize,
      accountId: query.accountId || undefined,
      from: parseDate(query.from),
      to: parseDate(query.to),
    });
  });

  app.get("/api/dorms/:id/students", async (request, reply) => {
    const { id } = request.params as { id: string };
    const dorm = await prisma.dorm.findUnique({ where: { id }, select: { id: true } });

    if (!dorm) {
      return reply.code(404).send({ message: "宿舍不存在" });
    }

    return prisma.student.findMany({
      where: { dormId: id },
      orderBy: { createdAt: "asc" },
    });
  });

  app.get("/api/students", async () => {
    const students = await prisma.student.findMany({
      include: {
        dorm: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      items: students.map((student) => ({
        id: student.id,
        name: student.name,
        email: student.email,
        dormId: student.dormId,
        dormName: student.dorm.name,
        createdAt: student.createdAt,
      })),
    };
  });

  app.post("/api/dorms/:id/students", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = AddStudentInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    }

    const dorm = await prisma.dorm.findUnique({ where: { id }, select: { id: true } });

    if (!dorm) {
      return reply.code(404).send({ message: "宿舍不存在" });
    }

    return prisma.student.upsert({
      where: { dormId_email: { dormId: id, email: parsed.data.email } },
      create: { dormId: id, name: parsed.data.name, email: parsed.data.email },
      update: { name: parsed.data.name },
    });
  });

  app.patch("/api/students/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = StudentUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: "参数错误" });
    }

    if (parsed.data.dormId) {
      const dorm = await prisma.dorm.findUnique({
        where: { id: parsed.data.dormId },
        select: { id: true },
      });

      if (!dorm) {
        return reply.code(404).send({ message: "宿舍不存在" });
      }
    }

    try {
      return await prisma.student.update({ where: { id }, data: parsed.data });
    } catch (error) {
      if (isUniqueError(error)) {
        return reply.code(409).send({ message: "该邮箱已存在于当前宿舍" });
      }
      throw error;
    }
  });

  app.delete("/api/students/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.student.delete({ where: { id } }).catch(() => undefined);
    return { ok: true };
  });

  app.get("/api/dorms/:id/recipients", async (request, reply) => {
    const { id } = request.params as { id: string };
    const dorm = await prisma.dorm.findUnique({ where: { id }, select: { id: true } });

    if (!dorm) {
      return reply.code(404).send({ message: "宿舍不存在" });
    }

    return prisma.dormRecipient.findMany({
      where: { dormId: id },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post("/api/dorms/:id/recipients", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = RecipientInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    }

    const dorm = await prisma.dorm.findUnique({ where: { id }, select: { id: true } });

    if (!dorm) {
      return reply.code(404).send({ message: "宿舍不存在" });
    }

    return prisma.dormRecipient.upsert({
      where: { dormId_email: { dormId: id, email: parsed.data.email } },
      create: {
        dormId: id,
        name: parsed.data.name || null,
        email: parsed.data.email,
      },
      update: { name: parsed.data.name || null },
    });
  });

  app.delete("/api/recipients/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.dormRecipient.delete({ where: { id } }).catch(() => undefined);
    return { ok: true };
  });

  app.put("/api/dorms/:id/openid", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = SetOpenIdInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    }

    const dorm = await prisma.dorm.findUnique({ where: { id }, select: { id: true } });

    if (!dorm) {
      return reply.code(404).send({ message: "宿舍不存在" });
    }

    const { openId } = parsed.data;
    const tokenHash = hashOpenId(openId);
    const existing = await prisma.dormToken.findUnique({
      where: { tokenHash },
      include: { dorm: { select: { name: true } } },
    });

    if (existing && existing.dormId !== id) {
      return reply
        .code(409)
        .send({ message: `该 OpenID 已绑定宿舍 ${existing.dorm.name}` });
    }

    await prisma.$transaction([
      prisma.dormToken.deleteMany({ where: { dormId: id } }),
      prisma.dormToken.create({
        data: {
          dormId: id,
          label: "宿舍 OpenID",
          tokenCipher: encryptOpenId(openId),
          tokenHash,
          tokenMask: maskOpenId(openId),
        },
      }),
    ]);

    return { ok: true };
  });

  app.put("/api/alert-rules/:accountId", async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const parsed = UpdateAlertRuleInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    }

    const account = await prisma.utilityAccount.findUnique({ where: { id: accountId } });

    if (!account) {
      return reply.code(404).send({ message: "账户不存在" });
    }

    const data = {
      moneyThresholdCents: parsed.data.moneyThresholdCents,
      volumeThresholdHundredths: parsed.data.volumeThresholdHundredths ?? null,
      forecastDays: parsed.data.forecastDays,
      enabled: parsed.data.enabled,
    };

    return prisma.alertRule.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });
  });

  app.get("/api/alerts/summary", async () => {
    const [dorms, grouped] = await Promise.all([
      prisma.dorm.findMany({
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.alertEvent.groupBy({
        by: ["dormId", "level"],
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);

    const summary = new Map<
      string,
      { total: number; criticalCount: number; lastAlertAt: Date | null }
    >(
      dorms.map((dorm) => [
        dorm.id,
        { total: 0, criticalCount: 0, lastAlertAt: null },
      ]),
    );

    for (const row of grouped) {
      const item = summary.get(row.dormId);
      if (!item) continue;

      item.total += row._count._all;
      if (row.level === "CRITICAL" || row.level === "TOKEN_INVALID") {
        item.criticalCount += row._count._all;
      }
      if (row._max.createdAt && (!item.lastAlertAt || row._max.createdAt > item.lastAlertAt)) {
        item.lastAlertAt = row._max.createdAt;
      }
    }

    return {
      items: dorms.map((dorm) => ({
        dormId: dorm.id,
        dormName: dorm.name,
        ...summary.get(dorm.id)!,
      })),
    };
  });

  app.get("/api/alerts", async (request) => {
    const query = request.query as {
      dormId?: string;
      page?: string;
      pageSize?: string;
    };
    const { page, pageSize } = pageParams(query);
    const where: Prisma.AlertEventWhereInput = query.dormId
      ? { dormId: query.dormId }
      : {};

    const [total, rows] = await prisma.$transaction([
      prisma.alertEvent.count({ where }),
      prisma.alertEvent.findMany({
        where,
        include: {
          account: true,
          dorm: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(mapAlert),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

  app.get("/api/scrape-runs", async (request) => {
    const query = request.query as {
      dormId?: string;
      page?: string;
      pageSize?: string;
    };
    const { page, pageSize } = pageParams(query);
    const where: Prisma.ScrapeRunWhereInput = query.dormId
      ? { dormId: query.dormId }
      : {};

    const [total, rows] = await prisma.$transaction([
      prisma.scrapeRun.count({ where }),
      prisma.scrapeRun.findMany({
        where,
        include: { dorm: { select: { name: true } } },
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        dormId: row.dormId,
        dormName: row.dorm.name,
        trigger: row.trigger,
        status: row.status,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        durationMs: row.durationMs,
        error: row.error,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

  app.post("/api/scrape/run", async (request, reply) => {
    const parsed = ScrapeRunInputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({ message: "参数错误" });
    }

    if (parsed.data.dormId) {
      const dorm = await prisma.dorm.findUnique({
        where: { id: parsed.data.dormId },
        select: { id: true },
      });

      if (!dorm) {
        return reply.code(404).send({ message: "宿舍不存在" });
      }

      return runScrape(parsed.data.dormId, "manual");
    }

    const dorms = await prisma.dorm.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    const results = [];

    for (const dorm of dorms) {
      results.push({
        dormId: dorm.id,
        dormName: dorm.name,
        ...(await runScrape(dorm.id, "manual")),
      });
    }

    return { results };
  });
}
