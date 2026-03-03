import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { log } from "./index";

export async function seedData() {
  const existingAdmin = await storage.getUserByUsername("admin");
  if (existingAdmin) {
    log("Seed data already exists, skipping", "seed");
    return;
  }

  log("Seeding database...", "seed");

  const hashedPassword = await bcrypt.hash("admin123", 12);
  await storage.createUser({
    username: "admin",
    password: hashedPassword,
    fullName: "System Administrator",
    email: "admin@hauerland.sk",
    role: "admin",
  });

  const modules = [
    {
      code: "ONIX",
      name: "ONIX ERP",
      description: "Central ERP system - products, prices, stock management. All other modules synchronize with this system.",
      baseUrl: "http://195.146.148.139/onix_api",
      status: "connected" as const,
    },
    {
      code: "PROMOTRON",
      name: "Promotron E-shop",
      description: "E-shop platform (shop.hauerland.sk) - orders, customers, product sync.",
      baseUrl: "https://api-ts-westeu.promotron.com",
      status: "connected" as const,
    },
    {
      code: "PIPEDRIVE",
      name: "Pipedrive CRM",
      description: "CRM system - deals, contacts, activities synchronization with ONIX.",
      baseUrl: "https://api.pipedrive.com/v1",
      status: "disconnected" as const,
    },
    {
      code: "GIVING",
      name: "Giving Europe",
      description: "Supplier - promotional products catalog, prices, and stock.",
      baseUrl: "https://www.givingeurope.com",
      status: "disconnected" as const,
    },
    {
      code: "MID",
      name: "Midocean",
      description: "Supplier - product catalog, pricing, stock levels via API.",
      baseUrl: "https://api.midocean.com/2.0",
      status: "configuring" as const,
    },
    {
      code: "STICKER",
      name: "Sticker",
      description: "Supplier - product catalog and pricing via web service.",
      baseUrl: "",
      status: "disconnected" as const,
    },
    {
      code: "MACMA",
      name: "Macma",
      description: "Supplier - pending documentation and integration setup.",
      baseUrl: "",
      status: "disconnected" as const,
    },
    {
      code: "XDCONNECT",
      name: "XD Connect",
      description: "Supplier - product data feeds and catalog synchronization.",
      baseUrl: "",
      status: "configuring" as const,
    },
    {
      code: "ANDA",
      name: "Anda Present",
      description: "Supplier - XML/CSV product feeds and pricing.",
      baseUrl: "",
      status: "disconnected" as const,
    },
    {
      code: "EASYGIFTS",
      name: "Easy Gifts",
      description: "Supplier - SKU and pricelist XML feeds.",
      baseUrl: "https://easygifts.sk/api/v2",
      status: "connected" as const,
    },
    {
      code: "PFCONCEPT",
      name: "PF Concept",
      description: "Supplier - data feeds gateway for product synchronization.",
      baseUrl: "https://www.pfconcept.com",
      status: "disconnected" as const,
    },
  ];

  for (const mod of modules) {
    await storage.createModule(mod);
  }

  const allModules = await storage.getAllModules();
  const onixModule = allModules.find(m => m.code === "ONIX");
  const promotronModule = allModules.find(m => m.code === "PROMOTRON");
  const easyGiftsModule = allModules.find(m => m.code === "EASYGIFTS");

  if (onixModule) {
    await storage.createSyncLog({
      moduleId: onixModule.id,
      direction: "import",
      status: "success",
      recordsProcessed: 1247,
      recordsFailed: 0,
    });
    await storage.createSyncLog({
      moduleId: onixModule.id,
      direction: "export",
      status: "success",
      recordsProcessed: 89,
      recordsFailed: 2,
      errorMessage: "2 records skipped - missing product code",
    });
  }

  if (promotronModule) {
    await storage.createSyncLog({
      moduleId: promotronModule.id,
      direction: "import",
      status: "success",
      recordsProcessed: 34,
      recordsFailed: 0,
    });
    await storage.createSyncLog({
      moduleId: promotronModule.id,
      direction: "import",
      status: "error",
      recordsProcessed: 0,
      recordsFailed: 1,
      errorMessage: "API timeout - connection refused",
    });
  }

  if (easyGiftsModule) {
    await storage.createSyncLog({
      moduleId: easyGiftsModule.id,
      direction: "import",
      status: "success",
      recordsProcessed: 562,
      recordsFailed: 3,
    });
  }

  log("Seed data created successfully", "seed");
}
