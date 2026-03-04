import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { db } from "./db";
import { syncLogs } from "@shared/schema";
import { log } from "./index";

const standardDataFields = [
  "Product Code (Supplier)",
  "Product Code (Ours)",
  "Name",
  "Description",
  "Purchase Price",
  "Manager Price",
  "Retail Price",
  "Product URL",
  "Image",
  "Stock Availability",
  "Intrastat Code",
  "Dimensions",
  "Intrastat Country",
];

const MODULE_DEFINITIONS = [
  {
    code: "ONIX",
    name: "ONIX ERP",
    sortOrder: 1,
    description: "Central ERP system - products, prices, stock management. All other modules synchronize with this system.",
    baseUrl: "http://195.146.148.139/onix_api",
    status: "disconnected" as const,
    docsUrl: "https://onix.kros.sk/externe-prepojenie/web-api-dokumentacia/",
    dataFields: ["Stock Cards", "Product Codes", "Names", "Descriptions", "Prices (Purchase/Manager/Retail)", "Images", "Stock Availability", "Intrastat"],
    config: {
      swaggerUrl: "http://195.146.148.139/onix_api/swagger/ui/index",
      apiType: "REST",
      authType: "token",
    },
  },
  {
    code: "PROMOTRON",
    name: "Promotron E-shop",
    sortOrder: 2,
    description: "E-shop platform (shop.hauerland.sk) - orders, customers, product sync with ONIX.",
    baseUrl: "https://api-ts-westeu.promotron.com",
    status: "disconnected" as const,
    docsUrl: "https://support.promotron.com/hc/en-us/articles/16618416323473-TronShop-API-access-reading-data-from-orders-inquiries-and-customers",
    dataFields: ["Orders", "Customers", "Inquiries", "Products"],
    config: {
      swaggerUrl: "https://api-ts-westeu.promotron.com/swagger/index.html",
      apiType: "REST",
      authType: "api_key",
    },
  },
  {
    code: "PIPEDRIVE",
    name: "Pipedrive CRM",
    sortOrder: 3,
    description: "CRM system - deals, contacts, activities synchronization with ONIX.",
    baseUrl: "https://api.pipedrive.com/v1",
    status: "disconnected" as const,
    docsUrl: "https://developers.pipedrive.com/docs/api/v1",
    dataFields: ["Deals", "Contacts", "Organizations", "Activities"],
    config: {
      apiType: "REST",
      authType: "api_key",
    },
  },
  {
    code: "GIVING",
    name: "Giving Europe",
    sortOrder: 4,
    description: "Supplier - promotional products catalog, prices, and stock.",
    baseUrl: "https://www.givingeurope.com",
    status: "disconnected" as const,
    dataFields: standardDataFields,
    config: {
      apiType: "web",
      authType: "credentials",
    },
  },
  {
    code: "MID",
    name: "Midocean",
    sortOrder: 5,
    description: "Supplier - product catalog, pricing, stock levels via API.",
    baseUrl: "https://api.midocean.com/2.0",
    status: "disconnected" as const,
    dataFields: standardDataFields,
    config: {
      apiType: "REST",
      authType: "api_key",
    },
  },
  {
    code: "STICKER",
    name: "Sticker",
    sortOrder: 6,
    description: "Supplier - product catalog and pricing via web service.",
    baseUrl: "",
    status: "disconnected" as const,
    dataFields: standardDataFields,
    config: {
      apiType: "SOAP/REST",
      authType: "api_key",
    },
  },
  {
    code: "MACMA",
    name: "Macma",
    sortOrder: 7,
    description: "Supplier - pending documentation and integration setup.",
    baseUrl: "",
    status: "disconnected" as const,
    dataFields: [],
    config: {
      apiType: "TBD",
      authType: "TBD",
      note: "Waiting for documentation",
    },
  },
  {
    code: "XDCONNECT",
    name: "XD Connect",
    sortOrder: 8,
    description: "Supplier - product data feeds and catalog synchronization.",
    baseUrl: "",
    status: "disconnected" as const,
    dataFields: standardDataFields,
    config: {
      apiType: "data_feed",
      authType: "credentials",
    },
  },
  {
    code: "ANDA",
    name: "Anda Present",
    sortOrder: 9,
    description: "Supplier - XML/CSV product feeds and pricing.",
    baseUrl: "",
    status: "disconnected" as const,
    dataFields: standardDataFields,
    config: {
      apiType: "XML/CSV",
      authType: "feed_url",
    },
  },
  {
    code: "EASYGIFTS",
    name: "Easy Gifts",
    sortOrder: 10,
    description: "Supplier - SKU and pricelist XML feeds.",
    baseUrl: "https://easygifts.sk/api/v2",
    status: "disconnected" as const,
    dataFields: standardDataFields,
    config: {
      apiType: "XML",
      authType: "feed_url",
      skuFeedUrl: "https://easygifts.sk/api/v2/_Xq2P5I6-cCZHnNIohcs/sk/sku.xml",
      pricelistFeedUrl: "https://easygifts.sk/api/v2/_Xq2P5I6-cCZHnNIohcs/sk/pricelist.xml",
    },
  },
  {
    code: "PFCONCEPT",
    name: "PF Concept",
    sortOrder: 11,
    description: "Supplier - data feeds gateway for product synchronization.",
    baseUrl: "https://www.pfconcept.com",
    status: "disconnected" as const,
    docsUrl: "https://www.pfconcept.com/cs_cz/data-feeds-gateway",
    dataFields: standardDataFields,
    config: {
      apiType: "data_feed",
      authType: "credentials",
    },
  },
];

export async function seedData() {
  const existingAdmin = await storage.getUserByUsername("admin");
  if (!existingAdmin) {
    log("Creating admin user...", "seed");
    const hashedPassword = await bcrypt.hash("admin123", 12);
    await storage.createUser({
      username: "admin",
      password: hashedPassword,
      fullName: "System Administrator",
      email: "admin@hauerland.sk",
      role: "admin",
    });
  }

  log("Syncing module definitions...", "seed");

  for (const modDef of MODULE_DEFINITIONS) {
    const existing = await storage.getModuleByCode(modDef.code);
    if (existing) {
      await storage.updateModule(existing.id, {
        name: modDef.name,
        sortOrder: modDef.sortOrder,
        description: modDef.description,
        baseUrl: modDef.baseUrl,
        status: modDef.status,
        docsUrl: modDef.docsUrl || null,
        dataFields: modDef.dataFields,
        config: modDef.config,
      });
    } else {
      await storage.createModule(modDef);
    }
  }

  log("Cleaning old demo sync logs...", "seed");
  await db.delete(syncLogs);

  log("Seed data synced successfully", "seed");
}
