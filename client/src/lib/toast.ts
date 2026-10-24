import { createKumoToastManager } from '@cloudflare/kumo';

/** One manager for the whole app, so code outside components can show toasts too */
export const toastManager = createKumoToastManager();

export const toast = {
  success: (title: string) => toastManager.add({ title, variant: 'success' }),
  error: (title: string) => toastManager.add({ title, variant: 'error' }),
  warning: (title: string) => toastManager.add({ title, variant: 'warning' }),
  info: (title: string) => toastManager.add({ title, variant: 'info' }),
};
