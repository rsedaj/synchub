import fs from "fs";
import path from "path";

export function getLocalBackupBasePath(): string {
  return process.env.LOCAL_BACKUP_PATH || "/app/data/backups";
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function saveLocalBackup(
  subDir: string,
  fileName: string,
  data: unknown
): Promise<{ filePath: string; fileSize: number }> {
  const base = getLocalBackupBasePath();
  const dir = path.join(base, subDir);
  await ensureDir(dir);
  const filePath = path.join(dir, fileName);
  const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  await fs.promises.writeFile(filePath, content, "utf-8");
  const stat = await fs.promises.stat(filePath);
  return { filePath, fileSize: stat.size };
}

export async function readLocalBackup(filePath: string): Promise<Buffer> {
  return fs.promises.readFile(filePath);
}

export async function deleteLocalBackup(filePath: string): Promise<void> {
  try { await fs.promises.unlink(filePath); } catch (_e) {}
}

export interface LocalBackupEntry {
  name: string;
  path: string;
  size: number;
  createdAt: Date;
}

export async function listLocalBackups(subDir: string): Promise<LocalBackupEntry[]> {
  const base = getLocalBackupBasePath();
  const dir = path.join(base, subDir);
  try {
    const files = await fs.promises.readdir(dir);
    const results: LocalBackupEntry[] = [];
    for (const file of files.filter(f => f.endsWith(".json"))) {
      const fp = path.join(dir, file);
      const stat = await fs.promises.stat(fp);
      results.push({ name: file, path: fp, size: stat.size, createdAt: stat.birthtimeMs ? new Date(stat.birthtimeMs) : stat.mtime });
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (_e) {
    return [];
  }
}

export async function localBackupExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch (_e) {
    return false;
  }
}
