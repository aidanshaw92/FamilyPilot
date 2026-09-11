const MOCK_WEATHER = {
  condition: 'partly_cloudy',
  temperature: 18,
  description: 'Partly cloudy, good for mixed indoor/outdoor plans',
};

function mapOpenWeatherCondition(weatherMain, cloudPercent) {
  const main = String(weatherMain || '').toLowerCase();
  if (main.includes('rain') || main.includes('drizzle') || main.includes('thunder')) {
    return 'rainy';
  }
  if (main.includes('clear')) {
    return cloudPercent != null && cloudPercent > 35 ? 'partly_cloudy' : 'sunny';
  }
  if (main.includes('cloud')) {
    return cloudPercent != null && cloudPercent > 70 ? 'cloudy' : 'partly_cloudy';
  }
  return 'partly_cloudy';
}

function buildDescription(condition, temperature) {
  switch (condition) {
    case 'rainy':
      return 'Rain expected — indoor options may suit better';
    case 'sunny':
      return `Sunny and ${temperature}° — great for outdoor plans`;
    case 'cloudy':
      return `Overcast and ${temperature}° — flexible indoor or outdoor`;
    default:
      return `Partly cloudy and ${temperature}° — good for mixed plans`;
  }
}

function estimateWeatherFallback(latitude, longitude, now = new Date()) {
  const month = now.getUTCMonth();
  const hour = now.getUTCHours();
  const isWinter = month <= 1 || month >= 10;
  const isEvening = hour >= 18 || hour < 7;

  let condition = 'partly_cloudy';
  if (isWinter && isEvening) condition = 'cloudy';
  if (!isWinter && hour >= 10 && hour <= 16 && latitude > 50) condition = 'sunny';

  const temperature = isWinter ? 8 : 18;
  return {
    condition,
    temperature,
    description: buildDescription(condition, temperature),
    source: 'estimated',
    provider: 'fallback',
    fetchedAt: now.toISOString(),
    coordinates: { latitude, longitude },
  };
}

async function fetchOpenWeather(latitude, longitude, apiKey) {
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('appid', apiKey);
  url.searchParams.set('units', 'metric');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`OpenWeather request failed (${response.status})`);
  }

  const payload = await response.json();
  const condition = mapOpenWeatherCondition(
    payload.weather?.[0]?.main,
    payload.clouds?.all,
  );
  const temperature = Math.round(payload.main?.temp ?? MOCK_WEATHER.temperature);
  return {
    condition,
    temperature,
    description: buildDescription(condition, temperature),
    source: 'live',
    provider: 'openweather',
    fetchedAt: new Date().toISOString(),
    coordinates: { latitude, longitude },
  };
}

async function getCurrentWeather(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Invalid coordinates');
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return estimateWeatherFallback(latitude, longitude);
  }

  try {
    return await fetchOpenWeather(latitude, longitude, apiKey);
  } catch {
    return estimateWeatherFallback(latitude, longitude);
  }
}

module.exports = {
  MOCK_WEATHER,
  buildDescription,
  estimateWeatherFallback,
  getCurrentWeather,
  mapOpenWeatherCondition,
};
