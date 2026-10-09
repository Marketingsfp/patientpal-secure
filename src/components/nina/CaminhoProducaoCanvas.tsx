/**
 * Canvas "Caminho da mensagem em produção": do webhook da Meta até a resposta
 * entregue ao paciente. Somente leitura — o conteúdo vem de
 * `src/lib/nina/arquitetura/caminho-producao.ts` e nada aqui altera a Nina.
 *
 * Tela cheia: cobre a janela inteira e escolhe a arrumação das faixas (1 ou
 * 2 colunas) que deixa o desenho inteiro o maior possível, refazendo a conta
 * quando a janela muda de tamanho.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Expand, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ETAPAS_CAMINHO,
  FAIXAS_CAMINHO,
  LIGACOES_CAMINHO,
  type EtapaCaminho,
} from "@/lib/nina/arquitetura/caminho-producao";
import {
  ALTURA_ETAPA,
  LARGURA_ETAPA,
  calcularLayoutCaminho,
  escalaParaCaber,
  melhorLayoutCaminho,
  type LayoutCaminho,
} from "@/lib/nina/arquitetura/caminho-producao-layout";
import { NODES_ARQUITETURA } from "@/lib/nina/arquitetura/manifesto";
import type { NivelAcesso } from "@/lib/nina/arquitetura/detalhes-ia";
import { NodeDetalhePainel } from "./NodeDetalhePainel";

const ESCALA_MIN = 0.15;
const ESCALA_MAX = 1.6;

/** Cor da borda de cada tipo de caixa (tokens do tema, claro e escuro). */
function corEtapa(etapa: EtapaCaminho): string {
  if (etapa.tipo === "rotina") return "var(--chart-5)";
  if (etapa.tipo === "condicional") return "var(--chart-4)";
  if (etapa.tipo === "saida") {
    switch (etapa.desfecho) {
      case "entregue":
        return "var(--chart-2)";
      case "humano":
        return "var(--chart-1)";
      case "erro":
        return "var(--destructive)";
      default:
        return "var(--muted-foreground)";
    }
  }
  return "var(--primary)";
}

const ROTULO_TIPO: Record<EtapaCaminho["tipo"], string> = {
  passo: "Etapa",
  condicional: "Só em um caso",
  saida: "Fim do caminho",
  rotina: "Rotina automática",
};

const LEGENDA: Array<{ rotulo: string; cor: string }> = [
  { rotulo: "Etapa do caminho", cor: "var(--primary)" },
  { rotulo: "Só em um caso", cor: "var(--chart-4)" },
  { rotulo: "Paciente recebe resposta", cor: "var(--chart-2)" },
  { rotulo: "Vai para a equipe", cor: "var(--chart-1)" },
  { rotulo: "Não segue / ignorada", cor: "var(--muted-foreground)" },
  { rotulo: "Erro", cor: "var(--destructive)" },
  { rotulo: "Rotina automática", cor: "var(--chart-5)" },
];

type Props = {
  clinicaId?: string | null;
  nivelAcesso?: NivelAcesso;
};

export function CaminhoProducaoCanvas({ clinicaId, nivelAcesso = "operacional" }: Props) {
  const empilhado = useMemo(() => calcularLayoutCaminho(ETAPAS_CAMINHO, LIGACOES_CAMINHO, 1), []);
  const [selecionada, setSelecionada] = useState<EtapaCaminho | null>(null);
  const [tecnico, setTecnico] = useState<string | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);

  const componenteTecnico = tecnico
    ? (NODES_ARQUITETURA.find((n) => n.id === tecnico) ?? null)
    : null;

  const sairTelaCheia = useCallback(() => {
    setTelaCheia(false);
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const abrirTelaCheia = useCallback(() => {
    setTelaCheia(true);
    // Tela cheia do navegador na página inteira: os painéis laterais (que
    // abrem fora do canvas) continuam visíveis. Sem suporte, fica a sobreposição.
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  // Esc do navegador encerra a tela cheia dele; a sobreposição acompanha.
  // Só fecha se a tela cheia do navegador chegou a começar: alguns navegadores
  // recusam ou saem na hora, e aí a sobreposição continua sozinha.
  useEffect(() => {
    if (!telaCheia) return;
    let entrou = Boolean(document.fullscreenElement);
    const aoMudar = () => {
      if (document.fullscreenElement) entrou = true;
      else if (entrou) setTelaCheia(false);
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !selecionada && !tecnico) sairTelaCheia();
    };
    document.addEventListener("fullscreenchange", aoMudar);
    window.addEventListener("keydown", aoTeclar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", aoMudar);
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
    };
  }, [telaCheia, selecionada, tecnico, sairTelaCheia]);

  return (
    <div className="space-y-3">
      <Desenho
        modo="normal"
        layoutFixo={empilhado}
        selecionadaId={selecionada?.id ?? null}
        onSelecionar={setSelecionada}
        extra={
          <Button type="button" size="sm" onClick={abrirTelaCheia}>
            <Expand className="mr-2 h-4 w-4" /> Tela cheia
          </Button>
        }
      />

      <Legenda />

      <p className="text-xs text-muted-foreground">
        Só o que acontece com uma mensagem de paciente em produção — sem homologação nem testes.
        Clique em uma caixa para ver o que ela faz, o arquivo e a função. Arraste o fundo para
        navegar e use Ctrl + roda do mouse para aproximar.
      </p>

      {telaCheia && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Caminho da mensagem em produção — tela cheia"
              className="fixed inset-0 z-[49] flex flex-col gap-2 bg-background p-2 sm:p-3"
            >
              <Desenho
                modo="cheia"
                selecionadaId={selecionada?.id ?? null}
                onSelecionar={setSelecionada}
                titulo="Caminho da mensagem em produção"
                extra={
                  <Button type="button" size="sm" variant="secondary" onClick={sairTelaCheia}>
                    <Minimize2 className="mr-2 h-4 w-4" /> Sair
                  </Button>
                }
              />
              <div className="hidden sm:block">
                <Legenda />
              </div>
            </div>,
            document.body,
          )
        : null}

      <Sheet open={Boolean(selecionada)} onOpenChange={(aberto) => !aberto && setSelecionada(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selecionada ? (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>{selecionada.titulo}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {FAIXAS_CAMINHO.find((f) => f.id === selecionada.faixa)?.titulo}
                </Badge>
                <Badge variant="secondary">{ROTULO_TIPO[selecionada.tipo]}</Badge>
              </div>
              <p className="text-sm">{selecionada.explicacao}</p>
              {selecionada.quando ? (
                <Campo rotulo="Quando acontece">{selecionada.quando}</Campo>
              ) : null}
              {selecionada.atencao ? (
                <div className="flex gap-2 rounded-md border border-destructive/50 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span>{selecionada.atencao}</span>
                </div>
              ) : null}
              {selecionada.arquivo ? (
                <Campo rotulo="Onde está no código">
                  <code className="break-all text-xs">
                    {selecionada.arquivo}
                    {selecionada.funcao ? ` › ${selecionada.funcao}` : ""}
                  </code>
                </Campo>
              ) : null}
              {selecionada.tabelas?.length ? (
                <Campo rotulo="Grava ou lê no banco">
                  <span className="text-xs">{selecionada.tabelas.join(", ")}</span>
                </Campo>
              ) : null}
              {selecionada.componente ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTecnico(selecionada.componente ?? null);
                    setSelecionada(null);
                  }}
                >
                  Ver código e detalhes técnicos
                </Button>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <NodeDetalhePainel
        node={componenteTecnico}
        aberto={Boolean(componenteTecnico)}
        onFechar={() => setTecnico(null)}
        clinicaId={clinicaId}
        nivelAcesso={nivelAcesso}
      />
    </div>
  );
}

/**
 * Área navegável do desenho. No modo "normal" usa o layout empilhado e abre
 * no começo do fluxo; no modo "cheia" mede a área, escolhe 1 ou 2 colunas de
 * faixas e mostra tudo, refazendo a conta quando a área muda.
 */
function Desenho({
  modo,
  layoutFixo,
  selecionadaId,
  onSelecionar,
  titulo,
  extra,
}: {
  modo: "normal" | "cheia";
  layoutFixo?: LayoutCaminho;
  selecionadaId: string | null;
  onSelecionar: (etapa: EtapaCaminho) => void;
  titulo?: string;
  extra?: React.ReactNode;
}) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  const [view, setView] = useState({ escala: 0.7, x: 0, y: 0 });
  const arrasto = useRef<{
    startX: number;
    startY: number;
    origemX: number;
    origemY: number;
  } | null>(null);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const medir = () => setTamanho({ largura: area.clientWidth, altura: area.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(area);
    return () => observador.disconnect();
  }, []);

  const layout = useMemo(
    () =>
      layoutFixo ??
      (tamanho.largura > 0
        ? melhorLayoutCaminho(ETAPAS_CAMINHO, LIGACOES_CAMINHO, tamanho)
        : calcularLayoutCaminho(ETAPAS_CAMINHO, LIGACOES_CAMINHO, 1)),
    [layoutFixo, tamanho],
  );

  const verTudo = useCallback(() => {
    if (!tamanho.largura) return;
    const folga = 12;
    const escala = Math.min(
      ESCALA_MAX,
      Math.max(
        ESCALA_MIN,
        escalaParaCaber(layout, {
          largura: tamanho.largura - folga * 2,
          altura: tamanho.altura - folga * 2,
        }),
      ),
    );
    setView({
      escala,
      x: (tamanho.largura - layout.largura * escala) / 2,
      y: Math.max(folga, (tamanho.altura - layout.altura * escala) / 2),
    });
  }, [layout, tamanho]);

  // Normal: começa pela chegada, legível. Tela cheia: tudo visível, sempre
  // que a área (ou a arrumação escolhida) muda.
  useEffect(() => {
    if (!tamanho.largura) return;
    if (modo === "cheia") {
      verTudo();
      return;
    }
    const escala = Math.min(0.85, Math.max(ESCALA_MIN, (tamanho.largura - 32) / layout.largura));
    setView({ escala, x: Math.max(16, (tamanho.largura - layout.largura * escala) / 2), y: 16 });
  }, [modo, layout, tamanho, verTudo]);

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

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {titulo ? <span className="mr-2 text-sm font-semibold">{titulo}</span> : null}
        <Button type="button" variant="outline" size="sm" onClick={verTudo}>
          <Maximize2 className="mr-2 h-4 w-4" /> Ver tudo
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
        <span className="text-xs text-muted-foreground">
          {ETAPAS_CAMINHO.length} caixas · {Math.round(view.escala * 100)}%
        </span>
        <span className="ml-auto">{extra}</span>
      </div>

      <div
        ref={areaRef}
        onWheel={(evento) => {
          const area = areaRef.current;
          // Na tela cheia a roda aproxima direto; na página, só com Ctrl, para
          // não atrapalhar a rolagem.
          if (!area || (modo === "normal" && !(evento.ctrlKey || evento.metaKey))) return;
          const caixa = area.getBoundingClientRect();
          aplicarZoom(evento.deltaY < 0 ? 1.1 : 1 / 1.1, {
            x: evento.clientX - caixa.left,
            y: evento.clientY - caixa.top,
          });
        }}
        onPointerDown={(evento) => {
          if (evento.button !== 0) return;
          arrasto.current = {
            startX: evento.clientX,
            startY: evento.clientY,
            origemX: view.x,
            origemY: view.y,
          };
        }}
        onPointerMove={(evento) => {
          const atual = arrasto.current;
          if (!atual) return;
          setView((v) => ({
            ...v,
            x: atual.origemX + evento.clientX - atual.startX,
            y: atual.origemY + evento.clientY - atual.startY,
          }));
        }}
        onPointerUp={() => (arrasto.current = null)}
        onPointerLeave={() => (arrasto.current = null)}
        className={`relative w-full touch-none overflow-hidden rounded-lg border bg-muted/30 ${
          modo === "cheia" ? "min-h-0 flex-1" : "h-[72vh] min-h-[460px]"
        }`}
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--muted-foreground) 22%, transparent) 1px, transparent 1px)",
          backgroundSize: `${24 * view.escala}px ${24 * view.escala}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        aria-label="Caminho da mensagem em produção"
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.escala})`,
            width: layout.largura,
            height: layout.altura,
          }}
        >
          {layout.faixas.map((faixa) => (
            <div
              key={faixa.id}
              aria-hidden="true"
              className="pointer-events-none absolute rounded-xl border bg-card/40"
              style={{ left: faixa.x, top: faixa.y, width: faixa.largura, height: faixa.altura }}
            >
              <div className="absolute left-3 top-2 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-foreground">{faixa.titulo}</span>
                <span className="text-xs text-muted-foreground">{faixa.resumo}</span>
              </div>
            </div>
          ))}

          <svg
            width={layout.largura}
            height={layout.altura}
            className="pointer-events-none absolute left-0 top-0"
          >
            <defs>
              {[
                ["seta-caminho-principal", "var(--primary)"],
                ["seta-caminho-desvio", "var(--muted-foreground)"],
              ].map(([id, cor]) => (
                <marker
                  key={id}
                  id={`${id}-${modo}`}
                  markerUnits="userSpaceOnUse"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="5"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 z" style={{ fill: cor }} />
                </marker>
              ))}
            </defs>
            {layout.linhas.map((linha) => {
              const principal = linha.ligacao.tipo === "principal";
              return (
                <path
                  key={linha.id}
                  d={linha.d}
                  fill="none"
                  style={{ stroke: principal ? "var(--primary)" : "var(--muted-foreground)" }}
                  strokeWidth={principal ? 2.4 : 1.4}
                  strokeOpacity={principal ? 0.9 : 0.7}
                  strokeDasharray={linha.ligacao.tipo === "retorno" ? "6 4" : undefined}
                  markerEnd={`url(#seta-caminho-${principal ? "principal" : "desvio"}-${modo})`}
                />
              );
            })}
            {/* Ligação entre colunas de faixas: pontas curtas junto aos marcadores. */}
            {layout.quebras.map((q) => (
              <g key={q.id}>
                <path
                  d={`M${q.saida.x},${q.saida.y} L${q.saida.x},${q.saida.y + 22}`}
                  fill="none"
                  style={{ stroke: "var(--primary)" }}
                  strokeWidth={2.4}
                  strokeOpacity={0.9}
                />
                <path
                  d={`M${q.chegada.x},${q.chegada.y - 22} L${q.chegada.x},${q.chegada.y}`}
                  fill="none"
                  style={{ stroke: "var(--primary)" }}
                  strokeWidth={2.4}
                  strokeOpacity={0.9}
                  markerEnd={`url(#seta-caminho-principal-${modo})`}
                />
              </g>
            ))}
          </svg>

          {layout.linhas.map((linha) =>
            linha.rotulo ? (
              <span
                key={`r-${linha.id}`}
                aria-hidden="true"
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-background px-1.5 py-px text-[10px] text-muted-foreground"
                style={{ left: linha.rotulo.x, top: linha.rotulo.y }}
              >
                {linha.rotulo.texto}
              </span>
            ) : null,
          )}
          {layout.quebras.flatMap((q) => [
            <span
              key={`s-${q.id}`}
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/60 bg-background px-2 py-0.5 text-[11px] font-medium text-primary"
              style={{ left: q.saida.x, top: q.saida.y + 22 }}
            >
              {q.saida.texto} →
            </span>,
            <span
              key={`c-${q.id}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border border-primary/60 bg-background px-2 py-0.5 text-[11px] font-medium text-primary"
              style={{ left: q.chegada.x, top: q.chegada.y - 22 }}
            >
              {q.chegada.texto}
            </span>,
          ])}

          {layout.etapas.map(({ etapa, x, y }) => {
            const cor = corEtapa(etapa);
            const lateral = etapa.tipo !== "passo";
            return (
              <button
                type="button"
                key={etapa.id}
                onPointerDown={(evento) => evento.stopPropagation()}
                onClick={() => onSelecionar(etapa)}
                title={etapa.explicacao}
                className={`absolute flex flex-col justify-center gap-0.5 rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selecionadaId === etapa.id ? "ring-2 ring-primary" : ""
                }`}
                style={{
                  left: x,
                  top: y,
                  width: LARGURA_ETAPA,
                  height: ALTURA_ETAPA,
                  borderLeft: `5px solid ${cor}`,
                  borderStyle: etapa.tipo === "condicional" ? "dashed" : undefined,
                  borderLeftStyle: "solid",
                  backgroundColor: lateral
                    ? `color-mix(in oklch, ${cor} 8%, var(--card))`
                    : undefined,
                }}
              >
                <span className="flex items-start gap-1 text-[13px] font-medium leading-tight text-foreground">
                  <span className="line-clamp-2">{etapa.titulo}</span>
                  {etapa.atencao ? (
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                      aria-label="Atenção"
                    />
                  ) : null}
                </span>
                <span className="line-clamp-1 text-[11px] text-muted-foreground">
                  {etapa.quando ?? etapa.funcao ?? ROTULO_TIPO[etapa.tipo]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {LEGENDA.map((item) => (
        <span
          key={item.rotulo}
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.cor }} />
          {item.rotulo}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
        <span className="w-4 border-t-2 border-dashed border-muted-foreground" />
        Volta no fluxo
      </span>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
