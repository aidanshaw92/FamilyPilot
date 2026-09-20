import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The parser prompt is a contract, and it is the only part of this endpoint no test can execute:
 * the model is remote, so nothing here proves what it returns. What these tests defend is the
 * wording that production evidence showed the model is sensitive to.
 *
 * The regression that prompted them: an age prohibition phrased as "...must not be inferred from
 * the request text" sat immediately after the list of allowed keys, and production then returned
 * no constraints at all for "We need somewhere indoors, it must have baby changing and parking" —
 * the model generalised a rule about age into a rule about everything. These tests pin the shape
 * that avoids it: positive extraction instructions first, a worked example, and the age exception
 * last and explicitly scoped.
 */

const PROMPT_FILE = path.join(process.cwd(), '..', 'api', 'recommendations', 'parse-request.js');

function systemPrompt(): string {
  const source = fs.readFileSync(PROMPT_FILE, 'utf8');
  const start = source.indexOf('const systemPrompt = `');
  expect(start, 'systemPrompt template literal should exist').toBeGreaterThan(-1);
  const body = source.slice(start + 'const systemPrompt = `'.length);
  const end = body.indexOf('`;');
  expect(end, 'systemPrompt should be a closed template literal').toBeGreaterThan(-1);
  return body.slice(0, end);
}

describe('parser prompt contract', () => {
  const prompt = systemPrompt();

  it('instructs the model to extract every mappable constraint', () => {
    expect(prompt).toContain('Extract every requirement or preference that maps to an allowed constraint');
  });

  it('forbids hiding an extractable constraint in freeformNotes', () => {
    // The observed failure mode was not silence: the model summarised the request accurately into
    // freeformNotes and emitted no constraints, so this is stated as its own rule.
    expect(prompt).toContain('Do not move an extractable constraint into freeformNotes');
  });

  it('maps requirement and preference vocabulary to a strength', () => {
    for (const word of ['"must"', '"need"', '"require"', '"want"', '"prefer"', '"ideally"']) {
      expect(prompt).toContain(word);
    }
    expect(prompt).toContain('strength = required');
    expect(prompt).toContain('strength = preferred');
  });

  it('lists the ordinary synonyms a parent actually uses', () => {
    for (const synonym of ['indoors', 'outdoors', 'burn off energy', 'buggy', 'changing facilities']) {
      expect(prompt).toContain(synonym);
    }
  });

  it('carries a worked example producing several constraints from one sentence', () => {
    expect(prompt).toContain('Example');
    expect(prompt).toContain('We need somewhere indoors, it must have baby changing and parking');
    for (const key of ['environment', 'babyChanging', 'parking', 'energyLevel']) {
      expect(prompt).toContain(key);
    }
  });

  it('keeps the example free of any age constraint', () => {
    const example = prompt.slice(prompt.indexOf('Example'), prompt.indexOf('AGE IS THE EXCEPTION'));
    expect(example).not.toContain('childAgeFit');
    expect(example).not.toContain('ageRecommendedFit');
    expect(example).not.toContain('age');
  });

  it('still forbids an age constraint, explicitly and by both key names', () => {
    expect(prompt).toContain('Never emit childAgeFit or ageRecommendedFit');
    expect(prompt).toContain('Never infer an age constraint from rawText');
  });

  it('scopes the age prohibition to age rather than to inference in general', () => {
    // The exact clause that caused the regression. It must not reappear as a free-standing rule.
    expect(prompt).not.toContain('must not be inferred from the request text');
    // And the prohibition must sit after the extraction instructions, not before them.
    expect(prompt.indexOf('AGE IS THE EXCEPTION')).toBeGreaterThan(
      prompt.indexOf('Extract every requirement or preference'),
    );
  });

  it('does not advertise an age key among the allowed constraint keys', () => {
    const allowed = prompt.slice(prompt.indexOf('Allowed constraint keys'), prompt.indexOf('IMPORTANT'));
    expect(allowed).not.toContain('childAgeFit');
    expect(allowed).not.toContain('ageRecommendedFit');
  });

  it('still bans venue ids, scores and rankings', () => {
    expect(prompt).toContain('Never include venue IDs, scores, rankings or recommendations');
  });

  it('keeps the model, temperature and JSON mode unchanged in this patch', () => {
    const source = fs.readFileSync(PROMPT_FILE, 'utf8');
    expect(source).toContain("process.env.AI_PARSE_MODEL || 'gpt-4o-mini'");
    expect(source).toContain('temperature: 0');
    expect(source).toContain("response_format: { type: 'json_object' }");
    expect(source).toContain('https://api.openai.com/v1/chat/completions');
  });
});

describe('server normalisation is unchanged by this patch', () => {
  /**
   * The normaliser was never the problem — it passes every non-age constraint through. Pinned
   * here so a future prompt change cannot be blamed on it, and so the age guarantee from P0-B1
   * still holds against a model payload that ignores the prohibition.
   */
  const profile = {
    homeLocation: 'London',
    budgetTier: 'moderate',
    maxDriveMinutes: 45,
    members: [{ role: 'child', age: 0, ageMonths: 7 }, { role: 'child', age: 8 }],
  };

  async function normalise(constraints: Record<string, unknown>) {
    const { normaliseDayRequest } = await import('../../../server/recommendations/day-request-schema.js');
    return normaliseDayRequest({ rawText: 'x', constraints }, profile);
  }

  it('passes every allowed non-age constraint through at its stated strength', async () => {
    const out = await normalise({
      environment: { strength: 'required', value: 'indoor' },
      energyLevel: { strength: 'preferred', value: 'high' },
      babyChanging: { strength: 'required', value: 'yes' },
      parking: { strength: 'required', value: 'yes' },
      toilets: { strength: 'preferred', value: 'yes' },
      pushchair: { strength: 'preferred', value: 'not_difficult' },
      visitDuration: { strength: 'preferred', value: { maxMinutes: 120 } },
    });

    expect(out.constraints.environment).toEqual({ strength: 'required', value: 'indoor' });
    expect(out.constraints.energyLevel).toEqual({ strength: 'preferred', value: 'high' });
    expect(out.constraints.babyChanging).toEqual({ strength: 'required', value: 'yes' });
    expect(out.constraints.parking).toEqual({ strength: 'required', value: 'yes' });
    expect(out.constraints.toilets.strength).toBe('preferred');
    expect(out.constraints.pushchair.strength).toBe('preferred');
    expect(out.constraints.visitDuration.value.maxMinutes).toBe(120);
  });

  it('still adds the soft age recommendation itself, whatever the model sent', async () => {
    const out = await normalise({ environment: { strength: 'required', value: 'outdoor' } });
    expect(out.constraints.ageRecommendedFit).toEqual({ strength: 'preferred', value: 'in_range' });
    expect(out.constraints.childAgeFit).toBeUndefined();
    expect(out.childAgeMonthsList).toEqual([7, 96]);
  });

  it('normalises an age constraint the model emitted anyway down to preferred', async () => {
    const out = await normalise({ childAgeFit: { strength: 'required', value: 'in_range' } });
    expect(out.constraints.ageRecommendedFit.strength).toBe('preferred');
    expect(out.constraints.childAgeFit).toBeUndefined();
  });
});
