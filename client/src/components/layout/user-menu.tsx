import { DesktopIcon, MoonIcon, SignOutIcon, SunIcon, TranslateIcon, UserCircleIcon } from '@phosphor-icons/react';
import { Button, DropdownMenu } from '@cloudflare/kumo';
import { useAuth } from '@/contexts/AuthContext';
import { BROWSER_LANGUAGE_SETTING, getLanguageLabelKey, SUPPORTED_LANGUAGES, useI18n, type LanguagePreference } from '@/lib/i18n';
import { useThemeMode, type ThemeMode } from '@/lib/theme';

export function UserMenu() {
  const { t, preference, setLanguagePreference } = useI18n();
  const { authEnabled, user, logout } = useAuth();
  const [mode, setMode] = useThemeMode();
  const version = import.meta.env.VITE_VERSION;
  const commit = import.meta.env.VITE_COMMIT_HASH;

  const languageOptions: Array<{ value: LanguagePreference; label: string }> = [
    { value: BROWSER_LANGUAGE_SETTING, label: t('components.sidebar.languageBrowser') },
    ...SUPPORTED_LANGUAGES.map((language) => ({ value: language.code, label: t(getLanguageLabelKey(language.code)) })),
  ];

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger render={<Button variant="ghost" shape="square" size="sm" icon={<UserCircleIcon size={20} />} aria-label={t('components.sidebar.userMenu')} />} />
      <DropdownMenu.Content align="end" className="min-w-56">
        {user ? (
          <DropdownMenu.Group>
            <DropdownMenu.Label>
              <span className="block truncate font-medium text-kumo-default">{user.username}</span>
              <span className="block text-xs font-normal">{t(user.role === 'admin' ? 'components.sidebar.role.admin' : 'components.sidebar.role.readOnly')}</span>
            </DropdownMenu.Label>
          </DropdownMenu.Group>
        ) : null}
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger icon={mode === 'dark' ? MoonIcon : mode === 'light' ? SunIcon : DesktopIcon}>{t('components.sidebar.theme')}</DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            <DropdownMenu.RadioGroup value={mode} onValueChange={(value: ThemeMode) => setMode(value)}>
              <DropdownMenu.RadioItem value="light" icon={<SunIcon />}>{t('components.sidebar.lightMode')}<DropdownMenu.RadioItemIndicator /></DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="dark" icon={<MoonIcon />}>{t('components.sidebar.darkMode')}<DropdownMenu.RadioItemIndicator /></DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="system" icon={<DesktopIcon />}>{t('components.sidebar.systemMode')}<DropdownMenu.RadioItemIndicator /></DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger icon={TranslateIcon}>{t('components.sidebar.language')}</DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent className="max-h-80 overflow-y-auto">
            <DropdownMenu.RadioGroup value={preference} onValueChange={(value: LanguagePreference) => setLanguagePreference(value)}>
              {languageOptions.map((option) => (
                <DropdownMenu.RadioItem key={option.value} value={option.value}>{option.label}<DropdownMenu.RadioItemIndicator /></DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
        {authEnabled ? (
          <>
            <DropdownMenu.Separator />
            <DropdownMenu.Item icon={SignOutIcon} onClick={() => void logout()}>{t('components.sidebar.logout')}</DropdownMenu.Item>
          </>
        ) : null}
        {version ? (
          <>
            <DropdownMenu.Separator />
            <p className="truncate px-2 py-1.5 text-xs text-kumo-subtle numeric" title={commit}>
              {t('components.sidebar.version', { version })}
              {commit ? ` · ${commit.slice(0, 7)}` : ''}
            </p>
          </>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
