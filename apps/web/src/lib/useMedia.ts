import { useEffect, useState } from 'react';
/** true bila media query cocok (mis. desktop `(min-width:1024px)`). */
export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => { const mq = window.matchMedia(query); const h = () => setM(mq.matches); h(); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, [query]);
  return m;
}
