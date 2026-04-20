const router = require('express').Router();
const db     = require('../db');
const { logAction } = require('../lib/auditLog');
const { verifyJWT, requireEditor } = require('../middleware/auth');
const { sendEmail } = require('./gmail');

// ── Carrier detection ──────────────────────────────────────────────────────────
function detectCarrier(tracking) {
  if (!tracking) return null;
  const t = tracking.trim();
  if (/^1Z/i.test(t)) return { name: 'UPS', url: `https://www.ups.com/track?tracknum=${t}` };
  if (/^\d{12,15}$/.test(t)) return { name: 'FedEx', url: `https://www.fedex.com/fedextrack/?trknbr=${t}` };
  if (/^\d{20,}$/.test(t)) return { name: 'USPS', url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}` };
  if (/^\d{10,11}$/.test(t)) return { name: 'DHL', url: `https://www.dhl.com/en/express/tracking.html?AWB=${t}` };
  return null;
}

// ── Public route: create delivery from contract signing (no auth) ──────────────
router.post('/from-contract', async (req, res) => {
  try {
    const { production_id, recipient_name, recipient_email, recipient_phone, phone_country_code,
            address_street, address_apt, address_city, address_state, address_zip, address_country,
            contract_token } = req.body;
    if (!production_id || !recipient_name) return res.status(400).json({ error: 'production_id and recipient_name required' });
    // Validate contract token exists for this production
    const { rows: check } = await db.query(
      `SELECT c.id FROM contracts c JOIN contract_signatures cs ON cs.contract_id = c.id
       WHERE c.production_id = $1 AND cs.token = $2 AND cs.signed_at IS NOT NULL`,
      [production_id, contract_token || '']
    );
    if (!check[0] && contract_token) return res.status(403).json({ error: 'Invalid contract token' });
    // Upsert: avoid duplicate if already exists for this production + name
    const { rows } = await db.query(
      `INSERT INTO product_deliveries (production_id, recipient_name, recipient_email, recipient_phone,
        phone_country_code, address_street, address_apt, address_city, address_state, address_zip, address_country)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [production_id, recipient_name.trim(), recipient_email || '', recipient_phone || '',
       phone_country_code || '+1', address_street || '', address_apt || '',
       address_city || '', address_state || '', address_zip || '', address_country || 'US']
    );
    res.status(201).json(rows[0] || { success: true });
  } catch (err) {
    console.error('POST /product-deliveries/from-contract error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Protected routes ───────────────────────────────────────────────────────────
router.use(verifyJWT);

// GET /api/product-deliveries?production_id=X
router.get('/', async (req, res) => {
  try {
    const { production_id } = req.query;
    const vals = [];
    let query = 'SELECT * FROM product_deliveries';
    if (production_id) { query += ' WHERE production_id = $1'; vals.push(production_id); }
    query += ' ORDER BY created_at ASC';
    const { rows } = await db.query(query, vals);
    // Enrich with carrier info
    rows.forEach(r => { r._carrier = detectCarrier(r.tracking_number); });
    res.json(rows);
  } catch (err) {
    console.error('GET /product-deliveries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/product-deliveries/summary?production_id=X — lightweight count for dashboard
router.get('/summary', async (req, res) => {
  try {
    const { production_id } = req.query;
    if (!production_id) return res.json({ total: 0, delivered: 0 });
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE delivery_status = 'Delivered')::int AS delivered
       FROM product_deliveries WHERE production_id = $1`,
      [production_id]
    );
    res.json(rows[0] || { total: 0, delivered: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/product-deliveries
router.post('/', requireEditor, async (req, res) => {
  try {
    const { production_id, casting_id, recipient_name, recipient_email, recipient_phone,
            phone_country_code, address_street, address_apt, address_city, address_state,
            address_zip, address_country, product_name, product_description, product_quantity,
            shipping_company, tracking_number, shipping_cost, shipping_date, expected_delivery,
            delivery_status, return_required, notes } = req.body;
    if (!production_id || !recipient_name) return res.status(400).json({ error: 'production_id and recipient_name required' });
    const { rows } = await db.query(
      `INSERT INTO product_deliveries (production_id, casting_id, recipient_name, recipient_email,
        recipient_phone, phone_country_code, address_street, address_apt, address_city, address_state,
        address_zip, address_country, product_name, product_description, product_quantity,
        shipping_company, tracking_number, shipping_cost, shipping_date, expected_delivery,
        delivery_status, return_required, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [production_id, casting_id || null, recipient_name, recipient_email || '',
       recipient_phone || '', phone_country_code || '+1',
       address_street || '', address_apt || '', address_city || '', address_state || '',
       address_zip || '', address_country || 'US',
       product_name || '', product_description || '', product_quantity || 1,
       shipping_company || '', tracking_number || '', shipping_cost || 0,
       shipping_date || null, expected_delivery || null,
       delivery_status || 'Pending', return_required || false, notes || '']
    );
    logAction(req, 'product_delivery_create', production_id, { recipient_name });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /product-deliveries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/product-deliveries/:id
router.patch('/:id', requireEditor, async (req, res) => {
  try {
    const allowed = [
      'recipient_name', 'recipient_email', 'recipient_phone', 'phone_country_code',
      'address_street', 'address_apt', 'address_city', 'address_state', 'address_zip', 'address_country',
      'product_name', 'product_description', 'product_quantity',
      'shipping_company', 'tracking_number', 'shipping_cost', 'shipping_date', 'expected_delivery',
      'delivery_status', 'return_required', 'return_tracking', 'return_status',
      'confirmation_photo_url', 'notes', 'casting_id',
    ];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

    // Check if status changed to 'Shipped' for email notification
    const oldStatus = req.body._old_status;
    const newStatus = req.body.delivery_status;

    const sets = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
    const vals = updates.map(([, v]) => v);
    const { rows } = await db.query(
      `UPDATE product_deliveries SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...vals]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    // Enrich with carrier
    rows[0]._carrier = detectCarrier(rows[0].tracking_number);

    // Email notification when status changes to "Shipped"
    if (newStatus === 'Shipped' && oldStatus !== 'Shipped' && rows[0].recipient_email) {
      const carrier = detectCarrier(rows[0].tracking_number);
      const trackingHtml = carrier
        ? `<p><a href="${carrier.url}" style="color:#1a73e8;font-weight:bold;text-decoration:none;">Track your package (${carrier.name})</a></p>`
        : rows[0].tracking_number ? `<p>Tracking number: <strong>${rows[0].tracking_number}</strong></p>` : '';
      const prodName = rows[0].product_name || 'your product';
      sendEmail({
        to: rows[0].recipient_email,
        subject: `Your product has been shipped! 📦`,
        htmlBody: `
          <div style="font-family:Arial,sans-serif;max-width:500px;">
            <h2 style="color:#333;">Your product is on its way! 🚀</h2>
            <p>Hi ${rows[0].recipient_name},</p>
            <p>Great news — <strong>${prodName}</strong> has been shipped to you${rows[0].shipping_company ? ' via <strong>' + rows[0].shipping_company + '</strong>' : ''}.</p>
            ${trackingHtml}
            ${rows[0].expected_delivery ? '<p style="color:#666;">Expected delivery: <strong>' + new Date(rows[0].expected_delivery).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '</strong></p>' : ''}
            <p style="color:#999;font-size:12px;margin-top:24px;">If you have any questions, please reply to this email.</p>
          </div>`,
        skipDefaultCc: true,
      }).catch(e => console.error('Delivery email failed:', e.message));
    }

    logAction(req, 'product_delivery_update', rows[0].production_id, { id: req.params.id, fields: updates.map(([k]) => k) });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /product-deliveries/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/product-deliveries/bulk-status
router.patch('/bulk-status', requireEditor, async (req, res) => {
  try {
    const { ids, delivery_status } = req.body;
    if (!ids?.length || !delivery_status) return res.status(400).json({ error: 'ids and delivery_status required' });
    const { rows } = await db.query(
      `UPDATE product_deliveries SET delivery_status = $1, updated_at = NOW() WHERE id = ANY($2) RETURNING *`,
      [delivery_status, ids]
    );
    res.json(rows);
  } catch (err) {
    console.error('PATCH /product-deliveries/bulk-status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/product-deliveries/:id
router.delete('/:id', requireEditor, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM product_deliveries WHERE id = $1 RETURNING id, production_id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    logAction(req, 'product_delivery_delete', rows[0].production_id, { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /product-deliveries/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/product-deliveries/sync-contracts — pull contract data into delivery records
router.post('/sync-contracts', requireEditor, async (req, res) => {
  try {
    const { production_id } = req.body;
    if (!production_id) return res.status(400).json({ error: 'production_id required' });

    // Get all contracts for this production
    const { rows: contracts } = await db.query(
      `SELECT provider_name, provider_email, provider_phone, provider_address, status
       FROM contracts WHERE production_id LIKE $1`,
      [`${production_id}%`]
    );

    let updated = 0;
    for (const c of contracts) {
      if (!c.provider_name) continue;
      const name = c.provider_name.trim().toLowerCase();

      // Parse address
      let addressFields = {};
      if (c.provider_address) {
        const parts = c.provider_address.split(',').map(s => s.trim());
        if (parts.length >= 3) {
          addressFields.address_street = parts[0] || '';
          addressFields.address_city = parts[1] || '';
          if (parts.length >= 5) {
            addressFields.address_state = parts[2] || '';
            addressFields.address_country = parts[3] || '';
            addressFields.address_zip = parts[parts.length - 1] || '';
          } else {
            addressFields.address_country = parts[2] || '';
            addressFields.address_zip = parts[parts.length - 1] || '';
          }
        } else {
          addressFields.address_street = c.provider_address;
        }
      }

      // Update delivery records: fill in missing email, phone + address
      const sets = [];
      const vals = [];
      let idx = 1;
      if (c.provider_email) { sets.push(`recipient_email = CASE WHEN recipient_email = '' OR recipient_email IS NULL THEN $${idx} ELSE recipient_email END`); vals.push(c.provider_email); idx++; }
      if (c.provider_phone) { sets.push(`recipient_phone = CASE WHEN recipient_phone = '' OR recipient_phone IS NULL THEN $${idx} ELSE recipient_phone END`); vals.push(c.provider_phone); idx++; }
      for (const [k, v] of Object.entries(addressFields)) {
        if (v) { sets.push(`${k} = CASE WHEN ${k} = '' OR ${k} IS NULL THEN $${idx} ELSE ${k} END`); vals.push(v); idx++; }
      }
      if (sets.length === 0) continue;

      vals.push(production_id, name);
      const { rowCount } = await db.query(
        `UPDATE product_deliveries SET ${sets.join(', ')}, updated_at = NOW()
         WHERE production_id = $${idx} AND LOWER(TRIM(recipient_name)) = $${idx + 1}`,
        vals
      );
      if (rowCount > 0) updated++;
    }

    res.json({ synced: updated, total_contracts: contracts.length });
  } catch (err) {
    console.error('POST /product-deliveries/sync-contracts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
