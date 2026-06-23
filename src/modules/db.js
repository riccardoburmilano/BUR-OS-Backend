// ============================================================
// db.js — Neon PostgreSQL client
// Installa: npm install @neondatabase/serverless bcryptjs jsonwebtoken
// ============================================================

const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const sql = neon(process.env.DATABASE_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'god-os-jwt-secret-change-in-prod';
const SESSION_HOURS = 12;

// ── CLINIC ────────────────────────────────────────────────────

async function clinicCreate({ name, city, specialties, logo_url, admin_email, admin_password }) {
  const hash = await bcrypt.hash(admin_password, 10);
  const rows = await sql`
    INSERT INTO clinic (name, city, specialties, logo_url, admin_email, admin_password)
    VALUES (${name}, ${city}, ${specialties}, ${logo_url}, ${admin_email}, ${hash})
    RETURNING id, name, city, specialties, logo_url, admin_email, created_at
  `;
  return rows[0];
}

async function clinicGet() {
  const rows = await sql`SELECT id, name, city, specialties, logo_url, admin_email, created_at FROM clinic LIMIT 1`;
  return rows[0] || null;
}

async function clinicLogin(email, password) {
  const rows = await sql`SELECT * FROM clinic WHERE admin_email = ${email}`;
  if (!rows[0]) return null;
  const ok = await bcrypt.compare(password, rows[0].admin_password);
  if (!ok) return null;
  const token = jwt.sign({ clinic_id: rows[0].id, role: 'ADMIN' }, JWT_SECRET, { expiresIn: `${SESSION_HOURS}h` });
  return { clinic: { id: rows[0].id, name: rows[0].name, admin_email: rows[0].admin_email }, token };
}

function clinicVerifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// ── STAFF ─────────────────────────────────────────────────────

async function staffCreate({ clinic_id, name, role, pin, avatar_color }) {
  const pin_hash = await bcrypt.hash(pin, 10);
  const rows = await sql`
    INSERT INTO staff (clinic_id, name, role, pin_hash, avatar_color)
    VALUES (${clinic_id}, ${name}, ${role}, ${pin_hash}, ${avatar_color || '#6366F1'})
    RETURNING id, clinic_id, name, role, avatar_color, active, created_at
  `;
  return rows[0];
}

async function staffList(clinic_id) {
  return sql`
    SELECT id, clinic_id, name, role, avatar_color, active, created_at
    FROM staff WHERE clinic_id = ${clinic_id} AND active = TRUE
    ORDER BY created_at ASC
  `;
}

async function staffPinLogin(clinic_id, staff_id, pin) {
  const rows = await sql`SELECT * FROM staff WHERE id = ${staff_id} AND clinic_id = ${clinic_id} AND active = TRUE`;
  if (!rows[0]) return null;
  const ok = await bcrypt.compare(pin, rows[0].pin_hash);
  if (!ok) return null;

  // Crea sessione
  const token = jwt.sign(
    { staff_id: rows[0].id, clinic_id, role: rows[0].role, name: rows[0].name },
    JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h` }
  );
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await sql`
    INSERT INTO staff_sessions (staff_id, clinic_id, token, expires_at)
    VALUES (${rows[0].id}, ${clinic_id}, ${token}, ${expires})
  `;

  return {
    staff: { id: rows[0].id, name: rows[0].name, role: rows[0].role, avatar_color: rows[0].avatar_color },
    token
  };
}

async function staffVerifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Verifica che la sessione esista ancora
    const rows = await sql`
      SELECT s.id FROM staff_sessions s
      WHERE s.token = ${token} AND s.expires_at > NOW()
    `;
    if (!rows[0]) return null;
    return payload;
  } catch { return null; }
}

async function staffUpdate(id, clinic_id, { name, role, avatar_color, active }) {
  const rows = await sql`
    UPDATE staff SET
      name = COALESCE(${name}, name),
      role = COALESCE(${role}, role),
      avatar_color = COALESCE(${avatar_color}, avatar_color),
      active = COALESCE(${active}, active)
    WHERE id = ${id} AND clinic_id = ${clinic_id}
    RETURNING id, name, role, avatar_color, active
  `;
  return rows[0] || null;
}

async function staffUpdatePin(id, clinic_id, new_pin) {
  const pin_hash = await bcrypt.hash(new_pin, 10);
  await sql`UPDATE staff SET pin_hash = ${pin_hash} WHERE id = ${id} AND clinic_id = ${clinic_id}`;
  return true;
}

async function staffLogout(token) {
  await sql`DELETE FROM staff_sessions WHERE token = ${token}`;
  return true;
}

// ── PATIENTS ──────────────────────────────────────────────────

async function patientCreate(clinic_id, { name, age, phone, email, tags, treatments, notes, next_appointment }) {
  const rows = await sql`
    INSERT INTO patients (clinic_id, name, age, phone, email, tags, treatments, notes, next_appointment)
    VALUES (${clinic_id}, ${name}, ${age}, ${phone}, ${email}, ${tags}, ${treatments}, ${notes}, ${next_appointment})
    RETURNING *
  `;
  return rows[0];
}

async function patientList(clinic_id, { limit = 50, search } = {}) {
  if (search) {
    return sql`
      SELECT * FROM patients
      WHERE clinic_id = ${clinic_id}
        AND (name ILIKE ${'%' + search + '%'} OR email ILIKE ${'%' + search + '%'})
      ORDER BY next_appointment ASC NULLS LAST
      LIMIT ${limit}
    `;
  }
  return sql`
    SELECT * FROM patients WHERE clinic_id = ${clinic_id}
    ORDER BY next_appointment ASC NULLS LAST
    LIMIT ${limit}
  `;
}

async function patientGet(id, clinic_id) {
  const rows = await sql`SELECT * FROM patients WHERE id = ${id} AND clinic_id = ${clinic_id}`;
  return rows[0] || null;
}

async function patientUpdate(id, clinic_id, fields) {
  const { name, age, phone, email, tags, treatments, notes, total_spend } = fields;
  
  // Se next_appointment è esplicitamente passato (anche null), aggiornalo
  if ('next_appointment' in fields) {
    const appt = fields.next_appointment;
    const rows = await sql`
      UPDATE patients SET
        name = COALESCE(${name}, name),
        age = COALESCE(${age}, age),
        phone = COALESCE(${phone}, phone),
        email = COALESCE(${email}, email),
        tags = COALESCE(${tags}, tags),
        treatments = COALESCE(${treatments}, treatments),
        notes = COALESCE(${notes}, notes),
        next_appointment = ${appt},
        total_spend = COALESCE(${total_spend}, total_spend),
        updated_at = NOW()
      WHERE id = ${id} AND clinic_id = ${clinic_id}
      RETURNING *
    `;
    return rows[0] || null;
  }
  
  const rows = await sql`
    UPDATE patients SET
      name = COALESCE(${name}, name),
      age = COALESCE(${age}, age),
      phone = COALESCE(${phone}, phone),
      email = COALESCE(${email}, email),
      tags = COALESCE(${tags}, tags),
      treatments = COALESCE(${treatments}, treatments),
      notes = COALESCE(${notes}, notes),
      total_spend = COALESCE(${total_spend}, total_spend),
      updated_at = NOW()
    WHERE id = ${id} AND clinic_id = ${clinic_id}
    RETURNING *
  `;
  return rows[0] || null;
}

async function patientDelete(id, clinic_id) {
  await sql`DELETE FROM patients WHERE id = ${id} AND clinic_id = ${clinic_id}`;
  return true;
}

// ── SESSION CLEANUP (chiamato periodicamente) ─────────────────
async function cleanExpiredSessions() {
  const result = await sql`DELETE FROM staff_sessions WHERE expires_at < NOW()`;
  return result.count || 0;
}

module.exports = {
  sql,
  clinicCreate, clinicGet, clinicLogin, clinicVerifyToken,
  staffCreate, staffList, staffPinLogin, staffVerifyToken,
  staffUpdate, staffUpdatePin, staffLogout,
  patientCreate, patientList, patientGet, patientUpdate, patientDelete,
  cleanExpiredSessions
};
