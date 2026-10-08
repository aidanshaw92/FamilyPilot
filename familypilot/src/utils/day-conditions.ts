import type { WeatherInfo } from '@/src/types';

/**
 * Today's weather against what the venue is, as a plain statement of the day. It is a CONDITION of the day the screen is
 * read, shown beside Family Fit and never part of it: it does not rate, rank or caution against a place, and it says
 * nothing unless the venue's environment is a confirmed fact (indoor or outdoor), because "Outdoors" cannot be said of a
 * place nobody has confirmed is outdoors. Once there is a plan for a chosen day, the planner decides what it means.
 */
export function describeWeatherToday(
  weather: WeatherInfo | null | undefined,
  environment: 'indoor' | 'outdoor' | 'mixed' | 'unknown' | undefined,
): string | null {
  if (!weather) return null;
  const forecast = weather.description?.trim();
  const base = forecast ? `${forecast.charAt(0).toUpperCase()}${forecast.slice(1).toLowerCase()} today` : null;
  if (environment === 'indoor') return base ? `${base} · indoors` : 'Indoors';
  if (environment === 'outdoor') return base ? `${base} · outdoors` : 'Outdoors';
  return base;
}
