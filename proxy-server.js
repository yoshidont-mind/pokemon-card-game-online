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
        const imageUrls = [];
        $('script').each((i, script) => {
            const scriptContent = $(script).html();
            if (scriptContent.includes('PCGDECK.searchItemCardPict')) {
                const regex = /PCGDECK\.searchItemCardPict\[\d+\]='([^']+)'/g;
                let match;
                while ((match = regex.exec(scriptContent)) !== null) {
                    imageUrls.push(`https://www.pokemon-card.com${match[1]}`);
                }
            }
        });

        res.json(imageUrls);
    } catch (error) {
        res.status(error.response.status).send(error.message);
    }
});

app.listen(port, () => {
    console.log(`Proxy server running at http://localhost:${port}`);
});
