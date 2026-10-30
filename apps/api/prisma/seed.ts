import { maskOpenId, utilityMeta, type UtilityType } from "@yudeng/shared";
import { config } from "../src/config";
import { encryptOpenId, hashOpenId } from "../src/crypto";
import { prisma } from "../src/db";

const DORM_NAME = "木棉1栋219";

async function main() {
  const dorm = await prisma.dorm.upsert({
    where: { name: DORM_NAME },
    create: { name: DORM_NAME, building: "木棉1栋", room: "219" },
    update: { building: "木棉1栋", room: "219" },
  });

  const utilityTypes: UtilityType[] = ["LIGHTING", "AC", "WATER"];

  for (const type of utilityTypes) {
    const meta = utilityMeta[type];
    const account = await prisma.utilityAccount.upsert({
      where: { dormId_type: { dormId: dorm.id, type } },
      create: {
        dormId: dorm.id,
        type,
        displayName: meta.label,
        unit: meta.volumeUnit,
      },
      update: {
        displayName: meta.label,
        unit: meta.volumeUnit,
      },
    });

    await prisma.alertRule.upsert({
      where: { accountId: account.id },
      create: {
        accountId: account.id,
        moneyThresholdCents: meta.defaultThresholdCents,
        forecastDays: 3,
        enabled: true,
        cooldownHours: 24,
      },
      update: {},
    });
  }

  const students = [];

  for (const [index, email] of config.alertEmails.entries()) {
    const student = await prisma.student.upsert({
      where: { dormId_email: { dormId: dorm.id, email } },
      create: {
        dormId: dorm.id,
        name: `同学${index + 1}`,
        email,
      },
      update: {},
    });
    students.push(student);
  }

  const openId = config.openIds[0];

  if (openId) {
    const tokenHash = hashOpenId(openId);
    await prisma.dormToken.upsert({
      where: { tokenHash },
      create: {
        dormId: dorm.id,
        label: "宿舍 OpenID",
        tokenCipher: encryptOpenId(openId),
        tokenHash,
        tokenMask: maskOpenId(openId),
      },
      update: {
        dormId: dorm.id,
        label: "宿舍 OpenID",
        tokenCipher: encryptOpenId(openId),
        tokenMask: maskOpenId(openId),
        status: "ACTIVE",
        failureCount: 0,
        cooldownUntil: null,
        lastError: null,
      },
    });
  }

  console.log(
    `Seed finished: dorm=${dorm.name}, students=${students.length}, openId=${openId ? "configured" : "missing"}`,
  );

  if (!openId) {
    console.warn("SCHOOL_OPENIDS is empty; set the dorm OpenID before scraping.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
