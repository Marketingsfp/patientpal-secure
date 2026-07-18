import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown, ChevronRight, Star, Heart, Clock, Search as SearchIcon,
  Pin, X, ChevronLeft, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CENTROS, PERFIL_DEFAULTS, findItem, type Centro, type MenuItem, type PerfilKey } from "./menu-catalog";
import { useMenuPrefs } from "@/hooks/use-menu-prefs";
import { usePermissoes } from "@/hooks/use-permissoes";
import { moduloDaRota } from "@/lib/permissoes-rotas";
import { useAtendimentoMultiploDisabled } from "@/hooks/use-atendimento-multiplo-disabled";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";

const MAX_INLINE = 6;

const HOVER_SCALE_CLASSES =
  "relative transform-gpu origin-center transition-all duration-200 ease-out hover:z-10 hover:scale-[1.04] hover:shadow-md active:scale-[0.98] motion-reduce:transform-none motion-reduce:hover:scale-100 [@media(hover:none)]:hover:scale-100 [@media(hover:none)]:hover:shadow-none [@media(hover:none)]:active:scale-100";

/**
 * Um path do menu é permitido quando:
 * - o usuário é admin (allowed === null); ou
 * - a rota é livre/sistema (moduloDaRota === null); ou
 * - o módulo mapeado está no Set de permitidos.
 * Módulos não mapeados (undefined) são bloqueados (fail-closed).
 */
function pathAllowed(path: string, allowed: Set<string> | null): boolean {
  if (allowed === null) return true;
  const mod = moduloDaRota(path);
  if (mod === null) return true;
  if (mod === undefined) return false;
  return allowed.has(mod);
}

function IconBtn({
  active, onClick, title, children, pressed,
}: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      className={cn(
        // Sempre visível (a11y: teclado + touch), com destaque leve no hover
        "text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "p-1 rounded transition-colors",
        active && "text-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Row({
  item, active, pinned, favorited, onTogglePin, onToggleFav, hoverScale,
}: {
  item: MenuItem; active: boolean; pinned: boolean; favorited: boolean;
  onTogglePin: () => void; onToggleFav: () => void;
  hoverScale?: boolean;
}) {
  const Icon = item.icon;
  return (
    <div
      className={cn(
        "group flex items-center gap-2 pl-3 pr-2 h-9 rounded-md text-sm transition-colors",
        "hover:bg-sidebar-accent",
        active && "bg-sidebar-accent border-l-2 border-primary",
        hoverScale && HOVER_SCALE_CLASSES,
      )}
    >
      <Link to={item.path} className="flex items-center gap-2 flex-1 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{item.label}</span>
      </Link>
      <div className="flex items-center gap-0.5">
        <IconBtn active={pinned} pressed={pinned} onClick={onTogglePin} title={pinned ? "Desfixar" : "Fixar"}>
          <Pin className={cn("h-3.5 w-3.5", pinned && "fill-primary")} />
        </IconBtn>
        <IconBtn active={favorited} pressed={favorited} onClick={onToggleFav} title={favorited ? "Remover favorito" : "Favoritar"}>
          <Heart className={cn("h-3.5 w-3.5", favorited && "fill-primary")} />
        </IconBtn>
      </div>
    </div>
  );
}

function CentroGroup({
  centro, currentPath, open, onToggleOpen, prefs, onPin, onFav, hidePaths, hoverScale,
}: {
  centro: Centro; currentPath: string; open: boolean; onToggleOpen: () => void;
  prefs: { pinned: string[]; favorites: string[] };
  onPin: (p: string) => void; onFav: (p: string) => void;
  /** paths a esconder dentro do centro (ex.: já mostrados em "Fixados") */
  hidePaths?: ReadonlyArray<string>;
  hoverScale?: boolean;
}) {
  const [query, setQuery] = useState("");
  const hide = new Set(hidePaths ?? []);
  const itemsDisponiveis = centro.items.filter((i) => !hide.has(i.path));
  const visible = itemsDisponiveis.slice(0, MAX_INLINE);
  const hasMore = itemsDisponiveis.length > MAX_INLINE;
  const Icon = centro.icon;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return itemsDisponiveis;
    return itemsDisponiveis.filter((i) => i.label.toLowerCase().includes(q));
  }, [itemsDisponiveis, query]);

  if (itemsDisponiveis.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggleOpen}
        className="w-full flex items-center gap-2 px-3 h-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Icon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left truncate">{centro.label}</span>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {visible.map((it) => (
            <Row
              key={it.path}
              item={it}
              active={currentPath === it.path || currentPath.startsWith(it.path + "/")}
              pinned={prefs.pinned.includes(it.path)}
              favorited={prefs.favorites.includes(it.path)}
              onTogglePin={() => onPin(it.path)}
              onToggleFav={() => onFav(it.path)}
              hoverScale={hoverScale}
            />
          ))}
          {hasMore && (
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="pl-3 h-8 text-xs text-primary hover:underline w-full text-left"
                >
                  Ver todos ({centro.items.length}) →
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[380px] sm:w-[420px]">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Icon className="h-4 w-4" /> {centro.label}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4 relative">
                  <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar…"
                    className="pl-8 h-9"
                  />
                </div>
                <div className="mt-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-160px)]">
                  {filtered.map((it) => (
                    <Row
                      key={it.path}
                      item={it}
                      active={currentPath === it.path}
                      pinned={prefs.pinned.includes(it.path)}
                      favorited={prefs.favorites.includes(it.path)}
                      onTogglePin={() => onPin(it.path)}
                      onToggleFav={() => onFav(it.path)}
                      hoverScale={hoverScale}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">Nada encontrado.</p>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      )}
    </div>
  );
}

export function MenuV2({ perfil = "gestor", clinicColor }: { perfil?: PerfilKey; clinicColor?: string }) {
  const { prefs, loading, togglePin, toggleFavorite, toggleGroup, pushRecent } = useMenuPrefs();
  const { allowed: allowedModules, loading: permsLoading } = usePermissoes();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const defaults = PERFIL_DEFAULTS[perfil];
  const { disabled: atendimentoMultiploDisabled } = useAtendimentoMultiploDisabled();
  const centrosBase = CENTROS.filter((c) => defaults.centros.includes(c.key)).map((c) => {
    if (!atendimentoMultiploDisabled) return c;
    return {
      ...c,
      items: c.items.filter((it) => it.path !== "/app/atendimento-multiplo"),
    };
  });
  // Filtra itens de cada centro pelas permissões do perfil. Enquanto
  // permissões carregam, escondemos tudo (fail-closed) para não vazar
  // links de módulos negados.
  const centrosVisiveis = useMemo(() => {
    return centrosBase
      .map((c) => ({ ...c, items: c.items.filter((it) => pathAllowed(it.path, allowedModules)) }))
      .filter((c) => c.items.length > 0);
  }, [centrosBase, allowedModules]);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("menuv2:collapsed");
    if (stored === "1") return true;
    if (stored === "0") return false;
    return window.innerWidth < 1024;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("menuv2:collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // pinned = user pinned OR perfil defaults (union, sem duplicar)
  const effectivePinned = useMemo(() => {
    const set = new Set<string>([...defaults.pinned, ...prefs.pinned]);
    return Array.from(set);
  }, [defaults.pinned, prefs.pinned]);

  const pinnedItems = effectivePinned
    .map((p) => findItem(p))
    .filter((x): x is MenuItem => Boolean(x))
    .filter((it) => pathAllowed(it.path, allowedModules))
    .filter((it) => !atendimentoMultiploDisabled || it.path !== "/app/atendimento-multiplo");

  const recentesFiltrados = prefs.recent
    .filter((r) => !effectivePinned.includes(r.path) && r.path !== currentPath)
    // remove itens que já aparecem em algum centro visível — evita mostrar a
    // mesma coisa em "Recentes" e no grupo do centro logo acima.
    .filter((r) => !centrosVisiveis.some((c) => c.items.some((i) => i.path === r.path)))
    .filter((r) => pathAllowed(r.path, allowedModules))
    .filter((r) => !atendimentoMultiploDisabled || r.path !== "/app/atendimento-multiplo")
    .slice(0, 5);

  const favoritos = prefs.favorites
    .map((p) => findItem(p))
    .filter((x): x is MenuItem => Boolean(x))
    .filter((it) => pathAllowed(it.path, allowedModules))
    .filter((it) => !atendimentoMultiploDisabled || it.path !== "/app/atendimento-multiplo");

  if (loading || permsLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Carregando menu…</div>;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        data-testid="menu-v2"
        className={cn(
          "shrink-0 bg-sidebar text-sidebar-foreground border-r border-border h-full flex flex-col transition-all duration-200",
          collapsed ? "w-16" : "w-64",
        )}
        style={clinicColor ? { backgroundColor: clinicColor, color: "#ffffff" } : undefined}
      >
        {/* Header com marca + botão recolher */}
        <div className={cn("flex items-center gap-2 border-b border-sidebar-border/40 h-12 shrink-0", collapsed ? "px-2 justify-center" : "px-3")}>
          <Link to="/app" className="flex items-center gap-2 min-w-0 flex-1">
            <Activity className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="font-semibold tracking-tight truncate">ClinicaOS</span>}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0 hover:bg-sidebar-accent"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {collapsed ? (
          <div className="p-2 space-y-1 overflow-y-auto flex-1">
            {pinnedItems.map((it) => {
              const Icon = it.icon;
              const active = currentPath === it.path || currentPath.startsWith(it.path + "/");
              return (
                <Tooltip key={it.path}>
                  <TooltipTrigger asChild>
                    <Link
                      to={it.path}
                      className={cn(
                        "flex items-center justify-center h-9 w-full rounded-md hover:bg-sidebar-accent",
                        active && "bg-sidebar-accent border-l-2 border-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{it.label}</TooltipContent>
                </Tooltip>
              );
            })}
            {centrosVisiveis.map((c) => {
              const CIcon = c.icon;
              return (
                <div key={c.key} className="pt-2">
                  <div className="flex items-center justify-center h-6 text-muted-foreground">
                    <CIcon className="h-3.5 w-3.5" />
                  </div>
                  {c.items.slice(0, MAX_INLINE).map((it) => {
                    const Icon = it.icon;
                    const active = currentPath === it.path || currentPath.startsWith(it.path + "/");
                    return (
                      <Tooltip key={it.path}>
                        <TooltipTrigger asChild>
                          <Link
                            to={it.path}
                            className={cn(
                              "flex items-center justify-center h-9 w-full rounded-md hover:bg-sidebar-accent",
                              active && "bg-sidebar-accent border-l-2 border-primary",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">{it.label}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
        <div className="p-3 space-y-4 overflow-y-auto flex-1">
          {/* Fixados */}
          {pinnedItems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-3 h-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Pin className="h-3.5 w-3.5" /> Fixados
              </div>
              <div className="space-y-0.5">
                {pinnedItems.map((it) => (
                  <Row
                    key={it.path}
                    item={it}
                    active={currentPath === it.path || currentPath.startsWith(it.path + "/")}
                    pinned
                    favorited={prefs.favorites.includes(it.path)}
                    onTogglePin={() => togglePin(it.path)}
                    onToggleFav={() => toggleFavorite(it.path)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Centros Operacionais */}
          <div>
            {centrosVisiveis.map((c) => (
              <CentroGroup
                key={c.key}
                centro={c}
                currentPath={currentPath}
                open={prefs.groups[c.key] ?? true}
                onToggleOpen={() => toggleGroup(c.key)}
                prefs={{ pinned: effectivePinned, favorites: prefs.favorites }}
                onPin={togglePin}
                onFav={toggleFavorite}
                hidePaths={effectivePinned}
              />
            ))}
          </div>

          {/* Recentes */}
          {recentesFiltrados.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-3 h-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Recentes
              </div>
              <div className="space-y-0.5">
                {recentesFiltrados.map((r) => (
                  <Link
                    key={r.path}
                    to={r.path}
                    className="flex items-center gap-2 pl-3 pr-2 h-8 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  >
                    <span className="truncate">{r.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Favoritos */}
          {favoritos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-3 h-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Heart className="h-3.5 w-3.5" /> Favoritos
              </div>
              <div className="space-y-0.5">
                {favoritos.map((it) => (
                  <Row
                    key={it.path}
                    item={it}
                    active={currentPath === it.path}
                    pinned={effectivePinned.includes(it.path)}
                    favorited
                    onTogglePin={() => togglePin(it.path)}
                    onToggleFav={() => toggleFavorite(it.path)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        )}
      </aside>
    </TooltipProvider>
  );
}