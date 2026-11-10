export type Theme = 'light' | 'dark';

const KEY = 'pv-docs-theme';

export function initialTheme(): Theme {
  const param = new URLSearchParams(location.search).get('theme');
  if (param === 'light' || param === 'dark') return param;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // storage unavailable
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage unavailable
  }
}
