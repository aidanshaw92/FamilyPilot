const { normaliseDayRequest, parseMockDayRequest } = require('./day-request-schema');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rawText = req.body?.rawText;
  const profile = req.body?.profile;

  if (typeof rawText !== 'string' || !rawText.trim()) {
    return res.status(400).json({ error: 'Missing rawText' });
  }
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: 'Missing profile' });
  }

  try {
    if (process.env.OPENAI_API_KEY) {
      const parsed = await callOpenAiParse(rawText.trim(), profile);
      const request = normaliseDayRequest(parsed, profile);
      return res.status(200).json({ request, parser: 'openai' });
    }

    const request = parseMockDayRequest(rawText.trim(), profile);
    return res.status(200).json({ request, parser: 'mock' });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Parse failed',
    });
  }
};

async function callOpenAiParse(rawText, profile) {
  const childAges = (profile.members ?? [])
    .filter((m) => m.role === 'child')
    .map((m) => m.age);

  const systemPrompt = `You parse a parent's natural-language day-out request into JSON constraints ONLY.
Never include venue IDs, scores, rankings, or recommendations.
Use strength: required | preferred | context.
Allowed constraint keys: environment (indoor|outdoor|either), energyLevel (high|moderate|low|either), pushchair, babyChanging, toilets, parking, visitDuration {maxMinutes,minMinutes}, childAgeFit (always in_range if children exist), journey, budget (within_profile).
Put non-ranking notes in context.freeformNotes.`;

  const userPrompt = JSON.stringify({
    rawText,
    profileSummary: {
      childAges,
      maxDriveMinutes: profile.maxDriveMinutes,
      budgetTier: profile.budgetTier,
      hasPushchair: Boolean(profile.pushchair?.trim()),
    },
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_PARSE_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI parse failed (${response.status})`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty AI parse response');
  const parsed = JSON.parse(content);
  parsed.rawText = rawText;
  return parsed;
}
