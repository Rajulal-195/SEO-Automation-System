// src/crawlers/schema.js
// Pipeline Step 4: Schema.org (JSON-LD) validator.
// Output becomes {SCHEMA_JSON} in the Claude prompt.
// This is a practical checker for the properties Google cares about for
// local businesses, not a full schema.org validator.

const cheerio = require('cheerio');

const LOCAL_BUSINESS_TYPES = new Set([
  'LocalBusiness', 'Dentist', 'MedicalClinic', 'MedicalBusiness', 'Physician', 'Hospital',
  'Pharmacy', 'Optician', 'RealEstateAgent', 'HealthAndBeautyBusiness', 'BeautySalon',
  'HairSalon', 'DaySpa', 'Store', 'Restaurant', 'LodgingBusiness', 'ProfessionalService',
  'LegalService', 'AutomotiveBusiness', 'FinancialService', 'HomeAndConstructionBusiness',
  'EntertainmentBusiness', 'SportsActivityLocation', 'Gym', 'TravelAgency',
]);

// "a|b" means either property satisfies the rule
const LOCAL_RULE = {
  required: ['name', 'address', 'telephone'],
  recommended: ['url', 'image', 'openingHoursSpecification|openingHours', 'geo', 'priceRange', 'sameAs', 'aggregateRating'],
};

const RULES = {
  Organization: { required: ['name', 'url'], recommended: ['logo', 'sameAs', 'contactPoint'] },
  WebSite: { required: ['name', 'url'], recommended: ['potentialAction'] },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
  Article: { required: ['headline', 'author', 'datePublished'], recommended: ['image', 'dateModified'] },
  BlogPosting: { required: ['headline', 'author', 'datePublished'], recommended: ['image', 'dateModified'] },
  Product: { required: ['name'], recommended: ['image', 'offers', 'aggregateRating'] },
  Person: { required: ['name'], recommended: [] },
};

function hasValue(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function hasProp(entity, key) {
  return key.split('|').some((k) => hasValue(entity[k]));
}

function typesOf(entity) {
  const t = entity['@type'];
  if (!t) return [];
  return (Array.isArray(t) ? t : [t]).map(String);
}

function ruleFor(types) {
  for (const t of types) {
    if (LOCAL_BUSINESS_TYPES.has(t)) return { rule: LOCAL_RULE, isLocal: true };
  }
  for (const t of types) {
    if (RULES[t]) return { rule: RULES[t], isLocal: false };
  }
  return null;
}

/** Flattens arrays and @graph wrappers into a plain list of entities. */
function flatten(parsed) {
  const out = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node['@graph'])) node['@graph'].forEach(visit);
    if (node['@type']) out.push(node);
  };
  visit(parsed);
  return out;
}

function analyzeSchema(html) {
  if (!html) {
    return { crawled: false, reason: 'No HTML to inspect' };
  }

  const $ = cheerio.load(html);
  const blocks = $('script[type="application/ld+json"]');

  const parseErrors = [];
  const entities = [];
  let missingContext = 0;

  blocks.each((index, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) {
      parseErrors.push({ block: index + 1, message: 'Empty JSON-LD block' });
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      parseErrors.push({ block: index + 1, message: err.message });
      return;
    }
    const ctx = JSON.stringify(parsed && parsed['@context'] !== undefined ? parsed['@context'] : '');
    if (!/schema\.org/i.test(ctx)) missingContext++;

    for (const entity of flatten(parsed)) entities.push(entity);
  });

  const checked = entities.map((entity) => {
    const types = typesOf(entity);
    const found = ruleFor(types);
    if (!found) {
      return { type: types.join(', '), validated: false, missingRequired: [], missingRecommended: [] };
    }
    return {
      type: types.join(', '),
      validated: true,
      missingRequired: found.rule.required.filter((k) => !hasProp(entity, k)),
      missingRecommended: found.rule.recommended.filter((k) => !hasProp(entity, k)),
    };
  });

  const allTypes = [...new Set(entities.flatMap(typesOf))];
  const isLocal = (t) => LOCAL_BUSINESS_TYPES.has(t);

  return {
    crawled: true,
    jsonLdBlocks: blocks.length,
    parseErrors,
    blocksMissingSchemaContext: missingContext,
    microdataItemscopeCount: $('[itemscope]').length,
    types: allTypes,
    entities: checked,
    hasLocalBusiness: allTypes.some(isLocal),
    hasOrganization: allTypes.includes('Organization'),
    hasWebSite: allTypes.includes('WebSite'),
    hasBreadcrumb: allTypes.includes('BreadcrumbList'),
    hasFaq: allTypes.includes('FAQPage'),
    summary: {
      totalEntities: checked.length,
      entitiesMissingRequired: checked.filter((c) => c.missingRequired.length > 0).length,
    },
  };
}

module.exports = { analyzeSchema };
