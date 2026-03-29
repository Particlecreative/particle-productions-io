const router    = require('express').Router();
const db        = require('../db');
const crypto    = require('crypto');
const path      = require('path');
const fs        = require('fs');
const rateLimit = require('express-rate-limit');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { verifyJWT } = require('../middleware/auth');
const { sendEmail } = require('./gmail');
const driveRouter = require('./drive');

// Rate limit for signing endpoints (10 attempts per IP per minute)
const signLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many signing attempts. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Tomer's signature image — loaded once at startup
const TOMER_SIG_PATH = path.join(__dirname, '..', 'assets', 'tomer-signature.png');
const TOMER_SIGNATURE_PNG = fs.existsSync(TOMER_SIG_PATH) ? fs.readFileSync(TOMER_SIG_PATH) : null;

// ── Token helper ──────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Slack webhook helper ──────────────────────────────
const APP_BASE = process.env.APP_URL || 'https://particlepdio.particleface.com';
async function notifySlack(message, link) {
  const text = link ? `${message}\n<${link}|View in CP Panel>` : message;

  // Always post to #cp-contracts channel via webhook
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.warn('Slack notification failed:', e.message);
  }
}

// Send DM to Tomer via Slack Bot API
const TOMER_SLACK_ID = 'U07466D6Y9E';
async function slackDM(text) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) { console.warn('Slack DM skipped: SLACK_BOT_TOKEN missing'); return; }
  try {
    // Open DM channel with Tomer's known user ID
    const openRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-type': 'application/json' },
      body: JSON.stringify({ users: TOMER_SLACK_ID }),
    });
    const open = await openRes.json();
    if (!open.ok) { console.warn('Slack DM open failed:', open.error); return; }

    // Send message
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-type': 'application/json' },
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
       LEFT JOIN productions p ON p.id = split_part(c.production_id, '_li_', 1)
       WHERE cs.contract_id = $1 AND cs.token = $2`,
      [id, token]
    );
    if (sigRows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired signing link' });
    }
    const sig = sigRows[0];
    // Token expiry: 30 days from creation
    const tokenAge = Date.now() - new Date(sig.created_at).getTime();
    if (tokenAge > 30 * 24 * 60 * 60 * 1000) {
      return res.status(410).json({ error: 'This signing link has expired (30 days). Please request a new contract.' });
    }
    if (sig.signed_at) {
      // Check if ALL parties signed — if so, include full completion data
      const { rows: allSigs } = await db.query(
        `SELECT signer_role, signer_name, signature_data, signed_at, signer_id_number
         FROM contract_signatures WHERE contract_id = $1 ORDER BY signed_at ASC`, [id]
      );
      const allDone = allSigs.every(s => s.signed_at !== null);
      const { rows: cInfo } = await db.query(
        `SELECT c.*, p.project_name FROM contracts c
         LEFT JOIN productions p ON p.id = split_part(c.production_id, '_li_', 1)
         WHERE c.id = $1`, [id]
      );
      const contract = cInfo[0] || {};
      return res.status(400).json({
        error: 'This contract has already been signed',
        already_signed: true,
        all_signed: allDone,
        signed_at: sig.signed_at,
        signature_data: sig.signature_data,
        signer_name: sig.signer_name,
        // Full contract data for completed view
        contract_data: {
          provider_name: contract.provider_name,
          provider_email: contract.provider_email,
          project_name: contract.project_name || contract.production_id,
          fee_amount: contract.fee_amount,
          currency: contract.currency,
          effective_date: contract.effective_date,
          exhibit_a: contract.exhibit_a,
          exhibit_b: contract.exhibit_b,
          contract_type: contract.contract_type,
          drive_url: contract.drive_url,
          events: contract.events,
        },
        signatures: allSigs.map(s => ({
          role: s.signer_role,
          name: s.signer_name,
          signature: s.signature_data,
          signed_at: s.signed_at,
          id_number: s.signer_id_number,
        })),
      });
    }
    // Fetch HOCP signature status (to show on supplier's signing page)
    let hocpSignature = null;
    try {
      const { rows: hocpRows } = await db.query(
        `SELECT signer_name, signature_data, signed_at FROM contract_signatures
         WHERE contract_id = $1 AND signer_role = 'hocp' LIMIT 1`,
        [id]
      );
      if (hocpRows[0]?.signed_at) {
        hocpSignature = {
          signer_name: hocpRows[0].signer_name,
          signature_data: hocpRows[0].signature_data,
          signed_at: hocpRows[0].signed_at,
        };
      }
    } catch (_) {}

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
      hocp_signature: hocpSignature,
    });
  } catch (err) {
    console.error('GET /sign/:id/:token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/contracts/sign/:id/:token — submit signature (public, rate-limited)
router.post('/sign/:id/:token', signLimiter, async (req, res) => {
  try {
    const { id, token } = req.params;
    const { signature_data, signer_name, signer_id_number, signer_address, agreed_at } = req.body;

    if (!signature_data) {
      return res.status(400).json({ error: 'Signature data is required' });
    }

    // Capture IP + User Agent for legal audit trail
    const signerIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const signerUserAgent = req.headers['user-agent'] || 'unknown';

    // Verify token
    const { rows: sigRows } = await db.query(
      `SELECT cs.*, c.events, c.status AS contract_status, c.production_id,
              c.provider_name, c.provider_email,
              c.fee_amount, c.currency, c.require_hocp_signature,
              p.project_name, p.producer
       FROM contract_signatures cs
       JOIN contracts c ON cs.contract_id = c.id
       LEFT JOIN productions p ON p.id = split_part(c.production_id, '_li_', 1)
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

    // Save signature with IP + user agent for legal audit
    await db.query(
      `UPDATE contract_signatures
       SET signature_data = $1, signed_at = $2, signer_name = COALESCE($3, signer_name),
           signer_id_number = COALESCE($4, signer_id_number),
           ip_address = $6, user_agent = $7, agreed_at = $8
       WHERE id = $5`,
      [signature_data, now, signer_name || null, signer_id_number || null, sig.id,
       signerIp, signerUserAgent, agreed_at || now]
    );

    // Update main contract with provider-filled details (ID + address)
    if (sig.signer_role === 'provider' && (signer_id_number || signer_address)) {
      const updates = [];
      const vals = [];
      let idx = 1;
      if (signer_id_number) { updates.push(`provider_id_number = $${idx}`); vals.push(signer_id_number); idx++; }
      if (signer_address) { updates.push(`provider_address = $${idx}`); vals.push(signer_address); idx++; }
      if (updates.length) {
        vals.push(id);
        await db.query(`UPDATE contracts SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
      }
    }

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

    // Variables used in both HOCP and individual signer notifications
    const projectLabel = sig.project_name || sig.production_id;
    const prdId = sig.production_id;
    const prdShort = prdId ? prdId.split('_li_')[0] : prdId;
    const feeDisplay = sig.fee_amount ? `${Number(sig.fee_amount).toLocaleString()} ${sig.currency || 'USD'}` : '';

    // If HOCP just signed AND require_hocp_signature is true → auto-send email to supplier
    if (sig.signer_role === 'hocp' && sig.require_hocp_signature) {
      // Get provider's signing token
      const { rows: providerSigs } = await db.query(
        `SELECT token, signer_name, signer_email FROM contract_signatures
         WHERE contract_id = $1 AND signer_role = 'provider' AND signed_at IS NULL`,
        [id]
      );
      if (providerSigs.length > 0) {
        const provSig = providerSigs[0];
        const baseUrl = process.env.APP_URL || 'https://particlepdio.particleface.com';
        const providerSignUrl = `${baseUrl}/sign/${id}/${provSig.token}`;

        // Send email to supplier
        sendEmail({
          to: sig.provider_email,
          skipDefaultCc: false,
          subject: `Services Agreement - ${projectLabel}`,
          htmlBody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
              <h2 style="color: #030b2e;">Contract Ready for Signature</h2>
              <p>Hi ${sig.provider_name},</p>
              <p>A contract has been prepared for <strong>${projectLabel}</strong>.</p>
              <p>Please review and sign the contract by clicking the link below:</p>
              <p style="margin: 24px 0;">
                <a href="${providerSignUrl}" style="background: #0808f8; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  Review & Sign Contract
                </a>
              </p>
              <p style="color: #888; font-size: 13px;">If the button doesn't work, copy this link: ${providerSignUrl}</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="color: #aaa; font-size: 11px;">Sent via CP Panel — Particle Aesthetic Science Ltd.</p>
            </div>`,
        }).catch(() => {});

        // Update contract status to 'sent'
        await db.query(`UPDATE contracts SET status = 'sent', sent_at = $1 WHERE id = $2`, [now, id]);
        // Slack: HOCP signed, contract now sent to supplier
        notifySlack(`✍️ HOCP signed — contract sent to ${sig.provider_name}\nProduction: ${projectLabel}`, `${APP_BASE}/production/${prdShort}?contract=true`);
      }
    }

    // Check if ALL signers have now signed
    const { rows: allSigs } = await db.query(
      `SELECT signed_at FROM contract_signatures WHERE contract_id = $1`,
      [id]
    );
    const allSigned = allSigs.every(s => s.signed_at !== null);

    // Slack notification — individual signer (simple, no PDF)
    notifySlack(`✍️ Contract signed by ${signer_name || sig.signer_name}\nProduction: ${projectLabel}`, `${APP_BASE}/production/${prdShort}?contract=true`);

    if (allSigned) {
      // Mark contract as fully signed
      events.push({ type: 'completed', at: now });
      await db.query(
        `UPDATE contracts SET status = 'signed', signed_at = $1, events = $2, completion_email_sent_at = $1 WHERE id = $3`,
        [now, JSON.stringify(events), id]
      );
      console.log(`Contract ${id} fully signed — generating PDF + sending notifications`);

      // ── Generate full signed PDF with pdf-lib ──
      let driveUrl = null;
      try {
        const { rows: cInfo } = await db.query(
          `SELECT * FROM contracts WHERE id = $1`, [id]
        );
        const c = cInfo[0] || {};
        const { rows: signatures } = await db.query(
          `SELECT signer_role, signer_name, signer_id_number, signature_data, signed_at, ip_address
           FROM contract_signatures WHERE contract_id = $1 ORDER BY signed_at ASC`, [id]
        );

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const W = 595; const H = 842; const M = 50; const CW = W - M * 2;

        // Helper: add text with word wrap and auto-pagination
        let page = pdfDoc.addPage([W, H]);
        let y = H - M;
        function checkPage(needed = 30) {
          if (y < M + needed) { page = pdfDoc.addPage([W, H]); y = H - M; }
        }
        function drawTitle(text) { checkPage(40); page.drawText(text, { x: M, y, size: 14, font: bold, color: rgb(0.01, 0.04, 0.18) }); y -= 24; }
        function drawHeading(text) { checkPage(30); page.drawText(text, { x: M, y, size: 11, font: bold }); y -= 18; }
        function drawParagraph(text) {
          if (!text) return;
          const words = text.split(' ');
          let line = '';
          for (const word of words) {
            const test = line ? line + ' ' + word : word;
            const tw = font.widthOfTextAtSize(test, 9.5);
            if (tw > CW && line) {
              checkPage(14);
              page.drawText(line, { x: M, y, size: 9.5, font, color: rgb(0.25, 0.25, 0.25) });
              y -= 14;
              line = word;
            } else { line = test; }
          }
          if (line) { checkPage(14); page.drawText(line, { x: M, y, size: 9.5, font, color: rgb(0.25, 0.25, 0.25) }); y -= 14; }
          y -= 6;
        }

        const provName = c.provider_name || 'Service Provider';
        const provId = c.provider_id_number || '[Not provided]';
        const provAddr = c.provider_address || '[Not provided]';
        const effDate = c.effective_date ? new Date(c.effective_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
        const isCast = c.contract_type === 'cast';

        // ── Title Page ──
        page.drawText('PARTICLE AESTHETIC SCIENCE LTD.', { x: M, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) }); y -= 20;
        drawTitle('SERVICES AGREEMENT');
        page.drawText(`Effective Date: ${effDate}`, { x: M, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) }); y -= 20;
        page.drawText('The Company:', { x: M, y, size: 9, font: bold }); y -= 14;
        page.drawText('Particle Aesthetic Science Ltd., King George 48, Tel Aviv', { x: M, y, size: 9, font }); y -= 20;
        page.drawText('Service Provider:', { x: M, y, size: 9, font: bold }); y -= 14;
        page.drawText(`${provName}, ID: ${provId}, Address: ${provAddr}`, { x: M, y, size: 9, font }); y -= 20;
        if (c.fee_amount) {
          page.drawText(`Fee: ${Number(c.fee_amount).toLocaleString()} ${c.currency || 'USD'}`, { x: M, y, size: 9, font: bold }); y -= 14;
        }
        if (projectLabel) { page.drawText(`Production: ${projectLabel}`, { x: M, y, size: 9, font }); y -= 20; }
        y -= 10;

        // ── Preamble ──
        drawParagraph(`This Services Agreement ("Agreement") is made and entered into on ${effDate} ("Effective Date"), by and between Particle Aesthetic Science Ltd., a company registered in Israel, with a principal place of business at King George 48, Tel Aviv ("Company"), and ${provName}, ID/Passport number ${provId}, with a principal place of business at ${provAddr} ("Service Provider").`);
        drawParagraph('WHEREAS, Service Provider has the skills, resources, know-how and ability required to provide the Services and create the Deliverables; and');
        drawParagraph('WHEREAS, based on Service Provider\'s representations hereunder, the parties desire that Service Provider provide the Services as an independent contractor of Company upon the terms and conditions hereinafter specified;');
        drawParagraph('NOW, THEREFORE, the parties hereby agree as follows:');

        // ── 1. DEFINITIONS ──
        drawHeading('1. DEFINITIONS');
        if (isCast) {
          drawParagraph('"Content" shall mean any testimonials, data, personal stories and details, names, locations, videos, photos, audio, and any breakdown, definition or partition of video, film or TV clips, including images, sound footage and segments, recorded performance, interviews, likeness and voice of the Service Provider as embodied therein.');
        } else {
          drawParagraph('"Deliverables" shall mean all deliverables provided or produced as a result of the work performed under this Agreement or in connection therewith, including, without limitation, any work products, composition, photographs, videos, information, specifications, documentation, content, designs, audio, and any breakdown, definition or partition of video, film or clips, images, sound footage and segments, recorded performance, including as set forth in Exhibit A, all in any media or form whatsoever.');
        }
        drawParagraph('"Intellectual Property Rights" shall mean all worldwide, whether registered or not (i) patents, patent applications and patent rights; (ii) rights associated with works of authorship, including copyrights; (iii) rights relating to the protection of trade secrets and confidential information; (iv) trademarks, logos, service marks, brands, trade names, domain names; (v) rights analogous to those set forth herein and any other proprietary rights relating to intangible property; (vi) all other intellectual and industrial property rights.');
        if (!isCast) {
          drawParagraph('"Services" shall mean any professional, creative, or technical services required under this Agreement, including filming, editing, directing, photography, sound design, styling, production assistance, and any other services as described in Exhibit A.');
        }

        // ── 2-10 Clauses (condensed for PDF) ──
        drawHeading('2. ENGAGEMENT AND SERVICES');
        drawParagraph('Company engages Service Provider as an independent contractor to provide the Services and/or Deliverables as set forth in Exhibit A. Service Provider shall devote sufficient time, attention, and resources to perform the Services in a professional manner.');

        drawHeading('3. COMPENSATION');
        drawParagraph(`Company shall pay Service Provider a fee of ${c.fee_amount ? Number(c.fee_amount).toLocaleString() + ' ' + (c.currency || 'USD') : 'as agreed'}, subject to the payment terms set forth in Exhibit B. ${c.payment_terms || ''}`);

        drawHeading('4. INTELLECTUAL PROPERTY');
        drawParagraph('All Deliverables and any Intellectual Property Rights therein shall be the sole and exclusive property of Company. Service Provider hereby irrevocably assigns to Company all rights, title, and interest in and to the Deliverables.');

        drawHeading('5. CONFIDENTIALITY');
        drawParagraph('Service Provider shall maintain in strict confidence all proprietary and confidential information of Company. This obligation shall survive the termination of this Agreement.');

        drawHeading('6. REPRESENTATIONS AND WARRANTIES');
        drawParagraph('Service Provider represents and warrants that (a) the Services and Deliverables will be performed in a professional manner; (b) the Deliverables will be original and will not infringe any third-party rights; (c) Service Provider has the full right and authority to enter into this Agreement.');

        drawHeading('7. INDEMNIFICATION');
        drawParagraph('Service Provider shall indemnify, defend, and hold harmless Company from and against any and all claims, damages, losses, costs, and expenses arising out of or relating to any breach of this Agreement by Service Provider.');

        drawHeading('8. TERM AND TERMINATION');
        drawParagraph('This Agreement shall commence on the Effective Date and continue until all Services have been completed, unless earlier terminated by either party upon written notice.');

        drawHeading('9. INDEPENDENT CONTRACTOR');
        drawParagraph('Service Provider is an independent contractor and nothing herein shall be construed to create a partnership, joint venture, or employer-employee relationship between the parties.');

        drawHeading('10. GENERAL PROVISIONS');
        drawParagraph('This Agreement constitutes the entire agreement between the parties. This Agreement shall be governed by the laws of the State of Israel. Any dispute arising under this Agreement shall be subject to the exclusive jurisdiction of the courts of Tel Aviv.');

        // ── Exhibit A ──
        if (c.exhibit_a) {
          checkPage(60);
          drawTitle('EXHIBIT A - SCOPE OF SERVICES');
          drawParagraph(c.exhibit_a);
        }

        // ── Exhibit B ──
        if (c.exhibit_b) {
          checkPage(60);
          drawTitle('EXHIBIT B - FEES & PAYMENT');
          drawParagraph(c.exhibit_b);
        }

        // ── SIGNATURES PAGE ──
        checkPage(200);
        drawTitle('SIGNATURES');
        page.drawText('The parties have executed this Agreement as of the dates set forth below.', { x: M, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) }); y -= 30;

        for (const s of signatures) {
          checkPage(100);
          const label = s.signer_role === 'hocp' ? 'For the Company:' : 'For the Service Provider:';
          page.drawText(label, { x: M, y, size: 10, font: bold }); y -= 16;
          page.drawText(`Name: ${s.signer_name || 'N/A'}`, { x: M, y, size: 9, font }); y -= 14;
          if (s.signer_id_number) { page.drawText(`ID/Title: ${s.signer_id_number}`, { x: M, y, size: 9, font }); y -= 14; }

          // Embed signature image
          if (s.signature_data) {
            try {
              const sigBytes = Buffer.from(s.signature_data.replace(/^data:[^;]+;base64,/, ''), 'base64');
              const sigImg = await pdfDoc.embedPng(sigBytes);
              const dims = sigImg.scale(0.25);
              checkPage(dims.height + 20);
              page.drawImage(sigImg, { x: M, y: y - dims.height, width: dims.width, height: dims.height });
              y -= dims.height + 8;
            } catch (e) {
              page.drawText('[Digitally Signed]', { x: M, y, size: 9, font, color: rgb(0, 0.4, 0) }); y -= 14;
            }
          }
          const signedDate = s.signed_at ? new Date(s.signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
          page.drawText(`Date: ${signedDate}`, { x: M, y, size: 9, font }); y -= 14;
          if (s.ip_address) { page.drawText(`IP: ${s.ip_address}`, { x: M, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) }); y -= 14; }
          y -= 20;
        }

        // ── DOCUMENT HISTORY ──
        checkPage(80);
        drawTitle('DOCUMENT HISTORY');
        page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) }); y -= 10;
        const fmtDt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        for (const evt of events) {
          checkPage(16);
          let label = evt.type;
          if (evt.type === 'created') label = 'Contract Created';
          if (evt.type === 'sent') label = 'Sent for Signature';
          if (evt.type === 'signed') label = `Signed by ${evt.name || evt.role || 'Party'}`;
          if (evt.type === 'completed') label = 'All Parties Signed - Completed';
          if (evt.type === 'regenerated') label = 'Links Regenerated';
          // Find matching IP
          const matchSig = signatures.find(s => s.signer_role === evt.role);
          const ip = matchSig?.ip_address ? ` (IP: ${matchSig.ip_address})` : '';
          page.drawText(label + ip, { x: M, y, size: 8, font: bold, color: rgb(0.3, 0.3, 0.3) });
          page.drawText(fmtDt(evt.at), { x: 350, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
          y -= 14;
        }

        // Save PDF
        const pdfBytes = await pdfDoc.save();
        const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
        console.log(`[PDF] Generated ${Math.round(pdfBytes.length / 1024)}KB signed contract PDF`);

        // Upload to Google Drive
        if (driveRouter.uploadDual) {
          const year = new Date().getFullYear();
          const uploadResult = await driveRouter.uploadDual({
            fileName: `Contract - ${provName}.pdf`,
            fileContent: pdfBase64,
            mimeType: 'application/pdf',
            subfolder: `${year}/${prdShort} ${projectLabel}`,
            category: 'contracts',
          });
          driveUrl = uploadResult.drive?.viewLink || null;
          if (driveUrl) {
            await db.query('UPDATE contracts SET drive_url = $1 WHERE id = $2', [driveUrl, id]);
          }
          console.log('Signed PDF uploaded to Drive:', driveUrl || 'skipped');
        }
      } catch (pdfErr) {
        console.error('PDF generation/upload failed:', pdfErr.message);
      }

      // Send completion email with Drive link
      try {
        const pdfLink = driveUrl ? `<p><a href="${driveUrl}" style="color: #1a73e8; font-weight: bold;">View Signed PDF in Google Drive</a></p>` : '';
        const completedSubject = `Contract Signed - ${projectLabel} - ${sig.provider_name}`;
        const completedBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2 style="color: #2e7d32;">Contract Fully Signed</h2>
            <p>The contract for <strong>${projectLabel}</strong> with <strong>${sig.provider_name}</strong> has been signed by all parties.</p>
            ${pdfLink}
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #aaa; font-size: 11px;">Sent via CP Panel - Particle Aesthetic Science Ltd.</p>
          </div>`;
        sendEmail({ to: sig.provider_email, subject: completedSubject, htmlBody: completedBody, skipDefaultCc: true }).catch(() => {});
        console.log(`Completion email sent to ${sig.provider_email}`);
      } catch (emailErr) {
        console.error('Completion email failed:', emailErr.message);
      }

      // Slack notification — fully signed with PDF link
      const pdfLink = driveUrl || `${APP_BASE}/production/${prdShort}?contract=true`;
      notifySlack(
        `Contract SIGNED - ${sig.provider_name} for ${projectLabel}\nAmount: ${feeDisplay}\nRef: ${prdId}${driveUrl ? '\nPDF: ' + driveUrl : ''}`,
        pdfLink
      );
    }

    res.json({ success: true, all_signed: allSigned });
  } catch (err) {
    console.error('POST /sign/:id/:token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/contracts/sign/:id/:token/completed — fetch both signatures + events for completed view ──
router.get('/sign/:id/:token/completed', async (req, res) => {
  const { id, token } = req.params;
  try {
    // Verify token
    const { rows: sigRows } = await db.query(
      `SELECT cs.contract_id FROM contract_signatures cs WHERE cs.contract_id = $1 AND cs.token = $2`,
      [id, token]
    );
    if (!sigRows.length) return res.status(404).json({ error: 'Invalid token' });

    // Get all signatures (include IP for document history)
    const { rows: signatures } = await db.query(
      `SELECT signer_role, signer_name, signer_id_number, signature_data, signed_at, ip_address, agreed_at
       FROM contract_signatures WHERE contract_id = $1 ORDER BY signed_at ASC`,
      [id]
    );

    // Get contract events + drive_url
    const { rows: cRows } = await db.query(
      `SELECT events, drive_url, dropbox_url FROM contracts WHERE id = $1`,
      [id]
    );
    const rawEvents = cRows[0]?.events;
    const events = Array.isArray(rawEvents) ? rawEvents : (typeof rawEvents === 'string' ? JSON.parse(rawEvents) : []);

    // Enrich signed events with IP addresses from signatures
    const enrichedEvents = events.map(evt => {
      if (evt.type === 'signed' && evt.role) {
        const matchingSig = signatures.find(s => s.signer_role === evt.role);
        if (matchingSig?.ip_address) return { ...evt, ip: matchingSig.ip_address };
      }
      return evt;
    });
    res.json({ signatures, events: enrichedEvents, drive_url: cRows[0]?.drive_url });
  } catch (err) {
    console.error('GET /sign/:id/:token/completed error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/contracts/:id/upload-signed-pdf — receive PDF from frontend, upload to Drive, send email+Slack ──
router.post('/:id/upload-signed-pdf', async (req, res) => {
  const { id } = req.params;
  const { pdf_base64, token } = req.body;
  if (!pdf_base64 || !token) return res.status(400).json({ error: 'Missing pdf_base64 or token' });

  try {
    // Verify token
    const { rows: sigRows } = await db.query(
      `SELECT cs.contract_id FROM contract_signatures cs WHERE cs.contract_id = $1 AND cs.token = $2`,
      [id, token]
    );
    if (!sigRows.length) return res.status(404).json({ error: 'Invalid token' });

    // Get contract info
    const { rows: cRows } = await db.query(
      `SELECT c.*, split_part(c.production_id, '_li_', 1) as prd_short,
              p.project_name
       FROM contracts c
       LEFT JOIN productions p ON p.id = split_part(c.production_id, '_li_', 1)
       WHERE c.id = $1`,
      [id]
    );
    const contract = cRows[0];
    if (!contract) return res.status(404).json({ error: 'Contract not found' });

    // Allow re-upload (previous upload may have been broken/empty)
    // Don't skip — always upload the new PDF

    // Upload to Google Drive
    let driveUrl = null;
    try {
      const uploadBase64 = pdf_base64.replace(/^data:[^;]+;base64,/, '');
      const pdfBytes = Buffer.from(uploadBase64, 'base64');
      console.log(`[PDF Upload] Received base64 length: ${pdf_base64.length}, decoded bytes: ${pdfBytes.length}`);
      if (driveRouter.uploadDual) {
        const prdShort = contract.prd_short || contract.production_id;
        const projectLabel = contract.project_name || prdShort;
        const year = new Date().getFullYear();
        const uploadResult = await driveRouter.uploadDual({
          fileName: `Contract - ${contract.provider_name || 'Signed'}.pdf`,
          fileContent: uploadBase64,
          mimeType: 'application/pdf',
          subfolder: `${year}/${prdShort} ${projectLabel}`,
          category: 'contracts',
        });
        driveUrl = uploadResult.drive?.viewLink || null;
        if (driveUrl) {
          await db.query('UPDATE contracts SET drive_url = $1 WHERE id = $2', [driveUrl, id]);
        }
        console.log('Signed PDF uploaded to Drive:', driveUrl || 'skipped');
      }
    } catch (uploadErr) {
      console.error('PDF upload failed:', uploadErr.message);
    }

    // Send Slack notification — completed
    const prdShort = contract.prd_short || contract.production_id;
    const projectLabel = contract.project_name || prdShort;
    const feeDisplay = contract.fee_amount ? `${Number(contract.fee_amount).toLocaleString()} ${contract.currency || 'USD'}` : '';

    const slackMsg = `✅ Contract Completed\nSupplier: ${contract.provider_name} | Production: ${projectLabel}${feeDisplay ? ' | Amount: ' + feeDisplay : ''}${driveUrl ? '\n📄 Signed PDF: ' + driveUrl : ''}`;
    notifySlack(slackMsg, driveUrl || `${APP_BASE}/production/${prdShort}?contract=true`);

    // Send completion email
    const events = Array.isArray(contract.events) ? contract.events : (typeof contract.events === 'string' ? JSON.parse(contract.events) : []);
    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const historyHtml = events.map(evt => {
      let label = evt.type;
      if (evt.type === 'created') label = 'Contract Created';
      if (evt.type === 'sent') label = 'Sent for Signature';
      if (evt.type === 'signed') label = `Signed by ${evt.name || evt.role}`;
      if (evt.type === 'completed') label = 'All Parties Signed — Completed';
      return `<tr><td style="padding:6px 0;color:#666;font-size:13px;">${label}</td><td style="padding:6px 0;font-size:13px;">${formatDate(evt.at)}</td></tr>`;
    }).join('');

    const subject = `Contract Signed & Completed: ${projectLabel} - ${contract.provider_name}`;
    const body = `
      <div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#2e7d32;">✅ Contract Fully Signed</h2>
        <p>The contract for <strong>${projectLabel}</strong> with <strong>${contract.provider_name}</strong> has been signed by all parties.</p>
        ${driveUrl ? `<p><a href="${driveUrl}" style="color:#1a73e8;text-decoration:none;font-weight:bold;">📄 View Signed PDF in Google Drive</a></p>` : ''}
        <h3 style="color:#333;font-size:14px;margin-top:24px;">Document History</h3>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">${historyHtml}</table>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="color:#aaa;font-size:11px;">Sent via CP Panel — Particle Aesthetic Science Ltd.</p>
      </div>`;

    sendEmail({ to: contract.provider_email, subject, htmlBody: body, skipDefaultCc: false }).catch(() => {});

    res.json({ success: true, drive_url: driveUrl });
  } catch (err) {
    console.error('POST /:id/upload-signed-pdf error:', err);
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
    currency, contract_type, effective_date,
    require_hocp_signature,
  } = req.body;
  const hocpRequired = require_hocp_signature !== false; // default true
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
           payment_terms = COALESCE($8, payment_terms),
           currency = COALESCE($9, currency),
           contract_type = COALESCE($10, contract_type),
           effective_date = COALESCE($11, effective_date)
         WHERE production_id = $1 RETURNING *`,
        [prodId, provider_name, provider_email, newEvent,
         exhibit_a || null, exhibit_b || null, fee_amount || null, payment_terms || null,
         currency || null, contract_type || null, effective_date || null]
      );
      contract = rows[0];
    } else {
      // Create new
      const { rows } = await db.query(
        `INSERT INTO contracts (production_id, provider_name, provider_email, status, events,
                                exhibit_a, exhibit_b, fee_amount, payment_terms,
                                currency, contract_type, effective_date, require_hocp_signature)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [prodId, provider_name, provider_email, JSON.stringify([{ type: 'created', at: now }]),
         exhibit_a || null, exhibit_b || null, fee_amount || null, payment_terms || null,
         currency || 'USD', contract_type || 'crew', effective_date || null, hocpRequired]
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
    const prdShort = prodId ? prodId.split('_li_')[0] : prodId;
    let projectName = prodId;
    try {
      const { rows: prodRows } = await db.query('SELECT project_name FROM productions WHERE id = $1', [prdShort]);
      if (prodRows[0]) projectName = prodRows[0].project_name;
    } catch (_) {}

    const feeLabel = fee_amount ? `${Number(fee_amount).toLocaleString()} ${currency || 'USD'}` : 'N/A';
    const contractIdForTimer = contract.id;

    // Helper: build supplier email HTML
    const buildSupplierEmailHtml = (signUrl) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #030b2e;">Contract Ready for Signature</h2>
        <p>Hi ${provider_name},</p>
        <p>A contract has been prepared for <strong>${projectName}</strong>.</p>
        <p>Please review and sign the contract by clicking the link below:</p>
        <p style="margin: 24px 0;">
          <a href="${signUrl}" style="background: #0808f8; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Review & Sign Contract
          </a>
        </p>
        <p style="color: #888; font-size: 13px;">If the button doesn't work, copy this link: ${signUrl}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 11px;">Sent via CP Panel — Particle Aesthetic Science Ltd.</p>
      </div>`;

    if (hocpRequired) {
      // ── FLOW A: HOCP Signature Required ──
      // Set status to awaiting_hocp
      await db.query(`UPDATE contracts SET status = 'awaiting_hocp', require_hocp_signature = true WHERE id = $1`, [contract.id]);
      contract.status = 'awaiting_hocp';

      // Slack DM to Tomer: requesting signature
      slackDM(`🖊️ Please sign: Contract for ${provider_name}\nProduction: ${projectName} | Amount: ${feeLabel}\n→ Sign here: ${hocpSignUrl}`);

      // Slack channel: contract sent to HOCP
      notifySlack(
        `🖊️ Contract sent to HOCP to sign\nSupplier: ${provider_name} | Production: ${projectName} | Amount: ${feeLabel}`,
        `${APP_BASE}/production/${prdShort}`
      );

      // Email to Tomer with HOCP signing link
      sendEmail({
        to: 'tomer@particleformen.com',
        skipDefaultCc: true,
        subject: `Sign Contract: ${provider_name} - ${projectName}`,
        htmlBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2 style="color: #030b2e;">Contract Needs Your Signature</h2>
            <p>A contract for <strong>${provider_name}</strong> (<strong>${projectName}</strong>) is waiting for your signature.</p>
            <p><strong>Amount:</strong> ${feeLabel}</p>
            <p style="margin: 24px 0;">
              <a href="${hocpSignUrl}" style="background: #030b2e; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                Review & Sign Contract
              </a>
            </p>
            <p style="color: #888; font-size: 13px;">After you sign, the contract will be automatically sent to ${provider_name}.</p>
          </div>`,
      }).catch(() => {});

      // Do NOT send to supplier yet — that happens after HOCP signs (in POST /sign/:id/:token)
    } else {
      // ── FLOW B: Auto-Sign (no HOCP canvas) ──
      // Set status to sent immediately
      await db.query(`UPDATE contracts SET status = 'sent', sent_at = $1, require_hocp_signature = false WHERE id = $2`, [now, contract.id]);
      contract.status = 'sent';

      // Slack: contract sent
      notifySlack(
        `📄 Contract Sent\nSupplier: ${provider_name}\nProduction: ${projectName} | Amount: ${feeLabel}`,
        `${APP_BASE}/production/${prdShort}`
      );

      // Send email to supplier immediately
      sendEmail({
        to: provider_email,
        skipDefaultCc: false,
        subject: `Services Agreement - ${projectName}`,
        htmlBody: buildSupplierEmailHtml(providerSignUrl),
      }).catch(() => {});

      // HOCP auto-sign removed — signers are now chosen manually in Step 1
    }

    res.json({
      contract,
      signing_links: {
        provider: { url: providerSignUrl, name: provider_name, email: provider_email },
        hocp:     { url: hocpSignUrl,     name: hocp_name || 'Tomer Wilf Lezmy', email: hocp_email || 'tomer@particleformen.com' },
      },
      require_hocp_signature: hocpRequired,
      emailSent: !hocpRequired, // supplier email only sent if auto-sign mode
    });
  } catch (err) {
    console.error('POST /contracts/generate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/contracts/notify-slack — send a Slack notification from the frontend
router.post('/notify-slack', async (req, res) => {
  try {
    const { message, link } = req.body;
    await notifySlack(message || 'Contract notification', link);
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

// DELETE /api/contracts/:production_id
router.delete('/:production_id', async (req, res) => {
  try {
    await db.query('DELETE FROM contract_signatures WHERE contract_id = $1', [req.params.production_id]);
    const { rows } = await db.query('DELETE FROM contracts WHERE production_id = $1 RETURNING *', [req.params.production_id]);
    res.json({ deleted: rows[0] || null });
  } catch (err) {
    console.error('DELETE contract error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
