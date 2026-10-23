import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRefresh } from '../contexts/useRefresh';

const INSTANCE_SCOPE_STORAGE_KEY = 'crowdsec-web-ui:instance-scope';

/** The instance the pages show data for: `all` or an instance id, kept in `?instance=` and remembered per browser. */
export function useInstanceScope() {
  const { config } = useRefresh();
  const location = useLocation();
  const navigate = useNavigate();
  const instances = config?.instances ?? [];
  const requested = new URLSearchParams(location.search).get('instance');
  const current = requested || (instances.length > 1 ? 'all' : instances[0]?.id || 'all');

  const changeInstance = useCallback((instanceId: string) => {
    window.localStorage.setItem(INSTANCE_SCOPE_STORAGE_KEY, instanceId);
    const params = new URLSearchParams(location.search);
    params.set('instance', instanceId);
    navigate(`${location.pathname}?${params}`);
  }, [location.pathname, location.search, navigate]);

  return { instances, current, changeInstance };
}

/** Puts the remembered instance into the URL when several instances exist and the URL names none. */
export function useRestoreInstanceScope() {
  const { config } = useRefresh();
  const location = useLocation();
  const navigate = useNavigate();
  const instances = config?.instances;
  const requested = new URLSearchParams(location.search).get('instance');

  useEffect(() => {
    if (!instances || instances.length <= 1 || requested) return;
    const stored = window.localStorage.getItem(INSTANCE_SCOPE_STORAGE_KEY);
    const restored = stored && (stored === 'all' || instances.some((instance) => instance.id === stored)) ? stored : 'all';
    const params = new URLSearchParams(location.search);
    params.set('instance', restored);
    navigate(`${location.pathname}?${params}`, { replace: true });
  }, [instances, location.pathname, location.search, navigate, requested]);
}
