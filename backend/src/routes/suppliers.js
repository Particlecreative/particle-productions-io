const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/suppliers
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM suppliers ORDER BY full_name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/suppliers/submissions?production_id=...
router.get('/submissions', async (req, res) => {
  const { production_id } = req.query;
  try {
    const q = production_id
      ? 'SELECT * FROM supplier_submissions WHERE data->>\'production_id\' = $1 ORDER BY submitted_at DESC'
      : 'SELECT * FROM supplier_submissions ORDER BY submitted_at DESC';
    const { rows } = await db.query(q, production_id ? [production_id] : []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/suppliers  (upsert by email / phone)
router.post('/', async (req, res) => {
  const s = req.body;
  try {
    // Try to find by email or phone first
    let existing = null;
    if (s.email) {
      const r = await db.query('SELECT id FROM suppliers WHERE lower(email) = lower($1)', [s.email]);
      existing = r.rows[0];
    }
    if (!existing && s.phone) {
      const r = await db.query(
        "SELECT id FROM suppliers WHERE regexp_replace(phone,'\\D','','g') = regexp_replace($1,'\\D','','g')",
        [s.phone]
      );
      existing = r.rows[0];
    }

    if (existing) {
      // Merge productions arrays
      const mergeRes = await db.query(
        `UPDATE suppliers SET
           full_name = COALESCE($2, full_name),
           role = COALESCE($3, role),
           phone = COALESCE($4, phone),
           email = COALESCE($5, email),
           business_type = COALESCE($6, business_type),
           productions = (
             SELECT array_agg(DISTINCT x) FROM unnest(productions || $7::text[]) x
           ),
           updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [existing.id, s.full_name, s.role, s.phone, s.email, s.business_type, s.productions || []]
      );
      return res.json(mergeRes.rows[0]);
    }

    const { rows } = await db.query(
      `INSERT INTO suppliers
        (full_name, role, phone, email, id_number, bank_name, account_number,
         branch, swift, business_type, company_name, tax_id,
         food_restrictions, dietary_notes, supplier_type, notes, productions, source,
         address, transport_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        s.full_name, s.role || null, s.phone || null, s.email || null,
        s.id_number || null, s.bank_name || null, s.account_number || null,
        s.branch || null, s.swift || null, s.business_type || null,
        s.company_name || null, s.tax_id || null,
        s.food_restrictions || null, s.dietary_notes || null,
        s.supplier_type || 'New Supplier', s.notes || null,
        s.productions || [], s.source || 'manual',
        s.address || null, s.transport_mode || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /suppliers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/suppliers/submit  (public supplier form submission)
router.post('/submit', async (req, res) => {
  const data = req.body;
  try {
    // Log submission
    const subRes = await db.query(
      'INSERT INTO supplier_submissions (data) VALUES ($1) RETURNING *',
      [JSON.stringify(data)]
    );
    // Upsert supplier
    const upsertReq = { ...req, body: { ...data, source: 'form' } };
    const fakeRes = {
      json: () => {}, status: () => ({ json: () => {} }),
    };
    // Re-use POST / logic by calling db directly
    const s = data;
    let existing = null;
    if (s.email) {
      const r = await db.query('SELECT id FROM suppliers WHERE lower(email) = lower($1)', [s.email]);
      existing = r.rows[0];
    }
    if (!existing && s.phone) {
      const r = await db.query(
        "SELECT id FROM suppliers WHERE regexp_replace(phone,'\\D','','g') = regexp_replace($1,'\\D','','g')",
        [s.phone]
      );
      existing = r.rows[0];
    }
    if (existing) {
      await db.query(
        `UPDATE suppliers SET
           productions = (SELECT array_agg(DISTINCT x) FROM unnest(productions || $2::text[]) x),
           source = 'form', updated_at = NOW()
         WHERE id = $1`,
        [existing.id, s.production_id ? [s.production_id] : []]
      );
    } else {
      await db.query(
        `INSERT INTO suppliers
          (full_name, role, phone, email, id_number, bank_name, account_number,
           branch, swift, business_type, company_name, tax_id,
           food_restrictions, dietary_notes, supplier_type, notes, productions, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'form')`,
        [
          s.full_name, s.role || null, s.phone || null, s.email || null,
          s.id_number || null, s.bank_name || null, s.account_number || null,
          s.branch || null, s.swift || null, s.business_type || null,
          s.company_name || null, s.tax_id || null,
          s.food_restrictions || null, s.dietary_notes || null,
          s.supplier_type || 'New Supplier', s.notes || null,
          s.production_id ? [s.production_id] : [],
        ]
      );
    }

    res.status(201).json(subRes.rows[0]);
  } catch (err) {
    console.error('POST /suppliers/submit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/suppliers/:id
router.patch('/:id', async (req, res) => {
  const allowed = [
    'full_name','role','phone','email','id_number','bank_name','account_number',
    'branch','swift','business_type','company_name','tax_id','food_restrictions',
    'dietary_notes','supplier_type','notes','productions','address','transport_mode',
  ];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE suppliers SET ${set}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/suppliers/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
