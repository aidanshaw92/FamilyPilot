/**
 * Strict schema for AI-parsed day requests — no venue IDs or scores.
 */

const STRENGTH = new Set(['required', 'preferred', 'context']);
const ENV_NEED = new Set(['indoor', 'outdoor', 'either']);
const ENERGY_NEED = new Set(['high', 'moderate', 'low', 'either']);

function normaliseStrength(value, fallback = 'preferred') {
  return STRENGTH.has(value) ? value : fallback;
}

function normaliseConstraint(raw, allowedValues, defaultValue) {
  if (!raw || typeof raw !== 'object') return null;
  const value = allowedValues.has(raw.value) ? raw.value : defaultValue;
  return {
    strength: normaliseStrength(raw.strength),
    value,
  };
}

function normaliseDurationConstraint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    strength: normaliseStrength(raw.strength),
    value: {
      maxMinutes: typeof raw.value?.maxMinutes === 'number' ? raw.value.maxMinutes : undefined,
      minMinutes: typeof raw.value?.minMinutes === 'number' ? raw.value.minMinutes : undefined,
    },
  };
}

function normaliseJourneyConstraint(raw, profileMaxDrive) {
  if (!raw || typeof raw !== 'object') return null;
  const minutes =
    typeof raw.value?.maxMinutes === 'number' ? raw.value.maxMinutes : profileMaxDrive;
  return {
    strength: normaliseStrength(raw.strength, 'required'),
    value: { maxMinutes: minutes },
  };
}

function mergeWithProfile(parsed, profile) {
  const childAges = profile.members.filter((m) => m.role === 'child').map((m) => m.age);
  const constraints = { ...(parsed.constraints ?? {}) };

  if (childAges.length > 0 && !constraints.childAgeFit) {
    constraints.childAgeFit = { strength: 'required', value: 'in_range' };
  }

  if (!constraints.journey) {
    constraints.journey = {
      strength: 'required',
      value: { maxMinutes: profile.maxDriveMinutes },
    };
  }

  if (!constraints.budget) {
    constraints.budget = { strength: 'preferred', value: 'within_profile' };
  }

  return {
    rawText: parsed.rawText ?? '',
    parsedAt: new Date().toISOString(),
    childAges,
    homeLocation: profile.homeLocation,
    budgetTier: profile.budgetTier,
    maxDriveMinutes: profile.maxDriveMinutes,
    hasPushchair: Boolean(profile.pushchair?.trim()),
    constraints,
    context: {
      freeformNotes: typeof parsed.context?.freeformNotes === 'string' ? parsed.context.freeformNotes : undefined,
      timeWindow: typeof parsed.context?.timeWindow === 'string' ? parsed.context.timeWindow : undefined,
    },
  };
}

function normaliseParsedConstraints(raw) {
  const constraints = {};
  const c = raw?.constraints ?? {};

  if (c.childAgeFit) {
    constraints.childAgeFit = {
      strength: normaliseStrength(c.childAgeFit.strength, 'required'),
      value: 'in_range',
    };
  }
  const environment = normaliseConstraint(c.environment, ENV_NEED, 'either');
  if (environment) constraints.environment = environment;
  const energyLevel = normaliseConstraint(c.energyLevel, ENERGY_NEED, 'either');
  if (energyLevel) constraints.energyLevel = energyLevel;
  if (c.pushchair) {
    constraints.pushchair = {
      strength: normaliseStrength(c.pushchair.strength),
      value: 'not_difficult',
    };
  }
  if (c.babyChanging) {
    constraints.babyChanging = { strength: normaliseStrength(c.babyChanging.strength), value: 'yes' };
  }
  if (c.toilets) {
    constraints.toilets = { strength: normaliseStrength(c.toilets.strength), value: 'yes' };
  }
  if (c.parking) {
    constraints.parking = { strength: normaliseStrength(c.parking.strength), value: 'yes' };
  }
  const visitDuration = normaliseDurationConstraint(c.visitDuration);
  if (visitDuration) constraints.visitDuration = visitDuration;
  if (c.budget) {
    constraints.budget = {
      strength: normaliseStrength(c.budget.strength, 'preferred'),
      value: 'within_profile',
    };
  }
  const journey = normaliseJourneyConstraint(c.journey, 30);
  if (journey) constraints.journey = journey;

  return constraints;
}

function parseMockDayRequest(rawText, profile) {
  const text = rawText.toLowerCase();
  const constraints = {};

  if (/\bindoor\b/.test(text)) {
    constraints.environment = { strength: /\bneed\b|\bmust\b|\bwant\b/.test(text) ? 'required' : 'preferred', value: 'indoor' };
  } else if (/\boutdoor\b/.test(text)) {
    constraints.environment = { strength: 'preferred', value: 'outdoor' };
  }

  if (/burn energy|run around|active|let off steam/.test(text)) {
    constraints.energyLevel = { strength: 'preferred', value: 'high' };
  } else if (/calm|quiet|gentle/.test(text)) {
    constraints.energyLevel = { strength: 'preferred', value: 'low' };
  }

  if (/pushchair|buggy|pram|stroller/.test(text)) {
    constraints.pushchair = {
      strength: /don'?t want difficult|need|must/.test(text) ? 'required' : 'preferred',
      value: 'not_difficult',
    };
  }

  if (/baby chang/.test(text)) {
    constraints.babyChanging = { strength: 'preferred', value: 'yes' };
  }

  if (/toilet/.test(text)) {
    constraints.toilets = { strength: 'preferred', value: 'yes' };
  }

  if (/parking/.test(text)) {
    constraints.parking = {
      strength: /don'?t want difficult|need|must|easy/.test(text) ? 'required' : 'preferred',
      value: 'yes',
    };
  }

  const hourMatch = text.match(/(\d+)\s*hours?/);
  if (hourMatch) {
    constraints.visitDuration = {
      strength: 'preferred',
      value: { maxMinutes: Number(hourMatch[1]) * 60 },
    };
  }

  constraints.childAgeFit = { strength: 'required', value: 'in_range' };
  constraints.journey = { strength: 'required', value: { maxMinutes: profile.maxDriveMinutes } };
  constraints.budget = { strength: 'preferred', value: 'within_profile' };

  return mergeWithProfile(
    {
      rawText,
      constraints,
      context: { freeformNotes: rawText.slice(0, 200) },
    },
    profile,
  );
}

function normaliseDayRequest(raw, profile) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Day request must be a JSON object');
  }
  if ('venueId' in raw || 'venues' in raw || 'score' in raw || 'ranking' in raw) {
    throw new Error('Parsed day request must not include venue IDs or scores');
  }

  return mergeWithProfile(
    {
      rawText: typeof raw.rawText === 'string' ? raw.rawText : '',
      constraints: normaliseParsedConstraints(raw),
      context: raw.context ?? {},
    },
    profile,
  );
}

module.exports = {
  normaliseDayRequest,
  parseMockDayRequest,
  mergeWithProfile,
};
