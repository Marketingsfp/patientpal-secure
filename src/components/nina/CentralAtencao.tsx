import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock, UserX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  EVENTO_FILTRAR_NAO_ATRIBUIDAS,
  FILTRO_NAO_ATRIBUIDAS_KEY,
} from "@/components/nina/BannerNaoAtribuidas";
import { useClinica } from "@/hooks/use-clinica";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { esperaConversas, listarConversas, listarFilaHumana } from "@/lib/atendimento.functions";
import {
  ABRIR_CONVERSA_KEY,
  EVENTO_ABRIR_CONVERSA,
  EVENTO_FILTRAR_ESPERA_CRITICA,
  FILTRO_ESPERA_CRITICA_KEY,
  calcularAtencao,
  rotuloCentral,
  type ItemAtencao,
  type ResumoAtencao,
} from "@/lib/atendimento/central-atencao";
import { formatarEspera } from "@/lib/atendimento/espera";
import { cn } from "@/lib/utils";

const VAZIO: ResumoAtencao = {
  total: 0,
  naoAtribuidas: 0,
  criticas: 0,
  aguardando: 0,
  itens: [],
  nivel: 0,
};

/**
 * Central de Atenção do cabeçalho global.
 *
 * Fica imediatamente à direita do botão de portal ("Clínica Médica"). Usa as
 * mesmas fontes de verdade da Inbox: `listarFilaHumana` (não atribuídas) e
 * `esperaConversas` (RPC do tempo de espera). Um único relógio de 30s
 * reclassifica as faixas — sem timer por conversa e sem polling por segundo.
 */
export function CentralAtencao() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const filaFn = useServerFn(listarFilaHumana);
  const esperaFn = useServerFn(esperaConversas);
  const convsFn = useServerFn(listarConversas);
  const navigate = useNavigate();

  const [fila, setFila] = useState<Array<{ id: string; contato_nome?: string | null }>>([]);
  const [espera, setEspera] = useState<Record<string, string>>({});
  const [nomes, setNomes] = useState<Record<string, string | null>>({});
  const [agora, setAgora] = useState(() => Date.now());
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) {
      setFila([]);
      setEspera({});
      return;
    }
    try {
      const [f, e] = await Promise.all([
        filaFn({ data: { clinicaId, limit: 200 } }) as unknown as Promise<any[]>,
        esperaFn({ data: { clinicaId, isTeste: false } }) as unknown as Promise<
          Record<string, string>
        >,
      ]);
      setFila(Array.isArray(f) ? f : []);
      setEspera(e ?? {});
    } catch {
      /* indicador: nunca pode derrubar o cabeçalho */
    }
  }, [clinicaId, filaFn, esperaFn]);

  // Nomes das conversas (para o painel). Leitura leve e espaçada.
  const carregarNomes = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const rows = (await convsFn({
        data: { clinicaId, status: "all", canal: "todos", limit: 200 },
      })) as unknown as any[];
      const m: Record<string, string | null> = {};
      for (const r of rows ?? []) m[r.id] = r.contato_nome ?? null;
      setNomes(m);
    } catch {
      /* sem nomes o painel ainda funciona */
    }
  }, [clinicaId, convsFn]);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 30_000);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    void carregarNomes();
  }, [carregarNomes]);

  // Relógio único: reclassifica as faixas de espera sem consultar o banco.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useRealtimeRefresh(
    ["atend_conversas", "whatsapp_mensagens", "atend_conversa_eventos"],
    () => {
      void carregar();
    },
    Boolean(clinicaId),
  );

  const resumo = useMemo(
    () => (clinicaId ? calcularAtencao({ naoAtribuidas: fila, espera, nomes, agora }) : VAZIO),
    [clinicaId, fila, espera, nomes, agora],
  );

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

  const abrirNaoAtribuidas = () => {
    try {
      window.sessionStorage.setItem(FILTRO_NAO_ATRIBUIDAS_KEY, "1");
    } catch {
      /* o evento abaixo já resolve na mesma tela */
    }
    window.dispatchEvent(new CustomEvent(EVENTO_FILTRAR_NAO_ATRIBUIDAS));
    setAberto(false);
    irParaInbox();
  };

  const abrirCriticas = () => {
    try {
      window.sessionStorage.setItem(FILTRO_ESPERA_CRITICA_KEY, "1");
    } catch {
      /* idem */
    }
    window.dispatchEvent(new CustomEvent(EVENTO_FILTRAR_ESPERA_CRITICA));
    setAberto(false);
    irParaInbox();
  };

  const abrirConversa = (id: string) => {
    try {
      window.sessionStorage.setItem(ABRIR_CONVERSA_KEY, id);
    } catch {
      /* idem */
    }
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_CONVERSA, { detail: { id } }));
    setAberto(false);
    irParaInbox();
  };

  if (!clinicaId) return null;

  const alerta = resumo.total > 0;
  const rotulo = rotuloCentral(resumo);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
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

      <PopoverContent align="start" className="w-[340px] p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Central de Atenção</p>
          <p className="text-[11px] text-muted-foreground" aria-live="polite">
            {alerta
              ? `${resumo.total} ${resumo.total === 1 ? "conversa precisa" : "conversas precisam"} de atenção`
              : "Nada precisando de atenção agora"}
          </p>
        </div>

        <div className="p-2">
          <LinhaCategoria
            cor="vermelho"
            icone={<UserX className="h-3.5 w-3.5" aria-hidden />}
            titulo="Não atribuídas"
            valor={resumo.naoAtribuidas}
            onClick={abrirNaoAtribuidas}
          />
          <LinhaCategoria
            cor="vermelho"
            icone={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
            titulo="Espera crítica"
            valor={resumo.criticas}
            onClick={abrirCriticas}
          />
          <LinhaCategoria
            cor="ambar"
            icone={<Clock className="h-3.5 w-3.5" aria-hidden />}
            titulo="Aguardando resposta"
            valor={resumo.aguardando}
            onClick={abrirCriticas}
          />
        </div>

        <div className="border-t border-border px-3 py-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Prioridades agora
          </p>
          {resumo.itens.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Nenhuma pendência.</p>
          ) : (
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {resumo.itens.map((i) => (
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

function LinhaCategoria({
  cor,
  icone,
  titulo,
  valor,
  onClick,
}: {
  cor: "vermelho" | "ambar";
  icone: React.ReactNode;
  titulo: string;
  valor: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
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
      <span className="min-w-0 flex-1 truncate font-medium">{titulo}</span>
      <span className="shrink-0 tabular-nums font-semibold">{valor}</span>
    </button>
  );
}

function ItemLinha({ item, onClick }: { item: ItemAtencao; onClick: () => void }) {
  const critico = item.categoria !== "aguardando";
  const marca =
    item.categoria === "nao_atribuida"
      ? "Não atribuída"
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
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          critico ? "bg-destructive" : "bg-amber-500",
        )}
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
