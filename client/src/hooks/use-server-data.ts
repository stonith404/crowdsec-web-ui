import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRefresh } from '../contexts/useRefresh';

interface ServerData<T> {
  data: T | null;
  /** True until the first response arrived */
  loading: boolean;
  /** True while a later request runs, during which the last data stays shown */
  busy: boolean;
  error: unknown;
  reload: () => void;
}

/**
 * Loads data for a page and loads it again whenever its key changes or the server reports new data.
 * Responses of superseded requests are dropped, so a slow old page never overwrites a newer one.
 */
export function useServerData<T>(key: string, load: (signal: AbortSignal) => Promise<T>): ServerData<T> {
  const { refreshSignal } = useRefresh();
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${key}|${refreshSignal}|${reloadToken}`;
  const [result, setResult] = useState<{ key: string | null; data: T | null; error: unknown }>({ key: null, data: null, error: null });
  const loadRef = useRef(load);

  useLayoutEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult((current) => ({ key: requestKey, data: current.data, error }));
      },
    );
    return () => controller.abort();
  }, [requestKey]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data: result.data, loading: result.key === null, busy: result.key !== requestKey, error: result.error, reload };
}
