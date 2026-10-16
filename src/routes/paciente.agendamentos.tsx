import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PortalAutenticado } from "@/components/portal-paciente/portal-shell";
import {
  cancelarAgendamento,
  confirmarAgendamento,
  meusAgendamentos,
} from "@/lib/portal-paciente/portal.functions";

export const Route = createFileRoute("/paciente/agendamentos")({
  component: () => <PortalAutenticado>{(c) => <Lista clinica={c} />}</PortalAutenticado>,
  head: () => ({
    meta: [
      { title: "Meus agendamentos — Área do Paciente" },
      { name: "description", content: "Próximos agendamentos e histórico." },
      { property: "og:title", content: "Meus agendamentos — Área do Paciente" },
      { property: "og:description", content: "Próximos agendamentos e histórico." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const STATUS: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  realizado: "Realizado",
  cancelado: "Cancelado",
  faltou: "Não compareceu",
};

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Lista({ clinica }: { clinica: string | null }) {
  const qc = useQueryClient();
  const listar = useServerFn(meusAgendamentos);
  const confirmarFn = useServerFn(confirmarAgendamento);
  const cancelarFn = useServerFn(cancelarAgendamento);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chave = ["portal-agendamentos", clinica];
  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    queryFn: () => listar({ data: { clinica } }),
  });

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: chave });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tente novamente.");
    } finally {
      setOcupado(false);
      setCancelarId(null);
    }
  };

  const proximos = (data?.itens ?? [])
    .filter((i) => i.futuro && i.status !== "cancelado")
    .reverse();
  const historico = (data?.itens ?? []).filter((i) => !(i.futuro && i.status !== "cancelado"));

  return (
    <>
      <Link
        to="/paciente"
        className="mb-4 inline-flex items-center text-sm text-primary hover:underline"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Início
      </Link>
      <h1 className="text-2xl font-semibold">Meus agendamentos</h1>
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>}
      {data && (
        <>
          <h2 className="mt-6 font-semibold">Próximos</h2>
          {proximos.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
          )}
          <div className="mt-2 space-y-3">
            {proximos.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium capitalize">{quando(a.inicio)}</p>
                    <p className="text-sm text-muted-foreground">
                      {[a.procedimento, a.profissional, a.especialidade]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Badge variant="secondary">{STATUS[a.status] ?? a.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.podeConfirmar && (
                    <Button
                      size="sm"
                      disabled={ocupado}
                      onClick={() =>
                        agir(
                          () => confirmarFn({ data: { clinica, id: a.id } }),
                          "Presença confirmada.",
                        )
                      }
                    >
                      Confirmar presença
                    </Button>
                  )}
                  {!a.motivoNaoCancela ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupado}
                      onClick={() => setCancelarId(a.id)}
                    >
                      Cancelar
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">{a.motivoNaoCancela}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <h2 className="mt-8 font-semibold">Histórico</h2>
          {historico.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Nada por aqui ainda.</p>
          )}
          <div className="mt-2 space-y-2">
            {historico.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
              >
                <div>
                  <p className="capitalize">{quando(a.inicio)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[a.procedimento, a.profissional].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {STATUS[a.status] ?? a.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <AlertDialog open={!!cancelarId} onOpenChange={(o) => !o && setCancelarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O horário será liberado. Para marcar de novo, fale com a clínica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={ocupado}
              onClick={() =>
                cancelarId &&
                agir(
                  () => cancelarFn({ data: { clinica, id: cancelarId } }),
                  "Agendamento cancelado.",
                )
              }
            >
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
