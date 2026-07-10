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

installLazyImageDefaults();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AlertModalProvider>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </AlertModalProvider>
    </ThemeProvider>
  </StrictMode>,
);

registerServiceWorker();
