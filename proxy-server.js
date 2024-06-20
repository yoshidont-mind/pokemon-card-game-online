const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
const port = 3001;

app.use(cors());

app.get('/proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send('URL is required');
    }

    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 画像URLを抽出
        const scriptTags = $('script');
        let imageUrls = [];
        scriptTags.each((i, script) => {
            const scriptContent = $(script).html();
            if (scriptContent.includes('PCGDECK.searchItemCardPict')) {
                const regex = /PCGDECK\.searchItemCardPict\[(\d+)\]='([^']+)'/g;
                let match;
                while ((match = regex.exec(scriptContent)) !== null) {
                    imageUrls.push(`https://www.pokemon-card.com${match[2]}`);
                }
            }
        });

        // カード情報を抽出
        const hiddenInputs = $('input[type="hidden"]');
        let cardData = [];
        hiddenInputs.each((i, input) => {
            const value = $(input).val();
            if (value) {
                const cards = value.split('-');
                cards.forEach(card => {
                    const [id, count] = card.split('_');
                    cardData.push({ id, count: parseInt(count, 10) });
                });
            }
        });

        res.json({ imageUrls, cardData });
    } catch (error) {
        res.status(error.response ? error.response.status : 500).send(error.message);
    }
});

app.listen(port, () => {
    console.log(`Proxy server running at http://localhost:${port}`);
});
