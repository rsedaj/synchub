import bcrypt from "bcryptjs";
import { storage } from "./storage";
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
    dataFields: ["Orders", "Customers", "Inquiries", "Carts", "Coupons", "Products", "Payment States"],
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
    description: "Supplier - promotional products catalog, prices, and stock via Debtor API.",
    baseUrl: "https://debtorapi-sandbox.givingeurope.com",
    docsUrl: "https://debtorapi-sandbox.givingeurope.com/spec/index.html",
    status: "disconnected" as const,
    dataFields: ["Products", "Categories", "Orders", "Stock Levels", "Print Methods"],
    config: {
      apiType: "REST",
      authType: "bearer_token",
      environment: "sandbox",
    },
  },
  {
    code: "MID",
    name: "Midocean",
    sortOrder: 5,
    description: "Supplier — products, pricing, stock, print data & orders via REST API v2.0.",
    baseUrl: "https://api.midocean.com",
    status: "disconnected" as const,
    dataFields: ["Products v2.0", "Stock Levels", "Pricelist", "Print Data", "Print Pricelist", "Order Entry", "Order Tracking"],
    config: {
      apiType: "REST",
      authType: "api_key",
      language: "en",
    },
  },
  {
    code: "STICKER",
    name: "Stricker Europe",
    sortOrder: 6,
    description: "Dodávateľ reklamných predmetov Stricker Europe (Paul Stricker). REST API v2.20 s autentifikáciou cez Access Key + session token. Produkty, ceny, sklady, personalizácia, objednávky.",
    baseUrl: "http://ws.stricker-europe.com",
    status: "disconnected" as const,
    docsUrl: "https://www.stricker-europe.com",
    dataFields: ["Product Reference", "SKU", "Name", "Description", "Color", "Size", "Capacity", "Category", "Brand", "Material", "Price", "YourPrice", "Catalog Price", "Stock", "Stock PT", "Stock CZ", "Next Quantities", "Customization Options", "Images"],
    config: {
      apiType: "REST",
      authType: "access_key",
    },
  },
  {
    code: "MACMA",
    name: "Macma",
    sortOrder: 7,
    description: "Supplier - JSON feeds (SKU, Pricelist, Stock). MACMA Werbeartikel OHG, macma.sk API v2.",
    baseUrl: "https://macma.sk/api/v2",
    status: "connected" as const,
    dataFields: ["Product Code", "Name", "Description", "Brand", "Size", "Weight", "Color", "Origin", "Tariff", "Category", "Images", "Material", "Print", "Packing", "Price", "Stock"],
    config: {
      apiType: "JSON",
      authType: "feed_url",
      skuFeedUrl: "https://macma.sk/api/v2/KssO6ZtCkBaGhBiPyAf3/sk/sku.json",
      pricelistFeedUrl: "https://macma.sk/api/v2/KssO6ZtCkBaGhBiPyAf3/sk/pricelist.json",
      stockFeedUrl: "https://macma.sk/api/v2/KssO6ZtCkBaGhBiPyAf3/sk/stock.json",
    },
  },
  {
    code: "XDCONNECT",
    name: "XD Connects",
    sortOrder: 8,
    description: "Dodávateľ reklamných predmetov XD Connects (predtým Xindao, Holandsko). 6 dátových feedov (XML/CSV/JSON): produkty, ceny, sklady, potlačové dáta, potlačové ceny a kombinovaný feed. Zákaznícky špecifické URL linky na feeds.xindao.com.",
    baseUrl: "https://feeds.xindao.com",
    status: "disconnected" as const,
    docsUrl: "https://www.xdconnects.com",
    dataFields: ["ModelCode", "ItemCode", "ItemName", "Brand", "MainCategory", "SubCategory", "Color", "Material", "ItemDimensions", "ItemWeightGr", "EANCode", "CommodityCode", "CountryOfOrigin", "MainImage", "ProductLifeCycle", "CurrentStock", "FutureIncomingStockDate1", "FutureIncomingStockQty1", "ItemPriceNet", "ItemPriceGross", "PrintTechniqueDefault", "PrintPositionDefault", "MaxPrintAreaDefault"],
    config: {
      apiType: "data_feed",
      authType: "feed_url",
      feedFormat: "XML/CSV/JSON",
    },
  },
  {
    code: "ANDA",
    name: "Anda Present",
    sortOrder: 9,
    description: "Dodávateľ reklamných predmetov Anda Present. XML a CSV feedy pre produkty, ceny, sklady, potlač a kategórie. Prístup cez unikátne feed ID + IP whitelist.",
    baseUrl: "https://xml.andapresent.com",
    status: "disconnected" as const,
    docsUrl: "https://andapresent.com",
    dataFields: ["Item Number", "Design Name", "Primary Color", "Secondary Color", "Name", "Description", "Primary Image", "MOQ", "Weight", "Country of Origin", "Tariff Number", "Brand", "EAN Code", "Price (List)", "Price (Discount)", "Stock (Central)", "Stock (External)", "Incoming Stock", "Labeling Info", "Categories"],
    config: {
      apiType: "XML/CSV",
      authType: "feed_id",
    },
  },
  {
    code: "EASYGIFTS",
    name: "Easy Gifts",
    sortOrder: 10,
    description: "Supplier - JSON/XML feeds (SKU, Pricelist, Stock). API v2.",
    baseUrl: "https://easygifts.sk/api/v2",
    status: "connected" as const,
    dataFields: standardDataFields,
    config: {
      apiType: "JSON",
      authType: "feed_url",
      skuFeedUrl: "https://easygifts.sk/api/v2/whrMOjZLaI8Hv18Yzi_r/sk/sku.json",
      pricelistFeedUrl: "https://easygifts.sk/api/v2/whrMOjZLaI8Hv18Yzi_r/sk/pricelist.json",
      stockFeedUrl: "https://easygifts.sk/api/v2/whrMOjZLaI8Hv18Yzi_r/sk/stock.json",
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

  const sensitiveKeys = ["apiToken", "apiTokenProd", "apiKey", "accessKey", "xmlFeedId", "csvFeedId", "username", "password", "shopId", "companyId", "companyDomain", "xmlFeedUrl", "apiBaseUrl", "environment", "language"];

  for (const modDef of MODULE_DEFINITIONS) {
    const existing = await storage.getModuleByCode(modDef.code);
    if (existing) {
      const existingConfig = (existing.config as Record<string, any>) || {};
      const mergedConfig = { ...modDef.config };
      for (const key of sensitiveKeys) {
        if (existingConfig[key]) {
          mergedConfig[key] = existingConfig[key];
        }
      }
      await storage.updateModule(existing.id, {
        name: modDef.name,
        sortOrder: modDef.sortOrder,
        description: modDef.description,
        baseUrl: modDef.baseUrl,
        status: modDef.status,
        docsUrl: modDef.docsUrl || null,
        dataFields: modDef.dataFields,
        config: mergedConfig,
      });
    } else {
      await storage.createModule(modDef);
    }
  }

  log("Seed data synced successfully", "seed");
}
