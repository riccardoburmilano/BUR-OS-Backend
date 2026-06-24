// ============================================================
// novaContext.js v2.0 — BUR OS Dynamic Context Builder
// Con memoria persistente e apprendimento clinico
// ============================================================

const { sql } = require('./db');

// ── KNOWLEDGE BASE MEDICINA ESTETICA ─────────────────────────
const KNOWLEDGE_BASE = `
=== BUR OS KNOWLEDGE BASE — MEDICINA ESTETICA ITALIANA v2.0 ===

## FILLER ACIDO IALURONICO

### Marche principali
- JUVEDERM (Allergan): Ultra (labbra, rughe superficiali), Voluma (zigomi, mento), Volift (rughe medio-profonde), Volbella (labbra naturali). Crosslinking VYCROSS. Durata 12-18 mesi.
- RESTYLANE (Galderma): Kysse (labbra), Lyft (zigomi), Defyne (rughe profonde), Refyne (rughe medie). Tecnologia NASHA/OBT. Durata 6-18 mesi.
- BELOTERO (Merz): Balance (superficiali), Intense (profonde), Volume (volumizzazione). Tecnologia CPM. Durata 6-12 mesi.
- TEOSYAL (Teoxane): Kiss (labbra), RHA (dinamico), Global Action (rughe medie). Durata 9-18 mesi.
- STYLAGE (Vivacy): con mannitolo antiossidante. Durata 12-18 mesi.

### Protocollo filler labbra
1. Analisi morfologica (proporzione ideale 1:1.6 sup/inf)
2. Consenso informato FIRMATO — obbligatorio per legge
3. Anamnesi: anticoagulanti/FANS/Aspirina (sospendere 7gg), herpes (profilassi Aciclovir 400mg 2x/die 3gg prima)
4. Foto pre-trattamento (frontale, laterale, 3/4)
5. Anestesia topica EMLA 20-30 minuti
6. Disinfezione clorexidina
7. Tecnica: tunnelling corpo labbro, microbolus tubercoli, serial puncture bordo vermiglio
8. Aghi 27-30G retrograde, cannula 25G per meno traumi
9. Massaggio modellante + ghiaccio 5-10 min post
10. Follow-up 2 settimane per eventuale ritocco

### Controindicazioni assolute filler
- Gravidanza e allattamento
- Allergia acido ialuronico o lidocaina
- Infezioni attive nella zona
- Autoimmunità attiva in fase acuta
- Isotretinoina (Roaccutane) — attendere 6 mesi post-fine terapia
- Coagulopatie non trattate

### Emergenze filler
- OCCLUSIONE VASCOLARE: dolore acuto, blanching, livido improvviso → INIETTARE IMMEDIATAMENTE Hialuronidasi 150-300U → massaggio → calore → se non risolve entro 1h: PS
- NECROSI INCIPIENTE: area pallida/cianotica → Hialuronidasi, Nitroglicerina topica, calore, massage
- EMBOLIA RETINICA: perdita visiva → EMERGENZA ASSOLUTA → chiamare 118 immediatamente

## TOSSINA BOTULINICA

### Prodotti in Italia
- BOTOX (Allergan): gold standard. 100U/flacone.
- DYSPORT (Ipsen): 1U Botox ≈ 2.5-3U Dysport. 300/500U/flacone.
- XEOMIN (Merz): senza proteine complesse, meno anticorpi. 100U/flacone.
- LETYBO (Hugel): approvato EU 2022, equivalente Botox unit/unit.

### Dosi standard INDICATIVE (Botox units)
- Glabella: 15-25U
- Fronte: 8-20U (⚠️ attenzione ptosi palpebrale — mai iniettare sotto linea pupillare)
- Zampe di gallina: 6-15U per lato
- Bunny lines: 2-5U per lato
- Lip flip: 2-4U labbro superiore
- Mento: 4-8U
- Massetere (bruxismo/slimming): 20-30U per lato
- Iperidrosi ascellare: 50U per ascella
- Platisma (nefertiti lift): 25-50U totali

### Controindicazioni botox
ASSOLUTE: Miastenia gravis, Sindrome di Eaton-Lambert, gravidanza, allattamento, aminoglicosidi in corso
RELATIVE: Disturbi coagulazione, trattamento anticoagulante, infezione locale attiva

### Protocollo botox
1. Analisi mimica DINAMICA (chiedere di corrugare, alzare sopracciglia, sorridere)
2. Consenso informato firmato
3. Foto pre con mimica attiva
4. Ricostituire con soluzione fisiologica (2-4ml per 100U Botox — più diluito = spread maggiore)
5. Ago 30-32G intradermico/sottocutaneo
6. NO massaggio post (rischio diffusione non voluta)
7. Paziente in posizione seduta/semireclinata durante iniezione
8. Onset 3-7gg, pieno effetto 14gg
9. Durata 3-6 mesi
10. Follow-up 14gg per valutare simmetria e ritocco

### Complicanze botox
- Ptosi palpebrale: Brimonidina collirio (stimola Müller) — attendere risoluzione 6-8 settimane
- Ptosi sopracciglio: attenzione a frontale basso, trattare solo la parte superiore
- Asinmetria: ritocco a 14gg con piccole dosi
- Cefalea post: paracetamolo, solitamente risolve in 24-48h

## BIOSTIMOLATORI E SKIN QUALITY

### Profhilo (IBSA)
- 32mg/2ml HA non crosslinkato, alta fluidità
- 5 punti BAP (Bio Aesthetic Points) per viso: 2 guance, 2 zigomi, 1 mento
- Stimola collagene I, III, IV ed elastina
- Protocollo: 2 sedute a distanza di 1 mese, poi mantenimento ogni 6 mesi
- Indicato: lassità cutanea, skin quality, collo, décolleté

### Radiesse (Merz)
- Idrossiapatite di calcio, biostimolatore + volumizzatore
- Durata 12-18 mesi
- Mani, zigomi, jawline, correzione rughe profonde
- Diluibile con lidocaina per uso skin booster

### PRP (Plasma Ricco di Piastrine)
- Centrifugazione sangue paziente 1500-3000 rpm
- Crescita fattori: PDGF, TGF-β, VEGF, EGF
- Indicazioni: rigenerazione cutanea, alopecia, cicatrici
- Protocollo: 3 sedute mensili + mantenimento 6-12 mesi

## LASER E TECNOLOGIE

### Laser CO2 frazionato
- Lunghezza d'onda 10600nm
- Indicazioni: rughe, acne cicatriziale, lassità, discromie, ringiovanimento
- Controindicazioni: isotretinoina (attendere 6 mesi), keloid, Fitzpatrick V-VI (iperpigmentazione)
- Recovery: 7-14 giorni (rossore, croste, desquamazione)
- Pre: SPF religioso 4 settimane + depigmentanti se Fitzpatrick III-IV
- Post: antibiotico topico, idratazione intensa, SPF obbligatorio 3 mesi

### IPL (Luce Pulsata Intensa)
- Indicazioni: macchie solari, teleangectasie, rosacea, couperose, epilazione
- Non è un laser (spettro largo 500-1200nm)
- Controindicazioni: abbronzatura recente, Fitzpatrick V-VI, fotosensibilizzanti

### Radiofrequenza
- Termolifting non invasivo, stimolo fibroblasti
- Indicazioni: lassità lieve-moderata, riduzione grasso localizzato
- Nessun downtime

## ANATOMIA E SICUREZZA

### Zone ad alto rischio vascolare
- GLABELLA: arteria sopratrocleare e sopraorbitale → rischio necrosi/cecità
- REGIONE NASALE: arteria angolare, dorsale del naso → anastomosi con arteria oftalmica
- SOLCO NASO-LABIALE: arteria labiale superiore → anastomosi con arteria facciale
- TEMPIA: arteria temporale superficiale → visibile, palpabile, evitare
- REGIONE PERIOCULARE: arteria sopraorbitale, infraorbitale

### Scala di Fitzpatrick
- I: sempre si scotta, non si abbronza (biondo/rosso)
- II: spesso si scotta, poco abbronzato
- III: a volte si scotta, abbronzatura moderata
- IV: raramente si scotta, bronzo (mediterraneo)
- V: molto raramente si scotta (latino americano, asiatico scuro)
- VI: non si scotta mai (africano)

### Principi di sicurezza fondamentali
1. ASPIRARE sempre prima di iniettare filler in zone rischiose
2. Iniettare LENTAMENTE (min 1ml/min per filler)
3. Avere SEMPRE Hialuronidasi disponibile in studio
4. Muovere l'ago durante iniezione per non restare in un vaso
5. Preferire CANNULE nelle zone ad alto rischio
6. Non iniettare profondo nel piano sottocutaneo della glabella

## FARMACOLOGIA CLINIC

### Hialuronidasi (antidoto filler HA)
- Prodotti: Hyalase, Hylase Dessau
- Dose: 150-300 unità per area
- Diluire in 1ml soluzione fisiologica
- Effetto visibile in 24-48h (può richiedere dosi multiple)
- Conservare in frigo, usare entro 24h dalla diluizione

### Farmaci studio (must have)
- Adrenalina 1:1000 (reazioni anafilattiche)
- Antistaminici iv (Polaramin, Trimeton)
- Cortisone iv (Soldesam, Bentelan)
- Hialuronidasi
- Aciclovir 400mg cp (profilassi herpes)
- EMLA crema anestetica
- Clorexidina 0.5-2%

## CONSENSI INFORMATI E NORMATIVA

### Obblighi legali in Italia
- Consenso informato SCRITTO obbligatorio per ogni procedura
- Firma del paziente e del medico
- Conservare per ALMENO 10 anni
- Include: rischi, benefici, alternative, possibili complicanze
- Il medico deve essere iscritto all'Ordine dei Medici
- La medicina estetica invasiva può essere eseguita SOLO da medici abilitati

### GDPR e privacy dati sanitari
- Dati biometrici e sanitari = dati sensibili (art. 9 GDPR)
- Consenso esplicito per raccolta foto
- Informativa privacy firmata
- Dati conservati in forma sicura e cifrata
- Diritto alla cancellazione (salvo obblighi di legge)

=== FINE KNOWLEDGE BASE v2.0 ===
`;

// ── MEMORIA CLINICA PERSISTENTE ───────────────────────────────
async function loadClinicMemory(clinicId) {
  try {
    // Carica ultime interazioni NOVA per questa clinica (feedback positivi = apprendimento)
    const feedbackRows = await sql`
      SELECT question, correction, role_id, created_at
      FROM nova_feedback
      WHERE clinic_id = ${clinicId}
        AND feedback = 'positive'
        AND correction IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20
    `.catch(() => []);

    // Carica pazienti con note cliniche rilevanti
    const patientNotes = await sql`
      SELECT name, age, treatments, notes, tags, total_spend
      FROM patients
      WHERE clinic_id = ${clinicId}
        AND (notes IS NOT NULL AND notes != '' OR tags != '{}')
      ORDER BY updated_at DESC
      LIMIT 30
    `.catch(() => []);

    // Carica ultimi 50 pazienti per pattern trattamenti
    const treatmentPatterns = await sql`
      SELECT treatments, COUNT(*) as count
      FROM patients
      WHERE clinic_id = ${clinicId}
        AND treatments != '{}'
      GROUP BY treatments
      ORDER BY count DESC
      LIMIT 10
    `.catch(() => []);

    let memoryText = '';

    if (feedbackRows.length > 0) {
      memoryText += `\n=== APPRENDIMENTO DA SESSIONI PRECEDENTI ===\n`;
      feedbackRows.slice(0, 5).forEach(f => {
        memoryText += `- Correzione ricevuta [${f.role_id}]: "${f.correction?.slice(0, 150)}"\n`;
      });
    }

    if (patientNotes.length > 0) {
      memoryText += `\n=== PAZIENTI CON NOTE CLINICHE ===\n`;
      patientNotes.slice(0, 10).forEach(p => {
        const tags = (p.tags || []).join(', ');
        const treatments = (p.treatments || []).join(', ');
        if (p.notes || tags) {
          memoryText += `- ${p.name} (${p.age || '?'}aa): ${treatments || 'N/A'}${p.notes ? ' | ' + p.notes.slice(0, 100) : ''}${tags ? ' | Tag: ' + tags : ''}\n`;
        }
      });
    }

    if (treatmentPatterns.length > 0) {
      memoryText += `\n=== TRATTAMENTI PIÙ FREQUENTI IN QUESTA CLINICA ===\n`;
      treatmentPatterns.forEach(t => {
        const treatments = (t.treatments || []).join(', ');
        if (treatments) memoryText += `- ${treatments}: ${t.count} pazienti\n`;
      });
    }

    return memoryText;
  } catch (err) {
    console.error('[BUR OS] loadClinicMemory error:', err.message);
    return '';
  }
}

// ── BUILD CONTEXT ─────────────────────────────────────────────
async function buildNovaContext(roleId, clinicId) {
  try {
    const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const todayISO = new Date().toISOString().split('T')[0];

    // 1. Dati clinica
    const clinicRows = await sql`SELECT * FROM clinic WHERE id = ${clinicId} LIMIT 1`;
    const clinic = clinicRows[0];
    if (!clinic) return null;

    // 2. Staff attivo
    const staffRows = await sql`
      SELECT name, role FROM staff
      WHERE clinic_id = ${clinicId} AND active = TRUE
      ORDER BY role
    `;

    // 3. Pazienti di oggi
    const patientRows = await sql`
      SELECT name, age, tags, treatments, notes, next_appointment, total_spend
      FROM patients
      WHERE clinic_id = ${clinicId}
        AND DATE(next_appointment) = ${todayISO}
      ORDER BY next_appointment ASC
      LIMIT 20
    `;

    // 4. Prossimi 7 giorni (per pianificazione)
    const upcomingRows = await sql`
      SELECT name, treatments, next_appointment
      FROM patients
      WHERE clinic_id = ${clinicId}
        AND next_appointment > NOW()
        AND next_appointment < NOW() + INTERVAL '7 days'
        AND DATE(next_appointment) != ${todayISO}
      ORDER BY next_appointment ASC
      LIMIT 10
    `.catch(() => []);

    // 5. Messaggi non letti
    const unreadMsgs = await sql`
      SELECT COUNT(*) as count FROM staff_messages
      WHERE clinic_id = ${clinicId} AND read = FALSE
    `.catch(() => [{ count: 0 }]);

    // 6. Memoria clinica (apprendimento persistente)
    const clinicMemory = await loadClinicMemory(clinicId);

    // 7. Assembla contesto
    const clinicContext = `
=== CONTESTO CLINICA — ${today} ===

CLINICA: ${clinic.name}
SEDE: ${clinic.city || 'N/A'}
SPECIALIZZAZIONI: ${(clinic.specialties || []).join(', ') || 'Medicina Estetica'}

STAFF ATTIVO (${staffRows.length} membri):
${staffRows.map(s => `- ${s.name} [${s.role}]`).join('\n') || '- Nessuno configurato'}

AGENDA OGGI (${patientRows.length} pazienti):
${patientRows.length === 0 ? '- Nessun appuntamento oggi' : patientRows.map(p => {
  const ora = p.next_appointment ? new Date(p.next_appointment).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
  const isVip = (p.tags || []).includes('VIP');
  const hasAlert = (p.notes || '').toLowerCase().includes('allergi') || (p.notes || '').toLowerCase().includes('farmac') || (p.tags || []).includes('ATTENZIONE');
  return `- ${ora} | ${p.name}${isVip ? ' ⭐VIP' : ''} (${p.age || '?'}aa) | ${(p.treatments || []).join(', ') || 'N/A'}${hasAlert ? ' ⚠️ VERIFICA ANAMNESI' : ''}${p.notes ? ' | Note: ' + p.notes.slice(0, 120) : ''}`;
}).join('\n')}

PROSSIMI 7 GIORNI (${upcomingRows.length} appuntamenti):
${upcomingRows.slice(0, 5).map(p => {
  const data = new Date(p.next_appointment).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  const ora = new Date(p.next_appointment).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return `- ${data} ${ora} | ${p.name} | ${(p.treatments || []).join(', ') || 'N/A'}`;
}).join('\n') || '- Nessun appuntamento programmato'}

MESSAGGI NON LETTI: ${unreadMsgs[0]?.count || 0}
${clinicMemory}
=== FINE CONTESTO ===
`;

    return { clinicContext, knowledgeBase: KNOWLEDGE_BASE };

  } catch (err) {
    console.error('[BUR OS] buildNovaContext error:', err.message);
    return null;
  }
}

// ── ROLE PROMPTS ──────────────────────────────────────────────
function buildNovaPrompt(roleId, clinicContext, knowledgeBase) {
  const rolePersonality = {

    doctor: `Sei NOVA, collaboratore clinico AI integrato in Operantis per medici di medicina estetica.

IDENTITÀ: Non sei un chatbot. Sei un collega clinico digitale. Hai studiato medicina estetica, conosci i protocolli, i prodotti, le dosi, le emergenze. Sei sempre presente durante le sedute.

COMPORTAMENTO:
- Parli come un collega medico esperto, non come un assistente
- Anticipi i problemi prima che accadano
- Se vedi un paziente con allergie o note critiche nell'agenda, lo dici subito senza aspettare che il medico chieda
- Conosci i pazienti della clinica — li hai "visti" nell'agenda e nelle cartelle
- Se il medico dice "sto facendo il filler alle labbra" capisci il contesto e aiuti con dosi, tecnica, precauzioni
- Se c'è un'emergenza (occlusione vascolare, reazione) dai istruzioni immediate e chiare

STILE:
- Conciso ma completo: max 5 righe normalmente, illimitato in emergenze
- Usa ⚠️ per alert critici, ✅ per conferme, 💡 per suggerimenti clinici, 🚨 per emergenze
- Non ripetere quello che il medico sa già — vai al punto
- Se non sei sicuro di qualcosa di specifico, dillo chiaramente

LIMITE ETICO: Non prescrivere mai farmaci senza che ci sia un medico. Sei supporto, non sostituzione.

Rispondi SEMPRE in italiano.`,

    assistant: `Sei NOVA, assistente AI per assistenti medici in clinica estetica.
CARATTERE: operativo, pratico, orientato ai dettagli. Dai istruzioni step-by-step.
PRIORITÀ: preparazione sala perfetta, checklist complete, supporto al medico.
STILE: diretto, usa ✅ step ok, 📋 checklist, ⏱️ timing. Max 4 righe.
Rispondi SEMPRE in italiano.`,

    nurse: `Sei NOVA, supervisore AI per infermieri in clinica estetica.
CARATTERE: rigoroso, orientato alla sicurezza. La sicurezza paziente è non negoziabile.
PRIORITÀ: sterilizzazione, farmaci, emergenze, protocolli.
STILE: preciso e diretto. Usa 🔴 emergenze, ⚠️ rischi, ✅ conformità. Max 4 righe.
Rispondi SEMPRE in italiano.`,

    ceo: `Sei NOVA, advisor strategico AI per il CEO della clinica.
CARATTERE: executive, orientato ai numeri e alle decisioni. Vai al punto.
PRIORITÀ: performance clinica, fatturato, staff, pazienti.
STILE: diretto, usa 📊 dati, ⚡ azioni urgenti. Max 5 righe.
Rispondi SEMPRE in italiano.`,

    receptionist: `Sei NOVA, assistente AI per receptionist di clinica estetica.
CARATTERE: organizzata, orientata al paziente, proattiva.
PRIORITÀ: agenda ottimizzata, zero no-show, esperienza paziente eccellente.
STILE: caldo e professionale. Usa 📅 agenda, 📞 chiamate, 💬 messaggi. Max 4 righe.
Rispondi SEMPRE in italiano.`,

    legal: `Sei NOVA, consulente AI legale per cliniche di medicina estetica.
CARATTERE: preciso, normativo, orientato alla compliance.
PRIORITÀ: GDPR, consensi, normativa sanitaria italiana, responsabilità medica.
STILE: formale. Usa 📋 documenti, ⚠️ scadenze, ✅ conformità. Max 4 righe.
Rispondi SEMPRE in italiano.`,

    marketing: `Sei NOVA, strategist AI per marketing di cliniche estetiche italiane.
CARATTERE: creativo e data-driven. Proponi azioni concrete e misurabili.
PRIORITÀ: acquisizione pazienti, retention, brand positioning.
STILE: energico. Usa 📈 crescita, 📱 social, ⭐ reputazione. Max 4 righe.
Rispondi SEMPRE in italiano.`,
  };

  const persona = rolePersonality[roleId] || rolePersonality.ceo;

  return `${persona}

${clinicContext}

KNOWLEDGE BASE MEDICINA ESTETICA:
${knowledgeBase}

ISTRUZIONI OPERATIVE:
- Usa i dati del contesto clinica per personalizzare ogni risposta
- Se un paziente oggi ha allergie o note critiche, segnalalo proattivamente
- Impara da ogni correzione ricevuta — se l'utente corregge qualcosa, memorizzalo
- I dati della clinica (pazienti, trattamenti, pattern) arricchiscono la tua conoscenza nel tempo`;
}

// ── FEEDBACK E APPRENDIMENTO ──────────────────────────────────
async function saveNovaFeedback(clinicId, roleId, question, novaAnswer, feedback, correction) {
  try {
    await sql`
      INSERT INTO nova_feedback (clinic_id, role_id, question, nova_answer, feedback, correction, created_at)
      VALUES (${clinicId}, ${roleId}, ${question}, ${novaAnswer}, ${feedback}, ${correction || null}, NOW())
    `.catch(() => {
      console.log('[BUR OS] nova_feedback: tabella non ancora creata');
    });
  } catch {}
}

// ── CREA TABELLA FEEDBACK SE NON ESISTE ──────────────────────
async function ensureNovaFeedbackTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS nova_feedback (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        clinic_id UUID,
        role_id TEXT,
        question TEXT,
        nova_answer TEXT,
        feedback TEXT,
        correction TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
  } catch {}
}

// Crea tabella all'avvio
ensureNovaFeedbackTable();

module.exports = { buildNovaContext, buildNovaPrompt, saveNovaFeedback, KNOWLEDGE_BASE };
