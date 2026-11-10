import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** Current route from the URL hash, for example '#/gallery' -> 'gallery'. Hash routing keeps the static build host-agnostic. */
export function useRoute(fallback: string): string {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return hash.replace(/^#\/?/, '') || fallback;
}
