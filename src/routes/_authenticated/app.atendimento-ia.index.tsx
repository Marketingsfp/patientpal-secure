import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Brain, Stethoscope, AlertTriangle, Users, Check, X, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { toast } from "sonner";
import { agendamentosStatusPagamento, type StatusPagamento } from "@/lib/pagamento-status";

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
  ativo?: boolean;
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
type TriagemResumo = {
  agendamento_id: string;
  enfermeira_nome: string | null;
  created_at: string;
  queixa_principal: string | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  freq_cardiaca: number | null;
  temperatura: number | null;
  saturacao: number | null;
  glicemia: number | null;
  peso_kg: number | null;
  altura_cm: number | null;
  imc: number | null;
  doencas: string[] | null;
  medicamentos: string | null;
  alergias: string | null;
  observacoes: string | null;
};

function AtendimentoIaPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [medicoId, setMedicoId] = useState("");
  const [triagens, setTriagens] = useState<Record<string, TriagemResumo>>({});
  const [triagensTick, setTriagensTick] = useState(0);
  const [pagamentos, setPagamentos] = useState<Record<string, StatusPagamento>>({});
  const [pagamentosTick, setPagamentosTick] = useState(0);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      const cid = clinicaAtual.clinica_id;
      const { data, error } = await supabase
        .from("medicos")
        .select("id, nome, email, user_id, especialidade_id, ativo, especialidades:especialidades!medicos_especialidade_id_fkey(nome)")
        .eq("clinica_id", cid)
        .eq("ativo", true)
        .order("nome");
      if (error) {
        toast.error("Não foi possível carregar o profissional logado");
        setMedicos([]);
        return;
      }
      const ativos = ((data ?? []) as unknown as Medico[]).map((m) => ({ ...m, ativo: true }));

      // Inclui médicos inativos que ainda têm pacientes na fila do dia,
      // para que nenhum atendimento em andamento fique órfão.
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: pendAll } = await supabase
        .from("agendamentos")
        .select("medico_id, paciente_id, paciente_nome, fluxo_etapa")
        .eq("clinica_id", cid)
        .in("fluxo_etapa", ["aguardando_recepcao", "recepcao", "caixa", "triagem", "atendimento"])
        .gte("inicio", `${hoje}T00:00:00`)
        .lte("inicio", `${hoje}T23:59:59`);
      const idsAtivos = new Set(ativos.map((m) => m.id));
      const idsExtras = Array.from(
        new Set(
          ((pendAll ?? []) as Array<{ medico_id: string | null; paciente_id: string | null; paciente_nome: string | null }>)
            .filter((r) => r.medico_id && r.paciente_id && (r.paciente_nome ?? "").toUpperCase() !== "DISPONIVEL" && (r.paciente_nome ?? "").toUpperCase() !== "DISPONÍVEL")
            .map((r) => r.medico_id as string)
            .filter((id) => !idsAtivos.has(id)),
        ),
      );
      let inativos: Medico[] = [];
      if (idsExtras.length > 0) {
        const { data: extras } = await supabase
          .from("medicos")
          .select("id, nome, email, user_id, especialidade_id, ativo, especialidades:especialidades!medicos_especialidade_id_fkey(nome)")
          .in("id", idsExtras);
        inativos = ((extras ?? []) as unknown as Medico[]).map((m) => ({ ...m, ativo: false }));
      }
      const meds = [...ativos, ...inativos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setMedicos(meds);
      const emailLogado = user?.email?.toLowerCase() ?? null;
      const meu = user?.id
        ? meds.find((x) => x.user_id === user.id)
          ?? (emailLogado ? meds.find((x) => x.email?.toLowerCase() === emailLogado) : null)
        : null;
      if (meu) setMedicoId(meu.id);
      else if (meds.length && !medicoId) {
        const comFila = ((pendAll ?? []) as Array<{ medico_id: string | null; fluxo_etapa: string }>)
          .find((r) => r.medico_id && (r.fluxo_etapa === "triagem" || r.fluxo_etapa === "atendimento"))
          ?.medico_id as string | undefined;
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

  const filaIdsKey = fila.map((f) => f.id).join(",");
  useEffect(() => {
    let cancel = false;
    (async () => {
      const ids = fila.map((f) => f.id);
      if (ids.length === 0) { setTriagens({}); return; }
      const { data } = await supabase
        .from("triagens_enfermagem")
        .select("agendamento_id, enfermeira_nome, created_at, queixa_principal, pa_sistolica, pa_diastolica, freq_cardiaca, temperatura, saturacao, glicemia, peso_kg, altura_cm, imc, doencas, medicamentos, alergias, observacoes")
        .in("agendamento_id", ids)
        .order("created_at", { ascending: false });
      if (cancel) return;
      const map: Record<string, TriagemResumo> = {};
      for (const row of (data ?? []) as unknown as TriagemResumo[]) {
        if (!map[row.agendamento_id]) map[row.agendamento_id] = row;
      }
      setTriagens(map);
    })();
    return () => { cancel = true; };
  }, [filaIdsKey, triagensTick]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const ids = fila.map((f) => f.id);
      if (ids.length === 0) { setPagamentos({}); return; }
      const map = await agendamentosStatusPagamento(ids);
      if (cancel) return;
      const obj: Record<string, StatusPagamento> = {};
      map.forEach((v, k) => { obj[k] = v; });
      setPagamentos(obj);
    })();
    return () => { cancel = true; };
  }, [filaIdsKey, pagamentosTick]);

  useEffect(() => {
    if (!clinicaAtual || !medicoId) return;
    const ch = supabase
      .channel(`atend-fila-${medicoId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "agendamentos", filter: `medico_id=eq.${medicoId}` },
        () => { void carregarFila(medicoId); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "triagens_enfermagem" },
        () => { setTriagensTick((t) => t + 1); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "fin_lancamentos" },
        () => { setPagamentosTick((t) => t + 1); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "agendamento_orcamento_itens" },
        () => { setPagamentosTick((t) => t + 1); })
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
              {medicoSelecionado.nome}
            </div>
          ) : (
            <SearchableSelect
              options={medicos.map((m) => ({
                value: m.id,
                label: `${m.nome.toUpperCase()}${m.ativo === false ? " (INATIVO)" : ""}`,
              }))}
              value={medicoId}
              onChange={setMedicoId}
              placeholder="Selecione…"
              searchPlaceholder="Buscar médico…"
              emptyText="Nenhum médico encontrado."
            />
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
                    <TableHead className="hidden md:table-cell">Serviço</TableHead>
                    <TableHead className="w-32">Pagamento</TableHead>
                    <TableHead className="w-24 text-center">Triagem</TableHead>
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
                    const temRegistroTriagem = Boolean(triagens[it.id]);
                    const triagemFeita = temRegistroTriagem || it.fluxo_etapa === "atendimento";
                    const pag = pagamentos[it.id];
                    const pago = Boolean(pag?.pago);
                    return (
                      <TableRow key={it.id} className={!pago && pag ? "border-l-4 border-l-amber-400" : ""}>
                        <TableCell className="tabular-nums text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="tabular-nums text-xs">{hora}</TableCell>
                        <TableCell className="font-medium uppercase">{it.paciente_nome}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {it.procedimento ?? "—"} · {it.fluxo_etapa.replace("_", " ")}
                        </TableCell>
                        <TableCell>
                          {!pag ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : pag.pago ? (
                            <Badge
                              className={
                                pag.motivo === "orcamento"
                                  ? "border-0 bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200 text-[10px] gap-1"
                                  : "border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 text-[10px] gap-1"
                              }
                              title={pag.motivo === "orcamento" ? "Pago via orçamento" : "Pago no caixa"}
                            >
                              <Check className="h-3 w-3" />
                              {pag.motivo === "orcamento" ? "PAGO (ORÇAMENTO)" : "PAGO"}
                            </Badge>
                          ) : (
                            <Badge
                              className="border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 text-[10px] gap-1"
                              title="Pagamento pendente — envie ao caixa antes do atendimento"
                            >
                              <DollarSign className="h-3 w-3" />
                              PENDENTE
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {triagemFeita ? (
                            <span
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              title={temRegistroTriagem ? "Triagem realizada" : "Paciente avançou no fluxo (sem registro formal de triagem)"}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" title="Triagem pendente">
                              <X className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <HoverCard openDelay={120} closeDelay={80}>
                            <HoverCardTrigger asChild>
                              <span className="cursor-help inline-flex">
                                {it.prioridade !== "normal" ? (
                                  <Badge className={`${prioCls} border-0 text-[10px] gap-1`}>
                                    <AlertTriangle className="h-3 w-3" />
                                    {it.prioridade === "urgente" ? "URGENTE" : "PRIORITÁRIO"}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent align="start" className="w-80 text-xs space-y-2">
                              {(() => {
                                const t = triagens[it.id];
                                if (!t) {
                                  return (
                                    <div className="text-muted-foreground">
                                      {it.fluxo_etapa === "atendimento"
                                        ? "Paciente avançou no fluxo sem registro formal de triagem no sistema."
                                        : "Paciente ainda não passou pela triagem."}
                                    </div>
                                  );
                                }
                                const sv: string[] = [];
                                if (t.pa_sistolica && t.pa_diastolica) sv.push(`PA ${t.pa_sistolica}/${t.pa_diastolica}`);
                                if (t.freq_cardiaca) sv.push(`FC ${t.freq_cardiaca}`);
                                if (t.temperatura) sv.push(`T ${t.temperatura}°`);
                                if (t.saturacao) sv.push(`SatO₂ ${t.saturacao}%`);
                                if (t.glicemia) sv.push(`Glic ${t.glicemia}`);
                                if (t.peso_kg) sv.push(`${t.peso_kg}kg`);
                                if (t.altura_cm) sv.push(`${t.altura_cm}cm`);
                                if (t.imc) sv.push(`IMC ${t.imc}`);
                                return (
                                  <>
                                    <div className="flex items-center justify-between gap-2 pb-1 border-b">
                                      <div className="font-semibold">Triagem da enfermagem</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {new Date(t.created_at).toLocaleString("pt-BR")}
                                      </div>
                                    </div>
                                    {t.enfermeira_nome && (
                                      <div className="text-[11px] text-muted-foreground">Por {t.enfermeira_nome}</div>
                                    )}
                                    {sv.length > 0 && (
                                      <div className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] leading-relaxed">{sv.join(" · ")}</div>
                                    )}
                                    {t.queixa_principal && (
                                      <div><span className="text-[10px] uppercase text-muted-foreground">Queixa</span><div>{t.queixa_principal}</div></div>
                                    )}
                                    {t.doencas && t.doencas.length > 0 && (
                                      <div>
                                        <span className="text-[10px] uppercase text-muted-foreground">Doenças</span>
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                          {t.doencas.map((d, i) => <Badge key={i} variant="outline" className="text-[10px]">{d}</Badge>)}
                                        </div>
                                      </div>
                                    )}
                                    {t.medicamentos && (
                                      <div><span className="text-[10px] uppercase text-muted-foreground">Medicamentos</span><div>{t.medicamentos}</div></div>
                                    )}
                                    {t.alergias && (
                                      <div><span className="text-[10px] uppercase text-muted-foreground">Alergias</span><div>{t.alergias}</div></div>
                                    )}
                                    {t.observacoes && (
                                      <div><span className="text-[10px] uppercase text-muted-foreground">Observações</span><div className="whitespace-pre-wrap">{t.observacoes}</div></div>
                                    )}
                                  </>
                                );
                              })()}
                            </HoverCardContent>
                          </HoverCard>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => atender(it)}
                            disabled={Boolean(pag && !pag.pago)}
                            title={pag && !pag.pago ? "Pagamento pendente — envie ao caixa antes do atendimento" : undefined}
                          >
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
