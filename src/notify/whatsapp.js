// src/notify/whatsapp.js
// WhatsApp delivery (MOCKED by default). Same toggle pattern as the crawlers.
const { USE_MOCKS } = require('../mocks');

const TIMEOUT_MS = 20000;

/**
 * @returns {Promise<{ status: 'mock_sent'|'sent', providerId: string }>}
 */
async function sendWhatsAppReport({ client, to, pdfPath, score, text, mediaUrl }) {
  if (USE_MOCKS) {
    const { sendWhatsApp } = require('../mocks/twilio.mock');
    const result = await sendWhatsApp(client.id, pdfPath, score);
    return { status: result.status, providerId: result.sid };
  }

  // ---- Real Twilio WhatsApp call ----
  // Note: outside WhatsApp's 24-hour reply window Twilio only delivers approved
  // message templates, so production use needs an approved business template.
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. +14155238886
  if (!sid || !token || !from) {
    throw new Error('Twilio is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, or use USE_MOCKS=true)');
  }

  const body = new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:${to}`, Body: text });
  if (mediaUrl && /^https:\/\//.test(mediaUrl)) body.set('MediaUrl', mediaUrl);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Twilio responded with ${res.status}`);

  const json = await res.json();
  return { status: 'sent', providerId: json.sid };
}

module.exports = { sendWhatsAppReport };
