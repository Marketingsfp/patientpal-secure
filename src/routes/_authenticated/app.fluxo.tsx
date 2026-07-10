import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Workflow,
  Bell,
  Settings2,
  AlertTriangle,
  Siren,
  CircleDot,
  Clock,
  User,
  Stethoscope,
  CalendarDays,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/_authenticated/app/fluxo")({
  component: FluxoPage,
  head: () => ({ meta: [{ title: "Fluxo do paciente — ClinicaOS" }] }),
});

type Etapa =
  "aguardando_recepcao" | "recepcao" | "caixa" | "triagem" | "atendimento" | "exame" | "finalizado";

const ETAPAS: { id: Etapa; label: string; cor: string; corFundo: string; icon: any }[] = [
  {
    id: "aguardando_recepcao",
    label: "Aguardando",
    cor: "text-slate-700",
    corFundo: "bg-slate-100",
    icon: CircleDot,
  },
  { id: "recepcao", label: "Recepção", cor: "text-rose-700", corFundo: "bg-rose-100", icon: User },
  { id: "caixa", label: "Caixa", cor: "text-amber-700", corFundo: "bg-amber-100", icon: CircleDot },
  {
    id: "triagem",
    label: "Triagem",
    cor: "text-emerald-700",
    corFundo: "bg-emerald-100",
    icon: Stethoscope,
  },
  {
    id: "atendimento",
    label: "Atendimento",
    cor: "text-blue-700",
    corFundo: "bg-blue-100",
    icon: User,
  },
  {
    id: "exame",
    label: "Exame",
    cor: "text-violet-700",
    corFundo: "bg-violet-100",
    icon: Stethoscope,
  },
  {
    id: "finalizado",
    label: "Finalizado",
    cor: "text-zinc-700",
    corFundo: "bg-zinc-100",
    icon: CheckCircle2,
  },
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
  prioridade?: "normal" | "prioritario" | "urgente";
  medicos?: { nome: string } | null;
};

// CORREÇÃO: Função proxima com ordem correta
function proxima(e: Etapa): Etapa | null {
  const ordem: Etapa[] = [
    "aguardando_recepcao",
    "recepcao",
    "caixa",
    "triagem",
    "atendimento",
    "finalizado",
  ];
  const ordemExame: Etapa[] = [
    "aguardando_recepcao",
    "recepcao",
    "caixa",
    "triagem",
    "exame",
    "finalizado",
  ];

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
  const ordem: Etapa[] = [
    "aguardando_recepcao",
    "recepcao",
    "caixa",
    "triagem",
    "atendimento",
    "finalizado",
  ];
  const ordemExame: Etapa[] = [
    "aguardando_recepcao",
    "recepcao",
    "caixa",
    "triagem",
    "exame",
    "finalizado",
  ];
  const arr = isExame ? ordemExame : ordem;
  const i = arr.indexOf(e);
  if (i <= 0) return null;
  return arr[i - 1];
}
// E no botão: onClick={() => prev && setEtapa(a.id, anterior(a.fluxo_etapa, isExame))}

function FluxoPage() {
  const { clinicaAtual } = useClinica();
  const [ags, setAgs] = useState<Ag[]>([]);
  const [loading, setLoading] = useState(false);
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
      .select(
        "id, paciente_id, paciente_nome, procedimento, inicio, fluxo_etapa, prioridade, medicos(nome)",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .gte("inicio", ini)
      .lte("inicio", fim)
      .order("inicio");
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []) as unknown as Ag[];
    const reais = rows.filter(
      (a) => !!a.paciente_id && (a.paciente_nome ?? "").trim().toUpperCase() !== "DISPONÍVEL",
    );
    setAgs(reais);
    if (
      reais.length === 0 &&
      !fallbackAplicado &&
      dataRef === new Date().toISOString().slice(0, 10)
    ) {
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
        toast.info(
          `Sem pacientes hoje — exibindo ${new Date(`${ultData}T12:00:00`).toLocaleDateString("pt-BR")}`,
        );
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
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `clinica_id=eq.${clinicaAtual.clinica_id}`,
        },
        debouncedReload,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [carregar, clinicaAtual]);

  async function setEtapa(id: string, etapa: Etapa) {
    const { error } = await supabase
      .from("agendamentos")
      .update({ fluxo_etapa: etapa, fluxo_atualizado_em: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      // Recarregar para atualizar a lista
      await carregar();
    }
  }

  async function ciclarPrioridade(a: Ag) {
    const atual = a.prioridade ?? "normal";
    const prox =
      atual === "normal" ? "prioritario" : atual === "prioritario" ? "urgente" : "normal";
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
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    await setEtapa(a.id, "atendimento");
    toast.success(`Chamando ${nomeCurto} · ${guicheStr}`);
  }

  const colunas = useMemo(() => {
    const m = new Map<Etapa, Ag[]>();
    ETAPAS.forEach((e) => m.set(e.id, []));
    for (const a of ags) {
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
  }, [ags]);

  if (!clinicaAtual)
    return <p className="text-muted-foreground">Selecione uma clínica primeiro.</p>;

  return (
    <div className="space-y-3 max-w-full">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 flex-wrap bg-background sticky top-0 z-10 py-2 border-b">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold">Fluxo do paciente</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Recepção → Caixa → Triagem → Atendimento ou Exame → Finalizado
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Seletor de data simplificado */}
          <div className="flex items-center gap-1 rounded-md border bg-card px-1.5 py-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                const d = new Date(`${dataRef}T12:00:00`);
                d.setDate(d.getDate() - 1);
                setFallbackAplicado(true);
                setDataRef(d.toISOString().slice(0, 10));
              }}
              title="Dia anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            <div className="flex items-center gap-1 px-1">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <Input
                type="date"
                value={dataRef}
                onChange={(e) => {
                  setFallbackAplicado(true);
                  setDataRef(e.target.value);
                }}
                className="h-6 w-[100px] border-0 px-0.5 text-[10px] bg-transparent focus:ring-0 focus:outline-none"
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                const d = new Date(`${dataRef}T12:00:00`);
                d.setDate(d.getDate() + 1);
                setFallbackAplicado(true);
                setDataRef(d.toISOString().slice(0, 10));
              }}
              title="Próximo dia"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px] px-2">
                <Settings2 className="h-3 w-3" /> Sala {consultorio || "?"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Sala/Consultório</Label>
                <Input
                  value={consultorio}
                  onChange={(e) => setConsultorio(e.target.value.slice(0, 10))}
                  placeholder="Ex.: 1, 2, A…"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Nome para chamada</Label>
                <Input
                  value={medicoChamada}
                  onChange={(e) => setMedicoChamada(e.target.value.slice(0, 60))}
                  placeholder="Ex.: Dr. João"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Usado no botão <span className="font-medium">Chamar paciente</span>
              </p>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            onClick={carregar}
            disabled={loading}
            className="h-6 text-[10px] px-2.5 gap-1"
          >
            {loading ? "..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {/* Colunas do fluxo - grid sem scroll */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {ETAPAS.map((col) => {
          const items = colunas.get(col.id) ?? [];
          const Icon = col.icon;
          const isFinalizado = col.id === "finalizado";

          return (
            <div key={col.id} className="space-y-2 min-w-0">
              {/* Cabeçalho da coluna */}
              <div className={`flex items-center justify-between p-2 rounded ${col.corFundo}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`h-4 w-4 ${col.cor} flex-shrink-0`} />
                  <span className={`text-xs font-medium ${col.cor} truncate`}>{col.label}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                  {items.length}
                </Badge>
              </div>

              {/* Cards */}
              <div className="space-y-1.5">
                {items.length === 0 && !isFinalizado && (
                  <div className="text-[10px] text-muted-foreground text-center py-2 border border-dashed rounded">
                    vazio
                  </div>
                )}
                {items.length === 0 && isFinalizado && (
                  <div className="text-[10px] text-muted-foreground text-center py-2 border border-dashed rounded">
                    vazio
                  </div>
                )}
                {items.map((a) => {
                  const h = new Date(a.inicio).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const isExame = /exame|raio|usg|ultra|tomo|ressona/i.test(a.procedimento ?? "");
                  const next = proxima(a.fluxo_etapa);
                  const prev = anterior(a.fluxo_etapa, isExame);
                  const prioridadeInfo = a.prioridade
                    ? PRIORIDADES[a.prioridade]
                    : PRIORIDADES.normal;
                  const PrioridadeIcon = prioridadeInfo.Icon;

                  // Verifica se é a última etapa (atendimento ou exame)
                  const isUltimaEtapa =
                    a.fluxo_etapa === "atendimento" || a.fluxo_etapa === "exame";

                  return (
                    <Card
                      key={a.id}
                      className={`p-2.5 space-y-1.5 hover:shadow-sm transition-shadow ${prioridadeInfo.border} text-xs`}
                    >
                      {/* Nome e horário */}
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div
                            className={`h-2 w-2 rounded-full ${prioridadeInfo.cor} flex-shrink-0`}
                          />
                          <span className="font-medium text-xs truncate">{a.paciente_nome}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{h}</span>
                      </div>

                      {/* Prioridade */}
                      {a.prioridade && a.prioridade !== "normal" && (
                        <Badge
                          className={`border text-[9px] gap-0.5 px-1.5 py-0 ${prioridadeInfo.badge}`}
                        >
                          <PrioridadeIcon className="h-3 w-3" />
                          {prioridadeInfo.label}
                        </Badge>
                      )}

                      {/* Procedimento */}
                      <div className="text-[10px] text-muted-foreground truncate">
                        {a.procedimento ?? "—"}
                        {a.medicos?.nome && <span className="ml-1">· {a.medicos.nome}</span>}
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-0.5 pt-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5"
                          disabled={!prev}
                          onClick={() => prev && setEtapa(a.id, prev)}
                          title="Voltar"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5"
                          onClick={() => ciclarPrioridade(a)}
                          title="Prioridade"
                        >
                          <PrioridadeIcon className={`h-3.5 w-3.5 ${prioridadeInfo.cor}`} />
                        </Button>

                        {col.id === "triagem" && (
                          <>
                            <Button
                              size="sm"
                              className="h-6 px-1.5 text-[9px] gap-1 bg-blue-600 hover:bg-blue-700 text-white flex-1 min-w-[40px]"
                              onClick={() => chamarPaciente(a)}
                            >
                              <Bell className="h-3 w-3" /> Chamar
                            </Button>
                            {isExame && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-[9px] border-violet-400 text-violet-700 hover:bg-violet-50 flex-1 min-w-[35px]"
                                onClick={() => setEtapa(a.id, "exame")}
                              >
                                Exame
                              </Button>
                            )}
                          </>
                        )}

                        {col.id !== "triagem" && col.id !== "finalizado" && (
                          <>
                            {col.id === "atendimento" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5"
                                onClick={() => chamarPaciente(a)}
                                title="Rechamar"
                              >
                                <Bell className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className={`h-6 px-1.5 flex-1 min-w-[30px] ${isUltimaEtapa ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
                              disabled={!next}
                              onClick={() => next && setEtapa(a.id, next)}
                              title={isUltimaEtapa ? "Finalizar" : "Avançar"}
                            >
                              {isUltimaEtapa ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" /> Fim
                                </>
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </Button>
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
    </div>
  );
}
