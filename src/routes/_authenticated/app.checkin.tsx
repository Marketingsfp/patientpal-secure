import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { janelaDiaClinica } from "@/lib/date-utils";
import { agendamentosStatusPagamento } from "@/lib/pagamento-status";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { DateInputBR } from "@/components/ui/date-input-br";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  BadgeCheck,
  Search,
  ConciergeBell,
  X,
  Loader2,
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Stethoscope,
  IdCard,
  Phone,
  UserCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/checkin")({
  component: CheckinPage,
  head: () => ({ meta: [{ title: "Check-in de pacientes — ClinicaOS" }] }),
});

type FluxoEtapa = "aguardando_recepcao" | "recepcao" | "triagem" | "atendimento" | "caixa";

type AgendamentoRow = {
  id: string;
  paciente_nome: string;
  paciente_id: string | null;
  inicio: string;
  procedimento: string | null;
  fluxo_etapa: FluxoEtapa;
  medicos: { nome: string } | null;
};

type PacienteRow = {
  id: string;
  cpf: string | null;
  telefone: string | null;
  foto_url: string | null;
};

type Item = AgendamentoRow & {
  paciente: PacienteRow | null;
  pago: boolean;
};

type MensalidadeVencida = {
  vencimento: string;
  valor: number;
  convenio_nome?: string;
};

type BloqueioInfo = {
  bloqueado?: boolean;
  total_aberto?: number;
  mensalidades?: MensalidadeVencida[];
};

const ETAPAS_CHECKIN: FluxoEtapa[] = ["aguardando_recepcao", "recepcao"];

const ETAPA_LABELS: Record<FluxoEtapa, string> = {
  aguardando_recepcao: "AGUARDANDO RECEPÇÃO",
  recepcao: "RECEPÇÃO",
  triagem: "CHECK-IN JÁ REALIZADO",
  atendimento: "EM ATENDIMENTO",
  caixa: "NO CAIXA",
};

function estaPendenteCheckin(etapa: string): boolean {
  return ETAPAS_CHECKIN.includes(etapa as FluxoEtapa);
}

function etapaLabel(etapa: string): string {
  return ETAPA_LABELS[etapa as FluxoEtapa] ?? etapa.replace(/_/g, " ").toUpperCase();
}

function normalizar(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function apenasDigitos(texto: string): string {
  return (texto || "").replace(/\D/g, "");
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarDataBr(data: string): string {
  const partes = data.split("-");
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatarDataExtenso(dataStr: string): string {
  const data = new Date(`${dataStr}T00:00:00`);
  return data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function combinaComBusca(item: Item, termo: string): boolean {
  const buscaNormalizada = normalizar(termo.trim());
  const buscaCpf = apenasDigitos(termo);

  if (!buscaNormalizada && !buscaCpf) return true;

  const nomeMatch = normalizar(item.paciente_nome).includes(buscaNormalizada);
  const cpfMatch = !!buscaCpf && apenasDigitos(item.paciente?.cpf ?? "").includes(buscaCpf);

  return nomeMatch || cpfMatch;
}

// ============ COMPONENTES ============

// 1. DateSelector - Componente de seleção de data (Corrigido o texto cortado)
function DateSelector({ data, onDataChange }: { data: string; onDataChange: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const hoje = new Date();
  const dataObj = new Date(`${data}T00:00:00`);

  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);

  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const semanaPassada = new Date(hoje);
  semanaPassada.setDate(semanaPassada.getDate() - 7);

  const proximaSemana = new Date(hoje);
  proximaSemana.setDate(proximaSemana.getDate() + 7);

  const isHoje = dataObj.toDateString() === hoje.toDateString();
  const isOntem = dataObj.toDateString() === ontem.toDateString();
  const isAmanha = dataObj.toDateString() === amanha.toDateString();

  const navegarDia = (dias: number) => {
    const novaData = new Date(dataObj);
    novaData.setDate(novaData.getDate() + dias);
    const ano = novaData.getFullYear();
    const mes = String(novaData.getMonth() + 1).padStart(2, "0");
    const dia = String(novaData.getDate()).padStart(2, "0");
    onDataChange(`${ano}-${mes}-${dia}`);
  };

  const textoData = (() => {
    const [ano, mes, dia] = data.split("-");
    const curto = `${dia}/${mes}/${ano}`;
    if (isHoje) return `Hoje, ${dia}/${mes}`;
    if (isOntem) return `Ontem, ${dia}/${mes}`;
    if (isAmanha) return `Amanhã, ${dia}/${mes}`;
    return curto;
  })();

  const corData = (() => {
    if (isHoje) return "text-primary font-medium";
    if (isOntem) return "text-muted-foreground";
    if (isAmanha) return "text-emerald-600";
    return "";
  })();

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Data do atendimento
      </Label>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navegarDia(-1)}
          className="h-10 w-10 flex-shrink-0 rounded-lg border-slate-200 bg-white"
          title="Dia anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="relative w-full max-w-[200px]">
          <Button
            variant="outline"
            className={`w-full max-w-[200px] truncate justify-center h-10 rounded-lg border-slate-200 bg-white text-sm font-semibold px-3 ${corData}`}
            onClick={() => setIsOpen(!isOpen)}
          >
            <CalendarDays className="h-4 w-4 shrink-0 mr-2" />
            <span className="truncate">{textoData}</span>
          </Button>

          {isOpen && (
            <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-lg p-2 min-w-[200px]">
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const d = semanaPassada;
                      const ano = d.getFullYear();
                      const mes = String(d.getMonth() + 1).padStart(2, "0");
                      const dia = String(d.getDate()).padStart(2, "0");
                      onDataChange(`${ano}-${mes}-${dia}`);
                      setIsOpen(false);
                    }}
                    className="text-xs h-7"
                  >
                    -7 dias
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const d = hoje;
                      const ano = d.getFullYear();
                      const mes = String(d.getMonth() + 1).padStart(2, "0");
                      const dia = String(d.getDate()).padStart(2, "0");
                      onDataChange(`${ano}-${mes}-${dia}`);
                      setIsOpen(false);
                    }}
                    className="text-xs h-7 font-bold text-primary"
                  >
                    Hoje
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const d = proximaSemana;
                      const ano = d.getFullYear();
                      const mes = String(d.getMonth() + 1).padStart(2, "0");
                      const dia = String(d.getDate()).padStart(2, "0");
                      onDataChange(`${ano}-${mes}-${dia}`);
                      setIsOpen(false);
                    }}
                    className="text-xs h-7"
                  >
                    +7 dias
                  </Button>
                </div>

                <div className="border-t pt-2">
                  <DateInputBR
                    value={data}
                    onChange={(e) => {
                      onDataChange(e.target.value);
                      setIsOpen(false);
                    }}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => navegarDia(1)}
          className="h-10 w-10 flex-shrink-0 rounded-lg border-slate-200 bg-white"
          title="Próximo dia"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
// 2. SearchBar - Componente de busca (Corrigido o tamanho do grid)
function SearchBar({
  data,
  onDataChange,
  busca,
  onBuscaChange,
  onSearch,
  onClear,
  buscaAplicada,
}: {
  data: string;
  onDataChange: (value: string) => void;
  busca: string;
  onBuscaChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
  buscaAplicada: string;
}) {
  return (
    <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_auto] gap-4 items-end">
        <DateSelector data={data} onDataChange={onDataChange} />

        <div className="space-y-1.5">
          <Label
            htmlFor="busca-paciente"
            className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            Buscar paciente (nome ou CPF)
          </Label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              id="busca-paciente"
              className="pl-9 h-10 w-full bg-white border border-slate-200 rounded-lg text-sm"
              value={busca}
              onChange={(e) => onBuscaChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSearch();
                }
              }}
              placeholder="Digite o nome ou CPF..."
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={onSearch}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 h-10 rounded-lg shadow-sm transition-colors whitespace-nowrap"
          >
            <Search className="h-4 w-4 mr-2" />
            Buscar
          </Button>
          {buscaAplicada && (
            <Button
              variant="outline"
              onClick={onClear}
              className="h-10 rounded-lg border-slate-200 text-xs font-semibold whitespace-nowrap"
            >
              <X className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 font-medium mt-3 pt-2 border-t border-slate-100">
        Mostrando todos os pacientes agendados para o dia (pagos e pendentes)
      </p>
    </div>
  );
}

// 3. PatientCard - Componente de card do paciente
function PatientCard({
  item,
  index,
  onConfirm,
  isConfirming,
  podeEscrever,
}: {
  item: Item;
  index: number;
  onConfirm: (item: Item) => void;
  isConfirming: boolean;
  podeEscrever: boolean;
}) {
  const pendente = estaPendenteCheckin(item.fluxo_etapa);

  return (
    <Card className="relative p-4 sm:p-5 border-border/80 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
        <AvatarPaciente
          nome={item.paciente_nome}
          cpf={item.paciente?.cpf ?? null}
          url={item.paciente?.foto_url ?? null}
        />

        <div className="flex-1 min-w-[220px] space-y-2">
          <div className="flex items-center gap-2 flex-wrap pr-16">
            <h3 className="text-lg font-bold leading-tight text-foreground">{item.paciente_nome}</h3>
            {item.pago ? (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">PAGO</Badge>
            ) : (
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">PENDENTE</Badge>
            )}
            {!pendente && <Badge variant="outline">{etapaLabel(item.fluxo_etapa)}</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {formatarHora(item.inicio)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5 shrink-0" />
              {item.medicos?.nome ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
              {item.procedimento ?? "CONSULTA"}
            </span>
            {item.paciente?.cpf && (
              <span className="inline-flex items-center gap-1.5">
                <IdCard className="h-3.5 w-3.5 shrink-0" />
                {item.paciente.cpf}
              </span>
            )}
            {item.paciente?.telefone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {item.paciente.telefone}
              </span>
            )}
          </div>
        </div>

        <div className="w-full sm:w-auto sm:self-center">
          {pendente ? (
            podeEscrever && (
              <Button
                onClick={() => onConfirm(item)}
                disabled={isConfirming}
                className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto sm:min-w-[180px] h-10"
              >
                {isConfirming ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <BadgeCheck className="h-4 w-4 mr-2" />
                )}
                Confirmar presença
              </Button>
            )
          ) : (
            <Button variant="outline" disabled className="w-full sm:w-auto h-10">
              {etapaLabel(item.fluxo_etapa)}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// 4. EmptyState - Componente de estado vazio
function EmptyState() {
  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-12 text-center shadow-xs">
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
        <UserCheck className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold text-slate-700">
        Nenhum paciente agendado para o dia aguardando check-in
      </p>
      <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
        Verifique os agendamentos ou confira se os pacientes já realizaram o check-in
      </p>
    </div>
  );
}

// 5. CheckinPage - Componente principal
function CheckinPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("checkin");

  const [data, setData] = useState(() => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const dia = String(hoje.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  });

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicaAtual) {
      setError("Selecione uma clínica primeiro");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { inicio, fimExclusivo } = janelaDiaClinica(data);

      let query = supabase
        .from("agendamentos")
        .select("id, paciente_nome, paciente_id, inicio, procedimento, fluxo_etapa, medicos(nome)")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .gte("inicio", inicio)
        .lt("inicio", fimExclusivo)
        .neq("status", "cancelado")
        .not("paciente_id", "is", null)
        .order("inicio", { ascending: true });

      const { data: agendamentos, error: agendamentosError } = await query;

      if (agendamentosError) {
        throw new Error(`Erro ao buscar agendamentos: ${agendamentosError.message}`);
      }

      const ags = agendamentos as AgendamentoRow[] | null;

      if (!ags || ags.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      // Lista TODOS os agendados do dia (pagos e pendentes). O pagamento vira
      // apenas um indicador visual, não um filtro que esconde o paciente.
      const ids = ags.map((a) => a.id);
      let statusPag = new Map<string, { pago: boolean }>();
      try {
        statusPag = await agendamentosStatusPagamento(ids);
      } catch (e) {
        console.error("Erro ao buscar pagamentos:", e);
      }

      const candidatos = ags;

      const pacIds = Array.from(new Set(candidatos.map((a) => a.paciente_id).filter((x): x is string => !!x)));

      const pacMap = new Map<string, PacienteRow>();

      if (pacIds.length > 0) {
        const { data: pacientes, error: pacientesError } = await supabase
          .from("pacientes")
          .select("id, cpf, telefone, foto_url")
          .in("id", pacIds);

        if (pacientesError) {
          console.error("Erro ao buscar pacientes:", pacientesError);
        } else {
          (pacientes ?? []).forEach((p) => {
            pacMap.set(p.id, {
              id: p.id,
              cpf: p.cpf,
              telefone: p.telefone,
              foto_url: p.foto_url,
            });
          });

          // foto_url guarda o caminho no bucket privado; gerar URL assinada para exibir
          const comFoto = (pacientes ?? []).filter((p) => !!p.foto_url);
          if (comFoto.length > 0) {
            const { data: signed } = await supabase.storage
              .from("pacientes-fotos")
              .createSignedUrls(comFoto.map((p) => p.foto_url as string), 3600);
            (signed ?? []).forEach((s, i) => {
              const alvo = comFoto[i];
              const atual = pacMap.get(alvo.id);
              if (atual) pacMap.set(alvo.id, { ...atual, foto_url: s.signedUrl ?? null });
            });
          }
        }
      }

      const resultado: Item[] = candidatos.map((a) => ({
        ...a,
        paciente: a.paciente_id ? (pacMap.get(a.paciente_id) ?? null) : null,
        pago: statusPag.get(a.id)?.pago ?? false,
      }));

      const termoAplicado = buscaAplicada.trim();
      const itemsFiltrados =
        termoAplicado.length > 0 ? resultado.filter((item) => combinaComBusca(item, termoAplicado)) : resultado;

      setItems(itemsFiltrados);
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
      setError(mensagem);
      toast.error(`Erro ao carregar lista: ${mensagem}`);
    } finally {
      setLoading(false);
    }
  }, [clinicaAtual, data, buscaAplicada]);

  useEffect(() => {
    void load();
  }, [load]);

  // Atualiza a lista assim que um pagamento é registrado em outra tela
  // (Agendas / Financeiro / Caixa) ou quando o agendamento muda de etapa.
  useRealtimeRefresh(
    ["fin_lancamentos", "agendamento_orcamento_itens", "agendamentos"],
    () => {
      void load();
    },
    !!clinicaAtual,
  );

  // Ao voltar para a aba, revalida o status de pagamento.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key < "1" || e.key > "9") return;

      const idx = Number(e.key) - 1;
      const alvo = filtradosRef.current[idx];
      if (alvo && estaPendenteCheckin(alvo.fluxo_etapa)) {
        e.preventDefault();
        void confirmarCheckin(alvo);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    return items;
  }, [items]);

  const filtradosRef = useRef<Item[]>([]);
  useEffect(() => {
    filtradosRef.current = filtrados;
  }, [filtrados]);

  const acionarBusca = () => {
    setBuscaAplicada(busca.trim());
  };

  // Busca automática com atraso de 300ms — a digitação continua fluida
  // mesmo com muitos registros; o botão "Buscar" segue funcionando.
  const buscaDebounced = useDebouncedValue(busca, 300);
  useEffect(() => {
    setBuscaAplicada(buscaDebounced.trim());
  }, [buscaDebounced]);

  const limparBusca = () => {
    setBusca("");
    setBuscaAplicada("");
  };

  const confirmarCheckin = async (item: Item) => {
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (confirmandoId === item.id) return;
    setConfirmandoId(item.id);

    try {
      if (item.paciente_id && clinicaAtual) {
        const { data: bloqueio, error: bloqueioError } = await supabase.rpc("paciente_cartao_inadimplente", {
          _paciente_id: item.paciente_id,
          _clinica_id: clinicaAtual.clinica_id,
        });

        if (bloqueioError) {
          console.error("Erro ao verificar inadimplência:", bloqueioError);
        } else {
          const info = bloqueio as BloqueioInfo;
          if (info?.bloqueado) {
            const linhas = (info.mensalidades ?? [])
              .slice(0, 5)
              .map(
                (m) =>
                  `• ${m.convenio_nome ?? "Cartão"} venc. ${m.vencimento?.split("-").reverse().join("/")} — R$ ${Number(m.valor).toFixed(2)}`,
              )
              .join("\n");

            toast.error(
              `Check-in bloqueado: ${item.paciente_nome} tem mensalidade(s) vencida(s).\nTotal em aberto: R$ ${Number(info.total_aberto ?? 0).toFixed(2)}\n\n${linhas}`,
              { duration: 10000 },
            );
            return;
          }
        }
      }

      const { error: updateError } = await supabase
        .from("agendamentos")
        .update({
          fluxo_etapa: "triagem",
          fluxo_atualizado_em: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (updateError) {
        throw new Error(`Erro ao confirmar check-in: ${updateError.message}`);
      }

      toast.success(`✅ Presença de ${item.paciente_nome} confirmada — liberado para triagem`);
      setItems((xs) => xs.filter((x) => x.id !== item.id));
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(`Erro ao confirmar check-in: ${mensagem}`);
    } finally {
      setConfirmandoId(null);
    }
  };

  if (!clinicaAtual) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <AlertCircle className="h-12 w-12 mx-auto mb-4" />
        <p className="text-lg font-medium">Nenhuma clínica selecionada</p>
        <p className="text-sm">Selecione uma clínica para acessar o check-in</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <ConciergeBell className="h-5 w-5" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Check-in de pacientes
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {clinicaAtual.clinica.nome && (
                <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-md">
                  {clinicaAtual.clinica.nome}
                </span>
              )}
              {data && (
                <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2.5 py-1 rounded-md capitalize">
                  {formatarDataExtenso(data)}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="bg-amber-50 text-amber-700 border border-amber-200/80 px-3 py-1 text-xs font-semibold rounded-full">
          {filtrados.length} {filtrados.length === 1 ? "paciente" : "pacientes"} aguardando
        </span>
      </div>

      {/* Busca com seletor de data melhorado */}
      <SearchBar
        data={data}
        onDataChange={setData}
        busca={busca}
        onBuscaChange={setBusca}
        onSearch={acionarBusca}
        onClear={limparBusca}
        buscaAplicada={buscaAplicada}
      />

      {/* Conteúdo */}
      {loading ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Carregando lista de pacientes...</p>
          </div>
        </Card>
      ) : error ? (
        <Card className="p-8 text-center border-destructive">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-lg font-medium text-destructive">Erro ao carregar</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => void load()} variant="outline">
              Tentar novamente
            </Button>
          </div>
        </Card>
      ) : filtrados.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {filtrados.map((item, index) => (
            <PatientCard
              key={item.id}
              item={item}
              index={index}
              onConfirm={confirmarCheckin}
              isConfirming={confirmandoId === item.id}
              podeEscrever={podeEscrever}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function iniciaisDoNome(nome: string) {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

function AvatarPaciente({ nome, cpf, url }: { nome: string; cpf?: string | null; url: string | null }) {
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState(false);
  const mostrarFoto = !!url && !erro;

  return (
    <>
      <button
        type="button"
        title={mostrarFoto ? "Ver foto do paciente" : "Nenhuma foto cadastrada para este paciente"}
        onClick={() => {
          if (mostrarFoto) setAberto(true);
          else toast.info("Nenhuma foto cadastrada para este paciente");
        }}
        className={`h-12 w-12 shrink-0 rounded-full border bg-slate-200 text-slate-700 flex items-center justify-center overflow-hidden transition-opacity ${
          mostrarFoto ? "cursor-pointer hover:opacity-80" : "cursor-default"
        }`}
      >
        {mostrarFoto ? (
          <img
            src={url as string}
            alt={`Foto de ${nome}`}
            className="h-full w-full object-cover"
            onError={() => setErro(true)}
          />
        ) : (
          <span className="text-sm font-semibold">{iniciaisDoNome(nome)}</span>
        )}
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{nome}</DialogTitle>
            <DialogDescription>{cpf ? `CPF ${cpf}` : "CPF não informado"}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            {url && (
              <img
                src={url}
                alt={`Foto de ${nome}`}
                className="max-h-[80vh] w-auto object-contain rounded-lg shadow-md"
                onError={() => { setErro(true); setAberto(false); }}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
