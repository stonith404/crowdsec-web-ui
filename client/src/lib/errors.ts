import type { ApiPermissionError } from '../types';

export interface ErrorInfo {
  message: string;
  helpLink?: string;
  helpText?: string;
}

/** Keeps the README link the server attaches to permission errors, such as a read-only LAPI account */
export function toErrorInfo(error: unknown, fallback: string): ErrorInfo {
  const apiError = error as Partial<ApiPermissionError> | undefined;
  return {
    message: typeof apiError?.message === 'string' && apiError.message ? apiError.message : fallback,
    helpLink: typeof apiError?.helpLink === 'string' ? apiError.helpLink : undefined,
    helpText: typeof apiError?.helpText === 'string' ? apiError.helpText : undefined,
  };
}
