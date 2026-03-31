import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

const TARGET_FOLDER_ID = "0AJCiYKbj09exUk9PVA";
const SYNCHUB_SUBFOLDER = "SyncHub_Backups";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      console.error(`[google-drive] ${label} attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`${label} failed after ${MAX_RETRIES} attempts`);
}

const SD = "supportsAllDrives=true&includeItemsFromAllDrives=true";

async function findOrCreateFolder(folderName: string, parentId: string): Promise<string> {
  const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;
  const searchRes = await connectors.proxy(
    "google-drive",
    `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&${SD}`,
    { method: "GET" }
  );
  const searchData = await searchRes.json();
  console.log(`[google-drive] Search folder '${folderName}' in ${parentId}:`, JSON.stringify(searchData));

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const metadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  };

  const createRes = await connectors.proxy(
    "google-drive",
    `/drive/v3/files?fields=id,name&${SD}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    }
  );
  const createData = await createRes.json();
  console.log(`[google-drive] Created folder '${folderName}':`, JSON.stringify(createData));

  if (!createData.id) {
    throw new Error(`Failed to create folder '${folderName}': ${JSON.stringify(createData)}`);
  }
  return createData.id;
}

async function ensureBackupFolder(configId: string): Promise<string> {
  const rootFolderId = await findOrCreateFolder(SYNCHUB_SUBFOLDER, TARGET_FOLDER_ID);
  const configFolderId = await findOrCreateFolder(configId, rootFolderId);
  return configFolderId;
}

async function ensureDataBackupFolder(moduleName: string): Promise<string> {
  const rootFolderId = await findOrCreateFolder(SYNCHUB_SUBFOLDER, TARGET_FOLDER_ID);
  const dataFolderId = await findOrCreateFolder("Data", rootFolderId);
  const dateStr = new Date().toISOString().slice(0, 10);
  const dateFolderId = await findOrCreateFolder(dateStr, dataFolderId);
  const safeName = moduleName.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
  const moduleFolderId = await findOrCreateFolder(safeName, dateFolderId);
  return moduleFolderId;
}

async function ensureConfigBackupFolder(): Promise<string> {
  const rootFolderId = await findOrCreateFolder(SYNCHUB_SUBFOLDER, TARGET_FOLDER_ID);
  const configFolderId = await findOrCreateFolder("Config", rootFolderId);
  return configFolderId;
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
  const ID_FIELDS = new Set(["Id", "id", "Code", "code", "Name", "name", "SKU", "sku",
    "RecordExternalIdentificator", "ExternalId"]);

  function stripRecord(rec: any): any {
    if (!rec || typeof rec !== "object") return rec;
    const keys = Object.keys(rec);
    if (mappedTargetFields.size > 0) {
      const keep: Record<string, any> = {};
      for (const k of keys) {
        if (ID_FIELDS.has(k) || mappedTargetFields.has(k)) {
          keep[k] = rec[k];
        }
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

  const MAX_BODY_BYTES = 900_000;
  const INITIAL_CHUNK = 500;

  const allStripped = data.map(stripRecord);

  function findSafeChunkSize(records: any[], startFrom: number): number {
    let size = Math.min(records.length, startFrom);
    while (size > 1) {
      const slice = records.slice(0, size);
      const json = JSON.stringify({ data: slice });
      const bytes = Buffer.byteLength(json, "utf-8");
      if (bytes <= MAX_BODY_BYTES - 500) return size;
      size = Math.max(1, Math.floor(size / 2));
    }
    const singleJson = JSON.stringify({ data: records.slice(0, 1) });
    const singleBytes = Buffer.byteLength(singleJson, "utf-8");
    if (singleBytes > MAX_BODY_BYTES) {
      console.warn(`[google-drive] Single record exceeds ${MAX_BODY_BYTES}B (${singleBytes}B) — uploading anyway`);
    }
    return 1;
  }

  if (allStripped.length === 0) {
    const fileName = `backup_${baseName}_${timestamp}_empty.json`;
    const jsonContent = JSON.stringify({
      configId, configName, runId, totalRecords: 0, partNumber: 1, totalParts: 1,
      recordsInPart: 0, exportedAt: new Date().toISOString(), data: [],
    });
    const fileSize = Buffer.byteLength(jsonContent, "utf-8");
    console.log(`[google-drive] Empty backup: 0 records, uploading placeholder file`);

    const result = await withRetry(async () => {
      const boundary = "synchub_boundary_" + Date.now();
      const metadata = JSON.stringify({ name: fileName, parents: [folderId], mimeType: "application/json" });
      const multipartBody = [
        `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", metadata,
        `--${boundary}`, "Content-Type: application/json", "", jsonContent, `--${boundary}--`,
      ].join("\r\n");
      const uploadRes = await connectors.proxy(
        "google-drive",
        `/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink&${SD}`,
        { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipartBody }
      );
      const uploadData = await uploadRes.json();
      if (!uploadData.id) throw new Error(`Upload failed for empty backup: ${JSON.stringify(uploadData)}`);
      return uploadData;
    }, `uploadBackup(${configName} empty)`);

    return {
      parts: [{ fileId: result.id, fileName, fileSize, webViewLink: result.webViewLink || "", recordCount: 0, partNumber: 1 }],
      totalFiles: 1, totalRecords: 0, combinedFileSize: fileSize,
      primaryFileId: result.id, primaryFileName: fileName, primaryWebViewLink: result.webViewLink || "",
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

  console.log(`[google-drive] Multi-file backup: ${allStripped.length} records, ${totalParts} parts`);

  const parts: BackupPartResult[] = [];

  for (let partIdx = 0; partIdx < totalParts; partIdx++) {
    const chunk = chunks[partIdx];
    const partNum = partIdx + 1;
    const partSuffix = totalParts > 1 ? `_part${partNum}of${totalParts}` : "";
    const fileName = `backup_${baseName}_${timestamp}${partSuffix}.json`;

    const jsonContent = JSON.stringify({
      configId,
      configName,
      runId,
      totalRecords: data.length,
      partNumber: partNum,
      totalParts,
      recordsInPart: chunk.length,
      exportedAt: new Date().toISOString(),
      data: chunk,
    });

    const fileSize = Buffer.byteLength(jsonContent, "utf-8");
    console.log(`[google-drive] Part ${partNum}: ${chunk.length} records, ${Math.round(fileSize / 1024)}KB`);

    const currentPartNum = partNum;
    const result = await withRetry(async () => {
      const boundary = "synchub_boundary_" + Date.now() + "_" + currentPartNum;
      const metadata = JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: "application/json",
      });

      const multipartBody = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        metadata,
        `--${boundary}`,
        "Content-Type: application/json",
        "",
        jsonContent,
        `--${boundary}--`,
      ].join("\r\n");

      const uploadRes = await connectors.proxy(
        "google-drive",
        `/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink&${SD}`,
        {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body: multipartBody,
        }
      );

      const uploadData = await uploadRes.json();
      console.log(`[google-drive] Upload part ${currentPartNum} result:`, JSON.stringify({ id: uploadData.id, name: uploadData.name, size: uploadData.size }));

      if (!uploadData.id) {
        throw new Error(`Upload failed for part ${currentPartNum}, no file ID returned: ${JSON.stringify(uploadData)}`);
      }

      return {
        fileId: uploadData.id,
        fileName,
        fileSize,
        webViewLink: uploadData.webViewLink || "",
        recordCount: chunk.length,
        partNumber: currentPartNum,
      };
    }, `uploadBackup(${configName} part ${currentPartNum})`);

    parts.push(result);
  }

  const combinedFileSize = parts.reduce((sum, p) => sum + p.fileSize, 0);
  const totalRecords = parts.reduce((sum, p) => sum + p.recordCount, 0);

  return {
    parts,
    totalFiles: parts.length,
    totalRecords,
    combinedFileSize,
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

    const boundary = "synchub_cfg_boundary_" + Date.now();
    const metadata = JSON.stringify({
      name: fileName,
      parents: [folderId],
      mimeType: "application/json",
    });

    const multipartBody = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      metadata,
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      jsonContent,
      `--${boundary}--`,
    ].join("\r\n");

    const uploadRes = await connectors.proxy(
      "google-drive",
      `/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink&${SD}`,
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: multipartBody,
      }
    );

    const uploadData = await uploadRes.json();
    console.log(`[google-drive] Config backup upload:`, JSON.stringify({ id: uploadData.id, name: uploadData.name }));

    if (!uploadData.id) {
      throw new Error(`Config backup upload failed: ${JSON.stringify(uploadData)}`);
    }

    return {
      fileId: uploadData.id,
      fileName,
      fileSize,
      webViewLink: uploadData.webViewLink || "",
    };
  }, "uploadConfigBackup");
}

export async function listConfigBackups(): Promise<Array<{ id: string; name: string; size: string; createdTime: string }>> {
  try {
    const folderId = await ensureConfigBackupFolder();
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,createdTime)&orderBy=createdTime desc&${SD}`,
      { method: "GET" }
    );
    const data = await res.json();
    return data.files || [];
  } catch (err: any) {
    console.error(`[google-drive] listConfigBackups failed:`, err.message);
    return [];
  }
}

export async function downloadBackup(fileId: string): Promise<any> {
  return withRetry(async () => {
    const res = await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${fileId}?alt=media&${SD}`,
      { method: "GET" }
    );
    return res.json();
  }, `downloadBackup(${fileId})`);
}

export async function deleteBackupFile(fileId: string): Promise<void> {
  await connectors.proxy(
    "google-drive",
    `/drive/v3/files/${fileId}?${SD}`,
    { method: "DELETE" }
  );
  console.log(`[google-drive] Deleted file ${fileId}`);
}

export async function listDriveBackups(configId: string): Promise<Array<{ id: string; name: string; size: string; createdTime: string }>> {
  try {
    const folderId = await ensureBackupFolder(configId);
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,createdTime)&orderBy=createdTime desc&${SD}`,
      { method: "GET" }
    );
    const data = await res.json();
    return data.files || [];
  } catch (err: any) {
    console.error(`[google-drive] listDriveBackups failed:`, err.message);
    return [];
  }
}

export async function rotateBackups(configId: string, maxBackups: number = 10): Promise<string[]> {
  const files = await listDriveBackups(configId);
  const deleted: string[] = [];
  if (files.length > maxBackups) {
    const toDelete = files.slice(maxBackups);
    for (const file of toDelete) {
      try {
        await deleteBackupFile(file.id);
        deleted.push(file.id);
      } catch (e: any) {
        console.error(`[google-drive] Failed to delete old backup ${file.id}:`, e.message);
      }
    }
  }
  return deleted;
}

export async function cleanupOldFolders(): Promise<{ deleted: string[]; errors: string[] }> {
  const deleted: string[] = [];
  const errors: string[] = [];
  try {
    const rootQ = `name='${SYNCHUB_SUBFOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${TARGET_FOLDER_ID}' in parents`;
    const rootRes = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?q=${encodeURIComponent(rootQ)}&fields=files(id)&${SD}`,
      { method: "GET" }
    );
    const rootData = await rootRes.json();
    if (!rootData.files || rootData.files.length === 0) return { deleted, errors };

    const rootId = rootData.files[0].id;
    const foldersQ = `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const foldersRes = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?q=${encodeURIComponent(foldersQ)}&fields=files(id,name)&${SD}`,
      { method: "GET" }
    );
    const foldersData = await foldersRes.json();

    const keepFolders = ["Data", "Config"];
    for (const folder of (foldersData.files || [])) {
      if (keepFolders.includes(folder.name)) continue;

      const filesQ = `'${folder.id}' in parents and trashed=false`;
      const filesRes = await connectors.proxy(
        "google-drive",
        `/drive/v3/files?q=${encodeURIComponent(filesQ)}&fields=files(id,name)&${SD}`,
        { method: "GET" }
      );
      const filesData = await filesRes.json();
      for (const file of (filesData.files || [])) {
        try {
          await connectors.proxy("google-drive", `/drive/v3/files/${file.id}?${SD}`, { method: "DELETE" });
          deleted.push(`${folder.name}/${file.name}`);
        } catch (e: any) {
          errors.push(`${folder.name}/${file.name}: ${e.message}`);
        }
      }
      try {
        await connectors.proxy("google-drive", `/drive/v3/files/${folder.id}?${SD}`, { method: "DELETE" });
        deleted.push(folder.name);
      } catch (e: any) {
        errors.push(`folder ${folder.name}: ${e.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`cleanup failed: ${err.message}`);
  }
  return { deleted, errors };
}

export async function getStorageStats(): Promise<{ totalFiles: number; totalSize: number; perConfig: Record<string, { count: number; size: number }> }> {
  try {
    const rootQ = `name='${SYNCHUB_SUBFOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${TARGET_FOLDER_ID}' in parents`;
    const rootRes = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?q=${encodeURIComponent(rootQ)}&fields=files(id)&${SD}`,
      { method: "GET" }
    );
    const rootData = await rootRes.json();
    if (!rootData.files || rootData.files.length === 0) {
      return { totalFiles: 0, totalSize: 0, perConfig: {} };
    }

    const rootId = rootData.files[0].id;
    const foldersQ = `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const foldersRes = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?q=${encodeURIComponent(foldersQ)}&fields=files(id,name)&${SD}`,
      { method: "GET" }
    );
    const foldersData = await foldersRes.json();

    let totalFiles = 0;
    let totalSize = 0;
    const perConfig: Record<string, { count: number; size: number }> = {};

    for (const folder of (foldersData.files || [])) {
      const filesQ = `'${folder.id}' in parents and trashed=false`;
      const filesRes = await connectors.proxy(
        "google-drive",
        `/drive/v3/files?q=${encodeURIComponent(filesQ)}&fields=files(id,size)&${SD}`,
        { method: "GET" }
      );
      const filesData = await filesRes.json();
      const files = filesData.files || [];
      const configSize = files.reduce((sum: number, f: any) => sum + (parseInt(f.size || "0")), 0);
      perConfig[folder.name] = { count: files.length, size: configSize };
      totalFiles += files.length;
      totalSize += configSize;
    }

    return { totalFiles, totalSize, perConfig };
  } catch (err: any) {
    console.error(`[google-drive] getStorageStats failed:`, err.message);
    return { totalFiles: 0, totalSize: 0, perConfig: {} };
  }
}
