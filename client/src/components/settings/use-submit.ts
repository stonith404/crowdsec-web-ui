import { useState } from 'react';
import { toErrorInfo, type ErrorInfo } from '@/lib/errors';

/** Tracks one action of a settings card: whether it runs and the error it failed with */
export function useSubmit() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(toErrorInfo(failure, fallback));
    } finally {
      setSaving(false);
    }
  };

  return { saving, error, setError, run };
}
