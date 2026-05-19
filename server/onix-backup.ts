import { storage } from "./storage";
import { saveLocalBackup } from "./local-backup";
import { uploadBackup } from "./google-drive";
import https from "https";
import http from "http";

const ONIX_ENDPOINTS = [
  { key: "stockitems", path: "/api/v1/stockitems", label: "Stockitems" },
  { key: "partners",   path: "/api/v1/partners",   label: "Partners" },
];

async function fetchOnixEndpoint(baseUrl: string, token: string, endpointPath: string): Promise<any[]> {
  const url = new URL(endpointPath, baseUrl.replace(/\/$/, ""));
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.get(
      url.toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      },
      (res) => {
        let raw = "";
        res.on("data", (c: string) => { raw += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return resolve(parsed);
            if (parsed && Array.isArray(parsed.data)) return resolve(parsed.data);
            if (parsed && Array.isArray(parsed.value)) return resolve(parsed.value);
            resolve([parsed]);
          } catch (e: any) {
            reject(new Error(`Parse error for ${endpointPath}: ${e.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error(`Timeout fetching ${endpointPath}`)); });
  });
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
      if (!onixModule) throw new Error("ONIX modul nebol nájdený");

      const cfg = onixModule.config as any;
      const baseUrl: string = cfg?.baseUrl || cfg?.apiBaseUrl || "";
      const token: string = cfg?.apiToken || cfg?.token || "";
      if (!baseUrl || !token) {
        throw new Error("ONIX modul nemá nastavený baseUrl alebo apiToken");
      }

      const allData: Record<string, any[]> = {};
      let totalRecords = 0;
      const epDetails: Record<string, { count: number; error?: string }> = {};

      for (const ep of ONIX_ENDPOINTS) {
        try {
          const records = await fetchOnixEndpoint(baseUrl, token, ep.path);
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
        totalRecords,
        endpoints: epDetails,
        data: allData,
      };

      const { filePath, fileSize } = await saveLocalBackup("onix", fileName, payload);
      console.log(`[onix-backup] Lokálna záloha uložená: ${filePath} (${fileSize} bytes)`);

      let gDriveFileId: string | undefined;
      let gDriveUrl: string | undefined;
      try {
        const allRecords = Object.values(allData).flat();
        const driveResult = await uploadBackup(
          "onix-manual", "ONIX_Backup", allRecords, id, "ONIX"
        );
        gDriveFileId = driveResult.primaryFileId;
        gDriveUrl = driveResult.primaryWebViewLink;
        console.log(`[onix-backup] Google Drive záloha: ${gDriveFileId}`);
      } catch (driveErr: any) {
        console.warn(`[onix-backup] GDrive backup zlyhal (lokálna záloha je OK): ${driveErr.message}`);
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
      console.error(`[onix-backup] Failed: ${err.message}`);
      await storage.updateOnixBackup(id, {
        status: "error",
        completedAt: new Date(),
        errorMessage: err.message,
      });
    }
  });

  return id;
}
