const router = require('express').Router();
const db     = require('../db');
const crypto = require('crypto');
const { verifyJWT } = require('../middleware/auth');
const { sendEmail } = require('./gmail');

// ── Token helper ──────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Slack webhook helper ──────────────────────────────
const APP_BASE = process.env.APP_URL || 'https://particlepdio.particleface.com';
async function notifySlack(message, link, { sandbox = false } = {}) {
  const text = link ? `${message}\n<${link}|View in CP Panel>` : message;

  if (sandbox) {
    // In sandbox/test mode → DM to Tomer via Slack Bot
    return slackDM(text);
  }

  // Normal mode → post to #cp-contracts channel via webhook
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.warn('Slack notification failed:', e.message);
  }
}

// Send DM to Tomer via Slack Bot API
async function slackDM(text) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) { console.warn('Slack DM skipped: SLACK_BOT_TOKEN missing'); return; }
  try {
    // Find Tomer's Slack user ID by email
    const lookupRes = await fetch('https://slack.com/api/users.lookupByEmail?' + new URLSearchParams({ email: 'tomer@particleformen.com' }), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const lookup = await lookupRes.json();
    if (!lookup.ok) { console.warn('Slack user lookup failed:', lookup.error); return; }
    const userId = lookup.user.id;

    // Open DM channel
    const openRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: userId }),
    });
    const open = await openRes.json();
    if (!open.ok) { console.warn('Slack DM open failed:', open.error); return; }

    // Send message
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: open.channel.id, text }),
    });
  } catch (e) {
    console.warn('Slack DM failed:', e.message);
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
              c.exhibit_a, c.exhibit_b, c.fee_amount, c.payment_terms,
              c.provider_id_number, c.provider_address,
              c.currency, c.contract_type, c.effective_date,
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
      return res.status(400).json({ error: 'This contract has already been signed', already_signed: true, signed_at: sig.signed_at, signature_data: sig.signature_data, signer_name: sig.signer_name });
    }
    res.json({
      contract_id: id,
      signer_role: sig.signer_role,
      signer_name: sig.signer_name,
      signer_email: sig.signer_email,
      provider_name: sig.provider_name,
      provider_email: sig.provider_email,
      provider_id_number: sig.provider_id_number,
      provider_address: sig.provider_address,
      project_name: sig.project_name,
      producer: sig.producer,
      production_id: sig.production_id,
      contract_status: sig.contract_status,
      pdf_url: sig.pdf_url,
      exhibit_a: sig.exhibit_a,
      exhibit_b: sig.exhibit_b,
      fee_amount: sig.fee_amount,
      payment_terms: sig.payment_terms,
      currency: sig.currency || 'USD',
      contract_type: sig.contract_type || 'crew',
      effective_date: sig.effective_date,
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
    const { signature_data, signer_name, signer_id_number } = req.body;

    if (!signature_data) {
      return res.status(400).json({ error: 'Signature data is required' });
    }

    // Verify token
    const { rows: sigRows } = await db.query(
      `SELECT cs.*, c.events, c.status AS contract_status, c.production_id,
              c.provider_name, c.provider_email,
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
      return res.status(400).json({ error: 'Already signed', already_signed: true });
    }

    const now = new Date().toISOString();

    // Save signature
    await db.query(
      `UPDATE contract_signatures
       SET signature_data = $1, signed_at = $2, signer_name = COALESCE($3, signer_name), signer_id_number = COALESCE($4, signer_id_number)
       WHERE id = $5`,
      [signature_data, now, signer_name || null, signer_id_number || null, sig.id]
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

    // Auto-sign on behalf of Particle (HOCP) when provider signs
    if (sig.signer_role === 'provider') {
      const { rows: hocpSigs } = await db.query(
        `SELECT * FROM contract_signatures WHERE contract_id = $1 AND signer_role = 'hocp' AND signed_at IS NULL`,
        [id]
      );
      for (const hocpSig of hocpSigs) {
        await db.query(
          `UPDATE contract_signatures
           SET signed_at = $1, signer_name = 'Tomer Wilf Lezmy', signer_id_number = 'Head of Creative Production'
           WHERE id = $2`,
          [now, hocpSig.id]
        );
        events.push({
          type: 'signed',
          role: 'hocp',
          name: 'Tomer Wilf Lezmy',
          title: 'Head of Creative Production',
          at: now,
        });
        await db.query(
          `UPDATE contracts SET events = $1 WHERE id = $2`,
          [JSON.stringify(events), id]
        );
      }
    }

    // Check if ALL signers have now signed
    const { rows: allSigs } = await db.query(
      `SELECT signed_at FROM contract_signatures WHERE contract_id = $1`,
      [id]
    );
    const allSigned = allSigs.every(s => s.signed_at !== null);

    // Slack notification — individual signer
    const roleLabel = sig.signer_role === 'hocp' ? 'HOCP' : 'provider';
    const projectLabel = sig.project_name || sig.production_id;
    const prdId = sig.production_id;
    const prdShort = prdId && prdId.startsWith('PRD') ? prdId.split('_')[0] : prdId;
    notifySlack(`\u270d\ufe0f Contract signed by ${roleLabel}: [${prdShort}] ${projectLabel} \u2014 ${signer_name || sig.signer_name}\nView: ${APP_BASE}/production/${prdId}`);

    if (allSigned) {
      // Mark contract as fully signed
      events.push({ type: 'completed', at: now });
      await db.query(
        `UPDATE contracts SET status = 'signed', signed_at = $1, events = $2 WHERE id = $3`,
        [now, JSON.stringify(events), id]
      );
      // Slack notification — fully signed
      notifySlack(`\u2705 Contract fully signed: [${prdShort}] ${projectLabel} \u2014 ${sig.provider_name || signer_name}\nView: ${APP_BASE}/production/${prdId}`);

      // Email all parties — contract completed
      // Gather document history from events
      const allEvents = events;
      const createdEvent = allEvents.find(e => e.type === 'created');
      const sentEvent = allEvents.find(e => e.type === 'sent');
      const signedEvents = allEvents.filter(e => e.type === 'signed');
      const completedEvent = allEvents.find(e => e.type === 'completed');

      // Fetch drive_url for PDF link
      const { rows: contractInfo } = await db.query('SELECT drive_url FROM contracts WHERE id = $1', [id]);
      const driveUrl = contractInfo[0]?.drive_url;

      const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';

      const historyHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          ${createdEvent ? `<tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Contract Created</td><td style="padding: 6px 0; font-size: 13px;">${formatDate(createdEvent.at)}</td></tr>` : ''}
          ${sentEvent ? `<tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Sent to ${sig.provider_name}</td><td style="padding: 6px 0; font-size: 13px;">${formatDate(sentEvent.at)}</td></tr>` : ''}
          ${signedEvents.map(se => `<tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Signed by ${se.name || se.role}</td><td style="padding: 6px 0; font-size: 13px;">${formatDate(se.at)}</td></tr>`).join('')}
          ${completedEvent ? `<tr><td style="padding: 6px 0; color: #666; font-size: 13px; font-weight: bold;">Completed</td><td style="padding: 6px 0; font-size: 13px; font-weight: bold;">${formatDate(completedEvent.at)}</td></tr>` : ''}
        </table>
      `;

      const completedSubject = `Contract Signed & Completed: ${projectLabel} — ${sig.provider_name}`;
      const completedBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #2e7d32;">&#9989; Contract Fully Signed</h2>
          <p>The contract for <strong>${projectLabel}</strong> with <strong>${sig.provider_name}</strong> has been signed by all parties.</p>
          ${driveUrl ? `<p><a href="${driveUrl}" style="color: #1a73e8; text-decoration: none; font-weight: bold;">&#128196; View Signed PDF in Google Drive</a></p>` : ''}
          <h3 style="color: #333; font-size: 14px; margin-top: 24px;">Document History</h3>
          ${historyHtml}
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #aaa; font-size: 11px;">Sent via CP Panel — Particle Aesthetic Science Ltd.</p>
        </div>
      `;
      // Send to provider + Tomer + Omer
      sendEmail({ to: sig.provider_email, subject: completedSubject, htmlBody: completedBody }).catch(() => {});
      sendEmail({ to: 'tomer@particleformen.com', subject: completedSubject, htmlBody: completedBody }).catch(() => {});
      sendEmail({ to: 'omer@particleformen.com', subject: completedSubject, htmlBody: completedBody }).catch(() => {});
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
  const {
    provider_name, provider_email, status, sent_at, signed_at, pdf_url, events,
    drive_url, dropbox_url,
    exhibit_a, exhibit_b, fee_amount, payment_terms,
    provider_id_number, provider_address, contract_pdf_base64,
    currency, contract_type, effective_date,
  } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO contracts (
         production_id, provider_name, provider_email, status, sent_at, signed_at, pdf_url, events,
         drive_url, dropbox_url,
         exhibit_a, exhibit_b, fee_amount, payment_terms,
         provider_id_number, provider_address, contract_pdf_base64,
         currency, contract_type, effective_date
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (production_id) DO UPDATE SET
         provider_name      = COALESCE(EXCLUDED.provider_name,      contracts.provider_name),
         provider_email     = COALESCE(EXCLUDED.provider_email,     contracts.provider_email),
         status             = COALESCE(EXCLUDED.status,             contracts.status),
         sent_at            = COALESCE(EXCLUDED.sent_at,            contracts.sent_at),
         signed_at          = COALESCE(EXCLUDED.signed_at,          contracts.signed_at),
         pdf_url            = COALESCE(EXCLUDED.pdf_url,            contracts.pdf_url),
         events             = COALESCE(EXCLUDED.events,             contracts.events),
         drive_url          = COALESCE(EXCLUDED.drive_url,          contracts.drive_url),
         dropbox_url        = COALESCE(EXCLUDED.dropbox_url,        contracts.dropbox_url),
         exhibit_a          = COALESCE(EXCLUDED.exhibit_a,          contracts.exhibit_a),
         exhibit_b          = COALESCE(EXCLUDED.exhibit_b,          contracts.exhibit_b),
         fee_amount         = COALESCE(EXCLUDED.fee_amount,         contracts.fee_amount),
         payment_terms      = COALESCE(EXCLUDED.payment_terms,      contracts.payment_terms),
         provider_id_number = COALESCE(EXCLUDED.provider_id_number, contracts.provider_id_number),
         provider_address   = COALESCE(EXCLUDED.provider_address,   contracts.provider_address),
         contract_pdf_base64= COALESCE(EXCLUDED.contract_pdf_base64,contracts.contract_pdf_base64),
         currency           = COALESCE(EXCLUDED.currency,           contracts.currency),
         contract_type      = COALESCE(EXCLUDED.contract_type,      contracts.contract_type),
         effective_date     = COALESCE(EXCLUDED.effective_date,     contracts.effective_date)
       RETURNING *`,
      [
        req.params.production_id,
        provider_name || null,
        provider_email || null,
        status || 'none',
        sent_at || null,
        signed_at || null,
        pdf_url || null,
        events ? JSON.stringify(events) : '[]',
        drive_url || null,
        dropbox_url || null,
        exhibit_a || null,
        exhibit_b || null,
        fee_amount || null,
        payment_terms || null,
        provider_id_number || null,
        provider_address || null,
        contract_pdf_base64 || null,
        currency || null,
        contract_type || null,
        effective_date || null,
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
  const {
    provider_name, provider_email, hocp_name, hocp_email,
    exhibit_a, exhibit_b, fee_amount, payment_terms,
    sandbox,
  } = req.body;
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
           events = COALESCE(events, '[]'::jsonb) || $4::jsonb,
           exhibit_a = COALESCE($5, exhibit_a),
           exhibit_b = COALESCE($6, exhibit_b),
           fee_amount = COALESCE($7, fee_amount),
           payment_terms = COALESCE($8, payment_terms)
         WHERE production_id = $1 RETURNING *`,
        [prodId, provider_name, provider_email, newEvent,
         exhibit_a || null, exhibit_b || null, fee_amount || null, payment_terms || null]
      );
      contract = rows[0];
    } else {
      // Create new
      const { rows } = await db.query(
        `INSERT INTO contracts (production_id, provider_name, provider_email, status, events,
                                exhibit_a, exhibit_b, fee_amount, payment_terms)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8) RETURNING *`,
        [prodId, provider_name, provider_email, JSON.stringify([{ type: 'created', at: now }]),
         exhibit_a || null, exhibit_b || null, fee_amount || null, payment_terms || null]
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
      [contract.id, hocp_name || 'Tomer Wilf Lezmy', hocp_email || 'tomer@particleformen.com', hocpToken]
    );

    // Build signing URLs
    const baseUrl = process.env.APP_URL || req.headers.origin || 'http://localhost:5173';
    const providerSignUrl = `${baseUrl}/sign/${contract.id}/${providerToken}`;
    const hocpSignUrl     = `${baseUrl}/sign/${contract.id}/${hocpToken}`;

    // Get production name for notifications
    let projectName = prodId;
    try {
      const { rows: prodRows } = await db.query('SELECT project_name FROM productions WHERE id = $1', [prodId]);
      if (prodRows[0]) projectName = prodRows[0].project_name;
    } catch (_) {}

    // Slack notification — contract generated/sent
    const slackPrefix = req.body.sandbox ? '[TEST] ' : '';
    const prdLabel = prodId.startsWith('PRD') ? prodId.split('_')[0] : prodId;
    notifySlack(`${slackPrefix}\ud83d\udcc4 Contract sent: [${prdLabel}] ${projectName} \u2014 ${provider_name}`, `${APP_BASE}/production/${prodId}`, { sandbox: !!req.body.sandbox });

    // Auto-send email to provider via Gmail API (fire-and-forget)
    sendEmail({
      to: provider_email,
      skipDefaultCc: !!sandbox,
      subject: `${sandbox ? '[TEST] ' : ''}Contract for ${projectName} — ${provider_name}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          ${sandbox ? '<div style="background:#fef3c7;border:2px solid #f59e0b;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-weight:bold;color:#92400e;">[TEST] Sandbox Mode</div>' : ''}
          <h2 style="color: #030b2e;">Contract Ready for Signature</h2>
          <p>Hi ${provider_name},</p>
          <p>A contract has been prepared for <strong>${projectName}</strong>.</p>
          <p>Please review and sign the contract by clicking the link below:</p>
          <p style="margin: 24px 0;">
            <a href="${providerSignUrl}" style="background: #0808f8; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Review & Sign Contract
            </a>
          </p>
          <p style="color: #888; font-size: 13px;">If the button doesn't work, copy this link: ${providerSignUrl}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #aaa; font-size: 11px;">Sent via CP Panel — Particle Aesthetic Science Ltd.</p>
        </div>
      `,
    }).catch(() => {}); // Non-blocking

    res.json({
      contract,
      signing_links: {
        provider: { url: providerSignUrl, name: provider_name, email: provider_email },
        hocp:     { url: hocpSignUrl,     name: hocp_name || 'Tomer Wilf Lezmy', email: hocp_email || 'tomer@particleformen.com' },
      },
      emailSent: true,
    });
  } catch (err) {
    console.error('POST /contracts/generate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/contracts/notify-slack — send a Slack notification from the frontend
router.post('/notify-slack', async (req, res) => {
  try {
    const { message, sandbox, link } = req.body;
    await notifySlack(message || 'Contract notification', link, { sandbox: !!sandbox });
    res.json({ ok: true });
  } catch (err) {
    console.warn('POST /contracts/notify-slack error:', err.message);
    res.json({ ok: false, error: err.message });
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
