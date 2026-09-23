/**
 * Wall-clock helpers for the event's timezone.
 *
 * The agenda is published in local time (Gdynia, Europe/Warsaw), while the
 * database stores instants in UTC. The importer and the MCP tools both convert
 * through these functions so a session imported at "09:30" is also found by a
 * "09:30" filter, whatever timezone the server itself runs in.
 */

/** Offset of `timeZone` from UTC, in minutes, at the given instant. */
function offsetMinutes(timeZone: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** `"2026-09-24"` + `"09:30"` in `timeZone` → the matching UTC instant. */
export function localToUtc(day: string, time: string, timeZone: string): Date {
  const naive = new Date(`${day}T${time}:00Z`);
  // A second pass settles correctly on a DST changeover day.
  const first = new Date(naive.getTime() - offsetMinutes(timeZone, naive) * 60_000);
  return new Date(naive.getTime() - offsetMinutes(timeZone, first) * 60_000);
}

/** UTC instant → `"09:30"` in `timeZone`. */
export function utcToLocalTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}
