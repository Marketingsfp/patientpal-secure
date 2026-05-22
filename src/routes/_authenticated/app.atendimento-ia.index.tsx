import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Brain, Stethoscope, AlertTriangle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/atendimento-ia/")({
  component: AtendimentoIaPage,
  head: () => ({ meta: [{ title: "Atendimento médico — ClinicaOS" }] }),
});

type Medico = {
  id: string;
  nome: string;
  email: string | null;
  user_id: string | null;
  especialidade_id: string | null;
  especialidades?: { nome: string } | null;
};
type FilaItem = {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  inicio: string;
  procedimento: string | null;
  fluxo_etapa: string;
  prioridade: "normal" | "prioritario" | "urgente";
};

function AtendimentoIaPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [medicoId, setMedicoId] = useState("");

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      const cid = clinicaAtual.clinica_id;
      const { data, error } = await supabase
        .from("medicos")
        .select("id, nome, email, user_id, especialidade_id, especialidades:especialidades!medicos_especialidade_id_fkey(nome)")
        .eq("clinica_id", cid)
        .eq("ativo", true)
        .order("nome");
      if (error) {
        toast.error("Não foi possível carregar o profissional logado");
        setMedicos([]);
        return;
      }
      const meds = (data ?? []) as unknown as Medico[];
      setMedicos(meds);
      const emailLogado = user?.email?.toLowerCase() ?? null;
      const meu = user?.id
        ? meds.find((x) => x.user_id === user.id)
          ?? (emailLogado ? meds.find((x) => x.email?.toLowerCase() === emailLogado) : null)
        : null;
      if (meu) setMedicoId(meu.id);
      else if (meds.length && !medicoId) {
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: pend } = await supabase
          .from("agendamentos")
          .select("medico_id")
          .eq("clinica_id", cid)
          .in("fluxo_etapa", ["triagem", "atendimento"])
          .gte("inicio", `${hoje}T00:00:00`)
          .lte("inicio", `${hoje}T23:59:59`)
          .order("inicio")
          .limit(1);
        const comFila = pend?.[0]?.medico_id as string | undefined;
        const escolhido = comFila && meds.find((x) => x.id === comFila) ? comFila : meds[0].id;
        setMedicoId(escolhido);
      }
    })();
  }, [clinicaAtual?.clinica_id, user?.id, user?.email]);

  const medicoSelecionado = useMemo(
    () => medicos.find((x) => x.id === medicoId) ?? null,
    [medicos, medicoId],
  );
  const medicoLogado = Boolean(
    medicoSelecionado && user && (
      medicoSelecionado.user_id === user.id
      || medicoSelecionado.email?.toLowerCase() === user.email?.toLowerCase()
    ),
  );
  const especialidadeMedico = medicoSelecionado?.especialidades?.nome ?? "";

  const carregarFila = async (medId: string) => {
    if (!clinicaAtual || !medId) { setFila([]); return; }
    const hoje = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, inicio, procedimento, fluxo_etapa, prioridade")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("medico_id", medId)
      .gte("inicio", `${hoje}T00:00:00`)
      .lte("inicio", `${hoje}T23:59:59`)
      .in("fluxo_etapa", ["aguardando_recepcao", "recepcao", "caixa", "triagem", "atendimento"])
      .order("inicio");
    setFila(((data ?? []) as unknown as FilaItem[]).filter((item) => item.paciente_id && item.paciente_nome !== "DISPONÍVEL"));
  };

  useEffect(() => { void carregarFila(medicoId); }, [medicoId, clinicaAtual?.clinica_id]);

  useEffect(() => {
    if (!clinicaAtual || !medicoId) return;
    const ch = supabase
      .channel(`atend-fila-${medicoId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "agendamentos", filter: `medico_id=eq.${medicoId}` },
        () => { void carregarFila(medicoId); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [medicoId, clinicaAtual?.clinica_id]);

  const filaOrdenada = useMemo(() => {
    const peso = { urgente: 0, prioritario: 1, normal: 2 } as const;
    return [...fila].sort((a, b) => {
      const pa = peso[a.prioridade] ?? 2;
      const pb = peso[b.prioridade] ?? 2;
      if (pa !== pb) return pa - pb;
      return a.inicio.localeCompare(b.inicio);
    });
  }, [fila]);

  function atender(item: FilaItem) {
    navigate({ to: "/app/atendimento-ia/$agendamentoId", params: { agendamentoId: item.id } });
  }

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-3">
        <Brain className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Atendimento médico</h1>
          <p className="text-sm text-muted-foreground">Selecione um paciente na fila para iniciar o atendimento.</p>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <Label>Profissional</Label>
          {medicoLogado && medicoSelecionado ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium uppercase">
              {medicoSelecionado.nome}{medicoSelecionado.especialidades?.nome ? ` — ${medicoSelecionado.especialidades.nome}` : ""}
            </div>
          ) : (
            <Select value={medicoId} onValueChange={setMedicoId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {medicos.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="uppercase">
                    {m.nome}{m.especialidades?.nome ? ` — ${m.especialidades.nome}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {medicoSelecionado && (
            <div className="text-xs text-muted-foreground pt-1">
              Especialidade: <b className="text-foreground">{especialidadeMedico || "—"}</b>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Fila de atendimento ({filaOrdenada.length})</Label>
          {filaOrdenada.length === 0 ? (
            <div className="text-xs text-muted-foreground border border-dashed rounded-md p-4 text-center">
              Nenhum paciente na fila para hoje.
            </div>
          ) : (
            <div className="rounded-md border max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="w-20">Hora</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead className="hidden md:table-cell">Procedimento</TableHead>
                    <TableHead className="w-28">Prioridade</TableHead>
                    <TableHead className="w-32 text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filaOrdenada.map((it, idx) => {
                    const hora = new Date(it.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                    const prioCls = it.prioridade === "urgente"
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                      : it.prioridade === "prioritario"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                      : "";
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="tabular-nums text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="tabular-nums text-xs">{hora}</TableCell>
                        <TableCell className="font-medium uppercase">{it.paciente_nome}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {it.procedimento ?? "—"} · {it.fluxo_etapa.replace("_", " ")}
                        </TableCell>
                        <TableCell>
                          {it.prioridade !== "normal" ? (
                            <Badge className={`${prioCls} border-0 text-[10px] gap-1`}>
                              <AlertTriangle className="h-3 w-3" />
                              {it.prioridade === "urgente" ? "URGENTE" : "PRIORITÁRIO"}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => atender(it)}>
                            <Stethoscope className="h-4 w-4" /> Atender
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
