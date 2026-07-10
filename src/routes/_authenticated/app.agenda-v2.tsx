import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, Shield } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useClinica } from "@/hooks/use-clinica";
import { useAgendaV2Flag } from "@/hooks/use-agenda-v2-flag";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { HhpSkeletonCard } from "@/design-system/hhp";

// Lazy — só baixa o bundle da agenda-v2 quando a flag for ligada.
// Isso corta o cold-start da rota (que antes carregava tudo mesmo com flag OFF).
const AgendaV2Shell = lazy(() =>
  import("@/components/agenda-v2/agenda-v2-shell").then((m) => ({ default: m.AgendaV2Shell })),
);

export const Route = createFileRoute("/_authenticated/app/agenda-v2")({
  component: AgendaV2Page,
  head: () => ({
    meta: [
      { title: "Agenda V2 (piloto) — ClinicaOS" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AgendaV2Page() {
  const { clinicaAtual } = useClinica();
  const { enabled, loading, setEnabled } = useAgendaV2Flag();
  const [toggleMs, setToggleMs] = useState<number | null>(null);
  const toggleStartRef = useRef<number>(0);

  // Modo full-bleed no mobile: recolhe o menu externo do app-shell e o padding
  // do <main>, dando 100% da largura útil para a Agenda V2. Só ativa quando a
  // flag está ligada (para não afetar a tela de aviso "Agenda V2 desligada").
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!enabled) return;
    document.documentElement.classList.add("agenda-v2-fullbleed");
    return () => {
      document.documentElement.classList.remove("agenda-v2-fullbleed");
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled && toggleStartRef.current > 0) {
      // Mede do clique até o shell montar (próximo frame após enabled=true).
      requestAnimationFrame(() => {
        setToggleMs(Math.round(performance.now() - toggleStartRef.current));
        toggleStartRef.current = 0;
      });
    }
  }, [enabled]);

  const role = clinicaAtual?.role ?? null;
  const podeVer = role === "admin" || role === "gestor";

  if (!podeVer) {
    return (
      <div className="h-[calc(100vh-56px)] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Agenda V2 — Piloto restrito</h1>
          <p className="text-sm text-muted-foreground">
            O piloto da Agenda V2 está liberado apenas para <b>admin</b> e <b>gestor</b>. A agenda
            clássica continua disponível normalmente.
          </p>
          <Button asChild variant="outline">
            <Link to="/app/agenda">Voltar para /app/agenda</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-[color:var(--hhp-surface-page)]">
      <div className="border-b bg-muted/30 px-4 py-2 flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>
            <b>Piloto isolado</b> — rota <code>/app/agenda-v2</code>. A agenda clássica em{" "}
            <code>/app/agenda</code> continua intacta.
          </span>
          {toggleMs !== null && (
            <span className="ml-2 text-[10px] text-slate-400 tabular-nums">
              toggle {toggleMs}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs flex items-center gap-2">
            Flag <code className="bg-muted px-1 rounded">agenda_v2</code>
            <Switch
              checked={enabled}
              disabled={loading}
              onCheckedChange={(v) => {
                if (v) toggleStartRef.current = performance.now();
                void setEnabled(v);
              }}
              data-testid="flag-agenda-v2"
            />
          </Label>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/app/agenda">Ver agenda clássica</Link>
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {enabled ? (
          <Suspense fallback={<ShellFallback />}>
            <AgendaV2Shell />
          </Suspense>
        ) : (
          <div className="h-full flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
              <h2 className="text-lg font-semibold">Agenda V2 desligada</h2>
              <p className="text-sm text-muted-foreground">
                Ative a flag <code>agenda_v2</code> acima para pré-visualizar. Isso não afeta nenhum
                outro usuário nem a rota <code>/app/agenda</code>.
              </p>
              <p className="text-xs text-muted-foreground">
                Fase 1 — visual e operacional (Timeline · Lista · Cards · KPIs · Filtros · Drawer de
                linha do tempo · Sessão de Coleta agrupada · Sem migration).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShellFallback() {
  return (
    <div className="h-full flex bg-[color:var(--hhp-surface-page)]">
      <div className="hidden md:block w-64 border-r border-slate-100 bg-white p-4 space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 max-w-md" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-28 rounded-2xl" />
          ))}
        </div>
        <div className="space-y-2 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <HhpSkeletonCard key={i} density="confortavel" />
          ))}
        </div>
      </div>
    </div>
  );
}
