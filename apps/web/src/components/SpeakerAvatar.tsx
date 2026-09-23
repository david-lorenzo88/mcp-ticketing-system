import { useState } from 'react';
import { initialsOf } from '../lib/format';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  md: 'h-12 w-12 text-sm',
} as const;

/**
 * Speaker photo, falling back to initials when there is no photo or it fails
 * to load (the photos are hotlinked from the event platform's CDN).
 */
export function SpeakerAvatar({
  name,
  photoUrl,
  size = 'md',
  className = '',
}: {
  name: string;
  photoUrl: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${SIZES[size]} shrink-0 rounded-full bg-slate-100 object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full bg-baltic-100 font-semibold text-baltic-800 ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}
