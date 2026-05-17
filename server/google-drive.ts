import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { Readable } from "stream";

let _driveClient: drive_v3.Drive | null = null;

function getDriveClient(): drive_v3.Drive {
  if (_driveClient) return _driveClient;

  const credJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credJson) {
    throw new Error(
      "Google Drive zálohy vyžadujú premennú GOOGLE_SERVICE_ACCOUNT_JSON (Service Account JSON)."
    );
  }

  const credentials = JSON.parse(credJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  _driveClient = google.drive({ version: "v3", auth });
  return _driveClient;
}

const TARGET_FOLDER_ID =
  process.env.GOOGLE_DRIVE_TARGET_FOLDER_ID || "0AJCiYKbj09exUk9PVA";
const SYNCHUB_SUBFOLDER = "SyncHub_Backups";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const SD_PARAMS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
} as const;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      console.error(
        `[google-drive] ${label} attempt ${attempt}/${MAX_RETRIES} failed:`,
        err.message
      );
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`${label} failed after ${MAX_RETRIES} attempts`);
}

async function findOrCreateFolder(
  folderName: string,
  parentId: string
): Promise<string> {
  const drive = getDriveClient();
  const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;

  const searchRes = await drive.files.list({
    q,
    fields: "files(id,name)",
    ...SD_PARAMS,
  });

  const files = searchRes.data.files || [];
  console.log(
    `[google-drive] Search folder '${folderName}' in ${parentId}:`,
    JSON.stringify(files)
  );

  if (files.length > 0) {
    return files[0].id!;
  }

  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,name",
    ...SD_PARAMS,
  });

  const created = createRes.data;
  console.log(
    `[google-drive] Created folder '${folderName}':`,
    JSON.stringify(created)
  );

  if (!created.id) {
    throw new Error(
      `Failed to create folder '${folderName}': ${JSON.stringify(created)}`
    );
  }
  return created.id;
}

async function ensureBackupFolder(configId: string): Promise<string> {
  const rootFolderId = await findOrCreateFolder(
    SYNCHUB_SUBFOLDER,
    TARGET_FOLDER_ID
  );
  return findOrCreateFolder(configId, rootFolderId);
}

async function ensureDataBackupFolder(moduleName: string): Promise<string> {
  const rootFolderId = await findOrCreateFolder(
    SYNCHUB_SUBFOLDER,
    TARGET_FOLDER_ID
  );
  const dataFolderId = await findOrCreateFolder("Data", rootFolderId);
  const dateStr = new Date().toISOString().slice(0, 10);
  const dateFolderId = await findOrCreateFolder(dateStr, dataFolderId);
  const safeName = moduleName.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  return findOrCreateFolder(safeName, dateFolderId);
}

async function ensureConfigBackupFolder(): Promise<string> {
  const rootFolderId = await findOrCreateFolder(
    SYNCHUB_SUBFOLDER,
    TARGET_FOLDER_ID
  );
  return findOrCreateFolder("Config", rootFolderId);
}

async function uploadJsonFile(
  folderId: string,
  fileName: string,
  jsonContent: string
): Promise<{ id: string; name: string; size: string; webViewLink: string }> {
  const drive = getDriveClient();

  const uploadRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "application/json",
    },
    media: {
      mimeType: "application/json",
      body: Readable.from(jsonContent),
    },
    fields: "id,name,size,webViewLink",
    ...SD_PARAMS,
  });

  const data = uploadRes.data;
  if (!data.id) {
    throw new Error(`Upload failed for '${fileName}': no file ID returned`);
  }

  return {
    id: data.id,
    name: data.name || fileName,
    size: String(data.size || Buffer.byteLength(jsonContent, "utf-8")),
    webViewLink: data.webViewLink || "",
  };
}

export interface BackupPartResult {
  fileId: string;
  fileName: string;
  fileSize: number;
  webViewLink: string;
  recordCount: number;
  partNumber: number;
}

export interface MultiFileBackupResult {
  parts: BackupPartResult[];
  totalFiles: number;
  totalRecords: number;
  combinedFileSize: number;
  primaryFileId: string;
  primaryFileName: string;
  primaryWebViewLink: string;
}

export async function uploadBackup(
  configId: string,
  configName: string,
  data: any[],
  runId: string,
  moduleName?: string,
  fieldMappings?: Array<{ sourceField: string; targetField: string }>
): Promise<MultiFileBackupResult> {
  const folderId = moduleName
    ? await ensureDataBackupFolder(moduleName)
    : await ensureBackupFolder(configId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = configName.replace(/[^a-zA-Z0-9]/g, "_");

  const mappedTargetFields = new Set<string>();
  if (fieldMappings && fieldMappings.length > 0) {
    for (const m of fieldMappings) {
      mappedTargetFields.add(m.targetField);
    }
  }
  const ID_FIELDS = new Set([
    "Id", "id", "Code", "code", "Name", "name", "SKU", "sku",
    "RecordExternalIdentificator", "ExternalId",
  ]);

  function stripRecord(rec: any): any {
    if (!rec || typeof rec !== "object") return rec;
    const keys = Object.keys(rec);
    if (mappedTargetFields.size > 0) {
      const keep: Record<string, any> = {};
      for (const k of keys) {
        if (ID_FIELDS.has(k) || mappedTargetFields.has(k)) keep[k] = rec[k];
      }
      return keep;
    }
    if (keys.length <= 15) return rec;
    const keep: Record<string, any> = {};
    for (const k of keys) {
      if (ID_FIELDS.has(k)) keep[k] = rec[k];
    }
    for (const k of keys) {
      if (Object.keys(keep).length >= 15) break;
      if (!(k in keep)) keep[k] = rec[k];
    }
    return keep;
  }

  const MAX_BODY_BYTES = 4_000_000;
  const INITIAL_CHUNK = 500;
  const allStripped = data.map(stripRecord);

  function findSafeChunkSize(records: any[], startFrom: number): number {
    let size = Math.min(records.length, startFrom);
    while (size > 1) {
      const slice = records.slice(0, size);
      const json = JSON.stringify({ data: slice });
      if (Buffer.byteLength(json, "utf-8") <= MAX_BODY_BYTES - 500) return size;
      size = Math.max(1, Math.floor(size / 2));
    }
    return 1;
  }

  if (allStripped.length === 0) {
    const fileName = `backup_${baseName}_${timestamp}_empty.json`;
    const jsonContent = JSON.stringify({
      configId, configName, runId, totalRecords: 0,
      partNumber: 1, totalParts: 1, recordsInPart: 0,
      exportedAt: new Date().toISOString(), data: [],
    });
    const fileSize = Buffer.byteLength(jsonContent, "utf-8");

    const result = await withRetry(
      () => uploadJsonFile(folderId, fileName, jsonContent),
      `uploadBackup(${configName} empty)`
    );

    return {
      parts: [{
        fileId: result.id, fileName, fileSize,
        webViewLink: result.webViewLink, recordCount: 0, partNumber: 1,
      }],
      totalFiles: 1, totalRecords: 0, combinedFileSize: fileSize,
      primaryFileId: result.id, primaryFileName: fileName,
      primaryWebViewLink: result.webViewLink,
    };
  }

  const chunks: any[][] = [];
  let scanOffset = 0;
  while (scanOffset < allStripped.length) {
    const remaining = allStripped.slice(scanOffset);
    const sz = findSafeChunkSize(remaining, INITIAL_CHUNK);
    chunks.push(remaining.slice(0, sz));
    scanOffset += sz;
  }
  const totalParts = chunks.length;

  console.log(
    `[google-drive] Multi-file backup: ${allStripped.length} records, ${totalParts} parts`
  );

  const parts: BackupPartResult[] = [];

  for (let partIdx = 0; partIdx < totalParts; partIdx++) {
    const chunk = chunks[partIdx];
    const partNum = partIdx + 1;
    const partSuffix = totalParts > 1 ? `_part${partNum}of${totalParts}` : "";
    const fileName = `backup_${baseName}_${timestamp}${partSuffix}.json`;

    const jsonContent = JSON.stringify({
      configId, configName, runId,
      totalRecords: data.length,
      partNumber: partNum, totalParts,
      recordsInPart: chunk.length,
      exportedAt: new Date().toISOString(),
      data: chunk,
    });

    const fileSize = Buffer.byteLength(jsonContent, "utf-8");
    console.log(
      `[google-drive] Part ${partNum}: ${chunk.length} records, ${Math.round(fileSize / 1024)}KB`
    );

    const currentPartNum = partNum;
    const result = await withRetry(
      () => uploadJsonFile(folderId, fileName, jsonContent),
      `uploadBackup(${configName} part ${currentPartNum})`
    );

    parts.push({
      fileId: result.id, fileName, fileSize,
      webViewLink: result.webViewLink,
      recordCount: chunk.length, partNumber: currentPartNum,
    });
  }

  const combinedFileSize = parts.reduce((sum, p) => sum + p.fileSize, 0);
  const totalRecords = parts.reduce((sum, p) => sum + p.recordCount, 0);

  return {
    parts, totalFiles: parts.length, totalRecords, combinedFileSize,
    primaryFileId: parts[0].fileId,
    primaryFileName: parts[0].fileName,
    primaryWebViewLink: parts[0].webViewLink,
  };
}

export async function uploadConfigBackup(
  configData: any
): Promise<{ fileId: string; fileName: string; fileSize: number; webViewLink: string }> {
  return withRetry(async () => {
    const folderId = await ensureConfigBackupFolder();
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, "-");
    const fileName = `synchub_config_${dateStr}_${timeStr}.json`;
    const jsonContent = JSON.stringify({
      type: "full_config_backup",
      exportedAt: new Date().toISOString(),
      ...configData,
    }, null, 2);
    const fileSize = Buffer.byteLength(jsonContent, "utf-8");

    const result = await uploadJsonFile(folderId, fileName, jsonContent);
    console.log(
      `[google-drive] Config backup upload:`,
      JSON.stringify({ id: result.id, name: result.name })
    );

    return { fileId: result.id, fileName, fileSize, webViewLink: result.webViewLink };
  }, "uploadConfigBackup");
}

export async function listConfigBackups(): Promise<
  Array<{ id: string; name: string; size: string; createdTime: string }>
> {
  try {
    const drive = getDriveClient();
    const folderId = await ensureConfigBackupFolder();
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await drive.files.list({
      q,
      fields: "files(id,name,size,createdTime)",
      orderBy: "createdTime desc",
      ...SD_PARAMS,
    });
    return (res.data.files || []).map((f) => ({
      id: f.id || "",
      name: f.name || "",
      size: String(f.size || "0"),
      createdTime: f.createdTime || "",
    }));
  } catch (err: any) {
    console.error(`[google-drive] listConfigBackups failed:`, err.message);
    return [];
  }
}

export async function downloadBackup(fileId: string): Promise<any> {
  return withRetry(async () => {
    const drive = getDriveClient();
    const res = await drive.files.get(
      { fileId, alt: "media", ...SD_PARAMS },
      { responseType: "arraybuffer" }
    );
    const content = Buffer.from(res.data as ArrayBuffer).toString("utf-8");
    return JSON.parse(content);
  }, `downloadBackup(${fileId})`);
}

export async function deleteBackupFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId, ...SD_PARAMS });
  console.log(`[google-drive] Deleted file ${fileId}`);
}

export async function listDriveBackups(
  configId: string
): Promise<Array<{ id: string; name: string; size: string; createdTime: string }>> {
  try {
    const drive = getDriveClient();
    const folderId = await ensureBackupFolder(configId);
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await drive.files.list({
      q,
      fields: "files(id,name,size,createdTime)",
      orderBy: "createdTime desc",
      ...SD_PARAMS,
    });
    return (res.data.files || []).map((f) => ({
      id: f.id || "",
      name: f.name || "",
      size: String(f.size || "0"),
      createdTime: f.createdTime || "",
    }));
  } catch (err: any) {
    console.error(`[google-drive] listDriveBackups failed:`, err.message);
    return [];
  }
}

export async function rotateBackups(
  configId: string,
  maxBackups: number = 10
): Promise<string[]> {
  const files = await listDriveBackups(configId);
  const deleted: string[] = [];
  if (files.length > maxBackups) {
    const toDelete = files.slice(maxBackups);
    for (const file of toDelete) {
      try {
        await deleteBackupFile(file.id);
        deleted.push(file.id);
      } catch (e: any) {
        console.error(
          `[google-drive] Failed to delete old backup ${file.id}:`,
          e.message
        );
      }
    }
  }
  return deleted;
}

export async function cleanupOldFolders(): Promise<{
  deleted: string[];
  errors: string[];
}> {
  const deleted: string[] = [];
  const errors: string[] = [];
  try {
    const drive = getDriveClient();
    const rootQ = `name='${SYNCHUB_SUBFOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${TARGET_FOLDER_ID}' in parents`;

    const rootRes = await drive.files.list({
      q: rootQ,
      fields: "files(id)",
      ...SD_PARAMS,
    });
    const rootFiles = rootRes.data.files || [];
    if (rootFiles.length === 0) return { deleted, errors };
    const rootId = rootFiles[0].id!;

    const foldersRes = await drive.files.list({
      q: `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      ...SD_PARAMS,
    });

    const keepFolders = ["Data", "Config"];
    for (const folder of foldersRes.data.files || []) {
      if (keepFolders.includes(folder.name || "")) continue;

      const filesRes = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false`,
        fields: "files(id,name)",
        ...SD_PARAMS,
      });

      for (const file of filesRes.data.files || []) {
        try {
          await drive.files.delete({ fileId: file.id!, ...SD_PARAMS });
          deleted.push(`${folder.name}/${file.name}`);
        } catch (e: any) {
          errors.push(`${folder.name}/${file.name}: ${e.message}`);
        }
      }

      try {
        await drive.files.delete({ fileId: folder.id!, ...SD_PARAMS });
        deleted.push(folder.name || folder.id!);
      } catch (e: any) {
        errors.push(`folder ${folder.name}: ${e.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`cleanup failed: ${err.message}`);
  }
  return { deleted, errors };
}

export async function getStorageStats(): Promise<{
  totalFiles: number;
  totalSize: number;
  perConfig: Record<string, { count: number; size: number }>;
}> {
  try {
    const drive = getDriveClient();
    const rootQ = `name='${SYNCHUB_SUBFOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${TARGET_FOLDER_ID}' in parents`;

    const rootRes = await drive.files.list({
      q: rootQ,
      fields: "files(id)",
      ...SD_PARAMS,
    });
    const rootFiles = rootRes.data.files || [];
    if (rootFiles.length === 0) {
      return { totalFiles: 0, totalSize: 0, perConfig: {} };
    }
    const rootId = rootFiles[0].id!;

    const foldersRes = await drive.files.list({
      q: `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      ...SD_PARAMS,
    });

    let totalFiles = 0;
    let totalSize = 0;
    const perConfig: Record<string, { count: number; size: number }> = {};

    for (const folder of foldersRes.data.files || []) {
      const filesRes = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false`,
        fields: "files(id,size)",
        ...SD_PARAMS,
      });
      const files = filesRes.data.files || [];
      const configSize = files.reduce(
        (sum, f) => sum + parseInt(String(f.size || "0")),
        0
      );
      perConfig[folder.name || folder.id!] = { count: files.length, size: configSize };
      totalFiles += files.length;
      totalSize += configSize;
    }

    return { totalFiles, totalSize, perConfig };
  } catch (err: any) {
    console.error(`[google-drive] getStorageStats failed:`, err.message);
    return { totalFiles: 0, totalSize: 0, perConfig: {} };
  }
}
