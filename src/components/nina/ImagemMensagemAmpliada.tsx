import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Visualização local: usa o mesmo link privado da mensagem, sem copiar a mídia. */
export function ImagemMensagemAmpliada({ url }: { url: string }) {
  const area = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState({ largura: 0, altura: 0 });
  const [janela, setJanela] = useState({ largura: 0, altura: 0 });
  const [arrastando, setArrastando] = useState(false);
  const arrasto = useRef<{ x: number; y: number; esquerda: number; topo: number } | null>(null);
  const anterior = useRef({ largura: 0, altura: 0 });

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const medir = () => setJanela({ largura: el.clientWidth, altura: el.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const ajustarZoom = (valor: number | ((atual: number) => number)) => {
    setZoom((atual) =>
      Math.min(5, Math.max(1, typeof valor === "function" ? valor(atual) : valor)),
    );
  };

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      // Ctrl + roda mantém o zoom nativo do navegador.
      if (e.ctrlKey || e.deltaY === 0) return;
      e.preventDefault();
      setZoom((atual) => Math.min(5, Math.max(1, atual + (e.deltaY < 0 ? 0.25 : -0.25))));
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, []);

  const fator =
    natural.largura && janela.largura
      ? Math.min(1, janela.largura / natural.largura, janela.altura / natural.altura)
      : 1;
  const largura = natural.largura * fator * zoom;
  const altura = natural.altura * fator * zoom;

  useLayoutEffect(() => {
    const el = area.current;
    const antes = anterior.current;
    if (el && antes.largura && antes.altura) {
      // Mantém no centro o trecho que estava sendo lido ao mudar a ampliação.
      const x =
        (el.scrollLeft + el.clientWidth / 2 - Math.max(0, (el.clientWidth - antes.largura) / 2)) /
        antes.largura;
      const y =
        (el.scrollTop + el.clientHeight / 2 - Math.max(0, (el.clientHeight - antes.altura) / 2)) /
        antes.altura;
      el.scrollLeft = Math.max(
        0,
        x * largura + Math.max(0, (el.clientWidth - largura) / 2) - el.clientWidth / 2,
      );
      el.scrollTop = Math.max(
        0,
        y * altura + Math.max(0, (el.clientHeight - altura) / 2) - el.clientHeight / 2,
      );
    }
    anterior.current = { largura, altura };
  }, [largura, altura]);

  const terminarArrasto = () => {
    arrasto.current = null;
    setArrastando(false);
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Diminuir zoom"
          disabled={zoom <= 1}
          onClick={() => ajustarZoom((atual) => atual - 0.25)}
        >
          <ZoomOut />
        </Button>
        <output
          className="w-14 text-center text-sm tabular-nums"
          aria-live="polite"
          aria-label="Nível de zoom"
        >
          {Math.round(zoom * 100)}%
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Aumentar zoom"
          disabled={zoom >= 5}
          onClick={() => ajustarZoom((atual) => atual + 0.25)}
        >
          <ZoomIn />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => ajustarZoom(1)}>
          <Maximize /> Ajustar à tela
        </Button>
      </div>
      <div
        ref={area}
        tabIndex={0}
        role="region"
        aria-label="Imagem ampliada. Use mais e menos para zoom e as setas para navegar."
        className={`h-[60dvh] sm:h-[70dvh] overflow-auto overscroll-contain rounded-lg bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${zoom > 1 ? (arrastando ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"}`}
        onDoubleClick={() => ajustarZoom(zoom === 1 ? 2 : 1)}
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            ajustarZoom((atual) => atual + 0.25);
          }
          if (e.key === "-") {
            e.preventDefault();
            ajustarZoom((atual) => atual - 0.25);
          }
          if (e.key === "0") {
            e.preventDefault();
            ajustarZoom(1);
          }
        }}
        onPointerDown={(e) => {
          if (zoom <= 1 || e.pointerType !== "mouse" || e.button !== 0) return;
          const el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          arrasto.current = {
            x: e.clientX,
            y: e.clientY,
            esquerda: el.scrollLeft,
            topo: el.scrollTop,
          };
          setArrastando(true);
        }}
        onPointerMove={(e) => {
          if (!arrasto.current) return;
          e.currentTarget.scrollLeft = arrasto.current.esquerda - (e.clientX - arrasto.current.x);
          e.currentTarget.scrollTop = arrasto.current.topo - (e.clientY - arrasto.current.y);
        }}
        onPointerUp={terminarArrasto}
        onPointerCancel={terminarArrasto}
        onLostPointerCapture={terminarArrasto}
      >
        <div
          className="relative min-h-full min-w-full"
          style={{ width: largura || "100%", height: altura || "100%" }}
        >
          <img
            src={url}
            alt="Imagem enviada pelo paciente"
            draggable={false}
            onLoad={(e) =>
              setNatural({
                largura: e.currentTarget.naturalWidth,
                altura: e.currentTarget.naturalHeight,
              })
            }
            className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
            style={{ width: largura || undefined, height: altura || undefined }}
          />
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Use os botões, a roda do mouse ou dois cliques para ampliar. Arraste para ver os detalhes.
      </p>
    </div>
  );
}
