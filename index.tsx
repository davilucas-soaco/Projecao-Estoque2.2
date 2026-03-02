import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

const THEME_KEY = 'sa_industrial_theme_v1';

function getInitialIsDark(): boolean {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'false') return false;
    return true; // padrão seguro: dark
  } catch {
    return true;
  }
}

function applyInitialTheme(): void {
  const isDark = getInitialIsDark();
  if (isDark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
}

// Aplica o tema antes do primeiro render para evitar "flash" em tema claro.
applyInitialTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
