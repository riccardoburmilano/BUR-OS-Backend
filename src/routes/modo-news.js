// ============================================================
// src/routes/modo-news.js
// MODO News Aggregator — aggrega RSS + API gratuite h24
// Aggiunge al BUR backend senza CORS issues
// ============================================================

const express = require('express');
const router = express.Router();

// ── FONTI GRATUITE ────────────────────────────────────────────
// Tutte usano fetch standard — nessuna key necessaria per RSS
// NewsAPI richiede key — passala come env NEWSAPI_KEY

const SOURCES = {
  // RSS gratuiti — nessuna key
  rss: [
    { name:'ANSA',        url:'https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml',    cat:'Italia',     lang:'it' },
    { name:'Repubblica',  url:'https://www.repubblica.it/rss/homepage/rss2.0.xml',           cat:'Italia',     lang:'it' },
    { name:'Sole 24 Ore', url:'https://www.ilsole24ore.com/rss/economia.xml',                cat:'Finanza',    lang:'it' },
    { name:'Wired IT',    url:'https://www.wired.it/feed/rss',                               cat:'Tech',       lang:'it' },
    { name:'BBC World',   url:'https://feeds.bbci.co.uk/news/world/rss.xml',                 cat:'Mondo',      lang:'en' },
    { name:'Reuters',     url:'https://feeds.reuters.com/reuters/businessNews',              cat:'Finanza',    lang:'en' },
    { name:'TechCrunch',  url:'https://techcrunch.com/feed/',                                cat:'Tech',       lang:'en' },
    { name:'Bloomberg',   url:'https://feeds.bloomberg.com/markets/news.rss',               cat:'Finanza',    lang:'en' },
    { name:'Sky Sport',   url:'https://sport.sky.it/rss/sport.xml',                         cat:'Sport',      lang:'it' },
    { name:'Gazzetta',    url:'https://www.gazzetta.it/rss/home.xml',                        cat:'Sport',      lang:'it' },
  ],

  // GNews API — key opzionale, piano gratuito 100 req/giorno
  gnews: {
    base: 'https://gnews.io/api/v4',
    categories: ['general','business','technology','sports','science','health','entertainment'],
  },

  // NewsAPI — key obbligatoria
  newsapi: {
    base: 'https://newsapi.org/v2',
    categories: ['business','technology','sports','science','health'],
  },
};

// ── PARSER RSS ────────────────────────────────────────────────
function parseRSS(xml, source) {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  itemMatches.slice(0, 8).forEach(item => {
    const get = (tag) => {
      const m = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`));
      return m ? (m[1] || m[2] || '').trim() : '';
    };

    const title = get('title');
    const desc = get('description') || get('summary');
    const url = get('link') || get('guid');
    const pubDate = get('pubDate') || get('published');
    const img = (item.match(/url="([^"]+\.(?:jpg|jpeg|png|webp))"/i) || [])[1] || null;

    if (title && title.length > 10) {
      items.push({
        id: Buffer.from(title).toString('base64').slice(0, 16),
        sourceTitle: title,
        sourceDesc: desc.replace(/<[^>]*>/g, '').slice(0, 300),
        sourceUrl: url,
        sourceName: source.name,
        cat: source.cat,
        lang: source.lang,
        img,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        isForecast: isForecastable(title + ' ' + desc),
      });
    }
  });

  return items;
}

// ── FORECAST DETECTION ────────────────────────────────────────
const FORECAST_KW = [
  'previsione','forecast','outlook','stima','target','probabilità',
  'scenario','proiezione','election','vote','final','championship',
  'match','gara','partita','finale','risultato','inflazione',
  'tasso','bce','fed','rate','spread','btp','leclerc','verstappen',
  'formula','gp','gran premio','prediction','odds',
];

function isForecastable(text) {
  const t = text.toLowerCase();
  return FORECAST_KW.some(kw => t.includes(kw));
}

// ── FETCH RSS ─────────────────────────────────────────────────
async function fetchRSS(source) {
  try {
    const resp = await fetch(source.url, {
      headers: { 'User-Agent': 'MODO-NewsBot/1.0 (news aggregator)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    return parseRSS(xml, source);
  } catch(e) {
    console.log(`[MODO News] RSS ${source.name} error: ${e.message}`);
    return [];
  }
}

// ── FETCH GNEWS ───────────────────────────────────────────────
async function fetchGNews(key, lang = 'it', max = 10) {
  if (!key) return [];
  try {
    const url = `${SOURCES.gnews.base}/top-headlines?lang=${lang}&max=${max}&apikey=${key}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await resp.json();
    return (data.articles || []).map(a => ({
      id: Buffer.from(a.title||'').toString('base64').slice(0,16),
      sourceTitle: a.title,
      sourceDesc: a.description || '',
      sourceUrl: a.url,
      sourceName: a.source?.name || 'GNews',
      cat: 'Mondo',
      lang,
      img: a.image || null,
      publishedAt: a.publishedAt || new Date().toISOString(),
      isForecast: isForecastable(a.title + ' ' + (a.description||'')),
    }));
  } catch(e) {
    console.log(`[MODO News] GNews error: ${e.message}`);
    return [];
  }
}

// ── FETCH NEWSAPI ─────────────────────────────────────────────
async function fetchNewsAPI(key, country = 'it', category = 'general') {
  if (!key) return [];
  try {
    const url = `${SOURCES.newsapi.base}/top-headlines?country=${country}&category=${category}&pageSize=5&apiKey=${key}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await resp.json();
    if (data.status !== 'ok') return [];
    return (data.articles || [])
      .filter(a => a.title && a.title !== '[Removed]')
      .map(a => ({
        id: Buffer.from(a.title||'').toString('base64').slice(0,16),
        sourceTitle: a.title,
        sourceDesc: a.description || '',
        sourceUrl: a.url,
        sourceName: a.source?.name || 'NewsAPI',
        cat: category,
        lang: 'it',
        img: a.urlToImage || null,
        publishedAt: a.publishedAt || new Date().toISOString(),
        isForecast: isForecastable(a.title + ' ' + (a.description||'')),
      }));
  } catch(e) {
    console.log(`[MODO News] NewsAPI error: ${e.message}`);
    return [];
  }
}

// ── CACHE IN MEMORIA ──────────────────────────────────────────
let cache = { articles: [], lastFetch: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 minuti

async function aggregateAll() {
  const now = Date.now();
  if (now - cache.lastFetch < CACHE_TTL && cache.articles.length > 0) {
    return cache.articles;
  }

  const NEWSAPI_KEY = process.env.NEWSAPI_KEY || '';
  const GNEWS_KEY = process.env.GNEWS_KEY || '';

  console.log('[MODO News] Aggregazione in corso...');

  // Fetch parallelo di tutte le fonti
  const promises = [
    ...SOURCES.rss.map(s => fetchRSS(s)),
    fetchGNews(GNEWS_KEY, 'it', 10),
    fetchGNews(GNEWS_KEY, 'en', 5),
    ...['business','technology','sports'].map(cat =>
      fetchNewsAPI(NEWSAPI_KEY, 'it', cat)
    ),
  ];

  const results = await Promise.allSettled(promises);
  const all = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  // Deduplication per titolo simile
  const seen = new Set();
  const unique = all.filter(a => {
    const key = a.sourceTitle.slice(0, 40).toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Ordina per data più recente
  unique.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  cache = { articles: unique.slice(0, 100), lastFetch: now };
  console.log(`[MODO News] ${unique.length} articoli aggregati da ${results.length} fonti`);
  return cache.articles;
}

// ══════════════════════════════════════════════════════════════
// ENDPOINTS
// ══════════════════════════════════════════════════════════════

// GET /api/v2/modo/news
// Ritorna notizie aggregate da tutte le fonti
// Query params: cat (categoria), lang (it|en), limit (default 50), forecast_only (bool)
router.get('/news', async (req, res) => {
  try {
    let articles = await aggregateAll();

    const { cat, lang, limit = 50, forecast_only } = req.query;
    if (cat) articles = articles.filter(a => a.cat.toLowerCase() === cat.toLowerCase());
    if (lang) articles = articles.filter(a => a.lang === lang);
    if (forecast_only === 'true') articles = articles.filter(a => a.isForecast);

    res.json({
      ok: true,
      count: articles.length,
      cached: Date.now() - cache.lastFetch < CACHE_TTL,
      lastFetch: new Date(cache.lastFetch).toISOString(),
      articles: articles.slice(0, parseInt(limit)),
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/v2/modo/news/sources
// Lista fonti configurate
router.get('/sources', (req, res) => {
  res.json({
    ok: true,
    rss: SOURCES.rss.map(s => ({ name: s.name, cat: s.cat, lang: s.lang })),
    apis: {
      gnews: !!process.env.GNEWS_KEY,
      newsapi: !!process.env.NEWSAPI_KEY,
    },
  });
});

// POST /api/v2/modo/news/refresh
// Forza refresh cache
router.post('/refresh', async (req, res) => {
  cache.lastFetch = 0; // invalida cache
  try {
    const articles = await aggregateAll();
    res.json({ ok: true, count: articles.length, message: 'Cache aggiornata' });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/v2/modo/generate
// Genera articolo MODO da una notizia grezza via Anthropic API
router.post('/generate', async (req, res) => {
  const { sourceTitle, sourceDesc, sourceName, catLabel, isForecast } = req.body;
  if (!sourceTitle) return res.status(400).json({ ok: false, error: 'sourceTitle mancante' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY non configurata' });

  try {
    const prompt = `Sei un giornalista di MODO, testata italiana AI-native seria e professionale diretta da Riccardo e Matteo.

Riscrivi questa notizia come articolo giornalistico italiano di qualità per MODO.
Tono: giornalistico moderno, accessibile, preciso. Zero clickbait. Zero bugie.

Fonte: ${sourceName}
Titolo originale: ${sourceTitle}
Descrizione: ${sourceDesc || 'Non disponibile'}

Rispondi SOLO con JSON valido (no markdown, no backtick):
{
  "titolo": "Titolo italiano chiaro e professionale, max 90 caratteri",
  "sommario": "Apertura che riassume il fatto, max 120 caratteri",
  "corpo": "Articolo completo in italiano, 180-280 parole, stile giornalistico. Paragrafi separati da \\n\\n. Cita la fonte originale alla fine.",
  "is_previsione": ${isForecast ? 'true' : 'false'}
}`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.content?.[0]?.text || '{}';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    res.json({ ok: true, ...parsed });
  } catch(e) {
    console.error('[MODO Generate]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/v2/modo/chat
// Chatbox redazione per Matteo — risponde a domande editoriali
router.post('/chat', async (req, res) => {
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ ok: false, error: 'message mancante' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY non configurata' });

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `Sei l'assistente editoriale di MODO, giornale italiano AI-native diretto da Riccardo e Matteo. 
Aiuti Matteo (il direttore editoriale) a verificare fatti, migliorare articoli, trovare fonti, controllare dati, suggerire titoli alternativi.
Rispondi in italiano, in modo diretto e professionale. Sei conciso ma completo.
${context ? `Contesto articolo corrente: ${context}` : ''}`,
        messages: [{ role: 'user', content: message }],
      }),
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.content?.[0]?.text || '';
    res.json({ ok: true, reply: text });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
