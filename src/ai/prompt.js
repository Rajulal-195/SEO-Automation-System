// src/ai/prompt.js
// The Master SEO Audit Prompt from the assessment (section 6.2), word for word.
// Only the {VARIABLES} are replaced at runtime.

const SYSTEM_PROMPT = `You are a senior SEO analyst with 15+ years experience specialising in
Indian local business websites, healthcare, dental, and real estate sectors.
You produce honest, falsifiable, prioritised SEO audit reports.
Your output must be valid JSON only — no markdown, no preamble.
Every recommendation must include: finding, fix, estimated_impact (High/Medium/Low),
effort (Hours/Days/Weeks), falsifiability_check (how we know if this worked).`;

const USER_PROMPT_TEMPLATE = `Analyse the following SEO signals for: {URL}
Business type: {BUSINESS_TYPE}
Business location: {CITY}, {STATE}, India

=== ON-PAGE DATA ===
{ON_PAGE_JSON}

=== TECHNICAL DATA ===
{TECHNICAL_JSON}

=== CORE WEB VITALS ===
{CWV_JSON}

=== SCHEMA.ORG DATA ===
{SCHEMA_JSON}

=== GOOGLE SEARCH CONSOLE ===
{GSC_JSON}

=== KEYWORD RANKINGS ===
{RANKINGS_JSON}

Respond ONLY with this JSON structure — no other text:
{
"audit_version": "v1.0",
"overall_score": <integer 0-100>,
"score_breakdown": { "technical": <0-100>, "on_page": <0-100>,
"content": <0-100>, "core_web_vitals": <0-100>,
"schema": <0-100> },
"critical_issues": [<max 5 items>],
"important_issues": [<max 8 items>],
"quick_wins": [<max 5 items — effort <= 2 hours>],
"recommendations": [{
"priority": "CRITICAL|HIGH|MEDIUM|LOW",
"category": "Technical|OnPage|Content|Schema|CWV",
"finding": "<what is wrong>",
"fix": "<exact action to take>",
"estimated_impact": "High|Medium|Low",
"effort": "Hours|Days|Weeks",
"falsifiability_check": "<how to verify this worked>"
}],
"executive_summary": "<3 sentences max, plain English>"
}`;

const toJson = (value) => JSON.stringify(value === undefined ? null : value, null, 2);

/**
 * Fills the template from the client row and the output of collectSignals().
 * Replacement uses a function so "$" characters in the data are never
 * treated as special replacement patterns.
 */
function buildUserPrompt(client, signals) {
  const values = {
    '{URL}': client.websiteUrl,
    '{BUSINESS_TYPE}': client.businessType,
    '{CITY}': client.city,
    '{STATE}': client.state,
    '{ON_PAGE_JSON}': toJson(signals.onPage),
    '{TECHNICAL_JSON}': toJson(signals.technical),
    '{CWV_JSON}': toJson(signals.cwv),
    '{SCHEMA_JSON}': toJson(signals.schema),
    '{GSC_JSON}': toJson(signals.gsc),
    '{RANKINGS_JSON}': toJson(signals.rankings),
  };

  let prompt = USER_PROMPT_TEMPLATE;
  for (const [token, value] of Object.entries(values)) {
    prompt = prompt.split(token).join(String(value));
  }
  return prompt;
}

module.exports = { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, buildUserPrompt };
