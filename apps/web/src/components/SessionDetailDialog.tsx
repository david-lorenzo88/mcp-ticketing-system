import { useEffect, useState } from 'react';
import { getSession, type SessionDetail, type SessionSpeakerDetail } from '../lib/sessions';
import { formatDayLong, formatTimeRange } from '../lib/format';
import { Modal } from './Modal';
import { FormatBadge, SpeakerBadge, TagBadge } from './SessionBadges';
import { SpeakerAvatar } from './SpeakerAvatar';

interface SessionDetailDialogProps {
  sessionId: string;
  onClose: () => void;
  onOpenSession: (id: string) => void;
}

const LINK_LABELS: Record<string, string> = { linkedin: 'LinkedIn', twitter: 'X / Twitter', website: 'Website' };

/** Long bios are clamped to a few lines until expanded. */
const BIO_CLAMP_CHARS = 360;

function SpeakerProfile({ speaker }: { speaker: SessionSpeakerDetail }) {
  const [expanded, setExpanded] = useState(false);
  const longBio = (speaker.bio?.length ?? 0) > BIO_CLAMP_CHARS;
  const subtitle = [speaker.jobTitle, speaker.company].filter(Boolean).join(' · ');
  const links = Object.entries(speaker.links ?? {});

  return (
    <li className="flex gap-3">
      <SpeakerAvatar name={speaker.name} photoUrl={speaker.photoUrl} />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-900">{speaker.name}</span>
          {speaker.badges.map((badge) => (
            <SpeakerBadge key={badge} badge={badge} />
          ))}
        </div>
        {subtitle && <div className="text-xs font-medium text-slate-600">{subtitle}</div>}
        {speaker.tagline && <div className="text-xs text-slate-500">{speaker.tagline}</div>}
        {speaker.bio && (
          <div className="mt-1.5">
            <p
              className={`text-sm whitespace-pre-line text-slate-600 ${
                longBio && !expanded ? 'line-clamp-4' : ''
              }`}
            >
              {speaker.bio}
            </p>
            {longBio && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-0.5 cursor-pointer text-xs font-medium text-baltic-700 hover:text-baltic-900"
              >
                {expanded ? 'Show less' : 'Read full bio'}
              </button>
            )}
          </div>
        )}
        {links.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
            {links.map(([kind, url]) => (
              <a
                key={kind}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-baltic-700 underline underline-offset-2 hover:text-baltic-900"
              >
                {LINK_LABELS[kind] ?? kind}
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function whenLabel(session: SessionDetail): string {
  if (!session.day) return 'Not yet scheduled';
  const parts = [formatDayLong(session.day)];
  const time = formatTimeRange(session.start, session.end);
  if (time) parts.push(time);
  if (session.room) parts.push(session.room);
  return parts.join(' · ');
}

export function SessionDetailDialog({ sessionId, onClose, onOpenSession }: SessionDetailDialogProps) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setError(null);
    getSession(sessionId)
      .then((result) => !cancelled && setSession(result))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this session.');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const title = session?.title ?? (error ? 'Session not found' : 'Loading session…');

  return (
    <Modal
      title={title}
      description={session ? whenLabel(session) : undefined}
      onClose={onClose}
      footer={
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      }
    >
      {error && <p className="text-sm text-rose-700">{error}</p>}

      {!session && !error && (
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-5/6 rounded bg-slate-100" />
          <div className="h-3 w-2/3 rounded bg-slate-100" />
        </div>
      )}

      {session && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <FormatBadge format={session.format} label={session.formatLabel} />
            {session.durationMinutes !== null && (
              <span className="text-xs text-slate-500 tabular-nums">
                {session.durationMinutes >= 120
                  ? `${Math.round((session.durationMinutes / 60) * 10) / 10} h`
                  : `${session.durationMinutes} min`}
              </span>
            )}
            {[session.track, session.level, session.language]
              .filter((value): value is string => Boolean(value))
              .map((value) => (
                <TagBadge key={value} tag={value} />
              ))}
            {session.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>

          {session.speakers.length > 0 && (
            <section>
              <h3 className="label">{session.speakers.length === 1 ? 'Speaker' : 'Speakers'}</h3>
              <ul className="space-y-4">
                {session.speakers.map((speaker) => (
                  <SpeakerProfile key={speaker.id} speaker={speaker} />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="label">Description</h3>
            {session.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">
                {session.description}
              </p>
            ) : (
              <p className="text-sm text-slate-400">No description published.</p>
            )}
          </section>

          {session.concurrentSessions.length > 0 && (
            <section>
              <h3 className="label">Also on at this time</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {session.concurrentSessions.map((other) => (
                  <li key={other.id}>
                    <button
                      type="button"
                      onClick={() => onOpenSession(other.id)}
                      className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-baltic-700">{other.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {[formatTimeRange(other.start, other.end), other.room].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(session.partnerUrl || session.url) && (
            <section className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {session.partnerUrl && (
                <a
                  href={session.partnerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-baltic-700 underline underline-offset-2 hover:text-baltic-900"
                >
                  Partner website
                </a>
              )}
              {session.url && (
                <a
                  href={session.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-baltic-700 underline underline-offset-2 hover:text-baltic-900"
                >
                  View on balticsummit.pl
                </a>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
