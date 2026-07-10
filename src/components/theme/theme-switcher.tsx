import { useEffect, useState } from "react";
import { Palette, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeKey = "classic" | "ocean" | "slate" | "emerald";

const THEMES: { key: ThemeKey; label: string; swatch: string; sidebar: string }[] = [
  { key: "classic", label: "Classic Azure",   swatch: "#0284C7", sidebar: "#3B5F8A" },
  { key: "ocean",   label: "Ocean Teal",      swatch: "#0EA5A4", sidebar: "#2E6B7A" },
  { key: "slate",   label: "Slate Premium",   swatch: "#6366F1", sidebar: "#475569" },
  { key: "emerald", label: "Emerald Exec",    swatch: "#059669", sidebar: "#2F6B4E" },
];

const STORAGE_KEY = "hhp:theme";
const DEFAULT: ThemeKey = "classic";

function applyTheme(key: ThemeKey) {
  const html = document.documentElement;
  THEMES.forEach((t) => html.classList.remove(`theme-${t.key}`));
  html.classList.add(`theme-${key}`);
}

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeKey>(DEFAULT);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeKey | null) ?? DEFAULT;
    setTheme(saved);
    applyTheme(saved);
  }, []);

  function pick(key: ThemeKey) {
    setTheme(key);
    applyTheme(key);
    try { localStorage.setItem(STORAGE_KEY, key); } catch {}
    setOpen(false);
  }

  const current = THEMES.find((t) => t.key === theme) ?? THEMES[0];

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      {open && (
        <div className="mb-2 w-60 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500 border-b border-slate-100">
            Tema
          </div>
          <ul className="p-1">
            {THEMES.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => pick(t.key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left text-sm hover:bg-slate-50 transition-colors",
                    theme === t.key && "bg-slate-50",
                  )}
                >
                  <span className="flex gap-0.5 shrink-0">
                    <span className="h-4 w-4 rounded-sm" style={{ background: t.sidebar }} />
                    <span className="h-4 w-4 rounded-sm" style={{ background: t.swatch }} />
                  </span>
                  <span className="flex-1 text-slate-700">{t.label}</span>
                  {theme === t.key && <Check className="h-4 w-4 text-slate-500" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Trocar tema"
        title={`Tema: ${current.label}`}
        className="relative h-10 w-10 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors"
      >
        <Palette className="h-4 w-4 text-slate-600" />
        <span
          className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white"
          style={{ background: current.swatch }}
        />
      </button>
    </div>
  );
}