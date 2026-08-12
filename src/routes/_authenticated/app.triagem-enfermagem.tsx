import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { HeartPulse, Bell, ChevronRight, AlertTriangle, Stethoscope, Wallet, RefreshCw, Clock, Activity, Scale, ClipboardList, ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { agendamentosStatusPagamento } from "@/lib/pagamento-status";
import { BadgePacienteDistante } from "@/components/paciente/badge-paciente-distante";
import {
  MANCHESTER, type ManchesterCor, calcularImc, classificarImc,
  alertaPressao, alertaTemperatura, alertaSaturacao, alertaFc, alertaGlicemia,
  classeInput, classeBadge, type Alerta,
} from "@/lib/triagem/sinais-vitais";

export const Route = createFileRoute("/_authenticated/app/triagem-enfermagem")({
  component: TriagemEnfermagemPage,
  head: () => ({ meta: [{ title: "Triagem - Enfermagem — ClinicaOS" }] }),
});

type Ag = {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  procedimento: string | null;
  inicio: string;
  fluxo_etapa: string;
  prioridade?: "normal" | "prioritario" | "urgente";
  medicos?: { nome: string } | null;
};

type Grupo = {
  chave: string;
  paciente_id: string | null;
  paciente_nome: string;
  prioridade: "normal" | "prioritario" | "urgente";
  agendamentos: Ag[];
};

function prioridadePeso(p?: string) {
  return p === "urgente" ? 2 : p === "prioritario" ? 1 : 0;
}

function agruparPorPaciente(ags: Ag[]): Grupo[] {
  const map = new Map<string, Grupo>();
  for (const a of ags) {
    const chave = a.paciente_id ?? `nome:${a.paciente_nome}`;
    const g = map.get(chave);
    if (!g) {
      map.set(chave, {
        chave,
        paciente_id: a.paciente_id,
        paciente_nome: a.paciente_nome,
        prioridade: (a.prioridade ?? "normal"),
        agendamentos: [a],
      });
    } else {
      g.agendamentos.push(a);
      if (prioridadePeso(a.prioridade) > prioridadePeso(g.prioridade)) {
        g.prioridade = a.prioridade ?? "normal";
      }
    }
  }
  return Array.from(map.values()).map((g) => ({
    ...g,
    agendamentos: g.agendamentos.sort((x, y) => x.inicio.localeCompare(y.inicio)),
  })).sort((a, b) => a.agendamentos[0].inicio.localeCompare(b.agendamentos[0].inicio));
}

const DOENCAS_COMUNS = [
  "Diabetes", "Hipertensão", "Asma", "Cardiopatia", "Dislipidemia",
  "Hipotireoidismo", "Hipertireoidismo", "DPOC", "Câncer", "Depressão", "Ansiedade",
];

type Form = {
  peso: string; altura: string;
  pa_sis: string; pa_dia: string;
  fc: string; temp: string; sat: string; glicemia: string;
  queixa: string;
  doencas: string[];
  outras_doencas: string;
  medicamentos: string;
  alergias: string;
  observacoes: string;
  prioridade: "normal" | "prioritario" | "urgente";
  motivo_prioridade: string;
  classificacao_risco: ManchesterCor | "";
};

const formVazio: Form = {
  peso: "", altura: "", pa_sis: "", pa_dia: "", fc: "", temp: "", sat: "", glicemia: "",
  queixa: "", doencas: [], outras_doencas: "", medicamentos: "", alergias: "", observacoes: "",
  prioridade: "normal", motivo_prioridade: "", classificacao_risco: "",
};

function TriagemEnfermagemPage() {
  return <TriagemEnfermagemConteudo />;
}

function AlertaBadge({ alerta, rotulo }: { alerta: Alerta; rotulo: string }) {
  if (!alerta) return null;
  return (
    <span className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${classeBadge(alerta)}`}>
      {alerta.nivel !== "ok" && <AlertTriangle className="h-3 w-3" />}
      {rotulo}: {alerta.texto}
    </span>
  );
}

function TriagemEnfermagemConteudo() {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("triagem-enfermagem");
  const [loading, setLoading] = useState(false);
  const [ags, setAgs] = useState<Ag[]>([]);
  const [pagosSet, setPagosSet] = useState<Set<string>>(new Set());
  const [cidadeMap, setCidadeMap] = useState<Map<string, string | null>>(new Map());
  const [aberto, setAberto] = useState<Grupo | null>(null);
  const [form, setForm] = useState<Form>(formVazio);
  const [salvando, setSalvando] = useState(false);
  // ALTA-14: clique duplo em "Chamar" disparava duas chamadas antes do botão
  // desabilitar (não havia nenhum estado de loading para essa ação) — cada
  // uma lia o mesmo "próximo número" e inseria sua própria senha, gerando
  // duplicidade na fila.
  const [chamandoId, setChamandoId] = useState<string | null>(null);
  const [consultorio, setConsultorio] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("triagem_consultorio") ?? "" : ""
  );
  useEffect(() => { localStorage.setItem("triagem_consultorio", consultorio); }, [consultorio]);

  const carregar = useCallback(async () => {
    if (!clinicaAtual) return;
    setLoading(true);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);
    const { data, error } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, procedimento, inicio, fluxo_etapa, prioridade, medicos(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("fluxo_etapa", "triagem")
      // Cancelar um agendamento não reseta fluxo_etapa — sem este filtro, um
      // paciente cancelado ficava "esperando" na fila de triagem para sempre
      // (CRIT-09).
      .neq("status", "cancelado")
      .gte("inicio", hoje.toISOString())
      .lt("inicio", amanha.toISOString())
      .order("inicio");
    setLoading(false);
    if (error) { mostrarErro(error); return; }
    const lista = (data ?? []) as unknown as Ag[];
    setAgs(lista);
    // Cidade dos pacientes — usada para o alerta de município distante.
    const pacIds = Array.from(new Set(lista.map((a) => a.paciente_id).filter((x): x is string => !!x)));
    if (pacIds.length) {
      const { data: pacs } = await supabase.from("pacientes").select("id,cidade").in("id", pacIds);
      setCidadeMap(new Map((pacs ?? []).map((p) => [p.id as string, (p.cidade as string | null) ?? null])));
    } else {
      setCidadeMap(new Map());
    }
    const status = await agendamentosStatusPagamento(lista.map((a) => a.id));
    const pagos = new Set<string>();
    status.forEach((s, id) => { if (s.pago) pagos.add(id); });
    setPagosSet(pagos);
  }, [clinicaAtual]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    if (!clinicaAtual) return;
    const ch = supabase
      .channel("triagem-enf")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
          () => void carregar())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clinicaAtual, carregar]);

  const imcNum = useMemo(() => calcularImc(form.peso, form.altura), [form.peso, form.altura]);
  const imc = imcNum == null ? "" : imcNum.toFixed(2);
  const imcClasse = useMemo(() => classificarImc(imcNum), [imcNum]);
  const alPa = useMemo(() => alertaPressao(form.pa_sis, form.pa_dia), [form.pa_sis, form.pa_dia]);
  const alTemp = useMemo(() => alertaTemperatura(form.temp), [form.temp]);
  const alSat = useMemo(() => alertaSaturacao(form.sat), [form.sat]);
  const alFc = useMemo(() => alertaFc(form.fc), [form.fc]);
  const alGli = useMemo(() => alertaGlicemia(form.glicemia), [form.glicemia]);

  const grupos = useMemo(() => agruparPorPaciente(ags), [ags]);
  function grupoPago(g: Grupo) {
    return g.agendamentos.every((a) => pagosSet.has(a.id));
  }

  function abrir(g: Grupo) {
    setAberto(g); setForm(formVazio);
  }

  function toggleDoenca(d: string) {
    setForm(f => ({ ...f, doencas: f.doencas.includes(d) ? f.doencas.filter(x => x !== d) : [...f.doencas, d] }));
  }

  async function chamarPaciente(g: Grupo) {
    if (!clinicaAtual) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (chamandoId) return; // clique duplo — já tem uma chamada em andamento
    if (!grupoPago(g)) {
      toast.error("Pagamento pendente — envie o paciente ao caixa antes de chamar para a triagem.");
      return;
    }
    if (!consultorio.trim()) { toast.error("Informe o consultório/sala da enfermagem no topo."); return; }
    setChamandoId(g.chave);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: ult } = await supabase
        .from("senhas").select("numero")
        .eq("clinica_id", clinicaAtual.clinica_id).eq("data_dia", hoje).eq("tipo", "T")
        .order("numero", { ascending: false }).limit(1).maybeSingle();
      const proximoNum = Math.min(9999, (ult?.numero ?? 0) + 1);
      const nomeCurto = g.paciente_nome.split(/\s+/).slice(0, 2).join(" ").toUpperCase().slice(0, 24);
      const guicheStr = `Triagem · Sala ${consultorio.trim()}`;
      const { error } = await supabase.from("senhas").insert({
        clinica_id: clinicaAtual.clinica_id, tipo: "T", numero: proximoNum,
        codigo: nomeCurto, status: "chamada", paciente_id: g.paciente_id,
        guiche: guicheStr, chamada_em: new Date().toISOString(),
      } as never);
      if (error) { mostrarErro(error); return; }
      toast.success(`Chamando ${nomeCurto} · ${guicheStr}`);
      abrir(g);
    } finally {
      setChamandoId(null);
    }
  }

  async function salvarEAvancar(avancar: boolean) {
    if (!clinicaAtual || !aberto) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    // ALTA-14: guarda explícita contra reentrância — o botão já desabilita
    // via disabled={salvando}, mas isso só some depois do próximo render;
    // um clique duplo bem rápido conseguia disparar duas chamadas antes
    // disso. O índice único em triagens_enfermagem.agendamento_id (banco)
    // é a última linha de defesa contra a mesma corrida.
    if (salvando) return;
    // Validação de faixas plausíveis (só valida se preenchido)
    const range = (v: string, min: number, max: number, label: string) => {
      if (!v.trim()) return true;
      const n = parseFloat(v.replace(",", "."));
      if (!isFinite(n) || n < min || n > max) {
        toast.error(`${label} fora da faixa esperada (${min}–${max})`);
        return false;
      }
      return true;
    };
    if (
      !range(form.pa_sis, 50, 260, "PA sistólica") ||
      !range(form.pa_dia, 30, 180, "PA diastólica") ||
      !range(form.fc, 20, 250, "Frequência cardíaca") ||
      !range(form.temp, 30, 45, "Temperatura") ||
      !range(form.sat, 40, 100, "Saturação O₂") ||
      !range(form.glicemia, 20, 800, "Glicemia") ||
      !range(form.peso, 1, 400, "Peso") ||
      !range(form.altura, 30, 260, "Altura")
    ) return;
    setSalvando(true);
    const num = (v: string) => {
      const n = parseFloat(v.replace(",", "."));
      return isFinite(n) ? n : null;
    };
    const int = (v: string) => {
      const n = parseInt(v, 10);
      return isFinite(n) ? n : null;
    };
    const doencasFinais = form.outras_doencas.trim()
      ? [...form.doencas, ...form.outras_doencas.split(",").map(s => s.trim()).filter(Boolean)]
      : form.doencas;
    const base = {
      clinica_id: clinicaAtual.clinica_id,
      paciente_id: aberto.paciente_id,
      enfermeira_id: user?.id ?? null,
      enfermeira_nome: user?.email ?? null,
      peso_kg: num(form.peso),
      altura_cm: num(form.altura),
      imc: imc ? Number(imc) : null,
      pa_sistolica: int(form.pa_sis),
      pa_diastolica: int(form.pa_dia),
      freq_cardiaca: int(form.fc),
      temperatura: num(form.temp),
      saturacao: int(form.sat),
      glicemia: int(form.glicemia),
      queixa_principal: form.queixa || null,
      doencas: doencasFinais,
      medicamentos: form.medicamentos || null,
      alergias: form.alergias || null,
      observacoes: form.observacoes || null,
      prioridade: form.prioridade,
      motivo_prioridade: form.prioridade !== "normal" ? (form.motivo_prioridade || null) : null,
      classificacao_risco: form.classificacao_risco || null,
    };
    const rows = aberto.agendamentos.map((a) => ({ ...base, agendamento_id: a.id }));
    const { error } = await supabase.from("triagens_enfermagem").insert(rows as never);
    if (error) {
      setSalvando(false);
      if ((error as { code?: string }).code === "23505") {
        toast.error("Já existe uma triagem registrada para este atendimento.");
        setAberto(null); setForm(formVazio);
        void carregar();
        return;
      }
      mostrarErro(error);
      return;
    }

    const ids = aberto.agendamentos.map((a) => a.id);
    if (form.prioridade !== "normal" && ids.length) {
      await supabase.from("agendamentos").update({ prioridade: form.prioridade } as never).in("id", ids);
    }

    if (avancar) {
      const isExame = (p: string | null) => /exame|raio|usg|ultra|tomo|ressona/i.test(p ?? "");
      const idsExame = aberto.agendamentos.filter((a) => isExame(a.procedimento)).map((a) => a.id);
      const idsAtend = aberto.agendamentos.filter((a) => !isExame(a.procedimento)).map((a) => a.id);
      if (idsExame.length) {
        await supabase.from("agendamentos").update({ fluxo_etapa: "exame", fluxo_atualizado_em: new Date().toISOString() } as never).in("id", idsExame);
      }
      if (idsAtend.length) {
        await supabase.from("agendamentos").update({ fluxo_etapa: "atendimento", fluxo_atualizado_em: new Date().toISOString() } as never).in("id", idsAtend);
      }
    }
    setSalvando(false);
    toast.success(avancar ? "Triagem salva. Paciente liberado." : "Triagem salva.");
    setAberto(null); setForm(formVazio);
    void carregar();
  }

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-600 border border-rose-500/15 flex items-center justify-center">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Triagem - Enfermagem</h1>
            <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
              Pacientes na etapa <b>Triagem</b> do fluxo. Chame, registre a anamnese e libere para o atendimento.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-card border border-border/50 p-1.5 rounded-2xl shadow-2xs">
          <Label className="text-xs text-muted-foreground pl-2 whitespace-nowrap">Sala/Consultório</Label>
          <Input value={consultorio} onChange={(e) => setConsultorio(e.target.value.slice(0, 10))}
                 placeholder="Ex.: 1, 2, A" className="h-9 w-24 rounded-xl" />
          <button
            type="button"
            onClick={carregar}
            disabled={loading}
            className="group border border-border/60 hover:bg-muted font-medium text-xs rounded-xl px-3.5 py-2 flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 transition-transform ${loading ? "animate-spin" : "group-hover:rotate-180 duration-500"}`} />
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {grupos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl">
          Nenhum paciente na fila de triagem.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {grupos.map((g) => {
            const pago = grupoPago(g);
            const accent =
              g.prioridade === "urgente"
                ? "before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-rose-500"
                : g.prioridade === "prioritario"
                ? "before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-amber-500"
                : "";
            return (
            <div
              key={g.chave}
              className={`bg-card border border-border/50 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 relative overflow-hidden ${accent}`}
            >
              <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-base font-bold tracking-tight text-foreground truncate">{g.paciente_nome}</div>
                  {g.agendamentos.length > 1 && (
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {g.agendamentos.length} atendimentos no dia
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  <BadgePacienteDistante cidade={g.paciente_id ? cidadeMap.get(g.paciente_id) : null} compact />
                  {!pago && (
                    <span className="bg-amber-500/10 text-amber-600 border border-amber-500/20 font-medium px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1">
                      <Wallet className="h-3 w-3" /> PAGAMENTO PENDENTE
                    </span>
                  )}
                  {g.prioridade !== "normal" && (
                    <span className={`font-semibold px-2.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 ${g.prioridade === "urgente" ? "bg-rose-500/10 text-rose-600 border border-rose-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"}`}>
                      <AlertTriangle className="h-3 w-3" />
                      {g.prioridade === "urgente" ? "URGENTE" : "PRIORITÁRIO"}
                    </span>
                  )}
                </div>
              </div>
              <ul className="space-y-0.5">
                {g.agendamentos.map((a) => {
                  const h = new Date(a.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <li key={a.id} className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {h} · {a.procedimento ?? "—"}{a.medicos?.nome ? ` · ${a.medicos.nome}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              </div>
              <div className="pt-3 border-t border-border/40 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => chamarPaciente(g)}
                  disabled={!pago || !!chamandoId}
                  title={!pago ? "Pagamento pendente" : undefined}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Bell className="h-3.5 w-3.5" /> Chamar
                </button>
                <button
                  type="button"
                  onClick={() => abrir(g)}
                  disabled={!pago}
                  title={!pago ? "Pagamento pendente" : undefined}
                  className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/20 font-medium py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Stethoscope className="h-3.5 w-3.5" /> Atender
                </button>
                {!pago && (
                  <Link
                    to="/app/caixa"
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/20 font-medium py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Wallet className="h-3.5 w-3.5" /> Caixa
                  </Link>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Triagem · {aberto?.paciente_nome}</DialogTitle>
          </DialogHeader>
          {aberto && aberto.agendamentos.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
              Os dados desta triagem serão enviados para {aberto.agendamentos.length === 1 ? "o atendimento" : `todos os ${aberto.agendamentos.length} atendimentos`} do paciente hoje:
              <ul className="mt-1 space-y-0.5">
                {aberto.agendamentos.map((a) => {
                  const h = new Date(a.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <li key={a.id}>• {h} · {a.procedimento ?? "—"}{a.medicos?.nome ? ` · ${a.medicos.nome}` : ""}</li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="space-y-4">
            {/* Classificação de risco — Protocolo de Manchester */}
            <div className="rounded-xl border border-border/60 p-3 space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> Classificação de risco (Manchester)
              </Label>
              <div className="flex flex-wrap gap-2">
                {MANCHESTER.map((m) => {
                  const ativo = form.classificacao_risco === m.v;
                  return (
                    <button
                      key={m.v}
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        classificacao_risco: ativo ? "" : m.v,
                        prioridade: ativo ? "normal" : m.prioridade,
                      }))}
                      className={`rounded-xl border px-3 py-1.5 text-xs text-left transition-all ${ativo ? `${m.classe} ring-2 ring-offset-1 ring-current/40` : "border-border/60 hover:bg-muted text-foreground"}`}
                    >
                      <span className="font-semibold">{m.emoji} {m.label}</span>
                      <span className="block text-[10px] opacity-75">{m.tempo}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
              {/* Sinais vitais */}
              <div className="rounded-xl border border-border/60 p-3 space-y-2.5">
                <div className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <Activity className="h-3.5 w-3.5" /> Sinais vitais
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">PA Sistólica</Label>
                    <Input className={classeInput(alPa)} inputMode="numeric" pattern="[0-9]*" maxLength={3} value={form.pa_sis}
                      onChange={(e) => setForm({ ...form, pa_sis: e.target.value.replace(/\D/g, "") })} placeholder="120" /></div>
                  <div><Label className="text-xs">PA Diastólica</Label>
                    <Input className={classeInput(alPa)} inputMode="numeric" pattern="[0-9]*" maxLength={3} value={form.pa_dia}
                      onChange={(e) => setForm({ ...form, pa_dia: e.target.value.replace(/\D/g, "") })} placeholder="80" /></div>
                </div>
                <AlertaBadge alerta={alPa} rotulo="PA" />
                <div><Label className="text-xs">Temperatura (°C)</Label>
                  <Input className={classeInput(alTemp)} inputMode="decimal" pattern="[0-9.,]*" value={form.temp}
                    onChange={(e) => setForm({ ...form, temp: e.target.value.replace(/[^0-9.,]/g, "") })} placeholder="36.5" />
                  <AlertaBadge alerta={alTemp} rotulo="Temp." /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Freq. Cardíaca</Label>
                    <Input className={classeInput(alFc)} inputMode="numeric" pattern="[0-9]*" maxLength={3} value={form.fc}
                      onChange={(e) => setForm({ ...form, fc: e.target.value.replace(/\D/g, "") })} placeholder="75" />
                    <AlertaBadge alerta={alFc} rotulo="FC" /></div>
                  <div><Label className="text-xs">Saturação O₂ (%)</Label>
                    <Input className={classeInput(alSat)} inputMode="numeric" pattern="[0-9]*" maxLength={3} value={form.sat}
                      onChange={(e) => setForm({ ...form, sat: e.target.value.replace(/\D/g, "") })} placeholder="98" />
                    <AlertaBadge alerta={alSat} rotulo="SpO₂" /></div>
                </div>
                <div><Label className="text-xs">Glicemia (mg/dL)</Label>
                  <Input className={classeInput(alGli)} inputMode="numeric" pattern="[0-9]*" maxLength={4} value={form.glicemia}
                    onChange={(e) => setForm({ ...form, glicemia: e.target.value.replace(/\D/g, "") })} placeholder="90" />
                  <AlertaBadge alerta={alGli} rotulo="Glicemia" /></div>
              </div>

              {/* Antropometria */}
              <div className="rounded-xl border border-border/60 p-3 space-y-2.5">
                <div className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <Scale className="h-3.5 w-3.5" /> Antropometria
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Peso (kg)</Label>
                    <Input inputMode="decimal" pattern="[0-9.,]*" value={form.peso}
                      onChange={(e) => setForm({ ...form, peso: e.target.value.replace(/[^0-9.,]/g, "") })} placeholder="70" /></div>
                  <div><Label className="text-xs">Altura (cm ou m)</Label>
                    <Input inputMode="decimal" pattern="[0-9.,]*" value={form.altura}
                      onChange={(e) => setForm({ ...form, altura: e.target.value.replace(/[^0-9.,]/g, "") })} placeholder="170" /></div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">IMC</div>
                  <div className="text-2xl font-bold tabular-nums">{imc || "—"}</div>
                  {imcClasse && (
                    <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] ${imcClasse.classe}`}>
                      {imcClasse.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Queixa e alergias */}
              <div className="rounded-xl border border-border/60 p-3 space-y-2.5">
                <div className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                  <ClipboardList className="h-3.5 w-3.5" /> Queixa e alergias
                </div>
                <div>
                  <Label className="text-xs">Queixa principal</Label>
                  <Textarea rows={3} value={form.queixa} onChange={(e) => setForm({ ...form, queixa: e.target.value })}
                    placeholder="O que trouxe o paciente hoje?" />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1.5">
                    Alergias conhecidas
                    {form.alergias.trim() && (
                      <span className="bg-rose-600 text-white font-bold px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> ALERGIA
                      </span>
                    )}
                  </Label>
                  <Textarea rows={3}
                    className={form.alergias.trim() ? "border-rose-500 bg-rose-500/5 focus-visible:ring-rose-500/40" : ""}
                    value={form.alergias}
                    onChange={(e) => setForm({ ...form, alergias: e.target.value })}
                    placeholder="Medicamentos, alimentos, etc." />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Doenças pré-existentes</Label>
              <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {DOENCAS_COMUNS.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={form.doencas.includes(d)} onCheckedChange={() => toggleDoenca(d)} />
                    {d}
                  </label>
                ))}
              </div>
              <Input className="mt-2" value={form.outras_doencas}
                onChange={(e) => setForm({ ...form, outras_doencas: e.target.value })}
                placeholder="Outras (separe por vírgula)" />
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Medicamentos em uso</Label>
                <Textarea rows={2} value={form.medicamentos}
                  onChange={(e) => setForm({ ...form, medicamentos: e.target.value })}
                  placeholder="Nome, dose e frequência" />
              </div>
              <div>
                <Label className="text-xs">Alergias</Label>
                <Textarea rows={2} value={form.alergias}
                  onChange={(e) => setForm({ ...form, alergias: e.target.value })}
                  placeholder="Medicamentos, alimentos, etc." />
              </div>
            </div>

            <div>
              <Label className="text-xs">Observações da enfermagem</Label>
              <Textarea rows={2} value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>

            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <Label className="text-xs flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Prioridade do atendimento
              </Label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { v: "normal", label: "Normal" },
                  { v: "prioritario", label: "Prioritário" },
                  { v: "urgente", label: "Urgente" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.v}
                    type="button"
                    size="sm"
                    variant={form.prioridade === opt.v ? "default" : "outline"}
                    className={
                      form.prioridade === opt.v && opt.v === "urgente" ? "bg-rose-600 hover:bg-rose-700" :
                      form.prioridade === opt.v && opt.v === "prioritario" ? "bg-amber-500 hover:bg-amber-600" : ""
                    }
                    onClick={() => setForm({ ...form, prioridade: opt.v })}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              {form.prioridade !== "normal" && (
                <div>
                  <Label className="text-xs">Motivo da prioridade</Label>
                  <Textarea rows={2} value={form.motivo_prioridade}
                    onChange={(e) => setForm({ ...form, motivo_prioridade: e.target.value })}
                    placeholder="Ex.: gestante, idoso com dor intensa, suspeita de quadro grave…" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAberto(null)} disabled={salvando}>Cancelar</Button>
            <Button variant="secondary" onClick={() => salvarEAvancar(false)} disabled={salvando}>
              Salvar
            </Button>
            <Button onClick={() => salvarEAvancar(true)} disabled={salvando}>
              Salvar e liberar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}