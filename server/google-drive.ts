import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

const SYNCHUB_FOLDER = "SyncHub_Backups";

async function findOrCreateFolder(folderName: string, parentId?: string): Promise<string> {
  let q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;

  const searchRes = await connectors.proxy("google-drive", `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, { method: "GET" });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const metadata: Record<string, any> = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const createRes = await connectors.proxy("google-drive", "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  const createData = await createRes.json();
  return createData.id;
}

async function ensureBackupFolder(configId: string): Promise<string> {
  const rootFolderId = await findOrCreateFolder(SYNCHUB_FOLDER);
  const configFolderId = await findOrCreateFolder(configId, rootFolderId);
  return configFolderId;
}

export async function uploadBackup(
  configId: string,
  configName: string,
  data: any[],
  runId: string
): Promise<{ fileId: string; fileName: string; fileSize: number; webViewLink: string }> {
  const folderId = await ensureBackupFolder(configId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `backup_${configName.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.json`;
  const jsonContent = JSON.stringify({ configId, configName, runId, recordCount: data.length, exportedAt: new Date().toISOString(), data }, null, 2);
  const fileSize = Buffer.byteLength(jsonContent, "utf-8");

  const boundary = "synchub_boundary_" + Date.now();
  const metadata = JSON.stringify({ name: fileName, parents: [folderId], mimeType: "application/json" });

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
    "/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipartBody,
    }
  );

  const uploadData = await uploadRes.json();
  return {
    fileId: uploadData.id,
    fileName,
    fileSize,
    webViewLink: uploadData.webViewLink || "",
  };
}

export async function downloadBackup(fileId: string): Promise<any> {
  const res = await connectors.proxy("google-drive", `/drive/v3/files/${fileId}?alt=media`, { method: "GET" });
  return res.json();
}

export async function deleteBackupFile(fileId: string): Promise<void> {
  await connectors.proxy("google-drive", `/drive/v3/files/${fileId}`, { method: "DELETE" });
}

export async function listDriveBackups(configId: string): Promise<Array<{ id: string; name: string; size: string; createdTime: string }>> {
  try {
    const folderId = await ensureBackupFolder(configId);
    const q = `'${folderId}' in parents and trashed=false`;
    const res = await connectors.proxy(
      "google-drive",
      `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,createdTime)&orderBy=createdTime desc`,
      { method: "GET" }
    );
    const data = await res.json();
    return data.files || [];
  } catch {
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
      } catch (e) {
        console.error(`Failed to delete old backup ${file.id}:`, e);
      }
    }
  }
  return deleted;
}

export async function getStorageStats(): Promise<{ totalFiles: number; totalSize: number; perConfig: Record<string, { count: number; size: number }> }> {
  try {
    const rootQ = `name='${SYNCHUB_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const rootRes = await connectors.proxy("google-drive", `/drive/v3/files?q=${encodeURIComponent(rootQ)}&fields=files(id)`, { method: "GET" });
    const rootData = await rootRes.json();
    if (!rootData.files || rootData.files.length === 0) {
      return { totalFiles: 0, totalSize: 0, perConfig: {} };
    }

    const rootId = rootData.files[0].id;
    const foldersQ = `'${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const foldersRes = await connectors.proxy("google-drive", `/drive/v3/files?q=${encodeURIComponent(foldersQ)}&fields=files(id,name)`, { method: "GET" });
    const foldersData = await foldersRes.json();

    let totalFiles = 0;
    let totalSize = 0;
    const perConfig: Record<string, { count: number; size: number }> = {};

    for (const folder of (foldersData.files || [])) {
      const filesQ = `'${folder.id}' in parents and trashed=false`;
      const filesRes = await connectors.proxy("google-drive", `/drive/v3/files?q=${encodeURIComponent(filesQ)}&fields=files(id,size)`, { method: "GET" });
      const filesData = await filesRes.json();
      const files = filesData.files || [];
      const configSize = files.reduce((sum: number, f: any) => sum + (parseInt(f.size || "0")), 0);
      perConfig[folder.name] = { count: files.length, size: configSize };
      totalFiles += files.length;
      totalSize += configSize;
    }

    return { totalFiles, totalSize, perConfig };
  } catch {
    return { totalFiles: 0, totalSize: 0, perConfig: {} };
  }
}
