// src/notify/email.js
// Email delivery (MOCKED by default). The PDF names no email provider, so the
// real path uses Resend's HTTP API (no SDK needed).
const fs = require('fs');
const path = require('path');
const { USE_MOCKS } = require('../mocks');

const TIMEOUT_MS = 20000;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * @returns {Promise<{ status: 'mock_sent'|'sent', providerId: string }>}
 */
async function sendEmailReport({ client, to, pdfPath, score, subject, html, text }) {
  if (USE_MOCKS) {
    const { sendEmail } = require('../mocks/email.mock');
    const result = await sendEmail(client.id, to, pdfPath, score);
    return { status: result.status, providerId: result.id };
  }

  // ---- Real Resend call ----
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM; // e.g. "Edgelink <reports@yourdomain.com>"
  if (!apiKey || !from) {
    throw new Error('Email is not configured (set RESEND_API_KEY and EMAIL_FROM, or use USE_MOCKS=true)');
  }

  const payload = { from, to: [to], subject, html, text };

  // Attach the PDF when the worker has it on disk; otherwise the email still carries the download link
  if (pdfPath && fs.existsSync(pdfPath) && fs.statSync(pdfPath).size <= MAX_ATTACHMENT_BYTES) {
    payload.attachments = [{ filename: path.basename(pdfPath), content: fs.readFileSync(pdfPath).toString('base64') }];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Email provider responded with ${res.status}`);

  const json = await res.json();
  return { status: 'sent', providerId: json.id };
}

module.exports = { sendEmailReport };
