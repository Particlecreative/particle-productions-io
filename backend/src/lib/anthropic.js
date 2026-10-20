/**
 * Shared lazy Anthropic client (nginx cuts requests at 120s, so the SDK timeout stays below that).
 */
let client = null;

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 105000, maxRetries: 1 });
  }
  return client;
}

module.exports = { getAnthropic };
