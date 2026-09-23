import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormatBadge, TagBadge } from '../components/SessionBadges';
import { SessionDetailDialog } from '../components/SessionDetailDialog';
import { formatDayLong, formatDayShort, formatTimeRange } from '../lib/format';
import type { Navigate } from '../lib/router';
import {
  getSessionFilters,
  listSessions,
  MAX_PAGE_SIZE,
  SESSION_FORMAT_LABELS,
  type SessionFilters,
  type SessionFormat,
  type SessionListResult,
  type SessionSummary,
} from '../lib/sessions';

interface SessionsPageProps {
  path: string;
  navigate: Navigate;
}

/** Non-content slots: shown muted in the agenda and left out of the counts. */
const isBreakLike = (s: SessionSummary) => s.format === 'BREAK' || s.format === 'OTHER';

interface DayGroup {
  day: string | null;
  slots: Array<{ key: string; start: string | null; end: string | null; sessions: SessionSummary[] }>;
  count: number;
}

/** The API returns the agenda already ordered by day, start and room. */
function groupAgenda(sessions: SessionSummary[]): DayGroup[] {
  const days: DayGroup[] = [];
  for (const session of sessions) {
    let day = days.at(-1);
    if (!day || day.day !== session.day) {
      day = { day: session.day, slots: [], count: 0 };
      days.push(day);
    }
    const key = `${session.start ?? ''}-${session.end ?? ''}`;
    let slot = day.slots.at(-1);
    if (!slot || slot.key !== key) {
      slot = { key, start: session.start, end: session.end, sessions: [] };
      day.slots.push(slot);
    }
    slot.sessions.push(session);
    if (!isBreakLike(session)) day.count += 1;
  }
  return days;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function SessionCard({ session, onOpen }: { session: SessionSummary; onOpen: () => void }) {
  if (isBreakLike(session)) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-500 hover:border-slate-300"
      >
        <span className="font-medium text-slate-600">{session.title}</span>
        {session.room && <span className="shrink-0 text-xs">{session.room}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full cursor-pointer flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xs transition-colors hover:border-baltic-300 hover:bg-baltic-50/40"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <FormatBadge format={session.format} label={session.formatLabel} />
        {session.room && <span className="text-xs text-slate-500">{session.room}</span>}
      </div>
      <div className="line-clamp-3 text-sm font-semibold text-slate-900">{session.title}</div>
      {session.speakers.length > 0 && (
        <div className="text-xs text-slate-600">
          {session.speakers.map((s) => s.name).join(', ')}
        </div>
      )}
      {session.tags.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {session.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>
      )}
    </button>
  );
}

export function SessionsPage({ path, navigate }: SessionsPageProps) {
  const selectedId = path.startsWith('/sessions/')
    ? decodeURIComponent(path.slice('/sessions/'.length))
    : null;

  const [filters, setFilters] = useState<SessionFilters | null>(null);
  const [result, setResult] = useState<SessionListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [day, setDay] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [room, setRoom] = useState('');
  const [format, setFormat] = useState<SessionFormat | ''>('');
  const [tag, setTag] = useState('');
  const [hideBreaks, setHideBreaks] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    getSessionFilters()
      .then(setFilters)
      .catch(() => setFilters(null));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setResult(
        await listSessions({
          search: debouncedSearch || undefined,
          day: day || undefined,
          room: room || undefined,
          format: format || undefined,
          tag: tag || undefined,
          excludeBreaks: hideBreaks,
        }),
      );
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load sessions.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, day, room, format, tag, hideBreaks]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The API's excludeBreaks drops BREAK slots; the welcome, sponsor and other
  // non-content slots are hidden here too so "Hide breaks" leaves only sessions.
  const visible = useMemo(
    () => (result?.sessions ?? []).filter((s) => !hideBreaks || !isBreakLike(s)),
    [result, hideBreaks],
  );
  const groups = useMemo(() => groupAgenda(visible), [visible]);

  const hasFilters = Boolean(debouncedSearch || room || format || tag || hideBreaks);
  const resetFilters = () => {
    setSearch('');
    setRoom('');
    setFormat('');
    setTag('');
    setHideBreaks(false);
  };

  const closeDetail = useCallback(() => navigate('/sessions', { keepScroll: true }), [navigate]);
  const openSession = useCallback(
    (id: string) => navigate(`/sessions/${encodeURIComponent(id)}`, { keepScroll: true }),
    [navigate],
  );

  const contentCount = filters
    ? filters.formats
        .filter((f) => f.format !== 'BREAK' && f.format !== 'OTHER')
        .reduce((sum, f) => sum + f.sessions, 0)
    : 0;
  const workshops = filters?.formats.find((f) => f.format === 'WORKSHOP')?.sessions ?? 0;
  const matching = visible.filter((s) => !isBreakLike(s)).length;

  return (
    <>
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Sessions</h1>
        <p className="text-sm text-slate-500">
          Baltic Summit 2026 agenda. Times are local ({filters?.timezone ?? 'Europe/Warsaw'}).
        </p>
      </div>

      {filters ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Sessions"
            value={String(contentCount)}
            hint={
              filters.unscheduledSessions
                ? `${filters.unscheduledSessions} not yet scheduled`
                : `Over ${filters.days.length} days`
            }
          />
          <Tile label="Speakers" value={String(filters.speakers)} />
          <Tile label="Workshops" value={String(workshops)} hint="Full-day, hands-on" />
          <Tile label="Rooms" value={String(filters.rooms.length)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card h-[86px] animate-pulse bg-slate-100" />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div
          role="tablist"
          aria-label="Day"
          className="flex gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1"
        >
          {[{ day: '', label: 'All days' }, ...(filters?.days ?? []).map((d) => ({
            day: d.day,
            label: formatDayShort(d.day),
          }))].map((tab) => {
            const current = day === tab.day;
            return (
              <button
                key={tab.day || 'all'}
                type="button"
                role="tab"
                aria-selected={current}
                onClick={() => setDay(tab.day)}
                className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  current ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative lg:max-w-xs lg:flex-1">
            <svg
              viewBox="0 0 20 20"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 3.23 9.95l3.16 3.16a.75.75 0 1 0 1.06-1.06l-3.16-3.16A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, description or speaker"
              aria-label="Search sessions"
              className="field pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
            <select
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              aria-label="Filter by room"
              className="field sm:w-48"
            >
              <option value="">All rooms</option>
              {filters?.rooms.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as SessionFormat | '')}
              aria-label="Filter by format"
              className="field sm:w-40"
            >
              <option value="">All formats</option>
              {filters?.formats.map((f) => (
                <option key={f.format} value={f.format}>
                  {SESSION_FORMAT_LABELS[f.format]} ({f.sessions})
                </option>
              ))}
            </select>

            {filters && filters.tags.length > 0 && (
              <select
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                aria-label="Filter by tag"
                className="field sm:w-40"
              >
                <option value="">All tags</option>
                {filters.tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 select-none">
              <input
                type="checkbox"
                checked={hideBreaks}
                onChange={(event) => setHideBreaks(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-baltic-600"
              />
              Hide breaks
            </label>

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="cursor-pointer px-2 py-1.5 text-left text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">
          <span>{loadError}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      {loading && !result ? (
        <div className="card divide-y divide-slate-100">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex animate-pulse gap-4 px-4 py-4">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded bg-slate-200" />
                <div className="h-3 w-1/3 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
          <p className="font-medium text-slate-700">No sessions match these filters</p>
          <p className="text-sm text-slate-500">Try another day, or clear the search and filters.</p>
        </div>
      ) : (
        <div className={`space-y-8 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {hasFilters && (
            <p className="text-sm text-slate-500">
              {matching} matching session{matching === 1 ? '' : 's'}
            </p>
          )}

          {groups.map((group) => (
            <section key={group.day ?? 'unscheduled'} aria-label={group.day ?? 'Not yet scheduled'}>
              <h2 className="mb-3 flex items-baseline gap-2">
                <span className="text-base font-semibold text-slate-900">
                  {group.day ? formatDayLong(group.day) : 'Not yet scheduled'}
                </span>
                <span className="text-sm text-slate-500">
                  {group.count} session{group.count === 1 ? '' : 's'}
                </span>
              </h2>

              <ol className="card divide-y divide-slate-100">
                {group.slots.map((slot) => (
                  <li key={slot.key} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:gap-6">
                    <div className="shrink-0 text-sm font-medium text-slate-700 tabular-nums sm:w-28 sm:pt-2">
                      {formatTimeRange(slot.start, slot.end) || '—'}
                    </div>
                    <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {slot.sessions.map((session) => (
                        <div
                          key={session.id}
                          className={isBreakLike(session) ? 'sm:col-span-2 xl:col-span-3' : ''}
                        >
                          <SessionCard session={session} onOpen={() => openSession(session.id)} />
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {result && result.pagination.total > MAX_PAGE_SIZE && (
            <p className="text-sm text-slate-500">
              Showing the first {MAX_PAGE_SIZE} of {result.pagination.total}. Narrow the filters to
              see the rest.
            </p>
          )}
        </div>
      )}

      {selectedId && (
        <SessionDetailDialog
          sessionId={selectedId}
          onClose={closeDetail}
          onOpenSession={openSession}
        />
      )}
    </>
  );
}
