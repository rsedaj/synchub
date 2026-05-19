import { storage } from "./storage";
import { saveLocalBackup } from "./local-backup";
import { uploadBackup } from "./google-drive";
import { getOnixCreds } from "./onix-creds";

const ONIX_ENDPOINTS = [
  { key: "stockitems", path: "/api/v1/stockitems", label: "Stockitems" },
  { key: "partners",   path: "/api/v1/partners",   label: "Partners" },
];

async function fetchOnixEndpoint(
  baseUrl: string,
  headers: Record<string, string>,
  endpointPath: string,
): Promise<any[]> {
  const url = baseUrl.replace(/\/$/, "") + endpointPath;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} pre ${endpointPath}`);
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.value)) return data.value;
    return [data];
  } finally {
    clearTimeout(t);
  }
}

export async function runOnixBackup(triggeredBy: string): Promise<string> {
  const backup = await storage.createOnixBackup({
    status: "running",
    endpoints: ONIX_ENDPOINTS.map(e => e.key),
    triggeredBy,
    details: {},
  });
  const id = backup.id;

  setImmediate(async () => {
    try {
      const onixModule = await storage.getModuleByCode("ONIX");
      if (!onixModule) throw new Error("ONIX modul nebol nájdený v databáze");

      const creds = getOnixCreds(onixModule.config as Record<string, any>);
      if (!creds.token) throw new Error(`ONIX token nie je nakonfigurovaný (environment: ${creds.environment})`);

      const rawBase = ((onixModule as any).baseUrl || "https://onix-api.hauerland.sk/onix_api")
        .replace(/\/onix_api$/i, "/ONIX_API");

      const headers: Record<string, string> = {
        "Authorization": `Bearer ${creds.token}`,
        "Accept": "application/json",
        "User-Agent": "SyncHub/1.0",
      };
      if (creds.databasePath) headers["DatabasePath"] = creds.databasePath;

      const allData: Record<string, any[]> = {};
      let totalRecords = 0;
      const epDetails: Record<string, { count: number; error?: string }> = {};

      for (const ep of ONIX_ENDPOINTS) {
        try {
          const records = await fetchOnixEndpoint(rawBase, headers, ep.path);
          allData[ep.key] = records;
          totalRecords += records.length;
          epDetails[ep.key] = { count: records.length };
          console.log(`[onix-backup] ${ep.key}: ${records.length} záznamov`);
        } catch (err: any) {
          console.error(`[onix-backup] ${ep.key} failed: ${err.message}`);
          epDetails[ep.key] = { count: 0, error: err.message };
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `onix_backup_${timestamp}.json`;
      const payload = {
        exportedAt: new Date().toISOString(),
        environment: creds.environment,
        databasePath: creds.databasePath ?? null,
        totalRecords,
        endpoints: epDetails,
        data: allData,
      };

      const { filePath, fileSize } = await saveLocalBackup("onix", fileName, payload);
      console.log(`[onix-backup] Lokálna záloha: ${filePath} (${fileSize} bytes)`);

      let gDriveFileId: string | undefined;
      let gDriveUrl: string | undefined;
      try {
        const allRecords = Object.values(allData).flat();
        const driveResult = await uploadBackup(
          "onix-manual", "ONIX_Backup", allRecords, id, "ONIX",
        );
        gDriveFileId = driveResult.primaryFileId;
        gDriveUrl = driveResult.primaryWebViewLink;
        console.log(`[onix-backup] Google Drive: ${gDriveFileId}`);
      } catch (driveErr: any) {
        console.warn(`[onix-backup] GDrive zlyhal (lokálna záloha OK): ${driveErr.message}`);
      }

      await storage.updateOnixBackup(id, {
        status: "success",
        completedAt: new Date(),
        localFilePath: filePath,
        googleDriveFileId: gDriveFileId,
        googleDriveUrl: gDriveUrl,
        totalRecords,
        fileSize,
        details: epDetails,
      });
    } catch (err: any) {
      console.error(`[onix-backup] Zlyhanie: ${err.message}`);
      await storage.updateOnixBackup(id, {
        status: "error",
        completedAt: new Date(),
        errorMessage: err.message,
      });
    }
  });

  return id;
}
