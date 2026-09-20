const { normaliseDayRequest, parseMockDayRequest } = require('../../server/recommendations/day-request-schema');

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

  // The age exception is stated last and scoped explicitly to age. An earlier wording put
  // "must not be inferred from the request text" in a sentence about age, and production then
  // returned no constraints at all for "it must have baby changing and parking" — the model had
  // generalised the prohibition. Everything above it now says, positively and repeatedly, that
  // the other keys SHOULD be extracted, and the worked example shows four of them being produced
  // from one sentence.
  const systemPrompt = `You extract a parent's stated day-out requirements and preferences into JSON constraints.

Return an object of exactly this shape:
{
  "constraints": { ... },
  "context": { "freeformNotes": "..." }
}

Allowed constraint keys:
  environment (indoor|outdoor|either)
  energyLevel (high|moderate|low|either)
  pushchair
  babyChanging
  toilets
  parking
  visitDuration {maxMinutes,minMinutes}
  journey
  budget (within_profile)

Each constraint is { "strength": required|preferred|context, "value": ... }.

IMPORTANT:
- Extract every requirement or preference that maps to an allowed constraint.
- Do not move an extractable constraint into freeformNotes instead.
- "must", "need", "require", "have to" normally mean strength = required.
- "want", "prefer", "looking for", "ideally" normally mean strength = preferred.
- Infer ordinary synonyms:
    indoors / inside -> environment=indoor
    outdoors / outside / fresh air -> environment=outdoor
    burn off energy / active / run around -> energyLevel=high
    quiet / calm / relaxed -> energyLevel=low
    buggy / pram / stroller -> pushchair
    changing facilities / nappy change -> babyChanging
- freeformNotes is only for information that cannot be represented by an allowed constraint.

Example
Input rawText:
  "We need somewhere indoors, it must have baby changing and parking, and we want to burn off energy."
Expected constraints:
  environment: { "strength": "required", "value": "indoor" }
  babyChanging: { "strength": "required", "value": "yes" }
  parking: { "strength": "required", "value": "yes" }
  energyLevel: { "strength": "preferred", "value": "high" }

AGE IS THE EXCEPTION:
- Never emit childAgeFit or ageRecommendedFit.
- Never infer an age constraint from rawText.
- Age recommendation matching is added separately by the server from the family profile.

Never include venue IDs, scores, rankings or recommendations.`;

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
