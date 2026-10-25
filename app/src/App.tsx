import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SiteFooter } from '@/components/site-footer';
import { ErrorBoundary, Toaster, toast } from '@/ui';
import { ErrorScreen } from '@/pages/error';
import { AppRoutes } from '@/routes/app-routes';
import { useSessionStore } from '@/stores/session-store';
import { isApiError } from '@/api/errors';
import { outbox } from '@/api/outbox';
import { queryKeys } from '@/api/query-keys';
import { startSettingsSync } from '@/bootstrap/settings-sync';
import { installGlobalErrorHandlers } from '@/bootstrap/error-reporting';
import { probeUiTextures } from '@/bootstrap/ui-env';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The API client already retries network errors; only retry 5xx once more here.
      retry: (count, error) => count < 1 && isApiError(error) && error.status >= 500,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

/** One-time app services: session bootstrap, settings sync, error reporting, offline outbox. */
function AppServices() {
  const status = useSessionStore((s) => s.status);

  useEffect(() => {
    probeUiTextures();
    const disposers = [installGlobalErrorHandlers(), startSettingsSync()];
    void useSessionStore.getState().bootstrap();
    const unsub = outbox.subscribe((e) => {
      if (e.type === 'queued') {
        toast.info('Result saved for later', { description: 'You appear to be offline. Your mission result will be submitted automatically.' });
      } else if (e.type === 'flushed') {
        toast.success('Mission result submitted', { description: `Score ${e.response.score.toLocaleString('en-GB')} recorded.` });
        void queryClient.invalidateQueries({ queryKey: queryKeys.progress });
        void queryClient.invalidateQueries({ queryKey: queryKeys.leaderboardAll });
        useSessionStore.getState().patchMe({ profile: e.response.profile });
      } else if (e.type === 'dropped') {
        toast.error('A saved mission result was rejected', { description: 'It could not be verified by the server.' });
      }
    });
    return () => {
      disposers.forEach((d) => d());
      unsub();
    };
  }, []);

  // Retry queued results once we know who is signed in, and whenever we come back online.
  useEffect(() => {
    if (status !== 'authenticated') return;
    return outbox.start();
  }, [status]);

  return null;
}

/** Root: query client, router, top-level error boundary, toasts, session bootstrap. */
export default function App() {
  return (
    <ErrorBoundary fallback={({ error, reset }) => <ErrorScreen error={error} reset={reset} />}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <a href="#main" className="sr-only z-[200] rounded bg-parchment-100 px-3 py-2 font-heading text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
            Skip to content
          </a>
          <AppServices />
          <AppRoutes />
          <SiteFooter />
          <Toaster />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
