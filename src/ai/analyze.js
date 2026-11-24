// src/ai/analyze.js
// Claude analysis step: signals in, validated audit JSON out.
//   USE_MOCKS=true  -> returns the mock response (it still goes through the
//                      same validator as a real reply)
//   USE_MOCKS=false -> calls the Anthropic API (claude-sonnet-4-6)

const { USE_MOCKS } = require('../mocks');
const mockResponse = require('../mocks/claude.mock');
const { SYSTEM_PROMPT, buildUserPrompt } = require('./prompt');
const { validateAnalysis } = require('./validate');

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 6000;
const MAX_ATTEMPTS = 2;

function createAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env, or set USE_MOCKS=true to use the mock Claude response.'
    );
  }
  const Anthropic = require('@anthropic-ai/sdk');
  const Client = Anthropic.default || Anthropic;
  return new Client({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120000, maxRetries: 2 });
}

function replyText(response) {
  return (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * @param {object} client   Client row (websiteUrl, businessType, city, state)
 * @param {object} signals  Output of collectSignals()
 * @param {{ anthropic?: object }} [options] inject a client for tests
 * @returns {Promise<{ result: object, meta: object }>}
 */
async function analyzeSignals(client, signals, options = {}) {
  // ---- Mock path ----
  if (USE_MOCKS && !options.anthropic) {
    const checked = validateAnalysis(JSON.stringify(mockResponse));
    if (!checked.ok) {
      throw new Error('Mock Claude response is invalid: ' + checked.problems.join('; '));
    }
    return {
      result: checked.data,
      meta: { usedMocks: true, model: 'mock', attempts: 1, notes: checked.notes, usage: null },
    };
  }

  // ---- Real path ----
  const anthropic = options.anthropic || createAnthropicClient();
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;

  const messages = [{ role: 'user', content: buildUserPrompt(client, signals) }];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let lastProblems = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    });

    if (response.usage) {
      usage.input_tokens += response.usage.input_tokens || 0;
      usage.output_tokens += response.usage.output_tokens || 0;
    }

    const text = replyText(response);
    const checked =
      response.stop_reason === 'max_tokens'
        ? { ok: false, problems: ['Reply was cut off before the JSON finished'], notes: [] }
        : validateAnalysis(text);

    if (checked.ok) {
      return {
        result: checked.data,
        meta: { usedMocks: false, model, attempts: attempt, notes: checked.notes, usage },
      };
    }

    lastProblems = checked.problems;
    console.warn(`[claude] attempt ${attempt} rejected: ${checked.problems.join('; ')}`);

    // Ask again, telling Claude exactly what was wrong
    messages.push({ role: 'assistant', content: text || '{}' });
    messages.push({
      role: 'user',
      content:
        'Your previous reply was rejected for these reasons:\n- ' +
        checked.problems.join('\n- ') +
        '\n\nRespond again with ONLY the corrected JSON object in the required structure. No markdown, no other text.',
    });
  }

  throw new Error(
    `Claude returned an invalid audit after ${MAX_ATTEMPTS} attempts: ${lastProblems.join('; ')}`
  );
}

module.exports = { analyzeSignals };
