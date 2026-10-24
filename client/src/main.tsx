import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { DateTimeProvider } from './lib/DateTimeProvider';
import { I18nProvider } from './lib/I18nProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <DateTimeProvider>
        <App />
      </DateTimeProvider>
    </I18nProvider>
  </StrictMode>,
);
