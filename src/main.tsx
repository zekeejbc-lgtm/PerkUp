import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ToastProvider';
import { AlertModalProvider } from './components/AlertModalProvider';
import { installLazyImageDefaults } from './lib/performance';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

import { ThemeProvider } from './contexts/ThemeContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { RuntimeModeProvider } from './contexts/RuntimeModeContext';

installLazyImageDefaults();

const rootElement = document.getElementById('root')!;
rootElement.replaceChildren();

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <AlertModalProvider>
        <ToastProvider>
          <RuntimeModeProvider>
            <AuthProvider>
              <CurrencyProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </CurrencyProvider>
            </AuthProvider>
          </RuntimeModeProvider>
        </ToastProvider>
      </AlertModalProvider>
    </ThemeProvider>
  </StrictMode>,
);

registerServiceWorker();
