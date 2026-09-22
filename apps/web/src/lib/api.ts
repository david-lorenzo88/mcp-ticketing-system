export const TICKET_TYPES = [
  'FULL_PASS',
  'CONFERENCE',
  'WORKSHOP',
  'SPEAKER',
  'SPONSOR',
  'VOLUNTEER',
  'STUDENT',
] as const;

export const TICKET_STATUSES = ['RESERVED', 'CONFIRMED', 'CHECKED_IN', 'CANCELLED'] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Human labels, kept out of the enum values so the API stays stable. */
export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  FULL_PASS: 'Full pass',
  CONFERENCE: 'Conference',
  WORKSHOP: 'Workshop',
  SPEAKER: 'Speaker',
  SPONSOR: 'Sponsor',
  VOLUNTEER: 'Volunteer',
  STUDENT: 'Student',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  RESERVED: 'Reserved',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  CANCELLED: 'Cancelled',
};

export interface Ticket {
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
  ticketType: TicketType;
  status: TicketStatus;
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

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TicketListResult {
  tickets: Ticket[];
  pagination: Pagination;
}

export interface TicketStats {
  total: number;
  byStatus: Partial<Record<TicketStatus, number>>;
  byType: Partial<Record<TicketType, number>>;
  checkedIn: number;
  admissionRate: number;
  revenue: { amount: number; currency: string };
}

export interface TicketFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  ticketType: TicketType;
  status: TicketStatus;
  priceAmount: number;
  currency: string;
  dietaryRequirements: string;
  notes: string;
}

export interface ListQuery {
  search?: string;
  status?: TicketStatus[];
  ticketType?: TicketType[];
  page?: number;
  pageSize?: number;
}

/** Error carrying the server's message and per-field validation details. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api/tickets';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('Could not reach the ticketing service. Is the server running?', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      details?: { field: string; message: string }[];
    } | null;

    throw new ApiError(
      body?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      body?.details,
    );
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function listTickets(query: ListQuery): Promise<TicketListResult> {
  const params = new URLSearchParams();

  if (query.search) params.set('search', query.search);
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.ticketType?.length) params.set('ticketType', query.ticketType.join(','));
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 25));

  return request<TicketListResult>(`${BASE}?${params}`);
}

export const getStats = (): Promise<TicketStats> => request<TicketStats>(`${BASE}/stats`);

/** Blank optional strings are dropped so the server keeps its own defaults. */
function toPayload(values: TicketFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    ticketType: values.ticketType,
    status: values.status,
    priceAmount: values.priceAmount,
    currency: values.currency,
  };

  for (const key of ['phone', 'company', 'jobTitle', 'dietaryRequirements', 'notes'] as const) {
    payload[key] = values[key].trim();
  }

  return payload;
}

export const createTicket = (values: TicketFormValues): Promise<Ticket> =>
  request<Ticket>(BASE, { method: 'POST', body: JSON.stringify(toPayload(values)) });

export const updateTicket = (id: string, values: TicketFormValues): Promise<Ticket> =>
  request<Ticket>(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(toPayload(values)) });

export const cancelTicket = (id: string, reason: string): Promise<Ticket> =>
  request<Ticket>(`${BASE}/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason.trim() }),
  });

export const checkInTicket = (id: string): Promise<Ticket> =>
  request<Ticket>(`${BASE}/${id}/check-in`, { method: 'POST' });

/** Reinstating is a plain status change, so it reuses PATCH. */
export const reinstateTicket = (id: string): Promise<Ticket> =>
  request<Ticket>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'CONFIRMED' }),
  });
