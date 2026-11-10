import { StrictMode, useEffect, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { StressTest } from './demos/stress/StressTest';
import { ApiReference } from './pages/ApiReference';
import { CustomSymbols } from './pages/CustomSymbols';
import { Gallery } from './pages/Gallery';
import { GettingStarted } from './pages/GettingStarted';
import { Theming } from './pages/Theming';
import { useRoute } from './router';
import { applyTheme, initialTheme, type Theme } from './theme';
import '@pipeline-view/core/styles.css';
import './styles.css';

interface Page {
  path: string;
  title: string;
  group: string;
  component: ComponentType;
}

const PAGES: Page[] = [
  { path: 'getting-started', title: 'Getting started', group: 'Guides', component: GettingStarted },
  { path: 'theming', title: 'Theming', group: 'Guides', component: Theming },
  { path: 'custom-symbols', title: 'Custom symbols', group: 'Guides', component: CustomSymbols },
  { path: 'stress', title: 'Stress test', group: 'Demos', component: StressTest },
  { path: 'api', title: 'API reference', group: 'Reference', component: ApiReference },
  { path: 'gallery', title: 'Symbol gallery', group: 'Reference', component: Gallery },
];

function App() {
  const route = useRoute(PAGES[0]!.path);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => applyTheme(theme), [theme]);

  const page = PAGES.find((p) => p.path === route) ?? PAGES[0]!;
  useEffect(() => {
    document.title = `${page.title} · pipeline-view`;
  }, [page]);
  const groups = [...new Set(PAGES.map((p) => p.group))];
  const Current = page.component;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          pipeline-view
          <small>Process diagrams</small>
        </div>
        <nav className="nav" aria-label="Docs">
          {groups.map((g) => (
            <div key={g}>
              <div className="nav-group">{g}</div>
              {PAGES.filter((p) => p.group === g).map((p) => (
                <a key={p.path} href={`#/${p.path}`} aria-current={p === page ? 'page' : undefined}>
                  {p.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          className="theme-toggle"
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
      </aside>
      <main className="content">
        <Current />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
