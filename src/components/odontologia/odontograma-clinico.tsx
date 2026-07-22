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
  const higidoAll = (["V", "M", "D", "L", "O"] as OdontoFace[]).every(
    (f) => (estados[`${dente}-${f}`] ?? estados[`${dente}-INTEIRO`] ?? "higido") === "higido",
  );
  // Ausente: qualquer face (ou INTEIRO) marcada como "ausente" → X vermelho sobre o dente.
  const ausente = (["INTEIRO", "O", "V", "L", "M", "D"] as OdontoFace[]).some(
    (f) => estados[`${dente}-${f}`] === "ausente",
  );
  // Superior (quadrantes 1,2,5,6) → raiz para cima; Inferior (3,4,7,8) → raiz para baixo.
  const quad = Math.floor(dente / 10);
  const superior = quad === 1 || quad === 2 || quad === 5 || quad === 6;
  const clipId = `tooth-crown-${dente}`;
  const shape = toothShape(dente, superior);
  const { crownPath, rootPath, cx0, crownY, cw, ch, vbW, vbH } = shape;
  const faceFill = (f: OdontoFace) => (higidoAll ? "transparent" : c(f));
  // Face oclusal (central) — margem proporcional à largura da coroa
  const insetX = Math.max(5, cw * 0.28);
  const insetY = Math.max(8, ch * 0.28);
  const cIn = { x: cx0 + insetX, y: crownY + insetY, w: cw - insetX * 2, h: ch - insetY * 2 };
  const cy0 = crownY;
  return (
    <div
      className={`flex ${superior ? "flex-col" : "flex-col-reverse"} items-center gap-0.5 rounded-md p-0.5 transition ${
        selecionado ? "ring-2 ring-primary" : orcado ? "ring-2 ring-amber-400/60" : ""
      }`}
      title={`Dente ${dente}${orcado ? " · orçado" : ""}`}
    >
      <svg viewBox={`0 0 ${vbW} ${vbH}`} className="h-20 w-9">
        <defs>
          <clipPath id={clipId}>
            <path d={crownPath} />
          </clipPath>
        </defs>
        {/* Raiz(es) — somente contorno, fiel ao diagrama de referência */}
        <path d={rootPath} fill="none" stroke="#64748b" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" fillRule="evenodd" />
        {/* Faces da coroa recortadas no formato de dente */}
        <g clipPath={`url(#${clipId})`}>
          {/* Vestibular (topo da coroa) */}
          <polygon
            points={`${cx0},${cy0} ${cx0 + cw},${cy0} ${cIn.x + cIn.w},${cIn.y} ${cIn.x},${cIn.y}`}
            fill={faceFill("V")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "V"); }}
          >
            <title>{`${dente} · Vestibular · ${STATUS_LABEL[s("V")]}`}</title>
          </polygon>
          <polygon
            points={`${cx0 + cw},${cy0} ${cx0 + cw},${cy0 + ch} ${cIn.x + cIn.w},${cIn.y + cIn.h} ${cIn.x + cIn.w},${cIn.y}`}
            fill={faceFill("M")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "M"); }}
          >
            <title>{`${dente} · Mesial · ${STATUS_LABEL[s("M")]}`}</title>
          </polygon>
          <polygon
            points={`${cx0},${cy0 + ch} ${cx0 + cw},${cy0 + ch} ${cIn.x + cIn.w},${cIn.y + cIn.h} ${cIn.x},${cIn.y + cIn.h}`}
            fill={faceFill("L")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "L"); }}
          >
            <title>{`${dente} · Lingual/Palatina · ${STATUS_LABEL[s("L")]}`}</title>
          </polygon>
          <polygon
            points={`${cx0},${cy0} ${cx0},${cy0 + ch} ${cIn.x},${cIn.y + cIn.h} ${cIn.x},${cIn.y}`}
            fill={faceFill("D")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "D"); }}
          >
            <title>{`${dente} · Distal · ${STATUS_LABEL[s("D")]}`}</title>
          </polygon>
          <rect
            x={cIn.x} y={cIn.y} width={cIn.w} height={cIn.h}
            fill={faceFill("O")}
            className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onClickFace(dente, "O"); }}
          >
            <title>{`${dente} · Oclusal/Incisal · ${STATUS_LABEL[s("O")]}`}</title>
          </rect>
        </g>
        {/* Contorno da coroa por cima — traço fino, cor referência */}
        <path d={crownPath} fill="none" stroke="#64748b" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />
        {ausente && (
          <g pointerEvents="none">
            <line x1={cx0 - 2} y1={crownY - 2} x2={cx0 + cw + 2} y2={crownY + ch + 2} stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" />
            <line x1={cx0 + cw + 2} y1={crownY - 2} x2={cx0 - 2} y2={crownY + ch + 2} stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )}
      </svg>
      <span className={`text-[10px] font-sans tracking-tight ${decidua ? "text-amber-700" : "text-slate-500"}`}>{dente}</span>
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
  const vbH = 90;
  // Coroa e raízes com proporções fiéis ao diagrama anatômico de referência:
  // coroa retangular alta com cúspides sutis, raízes retas e afiladas.
  const chByType: Record<ToothType, number> = { molar: 26, premolar: 26, canine: 30, incisor: 28 };
  const rhByType: Record<ToothType, number> = { molar: 40, premolar: 44, canine: 50, incisor: 42 };
  const cwByType: Record<ToothType, number> = { molar: 30, premolar: 22, canine: 19, incisor: 18 };
  const ch = chByType[type];
  const rootH = rhByType[type];
  const cw = cwByType[type];
  const cx0 = (vbW - cw) / 2;
  const topPad = 6;
  const crownY = superior ? topPad + rootH : topPad;
  const rootNeck = superior ? crownY : crownY + ch;
  const rootTip = superior ? topPad : crownY + ch + rootH;
  const cx = cx0 + cw / 2;

  const crownPath = buildCrownPath(type, cx0, crownY, cw, ch, superior);

  let rootPath = "";
  const single = (x: number, w: number, curve = 0) => singleRootPath(x, w, rootNeck, rootTip, superior, curve);
  if (type === "molar") {
    if (superior) {
      // 3 raízes: 2 vestibulares (M/D) divergindo + 1 palatina central reta.
      rootPath = [
        single(cx0 + 5, 6, -3),
        single(cx0 + cw - 5, 6, 3),
        single(cx, 5.5, 0),
      ].join(" ");
    } else {
      // 2 raízes (mesial + distal), divergência clara.
      rootPath = [
        single(cx0 + 7, 7, -3),
        single(cx0 + cw - 7, 7, 3),
      ].join(" ");
    }
  } else if (type === "premolar") {
    rootPath = single(cx, 7.5);
  } else if (type === "canine") {
    rootPath = single(cx, 7);
  } else {
    rootPath = single(cx, 6.5);
  }

  return { crownPath, rootPath, cx0, crownY, cw, ch, vbW, vbH };
}

function buildCrownPath(
  type: ToothType,
  cx0: number,
  crownY: number,
  cw: number,
  ch: number,
  superior: boolean,
): string {
  // Coroa retangular limpa: colo levemente estreito, laterais retas com leve
  // bojo, cantos incisais arredondados e cúspides sutis por tipo.
  const neckY = superior ? crownY : crownY + ch;
  const edgeY = superior ? crownY + ch : crownY;
  const dir = superior ? 1 : -1; // cúspides projetam para fora da coroa
  const neckShrink = type === "molar" ? 0.06 : type === "premolar" ? 0.08 : 0.10;
  const nxL = cx0 + cw * neckShrink;
  const nxR = cx0 + cw - cw * neckShrink;
  const rEdge = type === "molar" ? 2.5 : type === "premolar" ? 2.5 : type === "canine" ? 2.5 : 2;
  const eL = cx0 + rEdge;
  const eR = cx0 + cw - rEdge;
  const cx = cx0 + cw / 2;
  // Bojo lateral muito discreto — quase reto.
  const bulgeShift = 0.6;
  const bulgeY = superior ? neckY + ch * 0.55 : neckY - ch * 0.55;
  const bxL = cx0 - bulgeShift;
  const bxR = cx0 + cw + bulgeShift;

  function edge(): string {
    if (type === "molar") {
      // 4 cúspides suaves
      const seg = (eR - eL) / 4;
      const cusp = 1.4;
      const valley = 0.9;
      const parts: string[] = [];
      for (let i = 0; i < 4; i++) {
        const x0 = eL + seg * i;
        const x1 = eL + seg * (i + 1);
        const mid = (x0 + x1) / 2;
        parts.push(`Q ${mid},${edgeY + dir * cusp} ${x1},${edgeY}`);
        if (i < 3) parts.push(`Q ${x1},${edgeY - dir * valley} ${x1 + 0.01},${edgeY}`);
      }
      return parts.join(" ");
    }
    if (type === "premolar") {
      const cusp = 1.8;
      const mid = (eL + eR) / 2;
      return [
        `Q ${(eL + mid) / 2},${edgeY + dir * cusp} ${mid},${edgeY}`,
        `Q ${(mid + eR) / 2},${edgeY + dir * cusp} ${eR},${edgeY}`,
      ].join(" ");
    }
    if (type === "canine") {
      // Ponta central marcada
      const tip = 4;
      return [
        `L ${cx},${edgeY + dir * tip}`,
        `L ${eR},${edgeY}`,
      ].join(" ");
    }
    // Incisivo — borda reta
    return `L ${eR},${edgeY}`;
  }

  return [
    `M ${nxL},${neckY}`,
    `C ${bxL},${bulgeY} ${cx0},${edgeY} ${eL},${edgeY}`,
    edge(),
    `C ${cx0 + cw},${edgeY} ${bxR},${bulgeY} ${nxR},${neckY}`,
    `Z`,
  ].join(" ");
}

function singleRootPath(
  x: number,
  width: number,
  neckY: number,
  tipY: number,
  superior: boolean,
  curveX = 0,
): string {
  const half = width / 2;
  // Raiz reta afilando para uma ponta arredondada. Fiel ao diagrama de
  // referência: laterais quase retas com leve convergência, sem bojo.
  const tipHalf = 1.0;
  const tipX = x + curveX;
  const sign = superior ? 1 : -1;
  const shoulderY = neckY - sign * 2; // pequena curvatura no colo
  const preTipY = tipY + sign * 3;
  return [
    `M ${x - half},${shoulderY}`,
    `L ${tipX - tipHalf},${preTipY}`,
    `Q ${tipX},${tipY} ${tipX + tipHalf},${preTipY}`,
    `L ${x + half},${shoulderY}`,
    `Q ${x},${neckY + sign * 0.5} ${x - half},${shoulderY}`,
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