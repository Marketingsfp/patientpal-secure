/**
 * FASE 3 — Canvas visual da arquitetura da Nina.
 *
 * Somente leitura em relação ao backend: o desenho é gerado a partir do
 * Architecture Manifest (`src/lib/nina/arquitetura/manifesto.ts`). Arrastar um
 * node muda apenas a posição visual (guardada no navegador), nunca a ordem de
 * execução real. Não existe segunda definição da arquitetura nesta tela.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CATEGORIAS_ARQUITETURA,
  NODES_ARQUITETURA,
  type CategoriaArquitetura,
  type NodeArquitetura,
} from "@/lib/nina/arquitetura/manifesto";
import {
  ALTURA_NODE,
  CORES_CATEGORIA,
  LARGURA_NODE,
  calcularFitView,
  calcularLayout,
  type Posicao,
} from "@/lib/nina/arquitetura/layout";
import {
  calcularRotas,
  descreverConexao,
  realceCaminhoCompleto,
  realceDireto,
} from "@/lib/nina/arquitetura/rotas";
import { NodeDetalhePainel } from "./NodeDetalhePainel";
import type { NivelAcesso } from "@/lib/nina/arquitetura/detalhes-ia";

export type StatusNodeCanvas = {
  /** Estado mostrado no node (modo EXECUÇÃO preenche isto na fase seguinte). */
  status: "executado" | "falhou" | "ignorado" | "cancelado" | "retry";
  duracaoMs?: number | null;
  horario?: string | null;
  tentativas?: number | null;
  erro?: string | null;
  /** Resumo já mascarado do que entrou neste node naquela passagem. */
  entrada?: string | null;
  /** Resumo já mascarado do que o node devolveu naquela passagem. */
  resultado?: string | null;
  /** Metadata do trace daquela passagem (prompt, RAG, IA, tools). */
  metadata?: Record<string, unknown> | null;
};

type Props = {
  /** Chave para guardar as posições visuais separadamente por contexto. */
  chavePosicoes: string;
  /** Mapa node_id → status. Vazio = modo ARQUITETURA (tudo disponível). */
  execucao?: Record<string, StatusNodeCanvas>;
  /** Quando true, nodes sem status ficam apagados. */
  modoExecucao?: boolean;
  nodes?: NodeArquitetura[];
  /** Clínica usada para autorizar a visualização de código no painel. */
  clinicaId?: string | null;
  /** Perfil de quem está olhando: define o que pode ser exibido. */
  nivelAcesso?: NivelAcesso;
  /** Paciente da execução, usado para nunca exibir fonte de outro paciente. */
  pacienteExecucaoId?: string | null;
};

const ESCALA_MIN = 0.2;
const ESCALA_MAX = 2;

function lerPosicoes(chave: string): Record<string, Posicao> {
  if (typeof window === "undefined") return {};
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as Record<string, Posicao>) : {};
  } catch {
    return {};
  }
}

function gravarPosicoes(chave: string, posicoes: Record<string, Posicao>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(posicoes));
  } catch {
    /* posição visual é acessório: falha aqui não pode quebrar a tela */
  }
}

export function ArquiteturaCanvas({
  chavePosicoes,
  execucao,
  modoExecucao = false,
  nodes = NODES_ARQUITETURA,
  clinicaId,
  nivelAcesso = "operacional",
  pacienteExecucaoId = null,
}: Props) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [posicoes, setPosicoes] = useState<Record<string, Posicao>>({});
  const [carregou, setCarregou] = useState(false);
  const [view, setView] = useState({ escala: 0.7, x: 0, y: 0 });
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [caminhoCompleto, setCaminhoCompleto] = useState(false);
  const arrasto = useRef<
    | { tipo: "canvas"; startX: number; startY: number; origemX: number; origemY: number }
    | { tipo: "node"; id: string; startX: number; startY: number; origemX: number; origemY: number }
    | null
  >(null);

  useEffect(() => {
    setPosicoes(lerPosicoes(chavePosicoes));
    setCarregou(true);
  }, [chavePosicoes]);

  const layout = useMemo(() => calcularLayout(nodes, posicoes), [nodes, posicoes]);

  const mapaPosicionado = useMemo(
    () => new Map(layout.nodes.map((n) => [n.node.id, n])),
    [layout],
  );

  const rotas = useMemo(() => calcularRotas(layout), [layout]);

  // Realce: só o vizinho imediato por padrão; "Destacar caminho" mostra tudo
  // que leva até o componente e tudo que decorre dele.
  const realce = useMemo(
    () =>
      caminhoCompleto
        ? realceCaminhoCompleto(nodes, selecionado)
        : realceDireto(nodes, selecionado),
    [nodes, selecionado, caminhoCompleto],
  );
  const temRealce = realce.nodes.size > 0;


  const ajustarTela = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const { escala, x, y } = calcularFitView(layout, {
      largura: area.clientWidth,
      altura: area.clientHeight,
    }, { escalaMinima: ESCALA_MIN, escalaMaxima: 1.1 });
    setView({ escala, x, y });
  }, [layout]);

  // Visão inicial: escala legível, ancorada no começo do fluxo (o usuário
  // pode usar "Ajustar à tela" para ver tudo de uma vez).
  useEffect(() => {
    if (!carregou) return;
    const area = areaRef.current;
    if (!area) {
      ajustarTela();
      return;
    }
    const escala = Math.min(0.75, Math.max(0.5, (area.clientHeight - 48) / layout.altura));
    setView({ escala, x: 24, y: 24 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregou]);

  const centralizar = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    setView((atual) => ({
      escala: atual.escala,
      x: (area.clientWidth - layout.largura * atual.escala) / 2,
      y: (area.clientHeight - layout.altura * atual.escala) / 2,
    }));
  }, [layout]);

  const aplicarZoom = useCallback((fator: number, centro?: { x: number; y: number }) => {
    const area = areaRef.current;
    if (!area) return;
    setView((atual) => {
      const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, atual.escala * fator));
      const cx = centro?.x ?? area.clientWidth / 2;
      const cy = centro?.y ?? area.clientHeight / 2;
      const razao = escala / atual.escala;
      return { escala, x: cx - (cx - atual.x) * razao, y: cy - (cy - atual.y) * razao };
    });
  }, []);

  const onWheel = useCallback(
    (evento: React.WheelEvent) => {
      if (!areaRef.current) return;
      evento.preventDefault();
      const caixa = areaRef.current.getBoundingClientRect();
      aplicarZoom(evento.deltaY < 0 ? 1.1 : 1 / 1.1, {
        x: evento.clientX - caixa.left,
        y: evento.clientY - caixa.top,
      });
    },
    [aplicarZoom],
  );

  const onPointerMove = useCallback((evento: React.PointerEvent) => {
    const atual = arrasto.current;
    if (!atual) return;
    const dx = evento.clientX - atual.startX;
    const dy = evento.clientY - atual.startY;
    if (atual.tipo === "canvas") {
      setView((v) => ({ ...v, x: atual.origemX + dx, y: atual.origemY + dy }));
      return;
    }
    setView((v) => {
      setPosicoes((mapa) => ({
        ...mapa,
        [atual.id]: {
          x: Math.round(atual.origemX + dx / v.escala),
          y: Math.round(atual.origemY + dy / v.escala),
        },
      }));
      return v;
    });
  }, []);

  const encerrarArrasto = useCallback(() => {
    const atual = arrasto.current;
    arrasto.current = null;
    if (atual?.tipo === "node") {
      setPosicoes((mapa) => {
        gravarPosicoes(chavePosicoes, mapa);
        return mapa;
      });
    }
  }, [chavePosicoes]);

  const [pedidoAjuste, setPedidoAjuste] = useState(0);

  const organizarAutomaticamente = useCallback(() => {
    setPosicoes({});
    gravarPosicoes(chavePosicoes, {});
    setPedidoAjuste((n) => n + 1);
  }, [chavePosicoes]);

  // Após recalcular as posições, centralizar e ajustar à tela.
  useEffect(() => {
    if (pedidoAjuste === 0) return;
    ajustarTela();
  }, [pedidoAjuste, ajustarTela]);

  const detalhe = selecionado ? mapaPosicionado.get(selecionado)?.node ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={ajustarTela}>
          <Maximize2 className="mr-2 h-4 w-4" /> Ajustar à tela
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={centralizar}>
          <Crosshair className="mr-2 h-4 w-4" /> Centralizar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Aproximar"
          onClick={() => aplicarZoom(1.2)}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Afastar"
          onClick={() => aplicarZoom(1 / 1.2)}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={organizarAutomaticamente}>
          <RotateCcw className="mr-2 h-4 w-4" /> Organizar automaticamente
        </Button>
        <span className="text-xs text-muted-foreground">
          {layout.nodes.length} componentes · {layout.arestas.length} conexões ·{" "}
          {Math.round(view.escala * 100)}%
        </span>
      </div>

      <div
        ref={areaRef}
        onWheel={onWheel}
        onPointerDown={(evento) => {
          if (evento.button !== 0) return;
          arrasto.current = {
            tipo: "canvas",
            startX: evento.clientX,
            startY: evento.clientY,
            origemX: view.x,
            origemY: view.y,
          };
        }}
        onPointerMove={onPointerMove}
        onPointerUp={encerrarArrasto}
        onPointerLeave={encerrarArrasto}
        className="relative h-[62vh] min-h-[420px] w-full touch-none overflow-hidden rounded-lg border bg-muted/30"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--muted-foreground) 28%, transparent) 1px, transparent 1px)",
          backgroundSize: `${24 * view.escala}px ${24 * view.escala}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.escala})`,
            width: layout.largura,
            height: layout.altura,
          }}
        >
          {/* Molduras discretas por domínio funcional (apenas leitura visual). */}
          {layout.grupos.map((grupo) => (
            <div
              key={grupo.id}
              aria-hidden="true"
              className="pointer-events-none absolute rounded-lg border border-dashed"
              style={{
                left: grupo.x,
                top: grupo.y,
                width: grupo.largura,
                height: grupo.altura,
                borderColor: `color-mix(in oklch, ${CORES_CATEGORIA[grupo.categoria]} 45%, transparent)`,
                backgroundColor: `color-mix(in oklch, ${CORES_CATEGORIA[grupo.categoria]} 7%, transparent)`,
              }}
            >
              <span
                className="absolute left-2 top-1 text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: CORES_CATEGORIA[grupo.categoria] }}
              >
                {grupo.categoria}
              </span>
            </div>
          ))}

          <svg
            width={layout.largura}
            height={layout.altura}
            className="pointer-events-none absolute left-0 top-0"
          >
            <defs>
              <marker
                id="seta-arquitetura"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
              </marker>
            </defs>
            {rotas.map((rota) => {
              const ativa =
                !modoExecucao || (Boolean(execucao?.[rota.de]) && Boolean(execucao?.[rota.para]));
              const destacada = realce.arestas.has(rota.id);
              const atenuada = temRealce && !destacada;
              const cor = !ativa
                ? "text-muted-foreground/30"
                : atenuada
                  ? "text-muted-foreground/15"
                  : destacada
                    ? "text-primary"
                    : rota.principal
                      ? "text-primary/80"
                      : "text-muted-foreground/60";
              return (
                <path
                  key={rota.id}
                  d={rota.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={!ativa ? 1 : destacada ? 3 : rota.principal ? 2.6 : 1.4}
                  strokeDasharray={rota.retorno ? "6 4" : undefined}
                  markerEnd="url(#seta-arquitetura)"
                  className={`pointer-events-auto ${cor}`}
                >
                  <title>{descreverConexao(nodes, rota.de, rota.para) ?? ""}</title>
                </path>
              );
            })}
          </svg>


          {layout.nodes.map(({ node, x, y, principal }) => {
            const estado = execucao?.[node.id];
            const apagado = modoExecucao && !estado;
            const cor = CORES_CATEGORIA[node.categoria];
            const destacado = realce.nodes.has(node.id);
            const atenuado = temRealce && !destacado;
            return (
              <button
                type="button"
                key={node.id}
                onPointerDown={(evento) => {
                  evento.stopPropagation();
                  arrasto.current = {
                    tipo: "node",
                    id: node.id,
                    startX: evento.clientX,
                    startY: evento.clientY,
                    origemX: x,
                    origemY: y,
                  };
                }}
                onClick={() => setSelecionado(node.id)}
                title={node.descricao}
                className={`absolute flex flex-col justify-center gap-1 rounded-md border bg-card px-3 py-2 text-left transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  apagado || atenuado ? "opacity-25" : principal ? "opacity-100" : "opacity-80"
                } ${principal ? "shadow-md" : "shadow-sm"} ${
                  selecionado === node.id ? "ring-2 ring-primary" : ""
                }`}

                style={{
                  left: x,
                  top: y,
                  width: LARGURA_NODE,
                  height: ALTURA_NODE,
                  borderLeft: `4px solid ${cor}`,
                  borderTopColor: principal ? cor : undefined,
                  borderTopWidth: principal ? 2 : undefined,
                }}
              >
                <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">
                  {node.nome}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {node.categoria}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {estado
                    ? `${estado.status}${
                        estado.duracaoMs != null ? ` · ${estado.duracaoMs} ms` : ""
                      }`
                    : modoExecucao
                      ? "não utilizado"
                      : "disponível"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 px-2 py-0.5 text-[11px] text-foreground">
          <span className="h-0.5 w-4 rounded bg-primary" />
          Caminho principal (mensagem → processamento → IA → ação → resposta)
        </span>
        {CATEGORIAS_ARQUITETURA.map((categoria: CategoriaArquitetura) => (
          <span
            key={categoria}
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CORES_CATEGORIA[categoria] }}
            />
            {categoria}
          </span>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Clique em um componente para abrir o painel com arquivo, função, entradas, saídas, erros
        possíveis e documentação. Arraste para reposicionar — isso muda apenas o desenho, nunca o
        funcionamento da Nina.
      </p>

      <NodeDetalhePainel
        node={detalhe}
        aberto={Boolean(detalhe)}
        onFechar={() => setSelecionado(null)}
        clinicaId={clinicaId}
        nivelAcesso={nivelAcesso}
        pacienteExecucaoId={pacienteExecucaoId}
        execucao={detalhe ? execucao?.[detalhe.id] ?? null : null}
        modoExecucao={modoExecucao}
      />
    </div>
  );
}
