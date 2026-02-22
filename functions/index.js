const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const cheerio = require("cheerio");

const DECK_PAGE_BASE_URL = "https://www.pokemon-card.com/deck/confirm.html/deckID/";
const IMAGE_BASE_URL = "https://www.pokemon-card.com";
const DECK_CODE_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

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
