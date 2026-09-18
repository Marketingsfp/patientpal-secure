import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock, UserX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { consultarCentralAtencao } from "@/lib/atendimento.functions";
import {
  calcularAtencao,
  itensDaCategoria,
  pedirAbrirConversa,
  rotuloCentral,
  type CategoriaAtencao,
  type ItemAtencao,
  type LinhaFila,
  type PausaAtencao,
  type ResumoAtencao,
} from "@/lib/atendimento/central-atencao";
import { formatarEspera } from "@/lib/atendimento/espera";
import { criarAgrupador } from "@/lib/atendimento/realtime-roteador";
import { ouvirOutrasAbas } from "@/lib/atendimento/presenca-sync";
import { AtendentesEmPausa } from "./AtendentesEmPausa";
import { cn } from "@/lib/utils";

const VAZIO: ResumoAtencao = {
  total: 0,
  naoAtribuidas: 0,
  naoAtribuidasGlobal: 0,
  filasIndividuais: [],
  criticas: 0,
  aguardando: 0,
  itens: [],
  nivel: 0,
};

/**
 * Central de Atenção do cabeçalho global.
 *
 * Fica imediatamente à direita do botão de portal ("Clínica Médica"). Usa as
 * mesmas fontes de verdade da Inbox: filas em `atend_conversas` e a RPC do
 * tempo de espera. Um único relógio de 30s
 * reclassifica as faixas — sem timer por conversa e sem polling por segundo.
 */
export function CentralAtencao() {
  const { clinicaAtual } = useClinica();
  const { session } = useAuth();
  // Sem sessão (tela de login, sessão expirada) não há token para as server
  // functions protegidas: a clínica em cache não basta.
  const clinicaId = session ? clinicaAtual?.clinica_id : undefined;
  const centralFn = useServerFn(consultarCentralAtencao);
  const chaveContexto = `${clinicaId ?? ""}:${session?.user.id ?? ""}`;
  const navigate = useNavigate();

  const [dados, setDados] = useState<{
    chave: string;
    filas: LinhaFila[];
    espera: Record<string, string>;
    nomes: Record<string, string | null>;
    globalSemDetalhes: number;
    pausas: PausaAtencao[];
  } | null>(null);
  const sequenciaCarga = useRef(0);
  const [agora, setAgora] = useState(() => Date.now());
  const [aberto, setAberto] = useState(false);
  /** Categoria em foco dentro da própria Central (não filtra a Inbox). */
  const [categoria, setCategoria] = useState<CategoriaAtencao | null>(null);
  const [atendenteSelecionada, setAtendenteSelecionada] = useState<{
    id: string;
    nome: string;
  } | null>(null);

  const carregar = useCallback(async () => {
    const sequencia = ++sequenciaCarga.current;
    if (!clinicaId) {
      setDados(null);
      return;
    }
    try {
      const retorno = await centralFn({ data: { clinicaId } });
      if (sequencia === sequenciaCarga.current) setDados({ ...retorno, chave: chaveContexto });
    } catch {
      /* indicador: nunca pode derrubar o cabeçalho */
    }
  }, [clinicaId, chaveContexto, centralFn]);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 30_000);
    const reconferir = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    window.addEventListener("online", reconferir);
    document.addEventListener("visibilitychange", reconferir);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", reconferir);
      document.removeEventListener("visibilitychange", reconferir);
    };
  }, [carregar]);

  useEffect(() => {
    setCategoria(null);
    setAtendenteSelecionada(null);
  }, [chaveContexto]);

  // Relógio único: reclassifica as faixas de espera sem consultar o banco.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const atualizarEmTempoReal = useMemo(
    () => criarAgrupador({ executar: () => void carregar(), atrasoMs: 400, tetoMs: 1500 }),
    [carregar],
  );
  useEffect(() => () => atualizarEmTempoReal.cancelar(), [atualizarEmTempoReal]);
  useEffect(
    () =>
      ouvirOutrasAbas((presenca) => {
        if (presenca.clinicaId === clinicaId) atualizarEmTempoReal.agendar();
      }),
    [clinicaId, atualizarEmTempoReal],
  );

  useRealtimeRefresh(
    ["atend_conversas", "whatsapp_mensagens", "atend_conversa_eventos", "atend_agente_presenca"],
    () => {
      atualizarEmTempoReal.agendar();
    },
    Boolean(clinicaId),
    { filtro: `clinica_id=eq.${clinicaId}`, interessa: (linha) => linha.is_teste !== true },
  );

  const resumo = useMemo(
    () =>
      clinicaId && dados?.chave === chaveContexto
        ? calcularAtencao({
            naoAtribuidas: dados.filas,
            espera: dados.espera,
            nomes: dados.nomes,
            globalSemDetalhes: dados.globalSemDetalhes,
            agora,
            limiteItens: Number.MAX_SAFE_INTEGER,
          })
        : VAZIO,
    [clinicaId, chaveContexto, dados, agora],
  );

  const pausas = dados?.chave === chaveContexto ? (dados.pausas ?? []) : [];
  const idsEmPausa = new Set(pausas.map((pausa) => pausa.atendenteId));
  const filasSemPausa = resumo.filasIndividuais.filter((fila) => !idsEmPausa.has(fila.atendenteId));

  // Lista mostrada: prioridades gerais (8 primeiras) ou a categoria escolhida.
  const lista = useMemo(() => {
    const base = itensDaCategoria(resumo.itens, categoria, atendenteSelecionada?.id);
    return categoria ? base : base.slice(0, 8);
  }, [resumo.itens, categoria, atendenteSelecionada?.id]);

  // Animação de entrada mais perceptível só quando SURGE algo crítico novo.
  const [novo, setNovo] = useState(false);
  const antesRef = useRef(0);
  useEffect(() => {
    if (resumo.total > antesRef.current) {
      setNovo(true);
      const t = setTimeout(() => setNovo(false), 1600);
      antesRef.current = resumo.total;
      return () => clearTimeout(t);
    }
    antesRef.current = resumo.total;
  }, [resumo.total]);

  const irParaInbox = useCallback(() => {
    void navigate({ to: "/app/nina", hash: "atend-inbox" });
  }, [navigate]);

  // FASE 3 — as categorias filtram DENTRO da própria Central. A sidebar não é
  // mais usada para alertas operacionais.
  const alternarCategoria = (c: CategoriaAtencao) => {
    setAtendenteSelecionada(null);
    setCategoria((atual) => (atual === c ? null : c));
  };

  const alternarAtendente = (atendente: { id: string; nome: string }) => {
    const limpar =
      categoria === "nao_atribuida_individual" && atendenteSelecionada?.id === atendente.id;
    setCategoria(limpar ? null : "nao_atribuida_individual");
    setAtendenteSelecionada(limpar ? null : atendente);
  };

  const abrirConversa = (id: string) => {
    pedirAbrirConversa({ conversaId: id });
    setAberto(false);
    irParaInbox();
  };

  if (!clinicaId) return null;

  const alerta = resumo.total > 0;
  const rotulo = rotuloCentral(resumo);

  return (
    <Popover
      open={aberto}
      onOpenChange={(abrir) => {
        setAberto(abrir);
        if (abrir) void carregar();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            alerta
              ? `Central de Atenção — ${resumo.total} ${resumo.total === 1 ? "conversa precisa" : "conversas precisam"} de atenção`
              : "Central de Atenção"
          }
          aria-label={rotulo}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold",
            "will-change-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60",
            alerta
              ? "text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200",
            // Só transform/box-shadow/background: nada no cabeçalho se desloca.
            alerta && resumo.nivel === 1 && "central-atencao-n1",
            alerta && resumo.nivel === 2 && "central-atencao-n2",
            alerta && resumo.nivel === 3 && "central-atencao-n3",
            alerta && novo && "central-atencao-novo",
          )}
        >
          {alerta ? (
            <>
              <span
                aria-hidden
                className="central-atencao-ponto inline-block h-2 w-2 shrink-0 rounded-full bg-white"
              />
              <AlertTriangle className="h-4 w-4 shrink-0 lg:hidden" aria-hidden />
              <span className="hidden xl:inline">Central de Atenção</span>
              <span className="hidden lg:inline xl:hidden">Atenção</span>
              <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-md bg-white/25 px-1 text-[11px] font-extrabold tabular-nums">
                {resumo.total}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden xl:inline">Central de Atenção</span>
              <span className="hidden sm:inline xl:hidden">Atenção</span>
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="max-h-[var(--radix-popover-content-available-height)] w-[340px] max-w-[calc(100vw-1rem)] overflow-y-auto p-0"
      >
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Central de Atenção</p>
          <p className="text-[11px] text-muted-foreground" aria-live="polite">
            {alerta
              ? `${resumo.total} ${resumo.total === 1 ? "conversa precisa" : "conversas precisam"} de atenção`
              : "Nada precisando de atenção agora"}
          </p>
        </div>

        <div className="p-2">
          <AtendentesEmPausa
            pausas={pausas}
            filas={resumo.filasIndividuais}
            selecionada={
              categoria === "nao_atribuida_individual" ? atendenteSelecionada?.id : undefined
            }
            onSelecionar={alternarAtendente}
          />
          {filasSemPausa.length > 0 && (
            <div className="mb-1">
              <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                Não atribuídas individuais
              </p>
              <div className="max-h-48 overflow-y-auto">
                {filasSemPausa.map((fila) => (
                  <LinhaCategoria
                    key={fila.atendenteId}
                    cor="ambar"
                    icone={<UserX className="h-3.5 w-3.5" aria-hidden />}
                    titulo={fila.nome}
                    valor={fila.total}
                    ativo={
                      categoria === "nao_atribuida_individual" &&
                      atendenteSelecionada?.id === fila.atendenteId
                    }
                    onClick={() => alternarAtendente({ id: fila.atendenteId, nome: fila.nome })}
                  />
                ))}
              </div>
            </div>
          )}
          <LinhaCategoria
            cor="vermelho"
            icone={<UserX className="h-3.5 w-3.5" aria-hidden />}
            titulo="Não atribuídas global"
            valor={resumo.naoAtribuidasGlobal}
            ativo={categoria === "nao_atribuida_global"}
            onClick={() => alternarCategoria("nao_atribuida_global")}
          />
          <LinhaCategoria
            cor="vermelho"
            icone={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
            titulo="Espera crítica"
            valor={resumo.criticas}
            ativo={categoria === "critica"}
            onClick={() => alternarCategoria("critica")}
          />
          <LinhaCategoria
            cor="ambar"
            icone={<Clock className="h-3.5 w-3.5" aria-hidden />}
            titulo="Aguardando resposta"
            valor={resumo.aguardando}
            ativo={categoria === "aguardando"}
            onClick={() => alternarCategoria("aguardando")}
          />
        </div>

        <div className="border-t border-border px-3 py-2">
          <div className="mb-1 flex items-center gap-2">
            <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {categoria === "nao_atribuida_individual"
                ? `Não atribuídas · ${atendenteSelecionada?.nome ?? "Atendente"}`
                : categoria
                  ? tituloCategoria(categoria)
                  : "Prioridades agora"}
            </p>
            {categoria && (
              <button
                type="button"
                onClick={() => setCategoria(null)}
                className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                Ver tudo ✕
              </button>
            )}
          </div>
          {lista.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              {categoria === "nao_atribuida_global" && resumo.naoAtribuidasGlobal > 0
                ? "Conversas aguardando atribuição global. Os detalhes são acompanhados pela gestão."
                : "Nenhuma pendência."}
            </p>
          ) : (
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {lista.map((i) => (
                <li key={i.id}>
                  <ItemLinha item={i} onClick={() => abrirConversa(i.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function tituloCategoria(c: CategoriaAtencao) {
  if (c === "nao_atribuida_global") return "Não atribuídas global";
  return c === "nao_atribuida"
    ? "Não atribuídas"
    : c === "critica"
      ? "Espera crítica"
      : "Aguardando resposta";
}

function LinhaCategoria({
  cor,
  icone,
  titulo,
  valor,
  ativo,
  onClick,
}: {
  cor: "vermelho" | "ambar";
  icone: React.ReactNode;
  titulo: string;
  valor: number;
  ativo?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={Boolean(ativo)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
        ativo && "bg-muted",
      )}
    >
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-md",
          cor === "vermelho"
            ? "bg-destructive/15 text-destructive"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        )}
      >
        {icone}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium" title={titulo}>
        {titulo}
      </span>
      <span className="shrink-0 tabular-nums font-semibold">{valor}</span>
    </button>
  );
}

function ItemLinha({ item, onClick }: { item: ItemAtencao; onClick: () => void }) {
  const critico = item.categoria !== "aguardando";
  const marca =
    item.categoria === "nao_atribuida"
      ? item.atendenteId
        ? `Não atribuída · ${item.atendenteNome ?? "Atendente"}`
        : "Não atribuída global"
      : item.categoria === "critica"
        ? "Espera crítica"
        : "Aguardando resposta";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
    >
      <span
        aria-hidden
        className={cn("h-2 w-2 shrink-0 rounded-full", critico ? "bg-destructive" : "bg-amber-500")}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{item.nome}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {marca}
          {item.minutos > 0 ? ` • ${formatarEspera(item.minutos)}` : ""}
        </span>
      </span>
    </button>
  );
}
