import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldPlusIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Banner, Button, Input } from '@cloudflare/kumo';
import { AuthLayout } from '@/components/auth-layout';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/useBranding';
import { useI18n } from '@/lib/i18n';

function passwordErrorKey(password: string): string | null {
  if (password.length < 8) return 'pages.setup.error.passwordLength';
  if (!/[a-z]/.test(password)) return 'pages.setup.error.passwordLowercase';
  if (!/[A-Z]/.test(password)) return 'pages.setup.error.passwordUppercase';
  if (!/\d/.test(password)) return 'pages.setup.error.passwordDigit';
  return null;
}

export function Setup() {
  const { authEnabled, setupRequired, setup } = useAuth();
  const { appName } = useBranding();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!authEnabled || !setupRequired) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const errorKey = passwordErrorKey(password);
    if (errorKey) {
      setError(t(errorKey));
      return;
    }
    setLoading(true);
    try {
      await setup(username, password);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : t('pages.setup.error.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t('pages.setup.title', { appName })} description={t('pages.setup.description')}>
      {error ? <Banner variant="error" size="sm" icon={<WarningCircleIcon weight="fill" />} description={error} /> : null}
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <Input label={t('pages.login.username')} value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" autoFocus />
        <Input
          label={t('pages.login.password')}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
          description={t('pages.setup.passwordHint')}
        />
        <Button type="submit" variant="primary" className="w-full" loading={loading} icon={<ShieldPlusIcon />}>
          {t('pages.setup.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
