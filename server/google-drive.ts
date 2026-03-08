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

export async function uploadBackup(
  configId: string,
  configName: string,
  data: any[],
  runId: string,
  moduleName?: string
): Promise<{ fileId: string; fileName: string; fileSize: number; webViewLink: string }> {
  return withRetry(async () => {
    const folderId = moduleName
      ? await ensureDataBackupFolder(moduleName)
      : await ensureBackupFolder(configId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `backup_${configName.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.json`;
    const jsonContent = JSON.stringify({
      configId,
      configName,
      runId,
      recordCount: data.length,
      exportedAt: new Date().toISOString(),
      data,
    }, null, 2);
    const fileSize = Buffer.byteLength(jsonContent, "utf-8");

    const boundary = "synchub_boundary_" + Date.now();
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
    console.log(`[google-drive] Upload result:`, JSON.stringify({ id: uploadData.id, name: uploadData.name, size: uploadData.size }));

    if (!uploadData.id) {
      throw new Error(`Upload failed, no file ID returned: ${JSON.stringify(uploadData)}`);
    }

    return {
      fileId: uploadData.id,
      fileName,
      fileSize,
      webViewLink: uploadData.webViewLink || "",
    };
  }, `uploadBackup(${configName})`);
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
