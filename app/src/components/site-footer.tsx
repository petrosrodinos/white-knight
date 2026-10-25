import { useLocation } from 'react-router-dom';

/** "Powered by" credit pinned to the bottom of every page (hidden on the full-screen game canvas). */
export function SiteFooter() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/play/')) return null;
  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-[5] flex justify-center px-4 pb-1 text-[11px] text-parchment-100/60">
      <p className="pointer-events-auto rounded bg-black/40 px-2 py-0.5">
        Powered by{' '}
        <a href="https://logiqdev.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-parchment-100">
          logiqdev
        </a>
      </p>
    </footer>
  );
}
