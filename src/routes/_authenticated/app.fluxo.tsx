import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
import { cn } from "@/lib/utils";
import { agendamentosStatusPagamento, type StatusPagamento } from "@/lib/pagamento-status";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, CheckCircle2, Workflow, Bell, AlertTriangle, Siren, CircleDot, Clock, User, Stethoscope, CalendarDays, SlidersHorizontal, RefreshCw, MoreVertical, FileText, Pencil, Search, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { minutosEspera, faixaEspera, CLASSE_ESPERA, mediaEspera } from "@/lib/fluxo/espera";

import { DateInputBR } from "@/components/ui/date-input-br";
import { PacienteDetalheDrawer, type FluxoDetalheAg } from "@/components/fluxo/paciente-detalhe-drawer";
import { BadgePacienteDistante } from "@/components/paciente/badge-paciente-distante";
export const Route = createFileRoute("/_authenticated/app/fluxo")({
  component: FluxoPage,
  head: () => ({ meta: [{ title: "Fluxo do paciente — ClinicaOS" }] }),
});

type Etapa = "aguardando_recepcao" | "recepcao" | "caixa" | "triagem" | "atendimento" | "exame" | "finalizado";

const ETAPAS: { id: Etapa; label: string; cor: string; corFundo: string; ponto: string; accent: string; icon: any }[] = [
  { id: "aguardando_recepcao", label: "Aguardando", cor: "text-slate-700", corFundo: "bg-slate-100", ponto: "bg-slate-400", accent: "border-l-slate-300", icon: CircleDot },
  { id: "recepcao", label: "Recepção", cor: "text-slate-700", corFundo: "bg-slate-100", ponto: "bg-rose-500", accent: "border-l-rose-400", icon: User },
  { id: "caixa", label: "Caixa", cor: "text-slate-700", corFundo: "bg-slate-100", ponto: "bg-amber-500", accent: "border-l-amber-400", icon: CircleDot },
  { id: "triagem", label: "Triagem", cor: "text-slate-700", corFundo: "bg-slate-100", ponto: "bg-emerald-500", accent: "border-l-emerald-400", icon: Stethoscope },
  { id: "atendimento", label: "Atendimento", cor: "text-slate-700", corFundo: "bg-slate-100", ponto: "bg-blue-500", accent: "border-l-blue-400", icon: User },
  { id: "exame", label: "Exame", cor: "text-slate-700", corFundo: "bg-slate-100", ponto: "bg-violet-500", accent: "border-l-violet-400", icon: Stethoscope },
  { id: "finalizado", label: "Finalizado", cor: "text-slate-700", corFundo: "bg-slate-100", ponto: "bg-zinc-400", accent: "border-l-zinc-300", icon: CheckCircle2 },
];

const PRIORIDADES = {
  normal: {
    label: "Normal",
    Icon: CircleDot,
    cor: "text-muted-foreground",
    badge: "bg-muted text-muted-foreground",
    ordem: 0,
    border: "",
  },
  prioritario: {
    label: "PRIORITÁRIO",
    Icon: AlertTriangle,
    cor: "text-amber-600",
    badge: "bg-amber-100 text-amber-700 border-amber-300",
    ordem: 1,
    border: "border-l-4 border-l-amber-500",
  },
  urgente: {
    label: "URGENTE",
    Icon: Siren,
    cor: "text-rose-600",
    badge: "bg-rose-100 text-rose-700 border-rose-300",
    ordem: 2,
    border: "border-l-4 border-l-rose-500",
  },
} as const;

type Ag = {
  id: string;
  paciente_id: string | null;
  paciente_nome: string;
  procedimento: string | null;
  inicio: string;
  fluxo_etapa: Etapa;
  fluxo_atualizado_em?: string | null;
  prioridade?: "normal" | "prioritario" | "urgente";
  medicos?: { nome: string } | null;
};

/** Instante de referência para o cronômetro de espera do card. */
function refEspera(a: Ag): string {
  return a.fluxo_atualizado_em ?? a.inicio;
}

// CORREÇÃO: Função proxima com ordem correta
function proxima(e: Etapa): Etapa | null {
  const ordem: Etapa[] = ["aguardando_recepcao", "recepcao", "caixa", "triagem", "atendimento", "finalizado"];
  const ordemExame: Etapa[] = ["aguardando_recepcao", "recepcao", "caixa", "triagem", "exame", "finalizado"];
  
  // Se for "atendimento" ou "exame", a próxima etapa é "finalizado"
  if (e === "atendimento" || e === "exame") {
    return "finalizado";
  }
  
  const arr = ordem;
  void ordemExame;
  const i = arr.indexOf(e);
  if (i < 0 || i >= arr.length - 1) return null;
  return arr[i + 1];
}

function anterior(e: Etapa, isExame: boolean): Etapa | null {
  const ordem: Etapa[] = ["aguardando_recepcao", "recepcao", "caixa", "triagem", "atendimento", "finalizado"];
  const ordemExame: Etapa[] = ["aguardando_recepcao", "recepcao", "caixa", "triagem", "exame", "finalizado"];
  const arr = isExame ? ordemExame : ordem;
  const i = arr.indexOf(e);
  if (i <= 0) return null;
  return arr[i - 1];
}
// E no botão: onClick={() => prev && setEtapa(a.id, anterior(a.fluxo_etapa, isExame))}

function FluxoPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("fluxo");
  // Alvos de toque maiores nos botões de ação do kanban em telas pequenas
  // (toque em vez de mouse) — piloto São Francisco de Paula (flag
  // ux_melhorias). Some do desktop, onde o card denso com 7 colunas é
  // proposital.
  const { enabled: uxMelhorias } = useClinicFeatureFlag("ux_melhorias");
  const acaoBtnCls = uxMelhorias ? "h-9 sm:h-6 px-2.5 sm:px-1.5" : "h-6 px-1.5";
  const acaoTxtCls = uxMelhorias ? "text-xs sm:text-[9px]" : "text-[9px]";
  const acaoIconCls = cn(
    "inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer disabled:cursor-not-allowed",
    uxMelhorias && "p-2 sm:p-1.5",
  );
  const [ags, setAgs] = useState<Ag[]>([]);
  const [detalhe, setDetalhe] = useState<FluxoDetalheAg | null>(null);
  const [pagos, setPagos] = useState<Set<string>>(new Set());
  const [cidades, setCidades] = useState<Map<string, string | null>>(new Map());
  const [prontuarios, setProntuarios] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(false);
  // Filtros da barra superior (somente visualização — não alteram dados).
  const [busca, setBusca] = useState("");
  const [filtroMedico, setFiltroMedico] = useState("");
  const [filtroEspec, setFiltroEspec] = useState("");
  // Tick de 30s para os cronômetros de espera ficarem "vivos".
  const [agora, setAgora] = useState(() => Date.now());
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvoColuna, setAlvoColuna] = useState<Etapa | null>(null);
  const [dataRef, setDataRef] = useState(() => {
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzOffset).toISOString().slice(0, 10);
});
  const [fallbackAplicado, setFallbackAplicado] = useState(false);
  const [consultorio, setConsultorio] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("fluxo_consultorio") ?? "1") : "1",
  );
  const [medicoChamada, setMedicoChamada] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("fluxo_medico_chamada") ?? "") : "",
  );
  useEffect(() => {
    localStorage.setItem("fluxo_consultorio", consultorio);
  }, [consultorio]);
  useEffect(() => {
    localStorage.setItem("fluxo_medico_chamada", medicoChamada);
  }, [medicoChamada]);

  const carregar = useCallback(async () => {
    
    if (!clinicaAtual) return;
    setLoading(true);
    const ini = `${dataRef}T00:00:00`;
    const fim = `${dataRef}T23:59:59`;
    const { data, error } = await supabase
      .from("agendamentos")
      .select("id, paciente_id, paciente_nome, procedimento, inicio, fluxo_etapa, fluxo_atualizado_em, prioridade, medicos(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("inicio", ini)
      .lte("inicio", fim)
      .order("inicio");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as unknown as Ag[];
    const reais = rows.filter((a) => !!a.paciente_id && (a.paciente_nome ?? "").trim().toUpperCase() !== "DISPONÍVEL");
    setAgs(reais);

    // Cidade do paciente (alerta "paciente de longe")
    const pacIds = Array.from(new Set(reais.map((a) => a.paciente_id).filter((x): x is string => !!x)));
    if (pacIds.length) {
      const { data: pacs } = await supabase
        .from("pacientes")
        .select("id, cidade, codigo_prontuario")
        .in("id", pacIds);
      const mapa = new Map<string, string | null>();
      const mapaPr = new Map<string, string | null>();
      ((pacs ?? []) as { id: string; cidade: string | null; codigo_prontuario: string | null }[]).forEach((p) => {
        mapa.set(p.id, p.cidade);
        mapaPr.set(p.id, p.codigo_prontuario);
      });
      setCidades(mapa);
      setProntuarios(mapaPr);
    } else {
      setCidades(new Map());
      setProntuarios(new Map());
    }

    // Pula o Caixa quando o paciente já pagou (check-in/pagamento na recepção):
    // quem está pago não precisa passar pela coluna Caixa.
    if (reais.length) {
      const status = await agendamentosStatusPagamento(reais.map((a) => a.id));
      const idsPagos = new Set<string>();
      status.forEach((s: StatusPagamento, id: string) => { if (s.pago) idsPagos.add(id); });
      setPagos(idsPagos);
      const presosNoCaixa = reais.filter((a) => a.fluxo_etapa === "caixa" && idsPagos.has(a.id));
      if (presosNoCaixa.length) {
        await supabase
          .from("agendamentos")
          .update({ fluxo_etapa: "triagem", fluxo_atualizado_em: new Date().toISOString() } as never)
          .in("id", presosNoCaixa.map((a) => a.id));
        setAgs(reais.map((a) => (idsPagos.has(a.id) && a.fluxo_etapa === "caixa" ? { ...a, fluxo_etapa: "triagem" as Etapa } : a)));
      }
    } else {
      setPagos(new Set());
    }
    if (reais.length === 0 && !fallbackAplicado && dataRef === new Date().toISOString().slice(0, 10)) {
      const { data: ult } = await supabase
        .from("agendamentos")
        .select("inicio")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .not("paciente_id", "is", null)
        .neq("paciente_nome", "DISPONÍVEL")
        .lte("inicio", fim)
        .order("inicio", { ascending: false })
        .limit(1);
      const ultData = (ult?.[0] as { inicio?: string } | undefined)?.inicio?.slice(0, 10);
      if (ultData && ultData !== dataRef) {
        setFallbackAplicado(true);
        setDataRef(ultData);
        toast.info(`Sem pacientes hoje — exibindo ${new Date(`${ultData}T12:00:00`).toLocaleDateString("pt-BR")}`);
      }
    }
  }, [clinicaAtual, dataRef, fallbackAplicado]);

  useEffect(() => {
    void carregar();
    if (!clinicaAtual) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void carregar();
      }, 400);
    };
    const ch = supabase
      .channel(`fluxo-${clinicaAtual.clinica_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agendamentos", filter: `clinica_id=eq.${clinicaAtual.clinica_id}` },
        debouncedReload,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [carregar, clinicaAtual]);

  async function setEtapa(id: string, etapa: Etapa, opts?: { silencioso?: boolean }) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const anteriorLista = ags;
    const agoraISO = new Date().toISOString();
    // Atualização otimista: o card muda de coluna na hora.
    setAgs((prev) =>
      prev.map((a) => (a.id === id ? { ...a, fluxo_etapa: etapa, fluxo_atualizado_em: agoraISO } : a)),
    );

    const payload: Record<string, unknown> = { fluxo_etapa: etapa, fluxo_atualizado_em: agoraISO };
    // Ao entrar em Atendimento, o agendamento também passa a "em_atendimento"
    // na Agenda e registra o horário de início.
    if (etapa === "atendimento" || etapa === "exame") {
      payload.status = "em_atendimento";
      payload.executado_em = agoraISO;
    }

    const { error } = await supabase.from("agendamentos").update(payload as never).eq("id", id);
    if (error) {
      setAgs(anteriorLista); // desfaz a atualização otimista
      toast.error(error.message);
      return;
    }
    if (!opts?.silencioso) {
      const rotulo = ETAPAS.find((e) => e.id === etapa)?.label ?? etapa;
      toast.success(`Paciente encaminhado para ${rotulo}`);
    }
    await carregar();
  }

  async function ciclarPrioridade(a: Ag) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    const atual = a.prioridade ?? "normal";
    const prox = atual === "normal" ? "prioritario" : atual === "prioritario" ? "urgente" : "normal";
    const { error } = await supabase
      .from("agendamentos")
      .update({ prioridade: prox } as never)
      .eq("id", a.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Prioridade: ${prox}`);
      await carregar();
    }
  }

  async function chamarPaciente(a: Ag) {
    if (!clinicaAtual) return;
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!consultorio.trim()) {
      toast.error("Defina o consultório (botão de configuração no topo)");
      return;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: ult } = await supabase
      .from("senhas")
      .select("numero")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("data_dia", hoje)
      .eq("tipo", "N")
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();
    const proximoNum = Math.min(9999, (ult?.numero ?? 0) + 1);
    const nomeCurto = a.paciente_nome.split(/\s+/).slice(0, 2).join(" ").toUpperCase().slice(0, 24);
    const medicoStr = (medicoChamada || a.medicos?.nome || "").trim();
    const guicheStr = `Consultório ${consultorio.trim()}${medicoStr ? ` · ${medicoStr}` : ""}`;
    const now = new Date().toISOString();
    const { error: insErr } = await supabase.from("senhas").insert({
      clinica_id: clinicaAtual.clinica_id,
      tipo: "N",
      numero: proximoNum,
      codigo: nomeCurto,
      status: "chamada",
      paciente_id: a.paciente_id,
      guiche: guicheStr,
      chamada_em: now,
    } as never);
    if (insErr) { toast.error(insErr.message); return; }
    await setEtapa(a.id, "atendimento", { silencioso: true });
    toast.success(`Chamando ${nomeCurto} · ${guicheStr}`);
  }

  // Cronômetros vivos: recalcula a cada 30s sem recarregar dados.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const opcoesMedico = useMemo(
    () => Array.from(new Set(ags.map((a) => a.medicos?.nome).filter((n): n is string => !!n))).sort(),
    [ags],
  );
  const opcoesEspec = useMemo(
    () => Array.from(new Set(ags.map((a) => a.procedimento).filter((p): p is string => !!p))).sort(),
    [ags],
  );

  const agsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ags.filter((a) => {
      if (filtroMedico && (a.medicos?.nome ?? "") !== filtroMedico) return false;
      if (filtroEspec && (a.procedimento ?? "") !== filtroEspec) return false;
      if (!termo) return true;
      const pront = a.paciente_id ? (prontuarios.get(a.paciente_id) ?? "") : "";
      return (
        a.paciente_nome.toLowerCase().includes(termo) ||
        (pront ?? "").toLowerCase().includes(termo)
      );
    });
  }, [ags, busca, filtroMedico, filtroEspec, prontuarios]);

  // Cronômetro de espera só faz sentido quando estamos vendo o dia de hoje.
  const ehHoje = dataRef === new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const colunas = useMemo(() => {
    const m = new Map<Etapa, Ag[]>();
    ETAPAS.forEach((e) => m.set(e.id, []));
    for (const a of agsFiltrados) {
      const etapa = a.fluxo_etapa;
      const lista = m.get(etapa);
      if (lista) lista.push(a);
    }
    for (const [etapa, lista] of m) {
      lista.sort((a, b) => {
        const prioridadeA = a.prioridade ?? "normal";
        const prioridadeB = b.prioridade ?? "normal";
        const ordemA = PRIORIDADES[prioridadeA].ordem;
        const ordemB = PRIORIDADES[prioridadeB].ordem;
        return ordemB - ordemA;
      });
    }
    return m;
  }, [agsFiltrados]);

  if (!clinicaAtual) return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-3 max-w-full">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-background sticky top-0 z-10 py-2.5 border-b">
        <div className="flex items-start gap-2.5 min-w-0">
          <Workflow className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-xl font-bold text-slate-900 leading-none">Fluxo do paciente</h1>
            <div className="hidden sm:flex flex-wrap items-center gap-1">
              {["Recepção", "Caixa", "Triagem", "Atendimento ou Exame", "Finalizado"].map((etapa, i, arr) => (
                <span key={etapa} className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {etapa}
                  </span>
                  {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Navegação de data unificada */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
            <button
              type="button"
              className="cursor-pointer rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
              onClick={() => {
                const d = new Date(`${dataRef}T12:00:00`);
                d.setDate(d.getDate() - 1);
                setFallbackAplicado(true);
                setDataRef(d.toISOString().slice(0, 10));
              }}
              title="Dia anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <CalendarDays className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <DateInputBR
                value={dataRef}
                onChange={(e) => {
                  setFallbackAplicado(true);
                  setDataRef(e.target.value);
                }}
                className="h-6 w-[104px] cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-slate-700 shadow-none focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:hidden"
              />
            </div>

            <button
              type="button"
              className="cursor-pointer rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
              onClick={() => {
                const d = new Date(`${dataRef}T12:00:00`);
                d.setDate(d.getDate() + 1);
                setFallbackAplicado(true);
                setDataRef(d.toISOString().slice(0, 10));
              }}
              title="Próximo dia"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" /> Sala {consultorio || "?"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Sala/Consultório</Label>
                <Input value={consultorio} onChange={(e) => setConsultorio(e.target.value.slice(0, 10))} placeholder="Ex.: 1, 2, A…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Nome para chamada</Label>
                <Input value={medicoChamada} onChange={(e) => setMedicoChamada(e.target.value.slice(0, 60))} placeholder="Ex.: Dr. João" />
              </div>
              <p className="text-xs text-muted-foreground">Usado no botão <span className="font-medium">Chamar paciente</span></p>
            </PopoverContent>
          </Popover>
          
          <button
            type="button"
            onClick={carregar}
            disabled={loading}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-slate-500", loading && "animate-spin")} /> Atualizar
          </button>
        </div>
      </div>

      {/* Barra de busca e filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou prontuário…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <select
          value={filtroMedico}
          onChange={(e) => setFiltroMedico(e.target.value)}
          className="h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs"
        >
          <option value="">Todos os médicos</option>
          {opcoesMedico.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={filtroEspec}
          onChange={(e) => setFiltroEspec(e.target.value)}
          className="h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs"
        >
          <option value="">Todas as especialidades</option>
          {opcoesEspec.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {(busca || filtroMedico || filtroEspec) && (
          <button
            type="button"
            onClick={() => { setBusca(""); setFiltroMedico(""); setFiltroEspec(""); }}
            className="h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Colunas do fluxo - grid sem scroll */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {ETAPAS.map((col) => {
          const items = colunas.get(col.id) ?? [];
          const Icon = col.icon;
          const media = mediaEspera(items.map(refEspera), agora);

          return (
            <div
              key={col.id}
              className={cn(
                "space-y-2 min-w-0 rounded-xl transition-colors",
                alvoColuna === col.id && "bg-primary/5 ring-2 ring-primary/30",
              )}
              onDragOver={(e) => {
                if (!arrastando) return;
                e.preventDefault();
                setAlvoColuna(col.id);
              }}
              onDragLeave={() => setAlvoColuna((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                const id = arrastando ?? e.dataTransfer.getData("text/plain");
                setAlvoColuna(null);
                setArrastando(null);
                if (!id) return;
                const atual = ags.find((x) => x.id === id);
                if (!atual || atual.fluxo_etapa === col.id) return;
                void setEtapa(id, col.id);
              }}
            >
              {/* Cabeçalho da coluna */}
              <div
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-100/80 px-2.5 py-1.5 border-l-[3px]",
                  col.accent,
                )}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", col.ponto)} />
                  <Icon className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-700">{col.label}</span>
                    {media !== null && col.id !== "finalizado" && (
                      <span className="block truncate text-[10px] font-medium text-slate-500">
                        Média: {media} min
                      </span>
                    )}
                  </div>
                </div>
                <span className="flex-shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 shadow-xs">
                  {items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {items.length === 0 && (
                  <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-slate-200/70 bg-slate-50/50 p-6 text-center text-xs font-medium text-slate-400">
                    <Icon className="h-4 w-4 text-slate-300" />
                    Nenhum paciente
                  </div>
                )}
                {items.map((a) => {
                  const h = new Date(a.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  const isExame = /exame|raio|usg|ultra|tomo|ressona/i.test(a.procedimento ?? "");
                  const nextBruto = proxima(a.fluxo_etapa);
                  // Pagou na recepção → pula a coluna Caixa
                  const next = nextBruto === "caixa" && pagos.has(a.id) ? ("triagem" as Etapa) : nextBruto;
                  const prev = anterior(a.fluxo_etapa, isExame);
                  const prioridadeInfo = a.prioridade ? PRIORIDADES[a.prioridade] : PRIORIDADES.normal;
                  const PrioridadeIcon = prioridadeInfo.Icon;
                  
                  // Verifica se é a última etapa (atendimento ou exame)
                  const isUltimaEtapa = a.fluxo_etapa === "atendimento" || a.fluxo_etapa === "exame";
                  const espera = minutosEspera(refEspera(a), agora);
                  const faixa = faixaEspera(espera);
                  const prontuario = a.paciente_id ? prontuarios.get(a.paciente_id) : null;

                  return (
                    <Card
                      key={a.id}
                      draggable={podeEscrever}
                      onDragStart={(e) => {
                        setArrastando(a.id);
                        e.dataTransfer.setData("text/plain", a.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => { setArrastando(null); setAlvoColuna(null); }}
                      className={cn(
                        "gap-0 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer",
                        prioridadeInfo.border,
                        arrastando === a.id && "opacity-50",
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setDetalhe({
                          id: a.id,
                          paciente_id: a.paciente_id,
                          paciente_nome: a.paciente_nome,
                          procedimento: a.procedimento,
                          inicio: a.inicio,
                          medicoNome: a.medicos?.nome ?? null,
                        })
                      }
                    >
                      {/* Nome, prontuário e menu */}
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-800" title={a.paciente_nome}>
                          {a.paciente_nome}
                        </span>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{h}</span>
                          {prontuario && (
                            <span className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600" title={`Prontuário ${prontuario}`}>
                              #{prontuario}
                            </span>
                          )}
                          <div className="ml-auto flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className={acaoIconCls} title="Ações">
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => chamarPaciente(a)}>
                                <Bell className="mr-2 h-4 w-4" /> Chamar senha no painel
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to="/app/prontuarios">
                                  <FileText className="mr-2 h-4 w-4" /> Abrir prontuário/anamnese
                                </Link>
                              </DropdownMenuItem>
                              {a.paciente_id && (
                                <DropdownMenuItem asChild>
                                  <Link to="/app/clientes/$pacienteId/editar" params={{ pacienteId: a.paciente_id }}>
                                    <Pencil className="mr-2 h-4 w-4" /> Editar ficha
                                  </Link>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </div>
                      </div>

                      {/* Tempo de espera (só faz sentido no dia corrente) */}
                      {col.id !== "finalizado" && ehHoje && (
                        <span
                          className={cn(
                            "mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
                            CLASSE_ESPERA[faixa],
                          )}
                          title="Tempo desde a última movimentação no fluxo"
                        >
                          <Clock className="h-3 w-3" /> {espera} min de espera
                        </span>
                      )}

                      {a.paciente_id && (
                        <BadgePacienteDistante cidade={cidades.get(a.paciente_id) ?? null} compact className="mt-1.5" />
                      )}

                      {/* Prioridade */}
                      {a.prioridade && a.prioridade !== "normal" && (
                        <Badge className={cn("mt-2 w-fit gap-0.5 border px-1.5 py-0 text-[9px]", prioridadeInfo.badge)}>
                          <PrioridadeIcon className="h-3 w-3" />
                          {prioridadeInfo.label}
                        </Badge>
                      )}

                      {/* Procedimento */}
                      <div className="mt-1 truncate text-xs font-medium text-slate-500">
                        {a.procedimento ?? "—"}
                        {a.medicos?.nome && <span className="ml-1">· {a.medicos.nome}</span>}
                      </div>

                      {/* Ações */}
                      <div
                        className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className={cn(acaoIconCls, "disabled:opacity-40 disabled:hover:bg-transparent")}
                          disabled={!prev}
                          onClick={() => prev && setEtapa(a.id, prev)}
                          title="Voltar"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button type="button" className={acaoIconCls} onClick={() => ciclarPrioridade(a)} title="Prioridade">
                          <PrioridadeIcon className={cn("h-4 w-4", prioridadeInfo.cor)} />
                        </button>

                        {(col.id === "triagem" || col.id === "aguardando_recepcao") && (
                          <>
                            <Button size="sm" variant="outline" className={cn(acaoBtnCls, acaoTxtCls, "ml-auto gap-1 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800")} onClick={() => chamarPaciente(a)}>
                              <Bell className="h-3 w-3" /> Chamar
                            </Button>
                            {isExame && col.id === "triagem" && (
                              <Button size="sm" variant="outline" className={cn(acaoBtnCls, acaoTxtCls, "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100")} onClick={() => setEtapa(a.id, "exame")}>
                                Exame
                              </Button>
                            )}
                          </>
                        )}

                        {col.id !== "triagem" && col.id !== "finalizado" && (
                          <>
                            {col.id === "atendimento" && (
                              <button type="button" className={acaoIconCls} onClick={() => chamarPaciente(a)} title="Rechamar">
                                <Bell className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              className={cn(
                                acaoIconCls,
                                "ml-auto gap-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40",
                                isUltimaEtapa && "flex items-center px-2 text-xs font-semibold",
                              )}
                              disabled={!next}
                              onClick={() => next && setEtapa(a.id, next)}
                              title={isUltimaEtapa ? "Finalizar" : "Avançar"}
                            >
                              {isUltimaEtapa ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Fim
                                </>
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <PacienteDetalheDrawer
        ag={detalhe}
        pago={detalhe ? pagos.has(detalhe.id) : false}
        onClose={() => setDetalhe(null)}
      />
    </div>
  );
}
