// src/notify/index.js
// Sends the finished report to the client (WhatsApp + email) and records one
// Notification row per attempt (PDF section 5: channel, status, providerId).
//
// It never throws: a failed delivery is recorded as status "failed" and the
// audit itself is unaffected. A channel that already delivered for this audit
// is skipped, so a BullMQ retry cannot message the client twice.

const { buildWhatsAppText, buildEmail, reportLink } = require('./message');
const { sendWhatsAppReport } = require('./whatsapp');
const { sendEmailReport } = require('./email');

const DELIVERED = ['mock_sent', 'sent'];

/** "+91 99999-00001" -> "+919999900001"; returns null when it cannot be a phone number. */
function normalizePhone(value) {
  const compact = String(value || '').replace(/[\s().-]/g, '');
  return /^\+?[0-9]{8,15}$/.test(compact) ? (compact.startsWith('+') ? compact : '+' + compact) : null;
}

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

async function sendReportNotifications({ db, client, audit, pdfPath = null, deps = {} }) {
  const sendWhatsApp = deps.sendWhatsApp || sendWhatsAppReport;
  const sendEmail = deps.sendEmail || sendEmailReport;
  const score = Math.round(Number(audit.overallScore) || 0);
  const results = [];

  const record = async (channel, status, providerId) => {
    try {
      await db.notification.create({ data: { auditId: audit.id, channel, status, providerId: providerId || null } });
    } catch (err) {
      console.error(`[notify] could not save the ${channel} notification row:`, err.message);
    }
  };

  const channels = [
    {
      channel: 'whatsapp',
      raw: client.whatsapp,
      valid: () => normalizePhone(client.whatsapp),
      send: (to) => sendWhatsApp({
        client, to, pdfPath, score,
        text: buildWhatsAppText({ client, audit }),
        mediaUrl: reportLink(audit.id),
      }),
    },
    {
      channel: 'email',
      raw: client.email,
      valid: () => (isEmail(client.email) ? String(client.email).trim() : null),
      send: (to) => sendEmail({ client, to, pdfPath, score, ...buildEmail({ client, audit }) }),
    },
  ];

  for (const c of channels) {
    if (!c.raw) {
      results.push({ channel: c.channel, status: 'skipped', reason: 'no contact on file' });
      continue;
    }

    try {
      const already = await db.notification.findFirst({
        where: { auditId: audit.id, channel: c.channel, status: { in: DELIVERED } },
        select: { id: true },
      });
      if (already) {
        results.push({ channel: c.channel, status: 'skipped', reason: 'already delivered' });
        continue;
      }
    } catch (err) {
      console.error(`[notify] could not check earlier ${c.channel} deliveries:`, err.message);
    }

    const to = c.valid();
    if (!to) {
      console.error(`[notify] ${c.channel}: "${c.raw}" is not a valid ${c.channel === 'email' ? 'email address' : 'phone number'}`);
      await record(c.channel, 'failed', null);
      results.push({ channel: c.channel, status: 'failed', reason: 'invalid contact' });
      continue;
    }

    try {
      const sent = await c.send(to);
      await record(c.channel, sent.status, sent.providerId);
      results.push({ channel: c.channel, status: sent.status, providerId: sent.providerId });
    } catch (err) {
      console.error(`[notify] ${c.channel} delivery failed:`, err.message);
      await record(c.channel, 'failed', null);
      results.push({ channel: c.channel, status: 'failed', reason: err.message });
    }
  }

  return results;
}

module.exports = { sendReportNotifications, normalizePhone, isEmail };
