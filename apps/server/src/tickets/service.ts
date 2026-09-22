import { getPrisma, Prisma, type Ticket } from '@baltic/database';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  formatTicketNumber,
  parseTicketReference,
  ticketIdentifierWhere,
} from '../lib/ticket-number.js';
import type { CreateTicketInput, ListTicketsInput, UpdateTicketInput } from './schemas.js';

/** The shape returned by both the REST API and the MCP tools. */
export interface TicketDto {
  id: string;
  ticketNumber: string;
  reference: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  ticketType: Ticket['ticketType'];
  status: Ticket['status'];
  priceAmount: number;
  currency: string;
  dietaryRequirements: string | null;
  notes: string | null;
  checkedInAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListResult {
  tickets: TicketDto[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface TicketStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  checkedIn: number;
  admissionRate: number;
  revenue: { amount: number; currency: string };
}

const toIso = (value: Date | null): string | null => value?.toISOString() ?? null;

export function toDto(ticket: Ticket): TicketDto {
  return {
    id: ticket.id,
    ticketNumber: formatTicketNumber(ticket.reference),
    reference: ticket.reference,
    firstName: ticket.firstName,
    lastName: ticket.lastName,
    fullName: `${ticket.firstName} ${ticket.lastName}`,
    email: ticket.email,
    phone: ticket.phone,
    company: ticket.company,
    jobTitle: ticket.jobTitle,
    ticketType: ticket.ticketType,
    status: ticket.status,
    priceAmount: Number(ticket.priceAmount),
    currency: ticket.currency,
    dietaryRequirements: ticket.dietaryRequirements,
    notes: ticket.notes,
    checkedInAt: toIso(ticket.checkedInAt),
    cancelledAt: toIso(ticket.cancelledAt),
    cancellationReason: ticket.cancellationReason,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

const asArray = <T>(value: T | T[] | undefined): T[] | undefined => {
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : [value];
  return list.length > 0 ? list : undefined;
};

export async function listTickets(input: ListTicketsInput): Promise<TicketListResult> {
  const prisma = getPrisma();
  const { search, page, pageSize, sortBy, sortOrder } = input;

  const statuses = asArray(input.status);
  const types = asArray(input.ticketType);
  const searchReference = search ? parseTicketReference(search) : null;

  const where: Prisma.TicketWhereInput = {
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(types ? { ticketType: { in: types } } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { company: { contains: search, mode: 'insensitive' as const } },
            // Let a bare or prefixed ticket number match too. parseTicketReference
            // takes the trailing digit group, so the digits in the "BS26" prefix
            // are not mistaken for part of the reference.
            ...(searchReference !== null ? [{ reference: searchReference }] : []),
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    tickets: rows.map(toDto),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function findTicketOrThrow(identifier: string): Promise<Ticket> {
  const where = ticketIdentifierWhere(identifier);
  if (!where) {
    throw new ValidationError(
      `"${identifier}" is not a valid ticket id or ticket number. Expected a UUID or something like BS26-00042.`,
    );
  }

  const ticket = await getPrisma().ticket.findUnique({ where });
  if (!ticket) throw new NotFoundError(`No ticket found for "${identifier}".`);
  return ticket;
}

export async function getTicket(identifier: string): Promise<TicketDto> {
  return toDto(await findTicketOrThrow(identifier));
}

export async function createTicket(input: CreateTicketInput): Promise<TicketDto> {
  const now = new Date();

  const ticket = await getPrisma().ticket.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      company: input.company ?? null,
      jobTitle: input.jobTitle ?? null,
      ticketType: input.ticketType,
      status: input.status,
      priceAmount: new Prisma.Decimal(input.priceAmount.toFixed(2)),
      currency: input.currency,
      dietaryRequirements: input.dietaryRequirements ?? null,
      notes: input.notes ?? null,
      checkedInAt: input.status === 'CHECKED_IN' ? now : null,
      cancelledAt: input.status === 'CANCELLED' ? now : null,
    },
  });

  return toDto(ticket);
}

export async function updateTicket(
  identifier: string,
  input: UpdateTicketInput,
): Promise<TicketDto> {
  const existing = await findTicketOrThrow(identifier);
  const now = new Date();

  const data: Prisma.TicketUpdateInput = {};

  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone || null;
  if (input.company !== undefined) data.company = input.company || null;
  if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle || null;
  if (input.ticketType !== undefined) data.ticketType = input.ticketType;
  if (input.priceAmount !== undefined) {
    data.priceAmount = new Prisma.Decimal(input.priceAmount.toFixed(2));
  }
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.dietaryRequirements !== undefined) {
    data.dietaryRequirements = input.dietaryRequirements || null;
  }
  if (input.notes !== undefined) data.notes = input.notes || null;

  // Keep the lifecycle timestamps consistent with any status change.
  if (input.status !== undefined && input.status !== existing.status) {
    data.status = input.status;

    data.checkedInAt = input.status === 'CHECKED_IN' ? (existing.checkedInAt ?? now) : null;

    if (input.status === 'CANCELLED') {
      data.cancelledAt = existing.cancelledAt ?? now;
    } else {
      data.cancelledAt = null;
      data.cancellationReason = null;
    }
  }

  const ticket = await getPrisma().ticket.update({ where: { id: existing.id }, data });
  return toDto(ticket);
}

export async function cancelTicket(identifier: string, reason?: string): Promise<TicketDto> {
  const existing = await findTicketOrThrow(identifier);

  if (existing.status === 'CANCELLED') {
    throw new ConflictError(
      `Ticket ${formatTicketNumber(existing.reference)} was already cancelled on ` +
        `${existing.cancelledAt?.toISOString() ?? 'an earlier date'}.`,
    );
  }

  const ticket = await getPrisma().ticket.update({
    where: { id: existing.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancellationReason: reason ?? null,
      checkedInAt: null,
    },
  });

  return toDto(ticket);
}

export async function checkInTicket(identifier: string): Promise<TicketDto> {
  const existing = await findTicketOrThrow(identifier);
  const number = formatTicketNumber(existing.reference);

  if (existing.status === 'CANCELLED') {
    throw new ConflictError(
      `Ticket ${number} is cancelled and is not valid for admission. Reinstate it first if the attendee should be let in.`,
    );
  }

  if (existing.status === 'CHECKED_IN') {
    throw new ConflictError(
      `Ticket ${number} was already checked in at ${existing.checkedInAt?.toISOString() ?? 'an earlier time'}.`,
    );
  }

  const ticket = await getPrisma().ticket.update({
    where: { id: existing.id },
    data: { status: 'CHECKED_IN', checkedInAt: new Date() },
  });

  return toDto(ticket);
}

export async function getTicketStats(): Promise<TicketStats> {
  const prisma = getPrisma();

  const [total, byStatusRows, byTypeRows, revenue] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['ticketType'], _count: { _all: true } }),
    prisma.ticket.aggregate({
      _sum: { priceAmount: true },
      where: { status: { not: 'CANCELLED' } },
    }),
  ]);

  const byStatus = Object.fromEntries(byStatusRows.map((r) => [r.status, r._count._all]));
  const byType = Object.fromEntries(byTypeRows.map((r) => [r.ticketType, r._count._all]));

  const checkedIn = byStatus.CHECKED_IN ?? 0;
  const admissible = total - (byStatus.CANCELLED ?? 0);

  return {
    total,
    byStatus,
    byType,
    checkedIn,
    admissionRate: admissible > 0 ? Math.round((checkedIn / admissible) * 100) : 0,
    revenue: {
      amount: Number(revenue._sum.priceAmount ?? 0),
      currency: 'PLN',
    },
  };
}
