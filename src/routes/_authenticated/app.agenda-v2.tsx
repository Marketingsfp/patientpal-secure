import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, Shield } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { useAgendaV2Flag } from "@/hooks/use-agenda-v2-flag";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AgendaV2Shell } from "@/components/agenda-v2/agenda-v2-shell";

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

  const role = clinicaAtual?.role ?? null;
  const podeVer = role === "admin" || role === "gestor";

  if (!podeVer) {
    return (
      <div className="h-[calc(100vh-56px)] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Agenda V2 — Piloto restrito</h1>
          <p className="text-sm text-muted-foreground">
            O piloto da Agenda V2 está liberado apenas para <b>admin</b> e <b>gestor</b>.
            A agenda clássica continua disponível normalmente.
          </p>
          <Button asChild variant="outline">
            <Link to="/app/agenda">Voltar para /app/agenda</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      <div className="border-b bg-muted/30 px-4 py-2 flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>
            <b>Piloto isolado</b> — rota <code>/app/agenda-v2</code>. A agenda clássica em{" "}
            <code>/app/agenda</code> continua intacta.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs flex items-center gap-2">
            Flag <code className="bg-muted px-1 rounded">agenda_v2</code>
            <Switch
              checked={enabled}
              disabled={loading}
              onCheckedChange={(v) => void setEnabled(v)}
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
          <AgendaV2Shell />
        ) : (
          <div className="h-full flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
              <h2 className="text-lg font-semibold">Agenda V2 desligada</h2>
              <p className="text-sm text-muted-foreground">
                Ative a flag <code>agenda_v2</code> acima para pré-visualizar. Isso não afeta
                nenhum outro usuário nem a rota <code>/app/agenda</code>.
              </p>
              <p className="text-xs text-muted-foreground">
                Fase 1 — visual e operacional (Timeline · Lista · Cards · KPIs · Filtros ·
                Drawer de linha do tempo · Sessão de Coleta agrupada · Sem migration).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}