// ============================================================
// src/routes/quota.js — QUOTA prediction market backend
// Aggiunge a BUR OS: voti, crediti, card, accesso privato
// ============================================================
const express = require('express');
const router = express.Router();

// ── CACHE IN MEMORIA ─────────────────────────────────────────
let cardsCache = [];
let lastGenerated = 0;
const CARDS_TTL = 10 * 60 * 1000; // 10 minuti

// ── UTILS ────────────────────────────────────────────────────
async function getDB() {
  const { neon } = require('@neondatabase/serverless');
  return neon(process.env.DATABASE_URL);
}

async function initTables() {
  const sql = await getDB();
  await sql`
    CREATE TABLE IF NOT EXISTS quota_cards (
      id TEXT PRIMARY KEY,
      categoria TEXT NOT NULL,
      domanda TEXT NOT NULL,
      contesto TEXT DEFAULT '',
      pct_si INTEGER DEFAULT 50,
      deadline TIMESTAMPTZ NOT NULL,
      reward INTEGER DEFAULT 20,
      status TEXT DEFAULT 'aperta',
      source_url TEXT DEFAULT '',
      votes_si INTEGER DEFAULT 0,
      votes_no INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS quota_votes (
      id SERIAL PRIMARY KEY,
      card_id TEXT NOT NULL,
      user_token TEXT NOT NULL,
      scelta TEXT NOT NULL,
      crediti_scommessi INTEGER DEFAULT 5,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(card_id, user_token)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS quota_users (
      token TEXT PRIMARY KEY,
      qr DECIMAL DEFAULT 400,
      voti_totali INTEGER DEFAULT 0,
      azzeccati INTEGER DEFAULT 0,
      fascia TEXT DEFAULT 'Neutrino',
      percentile INTEGER DEFAULT 40,
      streak INTEGER DEFAULT 0,
      last_active TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS quota_private_links (
      token TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      canale TEXT DEFAULT '',
      crediti_bonus INTEGER DEFAULT 50,
      uses INTEGER DEFAULT 0,
      max_uses INTEGER DEFAULT 1000,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

// Init tabelle all'avvio
initTables().catch(e => console.error('[QUOTA] Init tables error:', e.message));

// ── GET /api/v2/quota/cards ───────────────────────────────────
// Ritorna card attive, genera nuove da RSS se necessario
router.get('/cards', async (req, res) => {
  try {
    const sql = await getDB();
    const cat = req.query.cat;
    const limit = parseInt(req.query.limit) || 20;

    let cards;
    if (cat && cat !== 'tutti') {
      cards = await sql`
        SELECT * FROM quota_cards
        WHERE status = 'aperta' AND deadline > NOW() AND categoria = ${cat}
        ORDER BY created_at DESC LIMIT ${limit}
      `;
    } else {
      cards = await sql`
        SELECT * FROM quota_cards
        WHERE status = 'aperta' AND deadline > NOW()
        ORDER BY created_at DESC LIMIT ${limit}
      `;
    }

    // Se meno di 5 card, prova a generarne di nuove
    if (cards.length < 5 && Date.now() - lastGenerated > CARDS_TTL) {
      generateCardsFromRSS().catch(e => console.log('[QUOTA] Gen error:', e.message));
    }

    res.json({ ok: true, count: cards.length, cards });
  } catch(e) {
    console.error('[QUOTA Cards]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/v2/quota/vote ───────────────────────────────────
router.post('/vote', async (req, res) => {
  try {
    const { card_id, scelta, user_token } = req.body;
    if (!card_id || !scelta || !user_token) {
      return res.status(400).json({ ok: false, error: 'Parametri mancanti' });
    }
    if (!['si', 'no'].includes(scelta)) {
      return res.status(400).json({ ok: false, error: 'Scelta non valida' });
    }

    const sql = await getDB();

    // Crea utente se non esiste
    await sql`
      INSERT INTO quota_users (token) VALUES (${user_token})
      ON CONFLICT (token) DO UPDATE SET last_active = NOW()
    `;

    // Salva voto
    await sql`
      INSERT INTO quota_votes (card_id, user_token, scelta)
      VALUES (${card_id}, ${user_token}, ${scelta})
      ON CONFLICT (card_id, user_token) DO NOTHING
    `;

    // Aggiorna contatori card
    if (scelta === 'si') {
      await sql`UPDATE quota_cards SET votes_si = votes_si + 1 WHERE id = ${card_id}`;
    } else {
      await sql`UPDATE quota_cards SET votes_no = votes_no + 1 WHERE id = ${card_id}`;
    }

    // Aggiorna QR: +5 punti base per partecipazione
    // Il delta reale viene calcolato al resolve
    await sql`
      UPDATE quota_users
      SET voti_totali = voti_totali + 1,
          qr = LEAST(1000, qr + 3),
          last_active = NOW()
      WHERE token = ${user_token}
    `;

    // Decay passivo se inattivo
    const [usr] = await sql`SELECT last_active, qr FROM quota_users WHERE token = ${user_token}`;
    if(usr){
      const daysDiff = Math.floor((Date.now()-new Date(usr.last_active).getTime())/86400000);
      if(daysDiff >= 2){
        const decayAmount = (daysDiff-1) * 8;
        await sql`UPDATE quota_users SET qr = GREATEST(0, qr - ${decayAmount}) WHERE token = ${user_token}`;
        console.log('[QUOTA] Decay '+token.slice(0,8)+': -'+decayAmount+' QR');
      }
    }

    // Ritorna stato aggiornato utente
    // Aggiorna percentile e fascia in base al QR relativo alla community
    const allUsers = await sql`SELECT qr FROM quota_users ORDER BY qr DESC`;
    const totalUsers = allUsers.length;
    await Promise.all((await sql`SELECT token, qr FROM quota_users`).map(async u => {
      const rank = allUsers.filter(x=>x.qr>u.qr).length;
      const pct = Math.round((1 - rank/totalUsers)*100);
      const fascia = pct>=95?'Singolarità':pct>=85?'Quasar':pct>=70?'Pulsar':pct>=40?'Orbiter':'Neutrino';
      await sql`UPDATE quota_users SET percentile=${pct}, fascia=${fascia} WHERE token=${u.token}`;
    }));
    const [user] = await sql`SELECT * FROM quota_users WHERE token = ${user_token}`;
    res.json({ ok: true, crediti: user?.crediti || 105, message: '+5 cr per la partecipazione' });

  } catch(e) {
    if (e.message.includes('unique')) {
      return res.json({ ok: false, error: 'Hai già votato questa quota' });
    }
    console.error('[QUOTA Vote]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/v2/quota/user/:token ────────────────────────────
router.get('/user/:token', async (req, res) => {
  try {
    const sql = await getDB();
    const token = req.params.token;

    // Crea se non esiste
    await sql`
      INSERT INTO quota_users (token) VALUES (${token})
      ON CONFLICT (token) DO UPDATE SET last_active = NOW()
    `;

    const [user] = await sql`SELECT * FROM quota_users WHERE token = ${token}`;
    const myVotes = await sql`
      SELECT card_id, scelta FROM quota_votes WHERE user_token = ${token}
    `;

    res.json({
      ok: true,
      qr: parseFloat(user.qr)||400,
      percentile: user.percentile||40,
      fascia: user.fascia||'Neutrino',
      voti_totali: user.voti_totali,
      azzeccati: user.azzeccati,
      streak: user.streak||0,
      accuracy: user.voti_totali > 0 ? Math.round(user.azzeccati / user.voti_totali * 100) : null,
      votes: Object.fromEntries(myVotes.map(v => [v.card_id, v.scelta]))
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/v2/quota/card ───────────────────────────────────
// Crea card manualmente (dal gestionale)
router.post('/card', async (req, res) => {
  try {
    const sql = await getDB();
    const { id, categoria, domanda, contesto, pct_si, deadline, reward, source_url } = req.body;
    if (!domanda || !categoria) return res.status(400).json({ ok: false, error: 'Parametri mancanti' });

    const cardId = id || 'card_' + Date.now();
    await sql`
      INSERT INTO quota_cards (id, categoria, domanda, contesto, pct_si, deadline, reward, source_url)
      VALUES (
        ${cardId}, ${categoria}, ${domanda},
        ${contesto || ''}, ${pct_si || 50},
        ${deadline || new Date(Date.now() + 24*3600000).toISOString()},
        ${reward || 20}, ${source_url || ''}
      )
      ON CONFLICT (id) DO UPDATE SET
        domanda = EXCLUDED.domanda,
        contesto = EXCLUDED.contesto,
        pct_si = EXCLUDED.pct_si
    `;

    res.json({ ok: true, id: cardId });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/v2/quota/private/:token ─────────────────────────
// Link privato per canali Telegram
router.get('/private/:token', async (req, res) => {
  try {
    const sql = await getDB();
    const token = req.params.token;

    const [link] = await sql`
      SELECT * FROM quota_private_links
      WHERE token = ${token}
      AND (expires_at IS NULL OR expires_at > NOW())
      AND uses < max_uses
    `;

    if (!link) return res.status(404).json({ ok: false, error: 'Link non valido o scaduto' });

    // Incrementa uses
    await sql`UPDATE quota_private_links SET uses = uses + 1 WHERE token = ${token}`;

    res.json({
      ok: true,
      nome: link.nome,
      canale: link.canale,
      crediti_bonus: link.crediti_bonus,
      uses_remaining: link.max_uses - link.uses - 1
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/v2/quota/private ───────────────────────────────
// Crea link privato per un canale
router.post('/private', async (req, res) => {
  try {
    const sql = await getDB();
    const { nome, canale, crediti_bonus, max_uses, days } = req.body;
    const token = 'prv_' + Math.random().toString(36).slice(2, 10);
    const expires = days ? new Date(Date.now() + days * 86400000).toISOString() : null;

    await sql`
      INSERT INTO quota_private_links (token, nome, canale, crediti_bonus, max_uses, expires_at)
      VALUES (${token}, ${nome || 'Link'}, ${canale || ''}, ${crediti_bonus || 50}, ${max_uses || 1000}, ${expires})
    `;

    res.json({
      ok: true,
      token,
      url: 'https://riccardoburmilano.github.io/modo-redazione/quota.html?ref=' + token
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GENERATORE AUTOMATICO CARD DA RSS ────────────────────────
async function generateCardsFromRSS() {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return;

  lastGenerated = Date.now();
  console.log('[QUOTA] Generazione card da RSS...');

  try {
    // Prendi notizie fresche
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: global.fetch }));

    const newsRes = await fetch('https://god-core-backend.onrender.com/api/v2/modo/news?limit=15&lang=it');
    const newsData = await newsRes.json();
    if (!newsData.ok || !newsData.articles?.length) return;

    const sql = await getDB();

    // Prendi ID già in DB per evitare duplicati
    const existing = await sql`SELECT id FROM quota_cards WHERE created_at > NOW() - INTERVAL '24 hours'`;
    const existingIds = new Set(existing.map(r => r.id));

    const nuove = newsData.articles.filter(a => !existingIds.has(a.id)).slice(0, 4);

    for (const article of nuove) {
      try {
        const promptRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            max_tokens: 200,
            temperature: 0.6,
            messages: [
              { role: 'system', content: 'Trasforma notizie in domande predittive sì/no per un prediction market italiano. Rispondi SOLO con JSON valido: {"domanda":"domanda max 80 caratteri","contesto":"max 100 caratteri","pct_si":50,"categoria":"Sport|Finanza|Politica|Mondo|Tech","ore":24}' },
              { role: 'user', content: article.sourceTitle + '. ' + (article.sourceDesc || '') }
            ]
          })
        });

        const promptData = await promptRes.json();
        const text = promptData.choices?.[0]?.message?.content || '{}';
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) continue;

        const gen = JSON.parse(match[0]);
        if (!gen.domanda) continue;

        await sql`
          INSERT INTO quota_cards (id, categoria, domanda, contesto, pct_si, deadline, reward, source_url)
          VALUES (
            ${article.id || 'g' + Date.now()},
            ${gen.categoria || 'Mondo'},
            ${gen.domanda},
            ${gen.contesto || ''},
            ${Math.min(90, Math.max(10, gen.pct_si || 50))},
            ${new Date(Date.now() + (gen.ore || 24) * 3600000).toISOString()},
            ${gen.ore > 48 ? 40 : 20},
            ${article.sourceUrl || ''}
          )
          ON CONFLICT (id) DO NOTHING
        `;

        console.log('[QUOTA] Card generata:', gen.domanda.slice(0, 50));
        await new Promise(r => setTimeout(r, 2000));
      } catch(e) {
        console.log('[QUOTA] Errore card:', e.message);
      }
    }
  } catch(e) {
    console.error('[QUOTA] Errore RSS gen:', e.message);
  }
}

// Genera card ogni 30 minuti
setInterval(() => generateCardsFromRSS(), 30 * 60 * 1000);



// ── GET /api/v2/quota/ranking ─────────────────────────────────
router.get('/ranking', async (req, res) => {
  try {
    const sql = await getDB();
    const limit = parseInt(req.query.limit)||20;
    const users = await sql`
      SELECT token, qr, percentile, fascia, voti_totali, azzeccati, streak
      FROM quota_users
      ORDER BY qr DESC
      LIMIT ${limit}
    `;
    res.json({ ok: true, users: users.map((u,i)=>({...u, rank:i+1, qr:parseFloat(u.qr)})) });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /api/v2/quota/resolve ───────────────────────────────
// Chiude una quota e distribuisce crediti ai vincitori
router.post('/resolve', async (req, res) => {
  try {
    const sql = await getDB();
    const { card_id, esito } = req.body; // esito: 'si' | 'no'
    if(!card_id || !esito) return res.status(400).json({ ok: false, error: 'Parametri mancanti' });

    // Trova tutti i voti su questa card
    const voti = await sql`SELECT user_token, scelta FROM quota_votes WHERE card_id = ${card_id}`;
    const card = await sql`SELECT * FROM quota_cards WHERE id = ${card_id}`;
    if(!card.length) return res.status(404).json({ ok: false, error: 'Card non trovata' });

    const reward = card[0].reward || 20;
    let vincitori = 0, perdenti = 0;

    // Calcola difficoltà della previsione
    const totVoti = voti.length;
    const votiEsito = voti.filter(v=>v.scelta===esito).length;
    const pctEsito = totVoti > 0 ? votiEsito/totVoti : 0.5;
    const difficulty = 1 - pctEsito; // più era improbabile, più vale

    for(const voto of voti){
      if(voto.scelta === esito){
        // Azzeccata: guadagno ELO proporzionale alla difficoltà
        const gain = Math.round(10 + difficulty * 40); // +10 a +50
        await sql`UPDATE quota_users SET qr = LEAST(1000, qr + ${gain}), azzeccati = azzeccati + 1 WHERE token = ${voto.user_token}`;
        vincitori++;
      } else {
        // Sbagliata: perdita proporzionale alla facilità
        const loss = Math.round(5 + (1-difficulty) * 20); // -5 a -25
        await sql`UPDATE quota_users SET qr = GREATEST(0, qr - ${loss}) WHERE token = ${voto.user_token}`;
        perdenti++;
      }
    }

    // Chiudi la card
    await sql`UPDATE quota_cards SET status = 'chiusa' WHERE id = ${card_id}`;

    // Aggiorna fasce di tutti
    await sql`
      UPDATE quota_users SET fascia = CASE
        WHEN crediti >= 1500 THEN 'Singolarità'
        WHEN crediti >= 700 THEN 'Quasar'
        WHEN crediti >= 300 THEN 'Pulsar'
        WHEN crediti >= 100 THEN 'Orbiter'
        ELSE 'Neutrino'
      END
    `;

    console.log('[QUOTA] Resolved '+card_id+': esito='+esito+', vincitori='+vincitori+', perdenti='+perdenti);
    res.json({ ok: true, esito, vincitori, perdenti, reward_distribuito: vincitori*reward });
  } catch(e) {
    console.error('[QUOTA Resolve]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
module.exports.generateCardsFromRSS = generateCardsFromRSS;
