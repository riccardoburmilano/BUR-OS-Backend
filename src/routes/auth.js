// ============================================================
// routes/auth.js — Operantis v2.0 — BUR OS
// ============================================================

const express = require('express');
const router = express.Router();
const db = require('../modules/db');
const { requireAdmin, requireStaff, requireRole } = require('../modules/authMiddleware');

// ── CLINIC ────────────────────────────────────────────────────

router.get('/clinic/status', async (req, res) => {
  try {
    // Se c'è un token staff, restituisce la clinica dello staff
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'god-os-jwt-secret-change-in-prod';
        const payload = jwt.verify(auth.slice(7), JWT_SECRET);
        if (payload.clinic_id) {
          const rows = await db.sql`SELECT id, name, city, specialties FROM clinic WHERE id = ${payload.clinic_id} LIMIT 1`;
          if (rows[0]) return res.json({ registered: true, clinic: rows[0] });
        }
      } catch {}
    }
    // Fallback — prima clinica disponibile
    const clinic = await db.clinicGet();
    res.json({ registered: !!clinic, clinic: clinic ? { id: clinic.id, name: clinic.name, city: clinic.city } : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clinic/register', async (req, res) => {
  try {
    const { name, city, specialties, logo_url, admin_email, admin_password } = req.body;
    if (!name || !admin_email || !admin_password) return res.status(400).json({ error: 'name, admin_email e admin_password sono obbligatori' });
    if (admin_password.length < 8) return res.status(400).json({ error: 'Password deve essere di almeno 8 caratteri' });
    const clinic = await db.clinicCreate({ name, city, specialties, logo_url, admin_email, admin_password });
    res.status(201).json({ success: true, clinic });
  } catch (err) {
    if (err.message?.includes('unique')) return res.status(409).json({ error: "Email già registrata — usa un'altra email" });
    res.status(500).json({ error: err.message });
  }
});

router.post('/clinic/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email e password obbligatori' });
    const result = await db.clinicLogin(email, password);
    if (!result) return res.status(401).json({ error: 'Credenziali non valide' });
    // Includi clinic_id nel risultato
    const clinicRows = await db.sql`SELECT id, name, city FROM clinic WHERE admin_email = ${email} LIMIT 1`;
    res.json({ success: true, ...result, clinic_id: clinicRows[0]?.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clinic', requireAdmin, async (req, res) => {
  try {
    const clinic = await db.clinicGet();
    res.json(clinic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STAFF ─────────────────────────────────────────────────────

router.get('/staff', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'god-os-jwt-secret-change-in-prod';
    const auth = req.headers.authorization;
    let clinicId = null;

    // Prova token
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(auth.slice(7), JWT_SECRET);
        clinicId = payload.clinic_id;
      } catch {}
    }

    // Fallback: cerca per email se passa query param
    if (!clinicId && req.query.email) {
      const rows = await db.sql`SELECT id FROM clinic WHERE admin_email = ${req.query.email} LIMIT 1`;
      clinicId = rows[0]?.id;
    }

    if (!clinicId) return res.status(400).json({ error: 'clinic_id non determinabile — effettua il login' });

    const staff = await db.staffList(clinicId);
    res.json({ staff, clinic_id: clinicId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/staff', async (req, res) => {
  try {
    // Valida token (admin o staff CEO)
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token mancante' });
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'god-os-jwt-secret-change-in-prod';
    let payload;
    try { payload = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Token non valido' }); }
    const clinic_id_from_token = payload.clinic_id;

    const { name, role, pin, avatar_color } = req.body;
    if (!name || !role || !pin) return res.status(400).json({ error: 'name, role e pin obbligatori' });
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN deve essere di 4 cifre numeriche' });
    const valid_roles = ['CEO', 'MEDICO', 'RECEPTIONIST', 'ASSISTENTE', 'INFERMIERE', 'LEGALE', 'MARKETING'];
    if (!valid_roles.includes(role)) return res.status(400).json({ error: `role deve essere uno tra: ${valid_roles.join(', ')}` });
    const member = await db.staffCreate({ clinic_id: clinic_id_from_token, name, role, pin, avatar_color });
    res.status(201).json({ success: true, staff: member });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/staff/:id', requireStaff, async (req, res) => {
  try {
    const updated = await db.staffUpdate(req.params.id, req.clinic_id, req.body);
    if (!updated) return res.status(404).json({ error: 'Staff non trovato' });
    res.json({ success: true, staff: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/staff/:id/pin', requireStaff, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN deve essere di 4 cifre numeriche' });
    await db.staffUpdatePin(req.params.id, req.clinic_id, pin);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/staff/login', async (req, res) => {
  try {
    const { staff_id, pin } = req.body;
    if (!staff_id || !pin) return res.status(400).json({ error: 'staff_id e pin obbligatori' });
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN non valido' });

    // Trova clinic_id dal staff_id direttamente
    const staffRows = await db.sql`SELECT clinic_id FROM staff WHERE id = ${staff_id} AND active = TRUE LIMIT 1`;
    if (!staffRows[0]) return res.status(404).json({ error: 'Staff non trovato' });
    
    const result = await db.staffPinLogin(staffRows[0].clinic_id, staff_id, pin);
    if (!result) return res.status(401).json({ error: 'PIN non corretto' });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/staff/logout', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) await db.staffLogout(auth.slice(7));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/staff/me', requireStaff, (req, res) => {
  res.json({ staff_id: req.staff_id, clinic_id: req.clinic_id, role: req.staff_role, name: req.staff_name });
});

// ── PATIENTS ──────────────────────────────────────────────────

router.get('/patients', requireStaff, async (req, res) => {
  try {
    const { limit, search } = req.query;
    const patients = await db.patientList(req.clinic_id, { limit: parseInt(limit) || 50, search });
    res.json({ patients, total: patients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/patients/:id', requireStaff, async (req, res) => {
  try {
    const patient = await db.patientGet(req.params.id, req.clinic_id);
    if (!patient) return res.status(404).json({ error: 'Paziente non trovato' });
    res.json(patient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/patients', requireStaff, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name obbligatorio' });
    const patient = await db.patientCreate(req.clinic_id, req.body);
    res.status(201).json({ success: true, patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/patients/:id', requireStaff, async (req, res) => {
  try {
    const patient = await db.patientUpdate(req.params.id, req.clinic_id, req.body);
    if (!patient) return res.status(404).json({ error: 'Paziente non trovato' });
    res.json({ success: true, patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/patients/:id', requireStaff, requireRole('CEO'), async (req, res) => {
  try {
    await db.patientDelete(req.params.id, req.clinic_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MESSAGGI STAFF ────────────────────────────────────────────

router.post('/messages', requireStaff, async (req, res) => {
  try {
    const { to_staff_id, message } = req.body;
    if (!to_staff_id || !message?.trim()) return res.status(400).json({ error: 'to_staff_id e message obbligatori' });
    const rows = await db.sql`
      INSERT INTO staff_messages (clinic_id, from_staff, to_staff, message)
      VALUES (${req.clinic_id}, ${req.staff_id}, ${to_staff_id}, ${message.trim()})
      RETURNING id, from_staff, to_staff, message, read, created_at
    `;
    res.status(201).json({ success: true, message: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages/unread', requireStaff, async (req, res) => {
  try {
    const rows = await db.sql`
      SELECT m.id, m.message, m.created_at, m.from_staff,
        s.name as from_name, s.avatar_color, s.role as from_role
      FROM staff_messages m
      JOIN staff s ON s.id = m.from_staff
      WHERE m.to_staff = ${req.staff_id}
        AND m.clinic_id = ${req.clinic_id}
        AND m.read = FALSE
      ORDER BY m.created_at ASC
    `;
    res.json({ messages: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/read', requireStaff, async (req, res) => {
  try {
    const { message_ids } = req.body;
    if (!message_ids?.length) return res.json({ success: true });
    await db.sql`
      UPDATE staff_messages SET read = TRUE
      WHERE id = ANY(${message_ids}::uuid[]) AND to_staff = ${req.staff_id}
    `;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/messages/thread/:other_staff_id', requireStaff, async (req, res) => {
  try {
    const { other_staff_id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const rows = await db.sql`
      SELECT m.id, m.message, m.created_at, m.read, m.from_staff, m.to_staff,
        s.name as from_name, s.avatar_color, s.role as from_role
      FROM staff_messages m
      JOIN staff s ON s.id = m.from_staff
      WHERE m.clinic_id = ${req.clinic_id}
        AND ((m.from_staff = ${req.staff_id} AND m.to_staff = ${other_staff_id})
          OR (m.from_staff = ${other_staff_id} AND m.to_staff = ${req.staff_id}))
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;
    const unread = rows.filter(r => r.to_staff === req.staff_id && !r.read).map(r => r.id);
    if (unread.length) {
      await db.sql`UPDATE staff_messages SET read = TRUE WHERE id = ANY(${unread}::uuid[])`;
    }
    res.json({ messages: rows.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STRIPE PAYMENT ────────────────────────────────────────────

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

const BUR_FEE_RATE = 0.008;

router.post('/payments/link', requireStaff, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe non configurato' });
    const { amount, description, patient_name, patient_email } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Importo obbligatorio (minimo €1)' });
    const amountCents = Math.round(parseFloat(amount) * 100);
    const price = await stripe.prices.create({
      currency: 'eur',
      unit_amount: amountCents,
      product_data: { name: description || 'Trattamento estetico', metadata: { clinic_id: req.clinic_id } }
    });
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { clinic_id: req.clinic_id, patient_name: patient_name || '', patient_email: patient_email || '' },
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: { custom_message: `Grazie ${patient_name || ''}! Pagamento confermato. I tuoi punti 🜁 verranno accreditati a breve.` }
      }
    });
    const burFee = Math.round(amount * BUR_FEE_RATE * 100) / 100;
    const stripeFee = Math.round((amount * 0.015 + 0.25) * 100) / 100;
    res.json({ success: true, payment_link: paymentLink.url, payment_link_id: paymentLink.id, amount: parseFloat(amount), bur_fee: burFee, stripe_fee: stripeFee, netto_clinica: Math.round((amount - burFee - stripeFee) * 100) / 100 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payments/history', requireStaff, async (req, res) => {
  try {
    if (!stripe) return res.json({ payments: [], total: 0 });
    const paymentIntents = await stripe.paymentIntents.list({ limit: 100 });
    const payments = paymentIntents.data
      .filter(p => p.metadata?.clinic_id === req.clinic_id)
      .slice(0, 20)
      .map(p => ({ id: p.id, amount: p.amount / 100, status: p.status, description: p.description, patient: p.metadata?.patient_name || 'Paziente', created: new Date(p.created * 1000).toISOString(), bur_fee: Math.round(p.amount * BUR_FEE_RATE) / 100 }));
    const total = payments.filter(p => p.status === 'succeeded').reduce((sum, p) => sum + p.amount, 0);
    res.json({ payments, total: Math.round(total * 100) / 100, count: payments.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payments/webhook', async (req, res) => {
  try {
    const event = req.body;
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      console.log(`[BUR OS] ✓ Pagamento: €${pi.amount/100} | Paziente: ${pi.metadata?.patient_name || 'N/A'}`);
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PAZIENTE ──────────────────────────────────────────────────

router.post('/paziente/register', async (req, res) => {
  try {
    const { nome, cognome, email, telefono } = req.body;
    if (!nome || !email) return res.status(400).json({ error: 'Nome ed email obbligatori' });
    const existing = await db.sql`SELECT id FROM pazienti WHERE email = ${email}`;
    if (existing[0]) return res.status(409).json({ error: 'Email già registrata — accedi' });
    const rows = await db.sql`
      INSERT INTO pazienti (nome, cognome, email, telefono, punti)
      VALUES (${nome}, ${cognome||''}, ${email}, ${telefono||''}, 500)
      RETURNING id, nome, cognome, email, telefono, punti, created_at
    `;
    res.status(201).json({ success: true, paziente: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/paziente/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obbligatoria' });
    const rows = await db.sql`SELECT * FROM pazienti WHERE email = ${email}`;
    if (!rows[0]) return res.status(404).json({ error: 'Email non trovata — registrati prima' });
    res.json({ success: true, paziente: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/paziente/push-token', async (req, res) => {
  try {
    const { paziente_id, push_token } = req.body;
    if (!paziente_id || !push_token) return res.status(400).json({ error: 'paziente_id e push_token obbligatori' });
    await db.sql`UPDATE pazienti SET push_token = ${push_token} WHERE id = ${paziente_id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cliniche', async (req, res) => {
  try {
    const { q } = req.query;
    let cliniche;
    if (q && q.length > 1) {
      cliniche = await db.sql`SELECT id, name, city, specialties FROM clinic WHERE name ILIKE ${'%' + q + '%'} OR city ILIKE ${'%' + q + '%'} LIMIT 10`;
    } else {
      cliniche = await db.sql`SELECT id, name, city, specialties FROM clinic LIMIT 20`;
    }
    res.json({ cliniche });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/prenotazioni', async (req, res) => {
  try {
    const { clinic_id, paziente_id, trattamento, note, data_richiesta } = req.body;
    if (!clinic_id || !paziente_id) return res.status(400).json({ error: 'clinic_id e paziente_id obbligatori' });
    const rows = await db.sql`
      INSERT INTO prenotazioni (clinic_id, paziente_id, trattamento, note, data_richiesta, status)
      VALUES (${clinic_id}, ${paziente_id}, ${trattamento||''}, ${note||''}, ${data_richiesta||''}, 'in_attesa')
      RETURNING *
    `;
    res.status(201).json({ success: true, prenotazione: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/prenotazioni', requireStaff, async (req, res) => {
  try {
    const rows = await db.sql`
      SELECT p.*, paz.nome, paz.cognome, paz.email, paz.telefono
      FROM prenotazioni p
      JOIN pazienti paz ON paz.id = p.paziente_id
      WHERE p.clinic_id = ${req.clinic_id}
      ORDER BY p.created_at DESC LIMIT 50
    `;
    res.json({ prenotazioni: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/prenotazioni/:id', requireStaff, async (req, res) => {
  try {
    const { status } = req.body;
    const rows = await db.sql`
      UPDATE prenotazioni SET status = ${status}
      WHERE id = ${req.params.id} AND clinic_id = ${req.clinic_id}
      RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Prenotazione non trovata' });
    res.json({ success: true, prenotazione: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/paziente/notifica', requireStaff, async (req, res) => {
  try {
    const { paziente_email, titolo, messaggio, tipo, payment_link } = req.body;
    if (!paziente_email || !messaggio) return res.status(400).json({ error: 'paziente_email e messaggio obbligatori' });
    const rows = await db.sql`SELECT id, push_token, nome FROM pazienti WHERE email = ${paziente_email}`;
    const paziente = rows[0];
    if (!paziente) return res.status(404).json({ error: 'Paziente non trovato' });
    res.json({ success: true, paziente_nome: paziente.nome, push_sent: !!paziente.push_token, messaggio, tipo: tipo || 'info', payment_link: payment_link || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/paziente/notifiche/:paziente_id', async (req, res) => {
  try {
    const rows = await db.sql`SELECT id, nome FROM pazienti WHERE id = ${req.params.paziente_id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Paziente non trovato' });
    res.json({ notifiche: [], paziente: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NOVA AI ────────────────────────────────────────────────────

const { buildNovaContext, buildNovaPrompt, saveNovaFeedback } = require('../modules/novaContext');
const { lazarusCall } = require('../modules/lazarus');

router.post('/nova/chat', requireStaff, async (req, res) => {
  try {
    const { message, role_id, conversation_history } = req.body;
    if (!message) return res.status(400).json({ error: 'message obbligatorio' });

    const context = await buildNovaContext(role_id || req.staff_role.toLowerCase(), req.clinic_id);

    let systemPrompt;
    if (context) {
      systemPrompt = buildNovaPrompt(role_id || req.staff_role.toLowerCase(), context.clinicContext, context.knowledgeBase);
    } else {
      systemPrompt = `Sei NOVA, supervisore AI per cliniche estetiche italiane powered by BUR OS. Sei esperto di medicina estetica, anatomia, prodotti (filler, botox, laser), normativa italiana. Rispondi sempre in italiano, conciso e professionale.`;
    }

    const history = (conversation_history || [])
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'Utente' : 'NOVA'}: ${m.text}`)
      .join('\n');

    const fullMessage = history ? `Conversazione precedente:\n${history}\n\nNuova domanda: ${message}` : message;

    const result = await lazarusCall(systemPrompt, fullMessage, {
      maxTokens: 600,
      tier: 'FAST',
      skipCache: true
    });

    res.json({ success: true, response: result.text, provider: result.provider, tokens: result.tokens, has_context: !!context });
  } catch (err) {
    console.error('[BUR OS] NOVA chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/nova/briefing', requireStaff, async (req, res) => {
  try {
    const roleId = req.query.role || req.staff_role.toLowerCase();
    const context = await buildNovaContext(roleId, req.clinic_id);

    if (!context) return res.json({ briefing: null, message: 'Contesto non disponibile' });

    const systemPrompt = buildNovaPrompt(roleId, context.clinicContext, context.knowledgeBase);

    const briefingRequest = {
      doctor:       'Genera il briefing clinico per oggi in massimo 5 righe. Pazienti, alert, e una cosa importante da non dimenticare.',
      assistant:    'Genera la checklist operativa mattutina in massimo 5 punti brevi.',
      nurse:        'Genera il briefing sicurezza in massimo 5 righe. Scadenze, sterilizzazione, alert.',
      ceo:          'Genera il briefing executive in massimo 5 righe. KPI, agenda, una priorità.',
      receptionist: 'Genera il briefing reception in massimo 5 righe. Appuntamenti, conferme mancanti, follow-up.',
      legal:        'Genera il briefing compliance in massimo 5 righe. Scadenze urgenti e documenti mancanti.',
      marketing:    'Genera il briefing marketing in massimo 5 righe. Performance e una azione concreta da fare oggi.',
    };

    const request = briefingRequest[roleId] || briefingRequest.ceo;

    const result = await lazarusCall(systemPrompt, request, {
      maxTokens: 500,
      tier: 'FAST',
      skipCache: true
    });

    res.json({ success: true, briefing: result.text, role: roleId, generated_at: new Date().toISOString(), tokens: result.tokens });
  } catch (err) {
    console.error('[BUR OS] NOVA briefing error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/nova/feedback', requireStaff, async (req, res) => {
  try {
    const { question, nova_answer, feedback, correction } = req.body;
    if (!question || !feedback) return res.status(400).json({ error: 'question e feedback obbligatori' });
    await saveNovaFeedback(req.clinic_id, req.staff_role, question, nova_answer || '', feedback, correction || null);
    res.json({ success: true, message: feedback === 'positive' ? 'Grazie! NOVA impara dalle tue conferme.' : 'Grazie! La correzione migliorerà NOVA per tutti.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/nova/insight-paziente', requireStaff, async (req, res) => {
  try {
    const { paziente } = req.body;
    if (!paziente) return res.status(400).json({ error: 'paziente obbligatorio' });

    const systemPrompt = `Sei NOVA, supervisore AI clinico. Analizza il paziente e rispondi SOLO con JSON valido, nessun testo aggiuntivo.`;
    const userMsg = `Restituisci SOLO JSON: {"azione_principale":"max 12 parole","alert":"stringa o null","opportunita":"stringa o null","score_paziente":1-10,"mood":"POSITIVO|NEUTRO|ATTENZIONE|CRITICO","controindicazioni":"stringa o null","protocollo_consigliato":"stringa o null"}
Paziente: ${JSON.stringify(paziente)}`;

    const result = await lazarusCall(systemPrompt, userMsg, { maxTokens: 400, tier: 'FAST', skipCache: true });

    let insight = null;
    try {
      const start = result.text.indexOf('{');
      const end = result.text.lastIndexOf('}');
      if (start !== -1 && end !== -1) insight = JSON.parse(result.text.slice(start, end + 1));
    } catch {}

    if (!insight) insight = { azione_principale: 'Procedere con anamnesi completa', alert: null, opportunita: null, score_paziente: 7, mood: 'NEUTRO', controindicazioni: null, protocollo_consigliato: null };

    res.json({ success: true, insight: { ...insight, generated_at: new Date().toISOString(), tokens: result.tokens, provider: result.provider } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN TOKEN COMPAT ───────────────────────────────────────
// Permette all'admin di entrare come CEO usando le credenziali clinica
router.post('/admin/staff-token', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email e password obbligatori' });

    // Verifica credenziali admin
    const result = await db.clinicLogin(email, password);
    if (!result) return res.status(401).json({ error: 'Credenziali non valide' });

    // Trova la clinica per email
    const clinicRows = await db.sql`SELECT * FROM clinic WHERE admin_email = ${email} LIMIT 1`;
    const clinic = clinicRows[0] || result.clinic;
    const staffRows = await db.sql`
      SELECT * FROM staff 
      WHERE clinic_id = ${clinic.id} AND role = 'CEO' AND active = TRUE 
      LIMIT 1
    `;
    
    let staffMember = staffRows[0];
    
    // Se non c'è un CEO, usa dati admin direttamente
    if (!staffMember) {
      staffMember = {
        id: clinic.id,
        name: 'Admin',
        role: 'CEO',
        avatar_color: '#00897B'
      };
    }

    // Genera token staff valido
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'god-os-jwt-secret-change-in-prod';
    const token = jwt.sign(
      { staff_id: staffMember.id, clinic_id: clinic.id, role: 'CEO', name: staffMember.name },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Salva sessione
    const expires = new Date(Date.now() + 12 * 3600 * 1000);
    await db.sql`
      INSERT INTO staff_sessions (staff_id, clinic_id, token, expires_at)
      VALUES (${staffMember.id}, ${clinic.id}, ${token}, ${expires})
      ON CONFLICT DO NOTHING
    `.catch(() => {});

    res.json({
      success: true,
      staff: { id: staffMember.id, name: staffMember.name, role: 'CEO', avatar_color: staffMember.avatar_color || '#00897B' },
      token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── CLINIC UPDATE ─────────────────────────────────────────────
router.put('/clinic/update', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'god-os-jwt-secret-change-in-prod';
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token mancante' });
    let payload;
    try { payload = jwt.verify(auth.slice(7), JWT_SECRET); } catch { return res.status(401).json({ error: 'Token non valido' }); }
    
    const { name, city, specialties, admin_email, admin_password } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome clinica obbligatorio' });
    
    const clinicRows = await db.sql`SELECT id FROM clinic WHERE id = ${payload.clinic_id} LIMIT 1`;
    if (!clinicRows[0]) return res.status(404).json({ error: 'Clinica non trovata' });
    
    let passwordHash = null;
    if (admin_password && admin_password.length >= 8) {
      const bcrypt = require('bcryptjs');
      passwordHash = await bcrypt.hash(admin_password, 10);
    }
    
    if (passwordHash) {
      await db.sql`
        UPDATE clinic SET
          name = ${name},
          city = ${city || null},
          specialties = ${specialties || []},
          admin_email = ${admin_email || null},
          admin_password_hash = ${passwordHash},
          updated_at = NOW()
        WHERE id = ${payload.clinic_id}
      `;
    } else {
      await db.sql`
        UPDATE clinic SET
          name = ${name},
          city = ${city || null},
          specialties = ${specialties || []},
          admin_email = ${admin_email || null},
          updated_at = NOW()
        WHERE id = ${payload.clinic_id}
      `;
    }
    
    const updated = await db.sql`SELECT id, name, city, specialties, admin_email FROM clinic WHERE id = ${payload.clinic_id} LIMIT 1`;
    res.json({ success: true, clinic: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
