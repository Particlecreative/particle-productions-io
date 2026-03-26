const router = require('express').Router();
const db     = require('../db');
const crypto = require('crypto');
const { verifyJWT } = require('../middleware/auth');

// ── Token helper ──────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Slack webhook helper ──────────────────────────────
async function notifySlack(message) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch (e) {
    console.warn('Slack notification failed:', e.message);
  }
}

// ════════════════════════════════════════════════════════
// PUBLIC endpoints — no JWT required (must be BEFORE verifyJWT)
// ════════════════════════════════════════════════════════

// GET /api/contracts/sign/:id/:token — fetch contract for signing (public)
router.get('/sign/:id/:token', async (req, res) => {
  try {
    const { id, token } = req.params;
    // Verify token matches a contract_signatures record
    const { rows: sigRows } = await db.query(
      `SELECT cs.*, c.provider_name, c.provider_email, c.status AS contract_status,
              c.production_id, c.events, c.pdf_url,
              p.project_name, p.producer
       FROM contract_signatures cs
       JOIN contracts c ON cs.contract_id = c.id
       LEFT JOIN productions p ON c.production_id = p.id
       WHERE cs.contract_id = $1 AND cs.token = $2`,
      [id, token]
    );
    if (sigRows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired signing link' });
    }
    const sig = sigRows[0];
    if (sig.signed_at) {
      return res.status(400).json({ error: 'This contract has already been signed', already_signed: true });
    }
    res.json({
      contract_id: id,
      signer_role: sig.signer_role,
      signer_name: sig.signer_name,
      signer_email: sig.signer_email,
      provider_name: sig.provider_name,
      provider_email: sig.provider_email,
      project_name: sig.project_name,
      producer: sig.producer,
      production_id: sig.production_id,
      contract_status: sig.contract_status,
      pdf_url: sig.pdf_url,
    });
  } catch (err) {
    console.error('GET /sign/:id/:token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/contracts/sign/:id/:token — submit signature (public)
router.post('/sign/:id/:token', async (req, res) => {
  try {
    const { id, token } = req.params;
    const { signature_data, signer_name } = req.body;

    if (!signature_data) {
      return res.status(400).json({ error: 'Signature data is required' });
    }

    // Verify token
    const { rows: sigRows } = await db.query(
      `SELECT cs.*, c.events, c.status AS contract_status
       FROM contract_signatures cs
       JOIN contracts c ON cs.contract_id = c.id
       WHERE cs.contract_id = $1 AND cs.token = $2`,
      [id, token]
    );
    if (sigRows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired signing link' });
    }
    const sig = sigRows[0];
    if (sig.signed_at) {
      return res.status(400).json({ error: 'Already signed', already_signed: true });
    }

    const now = new Date().toISOString();

    // Save signature
    await db.query(
      `UPDATE contract_signatures
       SET signature_data = $1, signed_at = $2, signer_name = COALESCE($3, signer_name)
       WHERE id = $4`,
      [signature_data, now, signer_name || null, sig.id]
    );

    // Add event to contract events array
    const events = Array.isArray(sig.events) ? sig.events : [];
    events.push({
      type: 'signed',
      role: sig.signer_role,
      name: signer_name || sig.signer_name,
      at: now,
    });
    await db.query(
      `UPDATE contracts SET events = $1 WHERE id = $2`,
      [JSON.stringify(events), id]
    );

    // Check if ALL signers have now signed
    const { rows: allSigs } = await db.query(
      `SELECT signed_at FROM contract_signatures WHERE contract_id = $1`,
      [id]
    );
    const allSigned = allSigs.every(s => s.signed_at !== null);

    // Slack notification — individual signer
    const roleLabel = sig.signer_role === 'hocp' ? 'HOCP' : 'provider';
    notifySlack(`✍️ Contract signed by ${roleLabel}: ${id} — ${signer_name || sig.signer_name}`);

    if (allSigned) {
      // Mark contract as fully signed
      events.push({ type: 'completed', at: now });
      await db.query(
        `UPDATE contracts SET status = 'signed', signed_at = $1, events = $2 WHERE id = $3`,
        [now, JSON.stringify(events), id]
      );
      // Slack notification — fully signed
      notifySlack(`✅ Contract fully signed: ${id} — ${signer_name || sig.signer_name}`);
    }

    res.json({ success: true, all_signed: allSigned });
  } catch (err) {
    console.error('POST /sign/:id/:token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════
// PROTECTED endpoints — JWT required
// ════════════════════════════════════════════════════════
router.use(verifyJWT);

// GET /api/contracts — all contracts
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM contracts ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/contracts/:production_id
router.get('/:production_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM contracts WHERE production_id = $1',
      [req.params.production_id]
    );
    res.json(rows[0] ?? null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/contracts/:production_id  (upsert)
router.put('/:production_id', async (req, res) => {
  const { provider_name, provider_email, status, sent_at, signed_at, pdf_url, events, drive_url, dropbox_url } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO contracts (production_id, provider_name, provider_email, status, sent_at, signed_at, pdf_url, events, drive_url, dropbox_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (production_id) DO UPDATE SET
         provider_name  = EXCLUDED.provider_name,
         provider_email = EXCLUDED.provider_email,
         status         = EXCLUDED.status,
         sent_at        = EXCLUDED.sent_at,
         signed_at      = EXCLUDED.signed_at,
         pdf_url        = EXCLUDED.pdf_url,
         events         = COALESCE(EXCLUDED.events, contracts.events),
         drive_url      = COALESCE(EXCLUDED.drive_url, contracts.drive_url),
         dropbox_url    = COALESCE(EXCLUDED.dropbox_url, contracts.dropbox_url)
       RETURNING *`,
      [
        req.params.production_id,
        provider_name,
        provider_email,
        status || 'none',
        sent_at || null,
        signed_at || null,
        pdf_url || null,
        events ? JSON.stringify(events) : '[]',
        drive_url || null,
        dropbox_url || null,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /contracts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/contracts/:production_id/generate — generate contract & signing tokens
router.post('/:production_id/generate', async (req, res) => {
  const { provider_name, provider_email, hocp_name, hocp_email } = req.body;
  const prodId = req.params.production_id;

  try {
    // Check if contract already exists for this production key
    const { rows: existing } = await db.query(
      'SELECT * FROM contracts WHERE production_id = $1', [prodId]
    );
    let contract;
    const now = new Date().toISOString();
    if (existing[0]) {
      // Update existing
      const newEvent = JSON.stringify({ type: 'regenerated', at: now });
      const { rows } = await db.query(
        `UPDATE contracts SET
           provider_name = $2, provider_email = $3,
           status = CASE WHEN status = 'signed' THEN status ELSE 'pending' END,
           events = COALESCE(events, '[]'::jsonb) || $4::jsonb
         WHERE production_id = $1 RETURNING *`,
        [prodId, provider_name, provider_email, newEvent]
      );
      contract = rows[0];
    } else {
      // Create new
      const { rows } = await db.query(
        `INSERT INTO contracts (production_id, provider_name, provider_email, status, events)
         VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
        [prodId, provider_name, provider_email, JSON.stringify([{ type: 'created', at: now }])]
      );
      contract = rows[0];
    }

    // Delete old unsigned signatures for this contract (keep signed ones)
    await db.query(
      `DELETE FROM contract_signatures WHERE contract_id = $1 AND signed_at IS NULL`,
      [contract.id]
    );

    // Create signing tokens for provider
    const providerToken = generateToken();
    await db.query(
      `INSERT INTO contract_signatures (contract_id, signer_role, signer_name, signer_email, token)
       VALUES ($1, 'provider', $2, $3, $4)`,
      [contract.id, provider_name, provider_email, providerToken]
    );

    // Create signing token for HOCP
    const hocpToken = generateToken();
    await db.query(
      `INSERT INTO contract_signatures (contract_id, signer_role, signer_name, signer_email, token)
       VALUES ($1, 'hocp', $2, $3, $4)`,
      [contract.id, hocp_name || 'Omer Barak', hocp_email || 'omer@particleformen.com', hocpToken]
    );

    // Build signing URLs
    const baseUrl = process.env.APP_URL || req.headers.origin || 'http://localhost:5173';
    const providerSignUrl = `${baseUrl}/sign/${contract.id}/${providerToken}`;
    const hocpSignUrl     = `${baseUrl}/sign/${contract.id}/${hocpToken}`;

    // Slack notification — contract generated
    notifySlack(`📄 Contract generated: ${prodId} — ${provider_name}`);

    res.json({
      contract,
      signing_links: {
        provider: { url: providerSignUrl, name: provider_name, email: provider_email },
        hocp:     { url: hocpSignUrl,     name: hocp_name || 'Omer Barak', email: hocp_email || 'omer@particleformen.com' },
      },
    });
  } catch (err) {
    console.error('POST /contracts/generate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/contracts/:production_id/signatures — get signature status
router.get('/:production_id/signatures', async (req, res) => {
  try {
    const { rows: contractRows } = await db.query(
      'SELECT * FROM contracts WHERE production_id = $1',
      [req.params.production_id]
    );
    if (!contractRows.length) return res.json({ signatures: [] });

    const { rows: sigs } = await db.query(
      `SELECT id, signer_role, signer_name, signer_email, signed_at, token, created_at
       FROM contract_signatures WHERE contract_id = $1 ORDER BY created_at`,
      [contractRows[0].id]
    );

    // Build signing URLs for unsigned ones
    const baseUrl = process.env.APP_URL || req.headers.origin || 'http://localhost:5173';
    const signatures = sigs.map(s => ({
      ...s,
      sign_url: s.signed_at ? null : `${baseUrl}/sign/${contractRows[0].id}/${s.token}`,
    }));

    res.json({ contract: contractRows[0], signatures });
  } catch (err) {
    console.error('GET /contracts/signatures error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
