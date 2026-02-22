const {onRequest} = require("firebase-functions/v2/https");
const {onMessagePublished} = require("firebase-functions/v2/pubsub");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const cheerio = require("cheerio");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const DECK_PAGE_BASE_URL = "https://www.pokemon-card.com/deck/confirm.html/deckID/";
const IMAGE_BASE_URL = "https://www.pokemon-card.com";
const DECK_CODE_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const PROXY_CONTROL_DOC_REF = db.doc("system/control_proxy");
const PROXY_CONTROL_CACHE_TTL_MS = 30000;
const PROXY_STOP_BUDGET_DISPLAY_NAME = "pokemon-tcg-proxy-stop-1000jpy";
const PROXY_STOP_CURRENCY_CODE = "JPY";

let proxyControlCache = {
  enabled: true,
  expiresAt: 0,
};

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function isProxyEnabled(controlData) {
  if (!controlData || typeof controlData !== "object") {
    return true;
  }
  return controlData.enabled !== false;
}

async function readProxyEnabledWithCache() {
  const now = Date.now();
  if (proxyControlCache.expiresAt > now) {
    return proxyControlCache.enabled;
  }

  try {
    const snapshot = await PROXY_CONTROL_DOC_REF.get();
    const enabled = isProxyEnabled(snapshot.data());
    proxyControlCache = {
      enabled,
      expiresAt: now + PROXY_CONTROL_CACHE_TTL_MS,
    };
    return enabled;
  } catch (error) {
    logger.error("Failed to read proxy control. Failing open.", {
      message: error?.message || "unknown error",
    });
    proxyControlCache = {
      enabled: true,
      expiresAt: now + 5000,
    };
    return true;
  }
}

function parseBudgetNotification(event) {
  const message = event?.data?.message || {};
  const attributes = message.attributes || {};

  if (message.json && typeof message.json === "object") {
    return {
      payload: message.json,
      attributes,
      messageId: message.messageId || null,
    };
  }

  if (typeof message.data === "string" && message.data.length > 0) {
    try {
      const decoded = Buffer.from(message.data, "base64").toString("utf8");
      return {
        payload: JSON.parse(decoded),
        attributes,
        messageId: message.messageId || null,
      };
    } catch (error) {
      logger.error("Failed to parse budget notification payload", {
        message: error?.message || "unknown error",
      });
    }
  }

  return {
    payload: {},
    attributes,
    messageId: message.messageId || null,
  };
}

function shouldDisableProxy(payload) {
  if (payload?.budgetDisplayName !== PROXY_STOP_BUDGET_DISPLAY_NAME) {
    return false;
  }
  if (payload?.currencyCode !== PROXY_STOP_CURRENCY_CODE) {
    return false;
  }

  const thresholdExceeded = parseNumber(payload.alertThresholdExceeded);
  const costAmount = parseNumber(payload.costAmount);
  const budgetAmount = parseNumber(payload.budgetAmount);

  if (thresholdExceeded !== null && thresholdExceeded >= 1.0) {
    return true;
  }

  if (costAmount !== null && budgetAmount !== null && budgetAmount > 0 && costAmount >= budgetAmount) {
    return true;
  }

  return false;
}

function extractDeckData(html) {
  const $ = cheerio.load(html);

  const imageUrls = [];
  $("script").each((_, script) => {
    const scriptContent = $(script).html() || "";
    if (!scriptContent.includes("PCGDECK.searchItemCardPict")) {
      return;
    }
    const regex = /PCGDECK\.searchItemCardPict\[(\d+)\]='([^']+)'/g;
    let match = regex.exec(scriptContent);
    while (match !== null) {
      const path = match[2];
      imageUrls.push(path.startsWith("http") ? path : `${IMAGE_BASE_URL}${path}`);
      match = regex.exec(scriptContent);
    }
  });

  const cardData = [];
  $("input[type='hidden']").each((_, input) => {
    const value = $(input).val();
    if (typeof value !== "string" || value.length === 0) {
      return;
    }

    value.split("-").forEach((card) => {
      const [id, countRaw] = card.split("_");
      const count = Number.parseInt(countRaw, 10);
      if (!id || !Number.isInteger(count) || count <= 0) {
        return;
      }
      cardData.push({id, count});
    });
  });

  return {imageUrls, cardData};
}

exports.proxyDeck = onRequest(
    {
      region: "asia-northeast1",
      cors: [
        /^http:\/\/localhost(?::\d+)?$/,
        /^https:\/\/.*\.web\.app$/,
        /^https:\/\/.*\.firebaseapp\.com$/,
      ],
    },
    async (request, response) => {
      if (request.method !== "GET" && request.method !== "OPTIONS") {
        response.status(405).json({error: "Method not allowed"});
        return;
      }

      const proxyEnabled = await readProxyEnabledWithCache();
      if (!proxyEnabled) {
        response.status(503).json({
          error: "Proxy temporarily disabled by budget guard",
        });
        return;
      }

      const deckCode = String(request.query.deckCode || "").trim();
      if (!deckCode) {
        response.status(400).json({error: "deckCode is required"});
        return;
      }
      if (!DECK_CODE_PATTERN.test(deckCode)) {
        response.status(400).json({error: "Invalid deckCode format"});
        return;
      }

      const deckPageUrl = `${DECK_PAGE_BASE_URL}${deckCode}`;

      try {
        const upstream = await axios.get(deckPageUrl, {
          timeout: 10000,
          headers: {
            "User-Agent": "pokemon-card-game-online/1.0 (+firebase-functions)",
          },
        });

        const {imageUrls, cardData} = extractDeckData(upstream.data);
        response.status(200).json({imageUrls, cardData});
      } catch (error) {
        const statusCode = error?.response?.status || 500;
        logger.error("proxyDeck failed", {
          deckCode,
          statusCode,
          message: error?.message || "unknown error",
        });
        response.status(statusCode).json({
          error: "Failed to fetch deck information",
          statusCode,
        });
      }
    },
);

exports.budgetGuard = onMessagePublished(
    {
      topic: "billing-budget-alerts-proxy-stop",
      region: "asia-northeast1",
    },
    async (event) => {
      const {payload, attributes, messageId} = parseBudgetNotification(event);
      const eventId = event?.id || messageId || null;

      if (!shouldDisableProxy(payload)) {
        logger.info("budgetGuard: notification ignored", {
          eventId,
          budgetDisplayName: payload?.budgetDisplayName || null,
          currencyCode: payload?.currencyCode || null,
          threshold: parseNumber(payload?.alertThresholdExceeded),
          costAmount: parseNumber(payload?.costAmount),
          budgetAmount: parseNumber(payload?.budgetAmount),
        });
        return;
      }

      const existingSnapshot = await PROXY_CONTROL_DOC_REF.get();
      const existingData = existingSnapshot.exists ? existingSnapshot.data() : {};
      if (eventId && existingData?.lastNotificationEventId === eventId) {
        logger.info("budgetGuard: duplicate event skipped", {eventId});
        return;
      }

      await PROXY_CONTROL_DOC_REF.set({
        enabled: false,
        disabledByBudget: true,
        budgetDisplayName: payload?.budgetDisplayName || null,
        billingAccountId: attributes?.billingAccountId || null,
        budgetId: attributes?.budgetId || null,
        alertThresholdExceeded: parseNumber(payload?.alertThresholdExceeded),
        lastCostAmount: parseNumber(payload?.costAmount),
        budgetAmount: parseNumber(payload?.budgetAmount),
        currencyCode: payload?.currencyCode || PROXY_STOP_CURRENCY_CODE,
        lastNotificationEventId: eventId,
        lastBudgetTopicMessageId: messageId,
        triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      proxyControlCache = {
        enabled: false,
        expiresAt: Date.now() + PROXY_CONTROL_CACHE_TTL_MS,
      };

      logger.warn("budgetGuard: proxy disabled", {
        eventId,
        budgetDisplayName: payload?.budgetDisplayName || null,
        costAmount: parseNumber(payload?.costAmount),
        budgetAmount: parseNumber(payload?.budgetAmount),
        currencyCode: payload?.currencyCode || null,
      });
    },
);
