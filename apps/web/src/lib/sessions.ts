import { request } from './api';

export const SESSION_FORMATS = [
  'KEYNOTE',
  'TALK',
  'WORKSHOP',
  'PANEL',
  'LIGHTNING',
  'BREAK',
  'OTHER',
] as const;

export type SessionFormat = (typeof SESSION_FORMATS)[number];

export const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  KEYNOTE: 'Keynote',
  TALK: 'Talk',
  WORKSHOP: 'Workshop',
  PANEL: 'Panel',
  LIGHTNING: 'Lightning talk',
  BREAK: 'Break',
  OTHER: 'Other',
};

export interface SessionSpeaker {
  id: string;
  name: string;
  company: string | null;
  badges: string[];
  photoUrl: string | null;
}

export interface SessionSpeakerDetail extends SessionSpeaker {
  jobTitle: string | null;
  tagline: string | null;
  bio: string | null;
  links: Record<string, string> | null;
}

export interface SessionSummary {
  id: string;
  externalId: string;
  title: string;
  day: string | null;
  dayName: string | null;
  start: string | null;
  end: string | null;
  durationMinutes: number | null;
  timezone: string;
  room: string | null;
  format: SessionFormat;
  formatLabel: string | null;
  track: string | null;
  level: string | null;
  language: string | null;
  tags: string[];
  speakers: SessionSpeaker[];
  abstract: string | null;
}

export interface SessionDetail extends Omit<SessionSummary, 'speakers' | 'abstract'> {
  description: string | null;
  url: string | null;
  partnerUrl: string | null;
  speakers: SessionSpeakerDetail[];
  concurrentSessions: Array<Pick<SessionSummary, 'id' | 'title' | 'room' | 'start' | 'end'>>;
}

export interface SessionListResult {
  sessions: SessionSummary[];
  byDay: Array<{ day: string; dayName: string; sessions: number }>;
  unscheduled: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface SessionFilters {
  timezone: string;
  days: Array<{
    day: string;
    dayName: string;
    sessions: number;
    firstStart: string | null;
    lastEnd: string | null;
  }>;
  rooms: string[];
  tracks: string[];
  formats: Array<{ format: SessionFormat; sessions: number }>;
  levels: string[];
  languages: string[];
  tags: string[];
  badges: Array<{ badge: string; speakers: number }>;
  speakers: number;
  totalSessions: number;
  unscheduledSessions: number;
}

export interface SessionQuery {
  search?: string;
  day?: string;
  room?: string;
  format?: SessionFormat;
  tag?: string;
  badge?: string;
  excludeBreaks?: boolean;
}

const BASE = '/api/sessions';

/** The whole agenda fits in one page, so the UI asks for the maximum. */
export const MAX_PAGE_SIZE = 200;

export function listSessions(query: SessionQuery): Promise<SessionListResult> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.day) params.set('day', query.day);
  if (query.room) params.set('room', query.room);
  if (query.format) params.set('format', query.format);
  if (query.tag) params.set('tag', query.tag);
  if (query.badge) params.set('badge', query.badge);
  if (query.excludeBreaks) params.set('excludeBreaks', 'true');
  params.set('pageSize', String(MAX_PAGE_SIZE));
  return request<SessionListResult>(`${BASE}?${params}`);
}

export const getSessionFilters = (): Promise<SessionFilters> =>
  request<SessionFilters>(`${BASE}/filters`);

export const getSession = (id: string): Promise<SessionDetail> =>
  request<SessionDetail>(`${BASE}/${encodeURIComponent(id)}`);
