import { useMemo, useState } from "react";
import {
  DENTES_PERMANENTES,
  DENTES_DECIDUOS,
  STATUS_COR,
  STATUS_LABEL,
  FACE_LABEL,
  isDecidua,
  type OdontoStatus,
  type OdontoFace,
} from "@/lib/odonto";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/** Estado por dente/face (chave: `${dente}-${face}`). */
export type FacesEstado = Record<string, OdontoStatus>;

interface Props {
  /** Estado por (dente,face). Se falta o `INTEIRO`, cai para "higido". */
  estados: FacesEstado;
  /** Callback com o dente e a face clicados. */
  onClickFace: (dente: number, face: OdontoFace) => void;
  /** Set de dentes com item de orçamento aberto (anel âmbar). */
  orcadoSet?: Set<number>;
  /** Dente destacado. */
  denteSelecionado?: number | null;
}

type Arcada = "permanente" | "decidua" | "mista";

export function OdontogramaClinico({ estados, onClickFace, orcadoSet, denteSelecionado }: Props) {
  const [arcada, setArcada] = useState<Arcada>("permanente");
  const linhas = useMemo(() => arcadaLinhas(arcada), [arcada]);

  return (
    <div className="space-y-3">
      <Tabs value={arcada} onValueChange={(v) => setArcada(v as Arcada)}>
        <TabsList>
          <TabsTrigger value="permanente">Permanente</TabsTrigger>
          <TabsTrigger value="decidua">Decídua</TabsTrigger>
          <TabsTrigger value="mista">Mista</TabsTrigger>
        </TabsList>
        <TabsContent value={arcada} className="mt-3">
          <div className="flex flex-col gap-3 select-none">
            {linhas.map((linha, idx) => (
              <div key={idx} className="flex justify-center gap-1 flex-wrap">
                {linha.map((d) => (
                  <DenteFaces
                    key={d}
                    dente={d}
                    estados={estados}
                    onClickFace={onClickFace}
                    orcado={orcadoSet?.has(d) ?? false}
                    selecionado={denteSelecionado === d}
                  />
                ))}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <Legenda />
    </div>
  );
}

function arcadaLinhas(a: Arcada): number[][] {
  if (a === "permanente") {
    return [
      [...DENTES_PERMANENTES.supDir, ...DENTES_PERMANENTES.supEsq],
      [...DENTES_PERMANENTES.infDir, ...DENTES_PERMANENTES.infEsq],
    ];
  }
  if (a === "decidua") {
    return [
      [...DENTES_DECIDUOS.supDir, ...DENTES_DECIDUOS.supEsq],
      [...DENTES_DECIDUOS.infDir, ...DENTES_DECIDUOS.infEsq],
    ];
  }
  // Mista: permanente posterior + decíduos anteriores
  return [
    [...DENTES_PERMANENTES.supDir.slice(0, 5), ...DENTES_DECIDUOS.supDir.slice(-3), ...DENTES_DECIDUOS.supEsq.slice(0, 3), ...DENTES_PERMANENTES.supEsq.slice(-5)],
    [...DENTES_PERMANENTES.infDir.slice(0, 5), ...DENTES_DECIDUOS.infDir.slice(-3), ...DENTES_DECIDUOS.infEsq.slice(0, 3), ...DENTES_PERMANENTES.infEsq.slice(-5)],
  ];
}

/** SVG do dente com 5 faces clicáveis (O centro, V topo, L base, M direita, D esquerda no lado direito da boca). */
function DenteFaces({
  dente,
  estados,
  onClickFace,
  orcado,
  selecionado,
}: {
  dente: number;
  estados: FacesEstado;
  onClickFace: (d: number, f: OdontoFace) => void;
  orcado: boolean;
  selecionado: boolean;
}) {
  const c = (f: OdontoFace) => STATUS_COR[estados[`${dente}-${f}`] ?? estados[`${dente}-INTEIRO`] ?? "higido"];
  const s = (f: OdontoFace) => estados[`${dente}-${f}`] ?? estados[`${dente}-INTEIRO`] ?? "higido";
  const decidua = isDecidua(dente);
  // Superior (quadrantes 1,2,5,6) → raiz para cima; Inferior (3,4,7,8) → raiz para baixo.
  const quad = Math.floor(dente / 10);
  const superior = quad === 1 || quad === 2 || quad === 5 || quad === 6;
  const clipId = `tooth-crown-${dente}`;
  const rootId = `tooth-root-${dente}`;
  // Coroa ocupa y=16..56 (superior) ou y=0..40 (inferior); raiz no lado oposto.
  const crownY = superior ? 16 : 0;
  const rootPath = superior
    ? `M8,16 C6,10 8,4 14,2 C18,0 22,0 26,2 C32,4 34,10 32,16 Z`
    : `M8,40 C6,46 8,52 14,54 C18,56 22,56 26,54 C32,52 34,46 32,40 Z`;
  // Coroa arredondada como clipPath para dar forma de dente às 5 faces.
  const crownPath = `M4,${crownY + 4} C4,${crownY} 8,${crownY - 2} 12,${crownY - 2} L28,${crownY - 2} C32,${crownY - 2} 36,${crownY} 36,${crownY + 4} L36,${crownY + 32} C36,${crownY + 38} 30,${crownY + 40} 20,${crownY + 40} C10,${crownY + 40} 4,${crownY + 38} 4,${crownY + 32} Z`;
  const cx0 = 4, cy0 = crownY, cw = 32, ch = 40;
  const cIn = { x: cx0 + 10, y: cy0 + 12, w: cw - 20, h: ch - 24 }; // face oclusal (central)
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-md p-0.5 transition ${
        selecionado ? "ring-2 ring-primary" : orcado ? "ring-2 ring-amber-400/60" : ""
      }`}
      title={`Dente ${dente}${orcado ? " · orçado" : ""}`}
    >
      <span className={`text-[10px] font-mono ${decidua ? "text-amber-700" : "text-foreground/70"}`}>{dente}</span>
      <svg viewBox="0 0 40 56" className="h-14 w-10">
        <defs>
          <clipPath id={clipId}>
            <path d={crownPath} />
          </clipPath>
        </defs>
        {/* Raiz (não clicável, apenas visual) */}
        <path d={rootPath} fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.7" id={rootId} />
        {/* Faces da coroa recortadas no formato de dente */}
        <g clipPath={`url(#${clipId})`}>
          {/* Vestibular (topo da coroa) */}
          <polygon
            points={`${cx0},${cy0} ${cx0 + cw},${cy0} ${cIn.x + cIn.w},${cIn.y} ${cIn.x},${cIn.y}`}
            fill={c("V")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "V"); }}
          >
            <title>{`${dente} · Vestibular · ${STATUS_LABEL[s("V")]}`}</title>
          </polygon>
          {/* Mesial (lateral direita da caixa — lado da linha média) */}
          <polygon
            points={`${cx0 + cw},${cy0} ${cx0 + cw},${cy0 + ch} ${cIn.x + cIn.w},${cIn.y + cIn.h} ${cIn.x + cIn.w},${cIn.y}`}
            fill={c("M")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "M"); }}
          >
            <title>{`${dente} · Mesial · ${STATUS_LABEL[s("M")]}`}</title>
          </polygon>
          {/* Lingual / Palatina (base) */}
          <polygon
            points={`${cx0},${cy0 + ch} ${cx0 + cw},${cy0 + ch} ${cIn.x + cIn.w},${cIn.y + cIn.h} ${cIn.x},${cIn.y + cIn.h}`}
            fill={c("L")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "L"); }}
          >
            <title>{`${dente} · Lingual/Palatina · ${STATUS_LABEL[s("L")]}`}</title>
          </polygon>
          {/* Distal (lateral esquerda) */}
          <polygon
            points={`${cx0},${cy0} ${cx0},${cy0 + ch} ${cIn.x},${cIn.y + cIn.h} ${cIn.x},${cIn.y}`}
            fill={c("D")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "D"); }}
          >
            <title>{`${dente} · Distal · ${STATUS_LABEL[s("D")]}`}</title>
          </polygon>
          {/* Oclusal / Incisal (centro) */}
          <rect
            x={cIn.x} y={cIn.y} width={cIn.w} height={cIn.h}
            fill={c("O")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "O"); }}
          >
            <title>{`${dente} · Oclusal/Incisal · ${STATUS_LABEL[s("O")]}`}</title>
          </rect>
        </g>
        {/* Contorno da coroa por cima */}
        <path d={crownPath} fill="none" stroke="hsl(var(--border))" strokeWidth="0.9" />
      </svg>
      {orcado && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />}
    </div>
  );
}

function Legenda() {
  const status: OdontoStatus[] = [
    "higido", "cariado", "restaurado", "selante", "ausente", "extracao_indicada",
    "tratamento_canal", "coroa", "implante", "protese", "fratura",
    "sangramento", "mobilidade", "tartaro", "aparelho", "faceta",
  ];
  const faces: OdontoFace[] = ["O", "M", "D", "V", "L"];
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {status.map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-border" style={{ background: STATUS_COR[s] }} />
            <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/70">Faces:</span>
        {faces.map((f) => (
          <span key={f}><span className="font-mono">{f}</span> {FACE_LABEL[f].split(" ")[0]}</span>
        ))}
      </div>
    </div>
  );
}