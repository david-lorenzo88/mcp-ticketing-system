import { useCallback, useEffect, useState } from 'react';

/**
 * Just enough routing for two sections: the current path, and a navigate()
 * that pushes history so back/forward and deep links work. The server already
 * falls back to index.html for any non-API path.
 */
export type Navigate = (path: string, options?: { keepScroll?: boolean }) => void;

export function usePath(): [string, Navigate] {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback<Navigate>((next, options) => {
    if (next === window.location.pathname) return;
    window.history.pushState(null, '', next);
    setPath(next);
    if (!options?.keepScroll) window.scrollTo({ top: 0 });
  }, []);

  return [path, navigate];
}
