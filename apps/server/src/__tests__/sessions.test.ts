import { localToUtc, utcToLocalTime } from '@baltic/database';
import { describe, expect, it } from 'vitest';
import { listSessionsSchema, sessionIdentifierShape } from '../sessions/schemas.js';

describe('event-time helpers', () => {
  it('converts Gdynia wall-clock time to UTC in summer time', () => {
    expect(localToUtc('2026-09-24', '09:30', 'Europe/Warsaw').toISOString()).toBe(
      '2026-09-24T07:30:00.000Z',
    );
  });

  it('converts in winter time too', () => {
    expect(localToUtc('2026-01-15', '09:30', 'Europe/Warsaw').toISOString()).toBe(
      '2026-01-15T08:30:00.000Z',
    );
  });

  it('round-trips back to the local time', () => {
    const at = localToUtc('2026-09-26', '17:45', 'Europe/Warsaw');
    expect(utcToLocalTime(at, 'Europe/Warsaw')).toBe('17:45');
  });
});

describe('listSessionsSchema', () => {
  it('applies defaults', () => {
    const result = listSessionsSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.excludeBreaks).toBe(false);
  });

  it('accepts one day or a list of days', () => {
    expect(listSessionsSchema.parse({ day: '2026-09-24' }).day).toBe('2026-09-24');
    expect(listSessionsSchema.parse({ day: ['2026-09-24', '2026-09-25'] }).day).toHaveLength(2);
  });

  it('rejects a malformed day', () => {
    expect(listSessionsSchema.safeParse({ day: '24/09/2026' }).success).toBe(false);
  });

  it('pads single-digit hours and rejects impossible times', () => {
    expect(listSessionsSchema.parse({ from: '9:05' }).from).toBe('09:05');
    expect(listSessionsSchema.safeParse({ to: '25:00' }).success).toBe(false);
  });

  it('accepts "true"/"false" strings for excludeBreaks', () => {
    expect(listSessionsSchema.parse({ excludeBreaks: 'true' }).excludeBreaks).toBe(true);
  });

  it('only accepts known formats', () => {
    expect(listSessionsSchema.safeParse({ format: 'KEYNOTE' }).success).toBe(true);
    expect(listSessionsSchema.safeParse({ format: 'KEYNOTES' }).success).toBe(false);
  });

  it('caps the page size', () => {
    expect(listSessionsSchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });

  it('requires a non-empty session identifier', () => {
    expect(sessionIdentifierShape.identifier.safeParse('  ').success).toBe(false);
  });
});
