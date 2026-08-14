import { Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface StatusTab<V extends string = string> {
  value: V;
  label: string;
  count?: number;
}

interface ListShellProps<S extends string> {
  title?: ReactNode;
  actions?: ReactNode;

  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  searchDebounceMs?: number;

  tabs?: ReadonlyArray<StatusTab<S>>;
  tabValue?: S;
  onTabChange?: (v: S) => void;

  chips?: ReactNode;

  loading?: boolean;
  /** Renderiza o slot vazio somente quando `isEmpty` for true. */
  empty?: ReactNode;
  isEmpty?: boolean;
  children: ReactNode;

  className?: string;
  bodyClassName?: string;
}

/**
 * Shell padrão de listas do ClinicaOS:
 *   [busca forte no topo][ações]
 *   [abas por status][chips]
 *   [corpo — virtualizado / agrupado]
 *
 * Estado da busca é controlado (o pai persiste em URL / query).
 */
export function ListShell<S extends string>({
  title,
  actions,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  searchDebounceMs = 200,
  tabs,
  tabValue,
  onTabChange,
  chips,
  loading,
  empty,
  isEmpty,
  children,
  className,
  bodyClassName,
}: ListShellProps<S>) {
  const [inner, setInner] = useState(searchValue);
  useEffect(() => {
    setInner(searchValue);
  }, [searchValue]);
  useEffect(() => {
    if (inner === searchValue) return;
    const t = setTimeout(() => onSearchChange(inner), searchDebounceMs);
    return () => clearTimeout(t);
  }, [inner, searchDebounceMs, onSearchChange, searchValue]);

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      {(title || actions) && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-3">
          <div className="min-w-0 truncate">{title}</div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className="relative mb-3">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={inner}
          onChange={(e) => setInner(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9 h-10"
          aria-label="Busca"
        />
      </div>

      {(tabs || chips) && (
        <div className="flex flex-col gap-2 mb-3">
          {tabs && tabValue !== undefined && onTabChange && (
            <Tabs value={tabValue} onValueChange={(v) => onTabChange(v as S)}>
              <TabsList className="h-9">
                {tabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs gap-1.5">
                    {t.label}
                    {typeof t.count === "number" && (
                      <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] tabular-nums text-muted-foreground data-[state=active]:bg-primary-foreground/20">
                        {t.count.toLocaleString("pt-BR")}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {chips}
        </div>
      )}

      <div
        className={cn(
          "flex-1 min-h-0 rounded-lg border border-border bg-card overflow-hidden",
          bodyClassName,
        )}
      >
        {loading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isEmpty && empty ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
            {empty}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
