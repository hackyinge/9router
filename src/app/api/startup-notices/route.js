import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/dataDir";

export const dynamic = "force-dynamic";

const NOTICE_DIR = path.join(DATA_DIR, "notices");
const PORT_MIGRATION_NOTICE_FILE = path.join(NOTICE_DIR, "port-migration.json");

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function markShown(filePath, notice) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify({
      ...notice,
      shownAt: notice.shownAt || new Date().toISOString(),
    }, null, 2)}\n`);
  } catch {}
}

export async function GET() {
  const notices = [];
  const portMigration = await readJson(PORT_MIGRATION_NOTICE_FILE);
  if (portMigration && !portMigration.shownAt) {
    notices.push({
      id: portMigration.id || "port-migration-20128-20502",
      type: "info",
      title: "默认端口已前移",
      message: `openrouterX 默认端口已从 ${portMigration.fromPort || 20128} 前移到 ${portMigration.toPort || 20502}，本机 MITM 路由配置已自动迁移。`,
      dismissible: true,
      duration: 12000,
    });
    await markShown(PORT_MIGRATION_NOTICE_FILE, portMigration);
  }

  return NextResponse.json({ notices });
}
