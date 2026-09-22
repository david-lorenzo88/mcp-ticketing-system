import { describe, expect, it } from 'vitest';
import { formatTicketNumber, isUuid, parseTicketReference, ticketIdentifierWhere } from '../lib/ticket-number.js';
import { createTicketSchema, listTicketsSchema, updateTicketSchema } from '../tickets/schemas.js';

describe('ticket numbers', () => {
  it('renders a padded, prefixed number', () => {
    expect(formatTicketNumber(42)).toBe('BS26-00042');
    expect(formatTicketNumber(1)).toBe('BS26-00001');
    expect(formatTicketNumber(123456)).toBe('BS26-123456');
  });

  it('parses every shape a human might type', () => {
    expect(parseTicketReference('BS26-00042')).toBe(42);
    expect(parseTicketReference('bs26-42')).toBe(42);
    expect(parseTicketReference('  #42 ')).toBe(42);
    expect(parseTicketReference('42')).toBe(42);
  });

  it('ignores digits in the prefix, taking only the trailing group', () => {
    // Regression: stripping every non-digit turned "BS26-00004" into 2600004.
    expect(parseTicketReference('BS26-00004')).toBe(4);
    expect(parseTicketReference('BS2026-00007')).toBe(7);
  });

  it('rejects things that are not ticket numbers', () => {
    expect(parseTicketReference('not-a-ticket')).toBeNull();
    expect(parseTicketReference('')).toBeNull();
    expect(parseTicketReference('BS26-0')).toBeNull();
  });

  it('recognises UUIDs', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(isUuid('BS26-00042')).toBe(false);
  });

  it('routes identifiers to the right where clause', () => {
    expect(ticketIdentifierWhere('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toEqual({
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });
    expect(ticketIdentifierWhere('BS26-00042')).toEqual({ reference: 42 });
    expect(ticketIdentifierWhere('nonsense')).toBeNull();
  });
});

describe('createTicketSchema', () => {
  const base = { firstName: 'Ada', lastName: 'Kowalska', email: 'Ada.Kowalska@Example.COM' };

  it('normalises email and currency, and applies defaults', () => {
    const result = createTicketSchema.parse(base);
    expect(result.email).toBe('ada.kowalska@example.com');
    expect(result.ticketType).toBe('CONFERENCE');
    expect(result.status).toBe('RESERVED');
    expect(result.priceAmount).toBe(0);
    expect(result.currency).toBe('PLN');
  });

  it('uppercases a lowercase currency code', () => {
    expect(createTicketSchema.parse({ ...base, currency: 'eur' }).currency).toBe('EUR');
  });

  it('turns blank optional strings into undefined', () => {
    expect(createTicketSchema.parse({ ...base, company: '   ' }).company).toBeUndefined();
  });

  it('rejects a malformed email', () => {
    expect(createTicketSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false);
  });

  it('rejects a negative price', () => {
    expect(createTicketSchema.safeParse({ ...base, priceAmount: -1 }).success).toBe(false);
  });

  it('rejects an unknown ticket type', () => {
    expect(createTicketSchema.safeParse({ ...base, ticketType: 'VIP' }).success).toBe(false);
  });
});

describe('updateTicketSchema', () => {
  it('requires at least one field', () => {
    expect(updateTicketSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single field', () => {
    const result = updateTicketSchema.safeParse({ jobTitle: 'CTO' });
    expect(result.success).toBe(true);
  });
});

describe('listTicketsSchema', () => {
  it('defaults to the first page, newest first', () => {
    const result = listTicketsSchema.parse({});
    expect(result).toMatchObject({ page: 1, pageSize: 25, sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('coerces numeric query strings', () => {
    expect(listTicketsSchema.parse({ page: '3', pageSize: '50' })).toMatchObject({
      page: 3,
      pageSize: 50,
    });
  });

  it('accepts a single status or a list', () => {
    expect(listTicketsSchema.parse({ status: 'CONFIRMED' }).status).toBe('CONFIRMED');
    expect(listTicketsSchema.parse({ status: ['CONFIRMED', 'RESERVED'] }).status).toEqual([
      'CONFIRMED',
      'RESERVED',
    ]);
  });

  it('caps the page size', () => {
    expect(listTicketsSchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });
});
