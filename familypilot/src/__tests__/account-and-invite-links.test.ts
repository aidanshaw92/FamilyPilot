import { describe, expect, it } from 'vitest';

import { AUTH_FAILURE_COPY, classifyAuthError, emailProblem, maskEmail, mustChoosePassword, normaliseEmail, parseAuthLinkError, passwordProblem } from '@/src/services/account/credentials';
import { buildInviteUrl, inviteShareMessage, isInviteCode, parseInviteCode } from '@/src/services/planning/invite-links';
import { coarseArea, snapshotForSharing } from '@/src/services/planning/connection-snapshot';
import { FamilyProfile } from '@/src/types';

const CODE = 'ab'.repeat(32);

describe('account credentials', () => {
  it('catches an email typo before a verification email is sent', () => {
    expect(emailProblem('')).toMatch(/Enter your email/);
    expect(emailProblem('alex@gmail')).toMatch(/typo/);
    expect(emailProblem('alex gmail.com')).toMatch(/typo/);
    expect(emailProblem('  Alex@Example.COM ')).toBeNull();
    expect(normaliseEmail('  Alex@Example.COM ')).toBe('alex@example.com');
  });

  it('asks for a password of at least ten characters', () => {
    expect(passwordProblem('')).toMatch(/Choose/);
    expect(passwordProblem('short')).toMatch(/at least 10/);
    expect(passwordProblem('long-enough-1')).toBeNull();
  });

  it('masks an address for display', () => {
    expect(maskEmail('alex@example.com')).toBe('a***@example.com');
  });

  it('classifies what Supabase Auth says into the decision the screen has to make', () => {
    expect(classifyAuthError({ message: 'Email not confirmed' })).toBe('email-not-confirmed');
    expect(classifyAuthError({ code: 'email_not_confirmed' })).toBe('email-not-confirmed');
    expect(classifyAuthError({ message: 'Invalid login credentials' })).toBe('invalid-credentials');
    expect(classifyAuthError({ message: 'User already registered' })).toBe('already-registered');
    expect(classifyAuthError({ status: 429 })).toBe('rate-limited');
    expect(classifyAuthError({ message: 'Failed to fetch' })).toBe('network');
    expect(classifyAuthError(null)).toBe('other');
    // Sign-ups switched off in Supabase Auth (the invitation-only beta) gets its own, friendly answer.
    expect(classifyAuthError({ code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toBe('invite-only');
    expect(classifyAuthError({ message: 'Signups not allowed for this instance' })).toBe('invite-only');
    expect(AUTH_FAILURE_COPY['invite-only']).toMatch(/Forgot password/);
    for (const copy of Object.values(AUTH_FAILURE_COPY)) expect(copy.length).toBeGreaterThan(10);
  });
});

describe('invite links', () => {
  it('builds and parses a link that carries only the code', () => {
    const url = buildInviteUrl(CODE, 'https://app.example.com/');
    expect(url).toBe(`https://app.example.com/invite/${CODE}`);
    expect(parseInviteCode(url)).toBe(CODE);
    expect(parseInviteCode(`${url}?utm=x`)).toBe(CODE);
    expect(parseInviteCode(`  ${url}/  `)).toBe(CODE);
    expect(parseInviteCode(CODE.toUpperCase())).toBe(CODE);
  });

  it('rejects anything that is not a 256-bit code', () => {
    for (const bad of ['', null, undefined, 'abc', 'zz'.repeat(32), 'ab'.repeat(31), 'https://x.test/invite/abc']) expect(parseInviteCode(bad as never)).toBeNull();
    expect(isInviteCode(CODE)).toBe(true);
    expect(isInviteCode(`${CODE}0`)).toBe(false);
  });

  it('words the share message without names or addresses, and says what the link does', () => {
    const message = inviteShareMessage(`https://x.test/invite/${CODE}`, 'partner', 'Alex');
    expect(message).toMatch(/Alex has invited you to plan days out together/);
    expect(message).toMatch(/once and expires in 7 days/);
    expect(inviteShareMessage('u', 'friend')).toMatch(/^I’ve invited you/);
  });
});

describe('what a connection shares', () => {
  const profile = {
    id: 'f', parentName: 'Alex Morgan', homeLocation: 'Islington', homeLatitude: 51.5362, homeLongitude: -0.103, budgetTier: 'moderate', maxDriveMinutes: 30, completionPercent: 100,
    members: [
      { id: 'p', name: 'Alex Morgan', role: 'parent', dateOfBirth: '1988-03-02', age: 38 },
      { id: 'c1', name: 'Sloane Morgan', role: 'child', dateOfBirth: '2019-02-10', age: 7, mobility: ['walks'] },
      { id: 'c2', name: 'Theo Morgan', role: 'child', dateOfBirth: '2024-05-04', age: 2, mobility: ['buggy'] },
    ],
    mustHaveFacilities: ['baby_changing'], routines: [{ id: 'r', kind: 'nap', time: '12:30', durationMinutes: 90, atHome: true, childId: 'c2' }],
  } as unknown as FamilyProfile;

  it('is labelled by first name and carries ages, never names, dates of birth or the street', () => {
    const snap = snapshotForSharing(profile, 'partner');
    expect(snap.label).toBe('Alex’s family');
    expect(snap.ages).toEqual([7, 2]);
    expect(snap.relationship).toBe('partner');
    const text = JSON.stringify(snap);
    for (const secret of ['Sloane', 'Theo', 'Morgan', '2019-02-10', '1988']) expect(text, secret).not.toContain(secret);
  });

  it('sends only the consented allow-list, with the location rounded on the device', () => {
    const snap = snapshotForSharing(profile, 'partner');
    expect(Object.keys(snap).sort()).toEqual(
      ['ages', 'area', 'budgetTier', 'label', 'latitude', 'longitude', 'maxDriveMinutes', 'preferencesStated', 'pushchair', 'relationship', 'required', 'shareAvailability'].sort(),
    );
    expect(snap.latitude).toBe(51.54);
    expect(snap.longitude).toBe(-0.1);
    expect(snap.routines).toBeUndefined();
    expect(JSON.stringify(snap)).not.toContain('51.5362');
  });

  it('cuts a postcode or street address back to a neighbourhood', () => {
    expect(coarseArea('WD23 4AB')).toBe('WD23');
    expect(coarseArea('wd234ab')).toBe('WD23');
    expect(coarseArea('12 High Street, Bushey')).toBe('Bushey');
    expect(coarseArea('Islington')).toBe('Islington');
    expect(coarseArea('')).toBe('Nearby');
    expect(coarseArea('N1 9GU')).toBe('N1');
  });

  it('shares home busy times only when asked, and the child is not named even then', () => {
    const snap = snapshotForSharing(profile, undefined, true);
    expect(snap.shareAvailability).toBe(true);
    expect(snap.routines?.length).toBe(1);
    expect(JSON.stringify(snap)).not.toMatch(/Theo|childId/);
  });

  it('refuses to share a household that has not said where it is', () => {
    expect(() => snapshotForSharing({ ...profile, homeLatitude: null, homeLongitude: null, homeLocation: '' } as FamilyProfile)).toThrow(/family details/);
  });
});

describe('links that cannot be used', () => {
  it('reads the reason Supabase puts in the address, and nothing else', () => {
    expect(parseAuthLinkError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBe('link-expired');
    expect(parseAuthLinkError('#error=access_denied&error_description=Email+link+has+already+been+used')).toBe('link-expired');
    expect(parseAuthLinkError('#error=server_error&error_code=unexpected_failure')).toBe('link-invalid');
    expect(parseAuthLinkError('#access_token=abc&type=recovery')).toBeNull();
    expect(parseAuthLinkError('')).toBeNull();
    expect(parseAuthLinkError(undefined)).toBeNull();
    expect(AUTH_FAILURE_COPY['link-expired']).toMatch(/Forgot password/);
    expect(AUTH_FAILURE_COPY['link-invalid']).toMatch(/Forgot password/);
  });
  it('who must choose a password', () => {
    expect(mustChoosePassword(null)).toBe(false);
    expect(mustChoosePassword({ invited_at: '2026-10-09' })).toBe(true);
    expect(mustChoosePassword({ invited_at: '2026-10-09', user_metadata: { password_set: true } })).toBe(false);
    expect(mustChoosePassword({ user_metadata: { password_set: false } })).toBe(true);
    expect(mustChoosePassword({})).toBe(false);
  });
});
