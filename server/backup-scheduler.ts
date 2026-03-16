import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

const BACKUP_DIR = path.join(process.cwd(), "backups");
const MAX_BACKUPS = 7;
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let backupInterval: ReturnType<typeof setInterval> | null = null;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function pruneOldBackups() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup_") && f.endsWith(".sql"))
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);

    const toDelete = files.slice(MAX_BACKUPS);
    for (const file of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, file.name));
      console.log(`[BACKUP] Removed old backup: ${file.name}`);
    }
  } catch (err) {
    console.error("[BACKUP] Error pruning old backups:", err);
  }
}

async function runBackup() {
  ensureBackupDir();
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const filename = `backup_${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("[BACKUP] DATABASE_URL not set — skipping backup");
    return;
  }

  console.log(`[BACKUP] Starting daily database backup → ${filename}`);
  try {
    await execAsync(`pg_dump "${dbUrl}" > "${filepath}"`);
    const stats = fs.statSync(filepath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`[BACKUP] Backup complete: ${filename} (${sizeMB} MB)`);
    pruneOldBackups();
  } catch (err) {
    console.error("[BACKUP] Backup failed:", err);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
}

export function startBackupScheduler() {
  if (backupInterval) return;

  console.log(
    "[BACKUP] Daily backup scheduler started (runs every 24 hours, keeps last 7)"
  );

  runBackup();

  backupInterval = setInterval(() => {
    runBackup();
  }, INTERVAL_MS);
}
