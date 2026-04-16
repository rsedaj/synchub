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
    baseUrl: "https://onix-api.hauerland.sk/onix_api",
    status: "disconnected" as const,
    docsUrl: "https://onix.kros.sk/externe-prepojenie/web-api-dokumentacia/",
    dataFields: ["Stock Cards", "Product Codes", "Names", "Descriptions", "Prices (Purchase/Manager/Retail)", "Images", "Stock Availability", "Intrastat"],
    config: {
      swaggerUrl: "https://onix-api.hauerland.sk/onix_api/swagger/ui/index",
      apiType: "REST",
      authType: "token",
      apiToken: process.env.ONIX_API_TOKEN || "",
      databasePath: process.env.ONIX_DATABASE_PATH || "",
      defaultStock: "SYN",
      notes: [
        "Swagger DEMO: http://195.146.148.139/onix_api/swagger/ui/index#!/",
        "Dokumentácia: https://onix.kros.sk/externe-prepojenie/web-api-dokumentacia/",
        "Sklad: https://onix.kros.sk/sklad/",
        "Externé prepojenie: https://onix.kros.sk/externe-prepojenie/",
        "POST stockitems povinné polia: RecordExternalIdentificator, Ns_Number, Type (1=Tovar)",
        "Default_Stock = kód skladu (predvolený: SYN = Sklad_SyncHub), nie ID číslo",
        "Sklady: Sklad_SyncHub (SYN, 1000036), SKLAD 1 (SK1, 1000030), Voľný sklad (VOS, 1000016), Vzorky (VZ, 1000011)",
        "Read-only polia (neposielať v POST): StockItemBalance, StockItemGroups, StockItemParams, StockItemCodes, StockItemAccessories",
        "CustomColumns formát: [{Name: string, Value: string}]",
        "Result kódy: 0=úspech, 3=chyba/odmietnuté",
        "Od verzie 25.05.1357: API nevracia polia s prázdnou hodnotou",
        "Endpoint pre doklady: /api/v1/documents/{id}/ (faktúry, objednávky)",
        "Shoptet natívna integrácia: objednávky, ceny, zostatky",
      ],
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
    code: "RAYNET",
    name: "Raynet CRM",
    sortOrder: 4,
    description: "CRM systém Raynet — správa klientov, obchodných prípadov, kontaktov, leadov a aktivít. REST API v2 s Basic Auth autentifikáciou.",
    baseUrl: "https://app.raynet.cz/api/v2",
    status: "disconnected" as const,
    docsUrl: "https://app.raynet.cz/api/doc/",
    dataFields: ["Companies", "Persons (Contacts)", "Business Cases (Deals)", "Leads", "Activities", "Invoices", "Products"],
    config: {
      apiType: "REST",
      authType: "basic_api_key",
    },
  },
  {
    code: "GIVING",
    name: "Giving Europe",
    sortOrder: 5,
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
    sortOrder: 6,
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
    sortOrder: 7,
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
    sortOrder: 8,
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
    sortOrder: 9,
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
    sortOrder: 10,
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
    sortOrder: 11,
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
    sortOrder: 12,
    description: "Supplier - Data Feeds Gateway v3 (XML) for product, price, stock and print data.",
    baseUrl: "https://www.pfconcept.com",
    status: "connected" as const,
    docsUrl: "https://www.pfconcept.com/cs_cz/data-feeds-gateway",
    dataFields: standardDataFields,
    config: {
      apiType: "XML",
      authType: "credentials",
      username: process.env.PFCONCEPT_USERNAME || "",
      password: process.env.PFCONCEPT_PASSWORD || "",
      productFeedUrl: "http://www.pfconcept.com/portal/datafeed/productfeed_cz_v3.xml",
      priceFeedUrl: "http://www.pfconcept.com/portal/datafeed/pricefeed_ff7e834a_8a5f_39a8_4014_b6f9c8ca81aa_v3.xml",
      printPriceFeedUrl: "http://www.pfconcept.com/portal/datafeed/printpricefeed_ff7e834a_8a5f_39a8_4014_b6f9c8ca81aa_v3.xml",
      stockFeedUrl: "http://www.pfconcept.com/portal/datafeed/stockfeed_ff7e834a_8a5f_39a8_4014_b6f9c8ca81aa_v3.xml",
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

  const sensitiveKeys = ["apiToken", "apiTokenProd", "apiKey", "accessKey", "xmlFeedId", "csvFeedId", "username", "password", "shopId", "companyId", "companyDomain", "xmlFeedUrl", "apiBaseUrl", "environment", "language", "productFeedUrl", "pricesFeedUrl", "printDataFeedUrl", "printPricesFeedUrl", "stockFeedUrl", "combinedFeedUrl", "instanceName", "databasePath"];

  for (const modDef of MODULE_DEFINITIONS) {
    const existing = await storage.getModuleByCode(modDef.code);
    if (existing) {
      const existingConfig = (existing.config as Record<string, any>) || {};
      const seedConfig = (modDef.config || {}) as Record<string, any>;
      const mergedConfig = { ...seedConfig };
      for (const key of sensitiveKeys) {
        if (seedConfig[key]) {
          mergedConfig[key] = seedConfig[key];
        } else if (existingConfig[key]) {
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

export async function runMigrations() {
  log("Running data migrations...", "seed");

  const promotronModule = await storage.getModuleByCode("PROMOTRON");
  const onixModule = await storage.getModuleByCode("ONIX");

  if (!promotronModule || !onixModule) {
    log("Migration m001: PROMOTRON or ONIX module not found, skipping", "seed");
    log("Data migrations complete", "seed");
    return;
  }

  const allConfigs = await storage.getAllSyncConfigs();
  const promotronToOnixConfigs = allConfigs.filter(
    c => c.sourceModuleId === promotronModule.id && c.targetModuleId === onixModule.id
  );

  let migratedCount = 0;
  for (const config of promotronToOnixConfigs) {
    const mappings = (config.fieldMappings || []) as Array<{ sourceField: string; targetField: string; transform?: string }>;
    let updated = false;
    const newMappings = mappings.map(m => {
      const needsVatTransform = !m.transform || m.transform === "price";
      if (
        m.sourceField === "price" &&
        m.targetField === "Default_Price" &&
        needsVatTransform
      ) {
        updated = true;
        return { ...m, transform: "price_excl_vat:23" };
      }
      return m;
    });
    if (updated) {
      await storage.updateSyncConfig(config.id, { fieldMappings: newMappings });
      log(`Migration m001: set price_excl_vat:23 on price→Default_Price in config "${config.name}" (${config.id})`, "seed");
      migratedCount++;
    }
  }

  if (migratedCount === 0) {
    log(`Migration m001: no PROMOTRON→ONIX configs needed price_excl_vat:23 (${promotronToOnixConfigs.length} checked)`, "seed");
  }

  // Migration m002: fix id→Ist_Code to custom_label_2→Ns_Number
  //                 fix description→Description to description→Info
  let m002Count = 0;
  for (const config of promotronToOnixConfigs) {
    const mappings = (config.fieldMappings || []) as Array<{ sourceField: string; targetField: string; transform?: string }>;
    let m002Updated = false;
    const m002Mappings = mappings.map(m => {
      if (m.sourceField === "id" && m.targetField === "Ist_Code") {
        m002Updated = true;
        log(`Migration m002: "${config.name}" — id→Ist_Code opravené na custom_label_2→Ns_Number`, "seed");
        return { ...m, sourceField: "custom_label_2", targetField: "Ns_Number" };
      }
      if (m.sourceField === "description" && m.targetField === "Description") {
        m002Updated = true;
        log(`Migration m002: "${config.name}" — description→Description opravené na description→Info`, "seed");
        return { ...m, targetField: "Info" };
      }
      return m;
    });
    if (m002Updated) {
      await storage.updateSyncConfig(config.id, { fieldMappings: m002Mappings });
      m002Count++;
    }
  }
  if (m002Count === 0) {
    log(`Migration m002: žiadne PROMOTRON→ONIX configs nepotrebovali opravu polí (${promotronToOnixConfigs.length} skontrolovaných)`, "seed");
  }

  log("Data migrations complete", "seed");
}
