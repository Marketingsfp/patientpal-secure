import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Sparkles, FileHeart, Stethoscope, Save, Loader2, History, Wand2, ArrowLeft, HeartPulse, CheckCircle2, Printer } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { VoiceInput } from "@/components/voice-input";
import { Cid10Picker } from "@/components/cid10-picker";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  gerarAnamneseEstruturada,
  sugerirCondutaClinica,
  resumirHistoricoPaciente,
} from "@/lib/atendimento-ai.functions";
import { agendamentoStatusPagamento, type StatusPagamento } from "@/lib/pagamento-status";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

export const Route = createFileRoute("/_authenticated/app/atendimento-ia/$agendamentoId")({
  component: AtendimentoEditorPage,
  head: () => ({ meta: [{ title: "Atendimento — ClinicaOS" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    from: s.from === "agenda-v2" ? ("agenda-v2" as const) : undefined,
  }),
});

type Modelo = { id: string; nome: string; prompt_ia: string | null };
type Medico = {
  id: string;
  nome: string;
  email: string | null;
  user_id: string | null;
  especialidade_id: string | null;
  tipo_repasse?: string | null;
  percentual_repasse_padrao?: number | null;
  valor_repasse_padrao?: number | null;
  especialidades?: { nome: string } | null;
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

function AtendimentoEditorPage() {
  const { agendamentoId } = Route.useParams();
  const { from } = Route.useSearch();
  const cameFromAgendaV2 = from === "agenda-v2";
  const backTo = cameFromAgendaV2 ? "/app/agenda-v2" : "/app/atendimento-ia";
  const backLabel = cameFromAgendaV2 ? "Voltar para Agenda V2" : "Voltar para fila";
  const navigate = useNavigate();
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("atendimento-ia");
  const estruturar = useServerFn(gerarAnamneseEstruturada);
  const sugerir = useServerFn(sugerirCondutaClinica);
  const resumir = useServerFn(resumirHistoricoPaciente);

  const [agendamento, setAgendamento] = useState<{ id: string; paciente_id: string | null; paciente_nome: string; medico_id: string | null; procedimento: string | null; fluxo_etapa: string } | null>(null);
  const [medico, setMedico] = useState<Medico | null>(null);
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [triagem, setTriagem] = useState<Triagem | null>(null);
  const [pagamento, setPagamento] = useState<StatusPagamento | null>(null);

  const [transcricao, setTranscricao] = useState("");
  const [soap, setSoap] = useState<Soap>(EMPTY);
  const [sugestoes, setSugestoes] = useState<{ cids: { codigo: string; descricao: string }[]; exames: string[]; prescricao: string } | null>(null);
  const [resumo, setResumo] = useState<string>("");
  const [resumoOpen, setResumoOpen] = useState(false);
  const [loading, setLoading] = useState<"estruturar" | "sugerir" | "resumir" | "salvar" | null>(null);
  const [salvo, setSalvo] = useState<{ valorMedico: number } | null>(null);

  // Carrega agendamento + médico + pagamento (usado no mount e no realtime).
  const carregarAgendamento = useCallback(async () => {
    if (!clinicaAtual || !agendamentoId) return;
    const { data: ag, error } = await supabase
        .from("agendamentos")
        .select("id, paciente_id, paciente_nome, medico_id, procedimento, fluxo_etapa")
        .eq("id", agendamentoId)
        .maybeSingle();
      if (error || !ag) { toast.error("Agendamento não encontrado"); navigate({ to: "/app/atendimento-ia" }); return; }
      setAgendamento(ag as never);

      // Pagamento ANTES da consulta — bloqueia avanço enquanto pendente.
      const status = await agendamentoStatusPagamento(ag.id);
      setPagamento(status);

      if (ag.medico_id) {
        const { data: med } = await supabase
          .from("medicos")
          .select("id, nome, email, user_id, especialidade_id, especialidades:especialidades!medicos_especialidade_id_fkey(nome)")
          .eq("id", ag.medico_id)
          .maybeSingle();
        if (med) {
          let sens: any = {};
          try {
            const { data: s } = await supabase.rpc("medico_dados_sensiveis", { _medico_id: ag.medico_id });
            sens = (s as any) ?? {};
          } catch { sens = {}; }
          setMedico({ ...(med as any), tipo_repasse: sens.tipo_repasse ?? null, percentual_repasse_padrao: sens.percentual_repasse_padrao ?? null, valor_repasse_padrao: sens.valor_repasse_padrao ?? null } as never);
        }
      }

      // move para "atendimento" se ainda não estiver (apenas se já estiver pago)
      if (status.pago && ag.fluxo_etapa !== "atendimento") {
        void supabase.from("agendamentos")
          .update({ fluxo_etapa: "atendimento", fluxo_atualizado_em: new Date().toISOString() } as never)
          .eq("id", ag.id);
      }
  }, [agendamentoId, clinicaAtual?.clinica_id, navigate]);

  useEffect(() => {
    void carregarAgendamento();
  }, [carregarAgendamento]);

  // Carrega modelo a partir da especialidade
  useEffect(() => {
    if (!clinicaAtual) return;
    (async () => {
      const { data: mds } = await supabase
        .from("prontuario_modelos")
        .select("id, nome, prompt_ia")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("nome");
      const list = (mds ?? []) as Modelo[];
      const espNome = (medico?.especialidades?.nome ?? "").toLowerCase().trim();
      const match = espNome ? list.find((x) => x.nome.toLowerCase().trim() === espNome) : null;
      setModelo(match ?? list[0] ?? null);
    })();
  }, [clinicaAtual?.clinica_id, medico?.especialidades?.nome]);

  // Carrega triagem (usado no mount e no realtime).
  const carregarTriagem = useCallback(async () => {
    if (!agendamentoId) return;
    const { data } = await supabase
        .from("triagens_enfermagem")
        .select("id, created_at, enfermeira_nome, peso_kg, altura_cm, imc, pa_sistolica, pa_diastolica, freq_cardiaca, temperatura, saturacao, glicemia, queixa_principal, doencas, medicamentos, alergias, observacoes")
        .eq("agendamento_id", agendamentoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    setTriagem((data as unknown as Triagem) ?? null);
  }, [agendamentoId]);

  useEffect(() => {
    void carregarTriagem();
  }, [carregarTriagem]);

  // Realtime: pagamento (fin_lancamentos / orçamento), triagem e o próprio
  // agendamento (etapa/status). Recarrega ao vivo enquanto o médico atende.
  const recarregarAoVivo = useCallback(() => {
    void carregarAgendamento();
    void carregarTriagem();
  }, [carregarAgendamento, carregarTriagem]);
  useRealtimeRefresh(
    ["agendamentos", "triagens_enfermagem", "fin_lancamentos", "agendamento_orcamento_itens"],
    recarregarAoVivo,
    Boolean(agendamentoId && clinicaAtual?.clinica_id),
  );

  function aplicarTriagemNoSoap(t: Triagem) {
    const linhas: string[] = [];
    if (t.queixa_principal) linhas.push(`Queixa (triagem): ${t.queixa_principal}`);
    const sv: string[] = [];
    if (t.pa_sistolica && t.pa_diastolica) sv.push(`PA ${t.pa_sistolica}/${t.pa_diastolica} mmHg`);
    if (t.freq_cardiaca) sv.push(`FC ${t.freq_cardiaca} bpm`);
    if (t.temperatura) sv.push(`T ${t.temperatura}°C`);
    if (t.saturacao) sv.push(`SatO₂ ${t.saturacao}%`);
    if (t.glicemia) sv.push(`Glicemia ${t.glicemia} mg/dL`);
    if (t.peso_kg) sv.push(`Peso ${t.peso_kg} kg`);
    if (t.altura_cm) sv.push(`Altura ${t.altura_cm} cm`);
    if (t.imc) sv.push(`IMC ${t.imc}`);
    if (sv.length) linhas.push(`Sinais vitais: ${sv.join(" · ")}`);
    if (t.doencas?.length) linhas.push(`Comorbidades: ${t.doencas.join(", ")}`);
    if (t.medicamentos) linhas.push(`Medicamentos: ${t.medicamentos}`);
    if (t.alergias) linhas.push(`Alergias: ${t.alergias}`);
    const txt = linhas.join("\n");
    setSoap((s) => {
      const jaContem = s.exame_fisico?.includes(txt);
      return {
        ...s,
        queixa_principal: s.queixa_principal || t.queixa_principal || "",
        exame_fisico: jaContem
          ? s.exame_fisico
          : (s.exame_fisico ? `${s.exame_fisico}\n${txt}` : txt),
      };
    });
  }

  const triagemAplicadaRef = useRef<string | null>(null);
  useEffect(() => {
    if (!triagem) return;
    if (triagemAplicadaRef.current === triagem.id) return;
    triagemAplicadaRef.current = triagem.id;
    aplicarTriagemNoSoap(triagem);
    toast.success("Triagem aplicada ao prontuário");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triagem?.id]);

  const especialidadeMedico = medico?.especialidades?.nome ?? "";
  const especialidade = especialidadeMedico || modelo?.nome || "Clínica Geral";
  const pacienteId = agendamento?.paciente_id ?? "";
  const pacienteNome = agendamento?.paciente_nome ?? "";

  async function handleEstruturar(textoOverride?: string) {
    const texto = (textoOverride ?? transcricao).trim();
    if (!texto) { toast.error("Grave ou cole a transcrição primeiro"); return; }
    setLoading("estruturar");
    try {
      const out = await estruturar({ data: { transcricao: texto, especialidade, promptExtra: modelo?.prompt_ia ?? undefined } });
      const nextSoap = {
        queixa_principal: out.queixa_principal || soap.queixa_principal,
        historia_doenca: out.historia_doenca || soap.historia_doenca,
        exame_fisico: out.exame_fisico || soap.exame_fisico,
        hipotese_diagnostica: out.hipotese_diagnostica || soap.hipotese_diagnostica,
        conduta: out.conduta || soap.conduta,
        prescricao: out.prescricao || soap.prescricao,
      };
      setSoap(nextSoap);
      toast.success("Prontuário preenchido pela IA como sugestão");
      // Gera CIDs/exames/prescrição sugerida na sequência
      try {
        const sug = await sugerir({ data: { ...nextSoap, especialidade } });
        setSugestoes(sug);
      } catch (err) {
        console.error("sugerir falhou", err);
      }
    } catch (e) { mostrarErro(e); }
    finally { setLoading(null); }
  }

  async function handleSugerir() {
    setLoading("sugerir");
    try {
      const out = await sugerir({ data: { ...soap, especialidade } });
      setSugestoes(out);
      toast.success("Sugestões geradas");
    } catch (e) { mostrarErro(e); }
    finally { setLoading(null); }
  }

  async function handleResumir() {
    if (!pacienteId) { toast.error("Paciente não identificado"); return; }
    setLoading("resumir");
    try {
      const out = await resumir({ data: { pacienteId } });
      setResumo(out.resumo);
      setResumoOpen(true);
      if (out.total === 0) toast.info("Sem prontuários anteriores");
    } catch (e) { mostrarErro(e); }
    finally { setLoading(null); }
  }

  async function handleSalvar() {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaAtual || !pacienteId) { toast.error("Paciente não identificado"); return; }
    if (pagamento && !pagamento.pago) {
      toast.error("Pagamento pendente — finalize no caixa antes de salvar o prontuário.");
      return;
    }
    setLoading("salvar");
    try {
      const cid = clinicaAtual.clinica_id;
      const { error } = await supabase.from("prontuarios").insert({
        clinica_id: cid,
        paciente_id: pacienteId,
        medico_id: medico?.id ?? null,
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

      const procNome = agendamento?.procedimento ?? "";
      let valorTotal = 0;
      let lancamentoId: string | null = null;
      if (procNome) {
        const { data: proc } = await supabase
          .from("procedimentos").select("valor_padrao, valor_dinheiro")
          .eq("clinica_id", cid).ilike("nome", procNome).maybeSingle();
        valorTotal = Number((proc?.valor_dinheiro ?? proc?.valor_padrao) ?? 0);
      }
      let valorMedico = 0;
      if (medico && valorTotal > 0) {
        if (medico.tipo_repasse === "valor") {
          valorMedico = Number(medico.valor_repasse_padrao ?? 0);
        } else {
          valorMedico = valorTotal * (Number(medico.percentual_repasse_padrao ?? 0) / 100);
        }
      }
      const valorClinica = Math.max(0, valorTotal - valorMedico);

      const { data: lancExist } = await supabase
        .from("fin_lancamentos").select("id, valor")
        .eq("agendamento_id", agendamentoId).maybeSingle();
      if (lancExist) {
        lancamentoId = lancExist.id;
        if (!valorTotal) valorTotal = Number(lancExist.valor ?? 0);
      }

      // Só cria fin_atendimentos quando NÃO houver fin_lancamentos vinculado
      // ao agendamento — caso contrário duplicaria o registro no Financeiro
      // (o repasse já vive em fin_lancamentos gerado no caixa).
      if (valorTotal > 0 && !lancExist) {
        await supabase.from("fin_atendimentos").insert({
          clinica_id: cid,
          paciente_id: pacienteId,
          medico_id: medico?.id ?? null,
          procedimento: procNome || null,
          data: new Date().toISOString().slice(0, 10),
          valor_total: valorTotal,
          valor_medico: valorMedico,
          valor_clinica: valorClinica,
          status: "realizado",
          lancamento_id: lancamentoId,
        } as never);
      }

      await supabase.from("agendamentos")
        .update({ fluxo_etapa: "finalizado", status: "realizado", fluxo_atualizado_em: new Date().toISOString() } as never)
        .eq("id", agendamentoId);

      toast.success(valorMedico > 0
        ? `Prontuário salvo · Repasse médico: R$ ${valorMedico.toFixed(2)}`
        : "Prontuário salvo");
      setSalvo({ valorMedico });
    } catch (e) { mostrarErro(e); }
    finally { setLoading(null); }
  }

  function addToHipotese(t: string) {
    setSoap((s) => ({ ...s, hipotese_diagnostica: s.hipotese_diagnostica ? `${s.hipotese_diagnostica} ${t}` : t }));
  }

  function imprimirDocumento(tipo: "Conduta" | "Prescrição") {
    const conteudo = tipo === "Conduta" ? soap.conduta : soap.prescricao;
    if (!conteudo?.trim()) { toast.error(`Preencha o campo ${tipo} antes de imprimir`); return; }
    const clinicaNome = clinicaAtual?.clinica?.nome ?? "";
    const dataStr = new Date().toLocaleDateString("pt-BR");
    const horaStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(tipo)} — ${esc(pacienteNome)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica', 'Arial', sans-serif; color: #000; font-size: 12pt; line-height: 1.5; margin: 0; padding: 24px; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px; }
  .header h1 { margin: 0; font-size: 16pt; text-transform: uppercase; }
  .header .sub { font-size: 10pt; color: #444; }
  .titulo { text-align: center; text-transform: uppercase; font-weight: 700; font-size: 14pt; margin: 18px 0 14px; letter-spacing: 1px; }
  .meta { display: flex; justify-content: space-between; font-size: 11pt; margin-bottom: 14px; }
  .meta b { text-transform: uppercase; }
  .conteudo { white-space: pre-wrap; font-size: 12pt; min-height: 200px; border-top: 1px dashed #888; border-bottom: 1px dashed #888; padding: 14px 0; }
  .assinatura { margin-top: 80px; text-align: center; }
  .assinatura .linha { border-top: 1px solid #000; width: 60%; margin: 0 auto 4px; }
  .assinatura .nome { font-weight: 700; text-transform: uppercase; }
  .assinatura .esp { font-size: 10pt; color: #333; }
  .rodape { margin-top: 24px; text-align: center; font-size: 9pt; color: #666; }
</style></head><body>
  <div class="header">
    <h1>${esc(clinicaNome || "Clínica")}</h1>
    ${clinicaNome ? '<div class="sub">Documento médico</div>' : ""}
  </div>
  <div class="titulo">${esc(tipo)}</div>
  <div class="meta">
    <div>Paciente: <b>${esc(pacienteNome)}</b></div>
    <div>Data: <b>${dataStr} ${horaStr}</b></div>
  </div>
  <div class="conteudo">${esc(conteudo)}</div>
  <div class="assinatura">
    <div class="linha"></div>
    <div class="nome">${esc(medico?.nome ?? "")}</div>
    ${especialidadeMedico ? `<div class="esp">${esc(especialidadeMedico)}</div>` : ""}
  </div>
  <div class="rodape">Emitido em ${dataStr} ${horaStr}</div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("Permita pop-ups para imprimir"); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  if (salvo) {
    return (
      <div className="space-y-4 p-1 max-w-2xl mx-auto">
        <Card className="p-8 text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-semibold">Prontuário salvo</h1>
          <p className="text-sm text-muted-foreground">
            O atendimento de <b className="text-foreground uppercase">{pacienteNome}</b> foi registrado.
            {salvo.valorMedico > 0 && <> Repasse médico: <b className="text-foreground">R$ {salvo.valorMedico.toFixed(2)}</b>.</>}
          </p>
          <Button size="lg" onClick={() => navigate({ to: backTo })}>
            <ArrowLeft className="h-4 w-4" /> {cameFromAgendaV2 ? backLabel : "Voltar para fila de atendimento"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {pagamento && !pagamento.pago && (
        <Card className="p-4 border-amber-400 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <HeartPulse className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Pagamento pendente — consulta requer pagamento antecipado
              </div>
              <p className="text-sm text-amber-800/80 dark:text-amber-200/80">
                Envie o paciente ao caixa antes de iniciar o atendimento.
                O prontuário fica disponível somente após a confirmação do pagamento.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" asChild>
                  <Link to="/app/caixa">Abrir caixa</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to={backTo}>{backLabel}</Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">
              Atendimento — <span className="uppercase">{pacienteNome || "…"}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {medico?.nome ? <>Profissional: <b className="text-foreground uppercase">{medico.nome}</b></> : "Carregando…"}
              {especialidadeMedico && <> · {especialidadeMedico}</>}
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link to={backTo}><ArrowLeft className="h-4 w-4" /> {backLabel}</Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleResumir} disabled={loading === "resumir" || !pacienteId}>
            {loading === "resumir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            Resumir histórico
          </Button>
        </div>
        {resumo && (
          <Collapsible open={resumoOpen} onOpenChange={setResumoOpen} className="mt-3">
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
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <FileHeart className="h-3.5 w-3.5" />
            Dados aplicados automaticamente ao prontuário
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Transcrição da consulta</h2>
            </div>
            <VoiceInput
              size="sm"
              currentValue={transcricao}
              onTranscript={(t) => {
                setTranscricao(t);
                void handleEstruturar(t);
              }}
              append
              prompt="Transcreva fielmente a conversa entre médico e paciente em português do Brasil. Retorne apenas o texto, sem rótulos."
              title="Gravar conversa — preenche o prontuário automaticamente"
            />
          </div>
          <Textarea
            rows={14}
            value={transcricao}
            onChange={(e) => setTranscricao(e.target.value)}
            placeholder="Clique no microfone para gravar a consulta, ou cole/digite aqui o relato…"
          />
          <Button onClick={() => handleEstruturar()} disabled={loading === "estruturar"} className="w-full">
            {loading === "estruturar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Estruturar prontuário com IA
          </Button>
        </Card>

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

      <div className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" size="lg" onClick={() => imprimirDocumento("Conduta")} disabled={!soap.conduta.trim()}>
          <Printer className="h-4 w-4" /> Imprimir conduta
        </Button>
        <Button variant="outline" size="lg" onClick={() => imprimirDocumento("Prescrição")} disabled={!soap.prescricao.trim()}>
          <Printer className="h-4 w-4" /> Imprimir prescrição
        </Button>
        {podeEscrever && (
          <Button
            size="lg"
            onClick={handleSalvar}
            disabled={loading === "salvar" || !pacienteId || (pagamento ? !pagamento.pago : false)}
            title={pagamento && !pagamento.pago ? "Pagamento pendente" : undefined}
          >
            {loading === "salvar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar prontuário
          </Button>
        )}
      </div>
    </div>
  );
}
