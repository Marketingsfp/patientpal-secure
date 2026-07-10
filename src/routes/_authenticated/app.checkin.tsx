import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
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
function DateSelector({
  data,
  onDataChange,
}: {
  data: string;
  onDataChange: (value: string) => void;
}) {
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
    if (isHoje) return "Hoje";
    if (isOntem) return "Ontem";
    if (isAmanha) return "Amanhã";
    return formatarDataExtenso(data);
  })();

  const corData = (() => {
    if (isHoje) return "text-primary font-medium";
    if (isOntem) return "text-muted-foreground";
    if (isAmanha) return "text-emerald-600";
    return "";
  })();

  return (
    <div className="space-y-1.5">
      <Label>Data do atendimento</Label>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navegarDia(-1)}
          className="h-9 w-9 flex-shrink-0"
          title="Dia anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="relative flex-1 min-w-[220px]">
          {/* Aqui removemos o 'truncate' e a data redundante para o texto respirar */}
          <Button
            variant="outline"
            className={`w-full justify-center h-9 font-normal text-sm px-3 ${corData}`}
            onClick={() => setIsOpen(!isOpen)}
          >
            <CalendarDays className="h-4 w-4 shrink-0 mr-2" />
            <span>{textoData}</span>
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
                  <Input
                    type="date"
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
          className="h-9 w-9 flex-shrink-0"
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
    <Card className="p-4">
      {/* Aqui a grid md:grid-cols passou de 220px para 320px */}
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_auto] gap-4 items-end">
        <DateSelector data={data} onDataChange={onDataChange} />

        <div className="space-y-1.5">
          <Label htmlFor="busca-paciente">Buscar paciente (nome ou CPF)</Label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="busca-paciente"
              className="pl-9 h-9"
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
            className="bg-primary text-primary-foreground h-9 whitespace-nowrap"
          >
            <Search className="h-4 w-4 mr-2" />
            Buscar
          </Button>
          {buscaAplicada && (
            <Button variant="outline" onClick={onClear} className="h-9 whitespace-nowrap">
              <X className="h-4 w-4 mr-2" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4 pt-3 border-t">
        <p className="text-xs text-muted-foreground">
          📋 Mostrando todos os pacientes agendados para o dia (pagos e pendentes)
        </p>
        <Badge variant="outline" className="text-xs">
          {formatarDataBr(data)}
        </Badge>
      </div>
    </Card>
  );
}

// 3. PatientCard - Componente de card do paciente
function PatientCard({
  item,
  index,
  onConfirm,
  isConfirming,
}: {
  item: Item;
  index: number;
  onConfirm: (item: Item) => void;
  isConfirming: boolean;
}) {
  const pendente = estaPendenteCheckin(item.fluxo_etapa);

  return (
    <Card className="p-3 flex items-center gap-3 flex-wrap hover:shadow-md transition-shadow">
      {index < 9 && (
        <kbd className="hidden md:inline-flex h-7 min-w-7 items-center justify-center rounded border bg-muted px-1.5 text-xs font-mono">
          Alt+{index + 1}
        </kbd>
      )}

      {item.paciente?.foto_url ? (
        <img
          src={item.paciente.foto_url}
          alt=""
          className="h-12 w-12 rounded-full object-cover border"
        />
      ) : (
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground">
          {item.paciente_nome.slice(0, 1).toUpperCase()}
        </div>
      )}

      <div className="flex-1 min-w-[200px]">
        <div className="font-semibold flex items-center gap-2 flex-wrap">
          {item.paciente_nome}
          <Badge className="bg-emerald-600 text-white">PAGO</Badge>
          {!pendente && <Badge variant="outline">{etapaLabel(item.fluxo_etapa)}</Badge>}
        </div>
        <div className="text-xs text-muted-foreground space-x-2">
          <span>{formatarHora(item.inicio)}</span>
          <span>•</span>
          <span>{item.medicos?.nome ?? "—"}</span>
          <span>•</span>
          <span>{item.procedimento ?? "CONSULTA"}</span>
          {item.paciente?.cpf && (
            <>
              <span>•</span>
              <span>CPF {item.paciente.cpf}</span>
            </>
          )}
          {item.paciente?.telefone && (
            <>
              <span>•</span>
              <span>{item.paciente.telefone}</span>
            </>
          )}
        </div>
      </div>

      {pendente ? (
        <Button
          onClick={() => onConfirm(item)}
          disabled={isConfirming}
          className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[180px] h-9"
        >
          {isConfirming ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <BadgeCheck className="h-4 w-4 mr-2" />
          )}
          Confirmar presença
        </Button>
      ) : (
        <Button variant="outline" disabled className="h-9">
          {etapaLabel(item.fluxo_etapa)}
        </Button>
      )}
    </Card>
  );
}

// 4. EmptyState - Componente de estado vazio
function EmptyState() {
  return (
    <Card className="p-12 text-center">
      <div className="flex flex-col items-center gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div>
          <p className="text-lg font-medium text-muted-foreground">
            Nenhum paciente com pagamento confirmado aguardando check-in
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Verifique os agendamentos ou confira se os pacientes já realizaram o check-in
          </p>
        </div>
      </div>
    </Card>
  );
}

// 5. CheckinPage - Componente principal
function CheckinPage() {
  const { clinicaAtual } = useClinica();

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
      const inicio = new Date(`${data}T00:00:00`).toISOString();
      const fim = new Date(`${data}T23:59:59`).toISOString();

      const query = supabase
        .from("agendamentos")
        .select("id, paciente_nome, paciente_id, inicio, procedimento, fluxo_etapa, medicos(nome)")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .gte("inicio", inicio)
        .lte("inicio", fim)
        .neq("status", "cancelado")
        .not("paciente_id", "is", null)
        .in("fluxo_etapa", ETAPAS_CHECKIN)
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

      const ids = ags.map((a) => a.id);
      let pagos = new Set<string>();

      const { data: lancamentos, error: lancamentosError } = await supabase
        .from("fin_lancamentos")
        .select("agendamento_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("tipo", "receita")
        .in("agendamento_id", ids);

      if (lancamentosError) {
        console.error("Erro ao buscar pagamentos:", lancamentosError);
      } else {
        pagos = new Set(
          (lancamentos ?? []).map((r) => r.agendamento_id).filter((x): x is string => !!x),
        );
      }

      const candidatos = ags.filter((a) => pagos.has(a.id));

      if (candidatos.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const pacIds = Array.from(
        new Set(candidatos.map((a) => a.paciente_id).filter((x): x is string => !!x)),
      );

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
        }
      }

      const resultado: Item[] = candidatos.map((a) => ({
        ...a,
        paciente: a.paciente_id ? (pacMap.get(a.paciente_id) ?? null) : null,
        pago: true,
      }));

      const termoAplicado = buscaAplicada.trim();
      const itemsFiltrados =
        termoAplicado.length > 0
          ? resultado.filter((item) => combinaComBusca(item, termoAplicado))
          : resultado;

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

  const limparBusca = () => {
    setBusca("");
    setBuscaAplicada("");
  };

  const confirmarCheckin = async (item: Item) => {
    if (confirmandoId === item.id) return;
    setConfirmandoId(item.id);

    try {
      if (item.paciente_id && clinicaAtual) {
        const { data: bloqueio, error: bloqueioError } = await supabase.rpc(
          "paciente_cartao_inadimplente",
          {
            _paciente_id: item.paciente_id,
            _clinica_id: clinicaAtual.clinica_id,
          },
        );

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
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ConciergeBell className="h-6 w-6" />
            Check-in de pacientes
          </h1>
          <p className="text-sm text-muted-foreground">
            {clinicaAtual.clinica.nome && `Clínica: ${clinicaAtual.clinica.nome}`}
            {data && ` • ${formatarDataExtenso(data)}`}
          </p>
        </div>
        <Badge variant="outline" className="text-base px-3 py-1">
          {filtrados.length} {filtrados.length === 1 ? "paciente" : "pacientes"} aguardando
        </Badge>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
