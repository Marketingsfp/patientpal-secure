import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Brain, Sparkles, FileHeart, Stethoscope, Save, Loader2, History, Wand2, AlertTriangle, Users, HeartPulse } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VoiceInput } from "@/components/voice-input";
import { Cid10Picker } from "@/components/cid10-picker";
import { toast } from "sonner";
import {
  gerarAnamneseEstruturada,
  sugerirCondutaClinica,
  resumirHistoricoPaciente,
} from "@/lib/atendimento-ai.functions";

export const Route = createFileRoute("/_authenticated/app/atendimento-ia")({
  component: AtendimentoIaPage,
  head: () => ({ meta: [{ title: "Atendimento médico — ClinicaOS" }] }),
});

type Modelo = { id: string; nome: string; prompt_ia: string | null };
type Medico = {
  id: string;
  nome: string;
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
type Triagem = {
  id: string;
  created_at: string;
  enfermeira_nome: string | null;
  peso_kg: number | null;
  altura_cm: number | null;
  imc: number | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  freq_cardiaca: number | null;
  temperatura: number | null;
  saturacao: number | null;
  glicemia: number | null;
  queixa_principal: string | null;
  doencas: string[] | null;
  medicamentos: string | null;
  alergias: string | null;
  observacoes: string | null;
};

const SOAP_KEYS = [
  ["queixa_principal", "Queixa principal", 2],
  ["historia_doenca", "História da doença atual", 3],
  ["exame_fisico", "Exame físico", 3],
  ["hipotese_diagnostica", "Hipótese diagnóstica", 2],
  ["conduta", "Conduta", 3],
  ["prescricao", "Prescrição", 4],
] as const;
type Soap = Record<(typeof SOAP_KEYS)[number][0], string>;
const EMPTY: Soap = { queixa_principal: "", historia_doenca: "", exame_fisico: "", hipotese_diagnostica: "", conduta: "", prescricao: "" };

function AtendimentoIaPage() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const estruturar = useServerFn(gerarAnamneseEstruturada);
  const sugerir = useServerFn(sugerirCondutaClinica);
  const resumir = useServerFn(resumirHistoricoPaciente);

  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [fila, setFila] = useState<FilaItem[]>([]);

  const [pacienteId, setPacienteId] = useState("");
  const [pacienteNome, setPacienteNome] = useState("");
  const [agendamentoId, setAgendamentoId] = useState<string | null>(null);
  const [medicoId, setMedicoId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [transcricao, setTranscricao] = useState("");
  const [soap, setSoap] = useState<Soap>(EMPTY);
  const [sugestoes, setSugestoes] = useState<{ cids: { codigo: string; descricao: string }[]; exames: string[]; prescricao: string } | null>(null);
  const [resumo, setResumo] = useState<string>("");
  const [resumoOpen, setResumoOpen] = useState(false);
  const [loading, setLoading] = useState<"estruturar" | "sugerir" | "resumir" | "salvar" | null>(null);
  const [triagem, setTriagem] = useState<Triagem | null>(null);
  const [triados, setTriados] = useState<Array<{ agendamento_id: string; paciente_nome: string; medico_id: string; medico_nome: string; quando: string }>>([]);

  useEffect(() => {
    (async () => {
      if (!clinicaAtual) return;
      const cid = clinicaAtual.clinica_id;
      const [m, md] = await Promise.all([
        supabase.from("medicos").select("id, nome, user_id, especialidade_id, especialidades(nome)").eq("clinica_id", cid).eq("ativo", true).order("nome"),
        supabase.from("prontuario_modelos").select("id, nome, prompt_ia").eq("clinica_id", cid).eq("ativo", true).order("nome"),
      ]);
      const meds = (m.data ?? []) as unknown as Medico[];
      setMedicos(meds);
      setModelos((md.data ?? []) as Modelo[]);
      // Auto-seleciona: médico logado, ou primeiro da lista
      const meu = user?.id ? meds.find((x) => x.user_id === user.id) : null;
      if (meu) setMedicoId(meu.id);
      else if (meds.length && !medicoId) {
        // Prefere médico com paciente na fila hoje (triagem/atendimento)
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
  }, [clinicaAtual?.clinica_id, user?.id]);

  // Médico selecionado e sua especialidade (fixa, vem do cadastro)
  const medicoSelecionado = useMemo(
    () => medicos.find((x) => x.id === medicoId) ?? null,
    [medicos, medicoId],
  );
  const especialidadeMedico = medicoSelecionado?.especialidades?.nome ?? "";

  // Auto-casa o modelo de prontuário com a especialidade do médico
  useEffect(() => {
    if (!modelos.length) return;
    const espNome = especialidadeMedico.toLowerCase().trim();
    if (espNome) {
      const match = modelos.find((x) => x.nome.toLowerCase().trim() === espNome);
      if (match) { setModeloId(match.id); return; }
    }
    if (!modeloId) setModeloId(modelos[0].id);
  }, [especialidadeMedico, modelos]);

  // Carrega a fila do médico (agendamentos do dia)
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
    setFila((data ?? []) as unknown as FilaItem[]);
  };

  useEffect(() => { void carregarFila(medicoId); }, [medicoId, clinicaAtual?.clinica_id]);

  // Carrega pacientes triados hoje (todos os médicos) — para o médico ver
  // quando uma triagem foi feita e poder pular para o paciente certo.
  const carregarTriados = async () => {
    if (!clinicaAtual) { setTriados([]); return; }
    const hoje = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("triagens_enfermagem")
      .select("agendamento_id, created_at, agendamentos!inner(id, paciente_nome, medico_id, fluxo_etapa, inicio, medicos(nome))")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("created_at", `${hoje}T00:00:00`)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as unknown as Array<{
      agendamento_id: string; created_at: string;
      agendamentos: { id: string; paciente_nome: string; medico_id: string; fluxo_etapa: string; inicio: string; medicos: { nome: string } | null } | null;
    }>;
    const lista = rows
      .filter(r => r.agendamentos && ["atendimento", "triagem"].includes(r.agendamentos.fluxo_etapa))
      .map(r => ({
        agendamento_id: r.agendamento_id,
        paciente_nome: r.agendamentos!.paciente_nome,
        medico_id: r.agendamentos!.medico_id,
        medico_nome: r.agendamentos!.medicos?.nome ?? "—",
        quando: r.created_at,
      }));
    setTriados(lista);
  };
  useEffect(() => { void carregarTriados(); }, [clinicaAtual?.clinica_id]);

  // Realtime: refaz a lista de triados quando há nova triagem
  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase
      .channel(`triados-${clinicaAtual.clinica_id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "triagens_enfermagem", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        () => { void carregarTriados(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clinicaAtual?.clinica_id]);

  // Realtime: atualiza fila quando o fluxo muda
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

  // Fila ordenada: urgente → prioritário → normal, depois por horário
  const filaOrdenada = useMemo(() => {
    const peso = { urgente: 0, prioritario: 1, normal: 2 } as const;
    return [...fila].sort((a, b) => {
      const pa = peso[a.prioridade] ?? 2;
      const pb = peso[b.prioridade] ?? 2;
      if (pa !== pb) return pa - pb;
      return a.inicio.localeCompare(b.inicio);
    });
  }, [fila]);

  function selecionar(item: FilaItem) {
    setPacienteId(item.paciente_id ?? "");
    setPacienteNome(item.paciente_nome);
    setAgendamentoId(item.id);
    // move para a etapa "atendimento" se ainda não estiver
    if (item.fluxo_etapa !== "atendimento") {
      void supabase.from("agendamentos")
        .update({ fluxo_etapa: "atendimento", fluxo_atualizado_em: new Date().toISOString() } as never)
        .eq("id", item.id);
    }
  }

  // Carrega triagem da enfermagem para o agendamento selecionado
  useEffect(() => {
    if (!agendamentoId) { setTriagem(null); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("triagens_enfermagem")
        .select("id, created_at, enfermeira_nome, peso_kg, altura_cm, imc, pa_sistolica, pa_diastolica, freq_cardiaca, temperatura, saturacao, glicemia, queixa_principal, doencas, medicamentos, alergias, observacoes")
        .eq("agendamento_id", agendamentoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancel) setTriagem((data as unknown as Triagem) ?? null);
    })();
    return () => { cancel = true; };
  }, [agendamentoId]);

  const modelo = useMemo(() => modelos.find((x) => x.id === modeloId) ?? null, [modelos, modeloId]);
  const especialidade = especialidadeMedico || modelo?.nome || "Clínica Geral";

  async function handleEstruturar() {
    if (!transcricao.trim()) { toast.error("Grave ou cole a transcrição primeiro"); return; }
    setLoading("estruturar");
    try {
      const out = await estruturar({ data: { transcricao, especialidade, promptExtra: modelo?.prompt_ia ?? undefined } });
      setSoap((s) => ({
        queixa_principal: out.queixa_principal || s.queixa_principal,
        historia_doenca: out.historia_doenca || s.historia_doenca,
        exame_fisico: out.exame_fisico || s.exame_fisico,
        hipotese_diagnostica: out.hipotese_diagnostica || s.hipotese_diagnostica,
        conduta: out.conduta || s.conduta,
        prescricao: out.prescricao || s.prescricao,
      }));
      toast.success("Anamnese estruturada");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(null); }
  }

  async function handleSugerir() {
    setLoading("sugerir");
    try {
      const out = await sugerir({ data: { ...soap, especialidade } });
      setSugestoes(out);
      toast.success("Sugestões geradas");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(null); }
  }

  async function handleResumir() {
    if (!pacienteId) { toast.error("Selecione o paciente"); return; }
    setLoading("resumir");
    try {
      const out = await resumir({ data: { pacienteId } });
      setResumo(out.resumo);
      setResumoOpen(true);
      if (out.total === 0) toast.info("Sem prontuários anteriores");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
    finally { setLoading(null); }
  }

  async function handleSalvar() {
    if (!clinicaAtual || !pacienteId) { toast.error("Selecione o paciente"); return; }
    setLoading("salvar");
    try {
      const cid = clinicaAtual.clinica_id;
      // 1) Salva o prontuário
      const { error } = await supabase.from("prontuarios").insert({
        clinica_id: cid,
        paciente_id: pacienteId,
        medico_id: medicoId || null,
        data: new Date().toISOString(),
        queixa_principal: soap.queixa_principal || null,
        historia_doenca: soap.historia_doenca || null,
        exame_fisico: soap.exame_fisico || null,
        hipotese_diagnostica: soap.hipotese_diagnostica || null,
        conduta: soap.conduta || null,
        prescricao: soap.prescricao || null,
        observacoes: transcricao ? `Transcrição:\n${transcricao}` : null,
      });
      if (error) throw error;

      // 2) Registra atendimento financeiro + repasse do médico
      const itemFila = fila.find((f) => f.id === agendamentoId) ?? null;
      const procNome = itemFila?.procedimento ?? "";
      let valorTotal = 0;
      let lancamentoId: string | null = null;
      if (procNome) {
        const { data: proc } = await supabase
          .from("procedimentos").select("valor_padrao, valor_dinheiro")
          .eq("clinica_id", cid).ilike("nome", procNome).maybeSingle();
        valorTotal = Number((proc?.valor_dinheiro ?? proc?.valor_padrao) ?? 0);
      }
      // Calcula repasse do médico (tipo_repasse percentual ou valor)
      let valorMedico = 0;
      if (medicoSelecionado && valorTotal > 0) {
        const { data: med } = await supabase
          .from("medicos")
          .select("tipo_repasse, percentual_repasse_padrao, valor_repasse_padrao")
          .eq("id", medicoSelecionado.id).maybeSingle();
        if (med?.tipo_repasse === "valor") {
          valorMedico = Number(med.valor_repasse_padrao ?? 0);
        } else {
          valorMedico = valorTotal * (Number(med?.percentual_repasse_padrao ?? 0) / 100);
        }
      }
      const valorClinica = Math.max(0, valorTotal - valorMedico);

      // Verifica se já houve recebimento (caixa) para este agendamento (link via lançamento)
      if (agendamentoId) {
        const { data: lancExist } = await supabase
          .from("fin_lancamentos").select("id, valor")
          .eq("agendamento_id", agendamentoId).maybeSingle();
        if (lancExist) {
          lancamentoId = lancExist.id;
          if (!valorTotal) valorTotal = Number(lancExist.valor ?? 0);
        }
      }

      if (valorTotal > 0) {
        await supabase.from("fin_atendimentos").insert({
          clinica_id: cid,
          paciente_id: pacienteId,
          medico_id: medicoSelecionado?.id ?? null,
          procedimento: procNome || null,
          data: new Date().toISOString().slice(0, 10),
          valor_total: valorTotal,
          valor_medico: valorMedico,
          valor_clinica: valorClinica,
          status: "realizado",
          lancamento_id: lancamentoId,
        } as never);
      }

      // 3) Finaliza o agendamento na fila
      if (agendamentoId) {
        await supabase.from("agendamentos")
          .update({ fluxo_etapa: "finalizado", status: "realizado", fluxo_atualizado_em: new Date().toISOString() } as never)
          .eq("id", agendamentoId);
      }
      toast.success(valorMedico > 0
        ? `Prontuário salvo · Repasse médico: R$ ${valorMedico.toFixed(2)}`
        : "Prontuário salvo");
      setSoap(EMPTY); setTranscricao(""); setSugestoes(null); setResumo("");
      setPacienteId(""); setPacienteNome(""); setAgendamentoId(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao salvar"); }
    finally { setLoading(null); }
  }

  function addToHipotese(t: string) {
    setSoap((s) => ({ ...s, hipotese_diagnostica: s.hipotese_diagnostica ? `${s.hipotese_diagnostica} ${t}` : t }));
  }

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-3">
        <Brain className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Atendimento médico</h1>
          <p className="text-sm text-muted-foreground">Transcreva a consulta, estruture o prontuário e receba sugestões clínicas.</p>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <Label>Profissional</Label>
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
          {medicoSelecionado && (
            <div className="text-xs text-muted-foreground pt-1">
              Especialidade: <b className="text-foreground">{especialidadeMedico || "—"}</b>
              {modelo && modelo.nome.toLowerCase().trim() !== especialidadeMedico.toLowerCase().trim() && (
                <span> · Modelo IA: <b className="text-foreground">{modelo.nome}</b></span>
              )}
            </div>
          )}
        </div>

        {/* Fila do médico */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Fila de atendimento ({filaOrdenada.length})</Label>
            {pacienteNome && (
              <span className="text-xs text-muted-foreground">Em atendimento: <b className="text-foreground uppercase">{pacienteNome}</b></span>
            )}
          </div>
          {filaOrdenada.length === 0 ? (
            <div className="text-xs text-muted-foreground border border-dashed rounded-md p-4 text-center">
              Nenhum paciente na fila para hoje.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto pr-1">
              {filaOrdenada.map((it, idx) => {
                const ativo = it.id === agendamentoId;
                const hora = new Date(it.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const prioCls = it.prioridade === "urgente"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                  : it.prioridade === "prioritario"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                  : "";
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => selecionar(it)}
                    className={`text-left rounded-md border p-2 text-sm transition hover:border-primary ${ativo ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="tabular-nums text-xs text-muted-foreground">#{idx + 1} · {hora}</span>
                      {it.prioridade !== "normal" && (
                        <Badge className={`${prioCls} border-0 text-[10px] gap-1`}>
                          <AlertTriangle className="h-3 w-3" />
                          {it.prioridade === "urgente" ? "URGENTE" : "PRIORITÁRIO"}
                        </Badge>
                      )}
                    </div>
                    <div className="font-medium uppercase leading-tight mt-0.5 line-clamp-1">{it.paciente_nome}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">{it.procedimento ?? "—"} · {it.fluxo_etapa.replace("_", " ")}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleResumir} disabled={loading === "resumir" || !pacienteId}>
            {loading === "resumir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            Resumir histórico
          </Button>
        </div>
        {resumo && (
          <Collapsible open={resumoOpen} onOpenChange={setResumoOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start">
                <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
                Resumo IA do histórico {resumoOpen ? "▲" : "▼"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{resumo}</div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </Card>

      {triagem && (
        <Card className="p-4 space-y-3 border-rose-200/60 dark:border-rose-900/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-rose-500" />
              <h2 className="font-semibold">Triagem da enfermagem</h2>
              {triagem.enfermeira_nome && (
                <Badge variant="secondary" className="text-[10px]">Por {triagem.enfermeira_nome}</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(triagem.created_at).toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
            {[
              ["Peso", triagem.peso_kg, "kg"],
              ["Altura", triagem.altura_cm, "cm"],
              ["IMC", triagem.imc, ""],
              ["PA", triagem.pa_sistolica && triagem.pa_diastolica ? `${triagem.pa_sistolica}/${triagem.pa_diastolica}` : null, "mmHg"],
              ["FC", triagem.freq_cardiaca, "bpm"],
              ["Temp.", triagem.temperatura, "°C"],
              ["SatO₂", triagem.saturacao, "%"],
              ["Glicemia", triagem.glicemia, "mg/dL"],
            ].filter(([, v]) => v !== null && v !== undefined && v !== "").map(([label, value, unit]) => (
              <div key={String(label)} className="rounded-md border bg-muted/30 p-2">
                <div className="text-[10px] uppercase text-muted-foreground">{label as string}</div>
                <div className="font-semibold tabular-nums">{String(value)} <span className="text-xs font-normal text-muted-foreground">{unit as string}</span></div>
              </div>
            ))}
          </div>
          {(triagem.queixa_principal || (triagem.doencas && triagem.doencas.length) || triagem.medicamentos || triagem.alergias || triagem.observacoes) && (
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              {triagem.queixa_principal && (
                <div className="rounded-md border p-2"><div className="text-[10px] uppercase text-muted-foreground">Queixa principal</div><div>{triagem.queixa_principal}</div></div>
              )}
              {triagem.doencas && triagem.doencas.length > 0 && (
                <div className="rounded-md border p-2"><div className="text-[10px] uppercase text-muted-foreground">Doenças pré-existentes</div><div className="flex flex-wrap gap-1 mt-1">{triagem.doencas.map((d, i) => <Badge key={i} variant="outline" className="text-[10px]">{d}</Badge>)}</div></div>
              )}
              {triagem.medicamentos && (
                <div className="rounded-md border p-2"><div className="text-[10px] uppercase text-muted-foreground">Medicamentos em uso</div><div>{triagem.medicamentos}</div></div>
              )}
              {triagem.alergias && (
                <div className="rounded-md border p-2"><div className="text-[10px] uppercase text-muted-foreground">Alergias</div><div>{triagem.alergias}</div></div>
              )}
              {triagem.observacoes && (
                <div className="rounded-md border p-2 sm:col-span-2"><div className="text-[10px] uppercase text-muted-foreground">Observações da enfermagem</div><div className="whitespace-pre-wrap">{triagem.observacoes}</div></div>
              )}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const linhas: string[] = [];
              if (triagem.queixa_principal) linhas.push(`Queixa (triagem): ${triagem.queixa_principal}`);
              const sv: string[] = [];
              if (triagem.pa_sistolica && triagem.pa_diastolica) sv.push(`PA ${triagem.pa_sistolica}/${triagem.pa_diastolica} mmHg`);
              if (triagem.freq_cardiaca) sv.push(`FC ${triagem.freq_cardiaca} bpm`);
              if (triagem.temperatura) sv.push(`T ${triagem.temperatura}°C`);
              if (triagem.saturacao) sv.push(`SatO₂ ${triagem.saturacao}%`);
              if (triagem.glicemia) sv.push(`Glicemia ${triagem.glicemia} mg/dL`);
              if (triagem.peso_kg) sv.push(`Peso ${triagem.peso_kg} kg`);
              if (triagem.altura_cm) sv.push(`Altura ${triagem.altura_cm} cm`);
              if (triagem.imc) sv.push(`IMC ${triagem.imc}`);
              if (sv.length) linhas.push(`Sinais vitais: ${sv.join(" · ")}`);
              if (triagem.doencas?.length) linhas.push(`Comorbidades: ${triagem.doencas.join(", ")}`);
              if (triagem.medicamentos) linhas.push(`Medicamentos: ${triagem.medicamentos}`);
              if (triagem.alergias) linhas.push(`Alergias: ${triagem.alergias}`);
              const txt = linhas.join("\n");
              setSoap((s) => ({
                ...s,
                queixa_principal: triagem.queixa_principal || s.queixa_principal,
                exame_fisico: s.exame_fisico ? `${s.exame_fisico}\n${txt}` : txt,
              }));
              toast.success("Triagem copiada para o prontuário");
            }}
          >
            <FileHeart className="h-4 w-4 mr-1" /> Copiar para prontuário
          </Button>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Transcrição */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Transcrição da consulta</h2>
            </div>
            <VoiceInput
              size="sm"
              currentValue={transcricao}
              onTranscript={setTranscricao}
              append
              prompt="Transcreva fielmente a conversa entre médico e paciente em português do Brasil. Retorne apenas o texto, sem rótulos."
              title="Gravar conversa"
              key={agendamentoId ?? "idle"}
              autoStart={!!agendamentoId}
            />
          </div>
          <Textarea
            rows={14}
            value={transcricao}
            onChange={(e) => setTranscricao(e.target.value)}
            placeholder="Clique no microfone para gravar a consulta, ou cole/digite aqui o relato…"
          />
          <Button onClick={handleEstruturar} disabled={loading === "estruturar"} className="w-full">
            {loading === "estruturar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Estruturar prontuário com IA
          </Button>
        </Card>

        {/* SOAP */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileHeart className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Prontuário ({especialidade})</h2>
          </div>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {SOAP_KEYS.map(([k, label, rows]) => (
              <div key={k} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <div className="flex items-center gap-1">
                    {k === "hipotese_diagnostica" && (
                      <Cid10Picker onPick={(t) => addToHipotese(t)} />
                    )}
                    <VoiceInput
                      size="sm"
                      currentValue={soap[k]}
                      onTranscript={(t) => setSoap((s) => ({ ...s, [k]: t }))}
                      prompt={`Transcreva o áudio em português como anotação médica do campo "${label}". Retorne apenas o texto.`}
                      title={`Ditar ${label}`}
                    />
                  </div>
                </div>
                <Textarea
                  rows={rows}
                  value={soap[k]}
                  onChange={(e) => setSoap((s) => ({ ...s, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Sugestões IA */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold">Sugestões clínicas</h2>
          </div>
          <Button variant="outline" size="sm" onClick={handleSugerir} disabled={loading === "sugerir"}>
            {loading === "sugerir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Sugerir CID, exames e prescrição
          </Button>
        </div>
        {!sugestoes ? (
          <p className="text-sm text-muted-foreground">Preencha o prontuário e clique em "Sugerir" para a IA propor CIDs, exames e prescrição.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">CIDs sugeridos (clique para adicionar)</Label>
              <div className="flex gap-2 flex-wrap mt-1">
                {sugestoes.cids.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                {sugestoes.cids.map((c, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                    onClick={() => addToHipotese(`[CID ${c.codigo} — ${c.descricao}]`)}>
                    {c.codigo} · {c.descricao}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Exames sugeridos</Label>
              <ul className="list-disc pl-5 text-sm space-y-0.5 mt-1">
                {sugestoes.exames.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
              {sugestoes.exames.length > 0 && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setSoap((s) => ({ ...s, conduta: `${s.conduta}${s.conduta ? "\n" : ""}Solicito: ${sugestoes.exames.join(", ")}.` }))}>
                  Adicionar à conduta
                </Button>
              )}
            </div>
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Prescrição sugerida</Label>
              <pre className="text-sm whitespace-pre-wrap rounded-md bg-muted/30 p-3 mt-1 border">{sugestoes.prescricao || "—"}</pre>
              {sugestoes.prescricao && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setSoap((s) => ({ ...s, prescricao: sugestoes.prescricao }))}>
                  Usar como prescrição
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSalvar} disabled={loading === "salvar" || !pacienteId}>
          {loading === "salvar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar prontuário
        </Button>
      </div>
    </div>
  );
}
