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
  const shape = toothShape(dente, superior);
  const { crownPath, rootPath, cx0, crownY, cw, ch, vbW, vbH } = shape;
  // Face oclusal (central) — margem proporcional à largura da coroa
  const insetX = Math.max(5, cw * 0.28);
  const insetY = Math.max(8, ch * 0.28);
  const cIn = { x: cx0 + insetX, y: crownY + insetY, w: cw - insetX * 2, h: ch - insetY * 2 };
  const cy0 = crownY;
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-md p-0.5 transition ${
        selecionado ? "ring-2 ring-primary" : orcado ? "ring-2 ring-amber-400/60" : ""
      }`}
      title={`Dente ${dente}${orcado ? " · orçado" : ""}`}
    >
      <span className={`text-[10px] font-mono ${decidua ? "text-amber-700" : "text-foreground/70"}`}>{dente}</span>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} className="h-16 w-10">
        <defs>
          <clipPath id={clipId}>
            <path d={crownPath} />
          </clipPath>
        </defs>
        {/* Raiz(es) (não clicável, apenas visual) — anatomia por tipo de dente */}
        <path d={rootPath} fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.8" fillRule="evenodd" />
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

// ---------------------------------------------------------------------------
// Anatomia dos dentes (FDI) — coroa arredondada + raízes por tipo de dente.
// A coroa serve de clipPath para as 5 faces clicáveis (V/M/D/L/O), então o
// clique e a coloração por face continuam funcionando; só o contorno muda.
// ---------------------------------------------------------------------------

type ToothType = "molar" | "premolar" | "canine" | "incisor";

function toothType(d: number): ToothType {
  const p = d % 10; // 1..8 (permanente) ou 1..5 (decíduo)
  if (p >= 6) return "molar";
  if (p >= 4) return isDecidua(d) ? "molar" : "premolar"; // decíduos 4,5 são molares
  if (p === 3) return "canine";
  return "incisor";
}

interface ToothShape {
  crownPath: string;
  rootPath: string;
  cx0: number;
  crownY: number;
  cw: number;
  ch: number;
  vbW: number;
  vbH: number;
}

function toothShape(dente: number, superior: boolean): ToothShape {
  const type = toothType(dente);
  const vbW = 40;
  const vbH = 72;
  const ch = 40; // altura da coroa
  const rootH = 26;
  // Largura da coroa por tipo
  const cwByType: Record<ToothType, number> = { molar: 34, premolar: 30, canine: 26, incisor: 24 };
  const cw = cwByType[type];
  const cx0 = (vbW - cw) / 2;
  // Superior: raiz em cima (y=3..29), coroa embaixo (y=30..70)
  // Inferior: coroa em cima (y=2..42), raiz embaixo (y=43..69)
  const crownY = superior ? 3 + rootH + 1 : 2;
  const rootNeck = superior ? crownY : crownY + ch; // linha do "colo" (junção coroa/raiz)
  const rootTip = superior ? 3 : crownY + ch + rootH; // ponta oposta ao colo
  const cx = cx0 + cw / 2;
  const r = Math.min(6, cw / 3);

  // Coroa: retângulo com cantos arredondados; incisivos/caninos ficam levemente
  // mais afilados no lado do colo (raiz).
  const crownPath = buildCrownPath(type, cx0, crownY, cw, ch, r, superior);

  // Raiz(es)
  let rootPath = "";
  const single = (x: number, w: number) => singleRootPath(x, w, rootNeck, rootTip, superior);
  if (type === "molar") {
    if (superior) {
      // 3 raízes (2 vestibulares + 1 palatina/central)
      rootPath = [single(cx0 + 5, 4.5), single(cx0 + cw - 5, 4.5), single(cx, 5)].join(" ");
    } else {
      // 2 raízes (mesial + distal)
      rootPath = [single(cx0 + 7, 5.5), single(cx0 + cw - 7, 5.5)].join(" ");
    }
  } else if (type === "premolar") {
    rootPath = single(cx, 7);
  } else if (type === "canine") {
    rootPath = single(cx, 6);
  } else {
    rootPath = single(cx, 5.5);
  }

  return { crownPath, rootPath, cx0, crownY, cw, ch, vbW, vbH };
}

function buildCrownPath(
  type: ToothType,
  cx0: number,
  crownY: number,
  cw: number,
  ch: number,
  r: number,
  superior: boolean,
): string {
  const x1 = cx0;
  const x2 = cx0 + cw;
  const y1 = crownY;
  const y2 = crownY + ch;
  // Lado incisal/oclusal (oposto ao colo)
  const incisalY = superior ? y2 : y1;
  const neckY = superior ? y1 : y2;
  // Molares: coroa mais quadrada, com leve estreitamento no colo (~6%)
  // Incisivos/caninos: coroa mais afilada no colo (~15%)
  const neckShrink = type === "molar" ? 0.06 : type === "premolar" ? 0.1 : 0.15;
  const nx1 = x1 + cw * neckShrink;
  const nx2 = x2 - cw * neckShrink;
  // Cantos incisais arredondados; cantos no colo levemente arredondados também.
  const rInc = r;
  const rNeck = Math.max(2, r * 0.5);
  if (superior) {
    // Colo em y1 (topo), incisal em y2 (base)
    return [
      `M ${nx1},${y1 + rNeck}`,
      `Q ${nx1},${y1} ${nx1 + rNeck},${y1}`,
      `L ${nx2 - rNeck},${y1}`,
      `Q ${nx2},${y1} ${nx2},${y1 + rNeck}`,
      `L ${x2},${y2 - rInc}`,
      `Q ${x2},${y2} ${x2 - rInc},${y2}`,
      `L ${x1 + rInc},${y2}`,
      `Q ${x1},${y2} ${x1},${y2 - rInc}`,
      `Z`,
    ].join(" ");
  }
  // Inferior: incisal em y1 (topo), colo em y2 (base)
  return [
    `M ${x1},${y1 + rInc}`,
    `Q ${x1},${y1} ${x1 + rInc},${y1}`,
    `L ${x2 - rInc},${y1}`,
    `Q ${x2},${y1} ${x2},${y1 + rInc}`,
    `L ${nx2},${y2 - rNeck}`,
    `Q ${nx2},${y2} ${nx2 - rNeck},${y2}`,
    `L ${nx1 + rNeck},${y2}`,
    `Q ${nx1},${y2} ${nx1},${y2 - rNeck}`,
    `Z`,
  ].join(" ");
}

function singleRootPath(
  x: number,
  width: number,
  neckY: number,
  tipY: number,
  superior: boolean,
): string {
  const half = width / 2;
  // Raiz afilando da base larga (colo) para uma ponta arredondada.
  const tipHalf = Math.max(1, width * 0.25);
  if (superior) {
    // tipY < neckY (raiz para cima)
    const midY = (neckY + tipY) / 2;
    return [
      `M ${x - half},${neckY}`,
      `C ${x - half},${midY} ${x - tipHalf - 0.5},${tipY + 3} ${x - tipHalf},${tipY + 1}`,
      `Q ${x},${tipY - 1} ${x + tipHalf},${tipY + 1}`,
      `C ${x + tipHalf + 0.5},${tipY + 3} ${x + half},${midY} ${x + half},${neckY}`,
      `Z`,
    ].join(" ");
  }
  // Inferior: tipY > neckY (raiz para baixo)
  const midY = (neckY + tipY) / 2;
  return [
    `M ${x - half},${neckY}`,
    `C ${x - half},${midY} ${x - tipHalf - 0.5},${tipY - 3} ${x - tipHalf},${tipY - 1}`,
    `Q ${x},${tipY + 1} ${x + tipHalf},${tipY - 1}`,
    `C ${x + tipHalf + 0.5},${tipY - 3} ${x + half},${midY} ${x + half},${neckY}`,
    `Z`,
  ].join(" ");
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