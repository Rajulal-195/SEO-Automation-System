// src/lib/clientInput.js
// Validation for the "add client" form. Returns field-level messages the UI can show.
const { normalizeUrl } = require('../crawlers/crawl');
const { normalizePhone, isEmail } = require('../notify');

const LIMITS = { name: 120, businessType: 80, city: 80, state: 80 };

/** https://Example.com/  ->  https://example.com   (stored form; websiteUrl is unique) */
function canonicalUrl(input) {
  const u = new URL(normalizeUrl(input));
  u.hash = '';
  let path = u.pathname.replace(/\/+$/, '');
  if (!path && u.search) path = '/'; // keep "https://example.com/?q=1" well-formed
  return `${u.origin}${path}${u.search}`;
}

/** Blocks addresses that point inside a network (the crawler would fetch them from our server). */
function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return host.includes(':');
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function validateClientInput(body) {
  const input = body && typeof body === 'object' ? body : {};
  const fields = {};
  const data = {};

  const text = (key, label, min = 2) => {
    const value = typeof input[key] === 'string' ? input[key].replace(/\s+/g, ' ').trim() : '';
    if (value.length < min) fields[key] = `${label} is required`;
    else if (value.length > LIMITS[key]) fields[key] = `${label} must be ${LIMITS[key]} characters or fewer`;
    else data[key] = value;
  };
  text('name', 'Business name');
  text('businessType', 'Business type');
  text('city', 'City');
  text('state', 'State');

  const rawUrl = typeof input.websiteUrl === 'string' ? input.websiteUrl.trim() : '';
  if (!rawUrl) {
    fields.websiteUrl = 'Website URL is required';
  } else {
    try {
      const url = canonicalUrl(rawUrl);
      const host = new URL(url).hostname;
      if (process.env.ALLOW_PRIVATE_URLS !== 'true' && isPrivateHost(host)) fields.websiteUrl = 'Enter a public website address';
      else if (!host.includes('.') && !/^\[|^[\d.]+$/.test(host) && process.env.ALLOW_PRIVATE_URLS !== 'true') fields.websiteUrl = 'Enter a full website address such as example.com';
      else data.websiteUrl = url;
    } catch (_) {
      fields.websiteUrl = 'Enter a valid website address such as https://example.com';
    }
  }

  const whatsapp = typeof input.whatsapp === 'string' ? input.whatsapp.trim() : '';
  if (whatsapp) {
    const phone = normalizePhone(whatsapp);
    if (phone) data.whatsapp = phone;
    else fields.whatsapp = 'Enter a phone number with country code, for example +919999900001';
  } else data.whatsapp = null;

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email) {
    if (isEmail(email) && email.length <= 254) data.email = email;
    else fields.email = 'Enter a valid email address';
  } else data.email = null;

  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, data };
}

module.exports = { validateClientInput, canonicalUrl, isPrivateHost };
