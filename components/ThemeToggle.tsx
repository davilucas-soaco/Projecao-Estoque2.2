import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const THEME_KEY = 'sa_industrial_theme_v1';

/** Lê a preferência salva. Padrão: dark (true) */
function getStoredTheme(): boolean {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'false') return false;
    return true; // default dark
  } catch {
    return true;
  }
}

function applyThemeToDom(isDark: boolean) {
  if (isDark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
}

/**
 * Toggle de tema isolado — evita re-render do App inteiro.
 * Aplica a classe no DOM imediatamente; apenas este componente re-renderiza.
 */
const ThemeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(getStoredTheme);

  useEffect(() => {
    applyThemeToDom(isDark);
    localStorage.setItem(THEME_KEY, String(isDark));
  }, [isDark]);

  const handleClick = () => {
    const next = !isDark;
    // Aplicação imediata no DOM — feedback visual instantâneo
    applyThemeToDom(next);
    localStorage.setItem(THEME_KEY, String(next));
    // Só este componente re-renderiza (App mantém-se estável)
    setIsDark(next);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="p-2 rounded-full hover:bg-white/10 transition-colors"
      aria-label={isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
    >
      {isDark ? <Sun className="w-5 h-5 text-highlight" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};

export default ThemeToggle;
