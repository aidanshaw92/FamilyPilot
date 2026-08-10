#!/usr/bin/env node
/**
 * Minimal client for the deployed FamilyPilot enrichment API.
 * Requires ENRICHMENT_ADMIN_TOKEN in the environment.
 */

const DEFAULT_BASE_URL = 'https://family-pilot-seven.vercel.app/api/enrichment';

export function getEnrichmentBaseUrl() {
  return (process.env.ENRICHMENT_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
}

export function getEnrichmentToken() {
  const token = process.env.ENRICHMENT_ADMIN_TOKEN?.trim();
  if (!token) {
    throw new Error('ENRICHMENT_ADMIN_TOKEN is not set');
  }
  return token;
}

export async function enrichmentFetch(action, { method = 'GET', query = {}, body = null } = {}) {
  const url = new URL(getEnrichmentBaseUrl());
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Enrichment-Token': getEnrichmentToken(),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.error ?? `HTTP ${response.status}`;
    throw new Error(`${action} failed: ${message}`);
  }

  return payload;
}

export async function getConfig() {
  const url = new URL(getEnrichmentBaseUrl());
  url.searchParams.set('action', 'config');
  const response = await fetch(url);
  return response.json();
}
