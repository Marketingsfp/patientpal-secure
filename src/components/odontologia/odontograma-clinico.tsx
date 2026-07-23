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
    [
      ...DENTES_PERMANENTES.supDir.slice(0, 5),
      ...DENTES_DECIDUOS.supDir.slice(-3),
      ...DENTES_DECIDUOS.supEsq.slice(0, 3),
      ...DENTES_PERMANENTES.supEsq.slice(-5),
    ],
    [
      ...DENTES_PERMANENTES.infDir.slice(0, 5),
      ...DENTES_DECIDUOS.infDir.slice(-3),
      ...DENTES_DECIDUOS.infEsq.slice(0, 3),
      ...DENTES_PERMANENTES.infEsq.slice(-5),
    ],
  ];
}

/** SVG do dente em vista oclusal (topo), com 5 faces clicáveis (O centro, V topo, L base, M direita, D esquerda no lado direito da boca). */
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
  const c = (f: OdontoFace) =>
    STATUS_COR[estados[`${dente}-${f}`] ?? estados[`${dente}-INTEIRO`] ?? "higido"];
  const s = (f: OdontoFace) => estados[`${dente}-${f}`] ?? estados[`${dente}-INTEIRO`] ?? "higido";
  const decidua = isDecidua(dente);
  const higidoAll = (["V", "M", "D", "L", "O"] as OdontoFace[]).every(
    (f) => (estados[`${dente}-${f}`] ?? estados[`${dente}-INTEIRO`] ?? "higido") === "higido",
  );
  // Ausente: qualquer face (ou INTEIRO) marcada como "ausente" → X vermelho sobre o dente.
  const ausente = (["INTEIRO", "O", "V", "L", "M", "D"] as OdontoFace[]).some(
    (f) => estados[`${dente}-${f}`] === "ausente",
  );
  const type = toothType(dente);
  const clipId = `tooth-crown-${dente}`;
  const shape = toothShape(dente);
  const { crownPath, cw, ch, vbW, vbH } = shape;
  const faceFill = (f: OdontoFace) => (higidoAll ? "transparent" : c(f));
  const halfW = cw / 2;
  const halfH = ch / 2;
  // Face oclusal (central) — margem proporcional à largura da coroa
  const insetX = Math.max(4, cw * 0.26);
  const insetY = Math.max(4, ch * 0.26);
  const cIn = { x: -halfW + insetX, y: -halfH + insetY, w: cw - insetX * 2, h: ch - insetY * 2 };
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-md p-0.5 transition ${
        selecionado ? "ring-2 ring-primary" : orcado ? "ring-2 ring-amber-400/60" : ""
      }`}
      title={`Dente ${dente}${orcado ? " · orçado" : ""}`}
    >
      <svg viewBox={`0 0 ${vbW} ${vbH}`} className="h-12 w-12">
        <defs>
          <clipPath id={clipId}>
            <path d={crownPath} />
          </clipPath>
        </defs>
        <g transform={`translate(${vbW / 2} ${vbH / 2})`}>
          {/* Faces recortadas no formato oclusal do dente */}
          <g clipPath={`url(#${clipId})`}>
            {/* Vestibular (topo) */}
            <polygon
              points={`${-halfW},${-halfH} ${halfW},${-halfH} ${cIn.x + cIn.w},${cIn.y} ${cIn.x},${cIn.y}`}
              fill={faceFill("V")}
              className="cursor-pointer hover:opacity-80"
              onClick={(e) => {
                e.stopPropagation();
                onClickFace(dente, "V");
              }}
            >
              <title>{`${dente} · Vestibular · ${STATUS_LABEL[s("V")]}`}</title>
            </polygon>
            <polygon
              points={`${halfW},${-halfH} ${halfW},${halfH} ${cIn.x + cIn.w},${cIn.y + cIn.h} ${cIn.x + cIn.w},${cIn.y}`}
              fill={faceFill("M")}
              className="cursor-pointer hover:opacity-80"
              onClick={(e) => {
                e.stopPropagation();
                onClickFace(dente, "M");
              }}
            >
              <title>{`${dente} · Mesial · ${STATUS_LABEL[s("M")]}`}</title>
            </polygon>
            <polygon
              points={`${-halfW},${halfH} ${halfW},${halfH} ${cIn.x + cIn.w},${cIn.y + cIn.h} ${cIn.x},${cIn.y + cIn.h}`}
              fill={faceFill("L")}
              className="cursor-pointer hover:opacity-80"
              onClick={(e) => {
                e.stopPropagation();
                onClickFace(dente, "L");
              }}
            >
              <title>{`${dente} · Lingual/Palatina · ${STATUS_LABEL[s("L")]}`}</title>
            </polygon>
            <polygon
              points={`${-halfW},${-halfH} ${-halfW},${halfH} ${cIn.x},${cIn.y + cIn.h} ${cIn.x},${cIn.y}`}
              fill={faceFill("D")}
              className="cursor-pointer hover:opacity-80"
              onClick={(e) => {
                e.stopPropagation();
                onClickFace(dente, "D");
              }}
            >
              <title>{`${dente} · Distal · ${STATUS_LABEL[s("D")]}`}</title>
            </polygon>
            <rect
              x={cIn.x}
              y={cIn.y}
              width={cIn.w}
              height={cIn.h}
              fill={faceFill("O")}
              className="cursor-pointer hover:opacity-80"
              onClick={(e) => {
                e.stopPropagation();
                onClickFace(dente, "O");
              }}
            >
              <title>{`${dente} · Oclusal/Incisal · ${STATUS_LABEL[s("O")]}`}</title>
            </rect>
            {ocluSulcos(type, cw, ch).map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="#64748b"
                strokeWidth="0.8"
                strokeLinecap="round"
                pointerEvents="none"
              />
            ))}
          </g>
          {/* Contorno da coroa por cima — traço fino, cor referência */}
          <path d={crownPath} fill="none" stroke="#64748b" strokeWidth="1" strokeLinejoin="round" />
          {ausente && (
            <g pointerEvents="none">
              <line
                x1={-halfW - 1}
                y1={-halfH - 1}
                x2={halfW + 1}
                y2={halfH + 1}
                stroke="#dc2626"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <line
                x1={halfW + 1}
                y1={-halfH - 1}
                x2={-halfW - 1}
                y2={halfH + 1}
                stroke="#dc2626"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </g>
          )}
        </g>
      </svg>
      <span
        className={`text-[10px] font-sans tracking-tight ${decidua ? "text-amber-700" : "text-slate-500"}`}
      >
        {dente}
      </span>
      {orcado && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anatomia dos dentes (FDI) — contorno oclusal (vista de cima) por tipo de
// dente. A coroa serve de clipPath para as 5 faces clicáveis (V/M/D/L/O),
// então o clique e a coloração por face continuam funcionando; só o
// contorno muda (sem raiz, sem elevação frontal).
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
  cw: number;
  ch: number;
  vbW: number;
  vbH: number;
}

const OCLU_SIZE: Record<ToothType, { w: number; h: number }> = {
  incisor: { w: 20, h: 24 },
  canine: { w: 21, h: 26 },
  premolar: { w: 25, h: 27 },
  molar: { w: 31, h: 31 },
};

function toothShape(dente: number): ToothShape {
  const type = toothType(dente);
  const { w: cw, h: ch } = OCLU_SIZE[type];
  const vbW = 40;
  const vbH = 40;
  const crownPath = ocluContorno(type, cw, ch);
  return { crownPath, cw, ch, vbW, vbH };
}

/** Contorno da coroa em vista oclusal (centrado em 0,0), conforme o tipo do dente. */
function ocluContorno(type: ToothType, w: number, h: number): string {
  if (type === "incisor") {
    // incisivos: vestibular plano, lingual côncavo
    return `M ${-w / 2} ${-h * 0.12} Q ${-w / 2} ${-h / 2} 0 ${-h / 2} Q ${w / 2} ${-h / 2} ${w / 2} ${-h * 0.12} Q ${
      w * 0.34
    } ${h / 2} 0 ${h * 0.46} Q ${-w * 0.34} ${h / 2} ${-w / 2} ${-h * 0.12} Z`;
  }
  if (type === "canine") {
    // canino: cúspide única voltada para vestibular
    return `M 0 ${-h / 2} Q ${w * 0.46} ${-h * 0.24} ${w * 0.42} ${h * 0.16} Q ${w * 0.24} ${h * 0.5} 0 ${h * 0.44} Q ${
      -w * 0.24
    } ${h * 0.5} ${-w * 0.42} ${h * 0.16} Q ${-w * 0.46} ${-h * 0.24} 0 ${-h / 2} Z`;
  }
  if (type === "premolar") {
    // pré-molares: oval com duas cúspides
    return ocluRrect(w, h, Math.min(w, h) * 0.4);
  }
  // molares: quadrangular arredondado
  return ocluRrect(w, h, Math.min(w, h) * 0.26);
}

function ocluRrect(w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${
    x + w - r
  } ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}

/** Sulcos/cristas internas — dão o aspecto anatômico (apenas decorativo). */
function ocluSulcos(type: ToothType, w: number, h: number): string[] {
  if (type === "incisor")
    return [`M ${-w * 0.36} ${-h * 0.02} Q 0 ${-h * 0.2} ${w * 0.36} ${-h * 0.02}`];
  if (type === "canine")
    return [
      `M 0 ${-h * 0.4} L 0 ${h * 0.18}`,
      `M 0 ${-h * 0.4} L ${-w * 0.26} ${h * 0.1}`,
      `M 0 ${-h * 0.4} L ${w * 0.26} ${h * 0.1}`,
    ];
  if (type === "premolar") return [`M ${-w * 0.3} 0 Q 0 ${h * 0.1} ${w * 0.3} 0`];
  return [
    `M ${-w * 0.34} 0 Q 0 ${h * 0.06} ${w * 0.34} 0`,
    `M ${-w * 0.1} ${-h * 0.02} L ${-w * 0.13} ${-h * 0.32}`,
    `M ${w * 0.06} ${h * 0.02} L ${w * 0.09} ${h * 0.32}`,
    `M ${w * 0.2} ${-h * 0.02} L ${w * 0.23} ${-h * 0.3}`,
  ];
}

function Legenda() {
  const status: OdontoStatus[] = [
    "higido",
    "cariado",
    "restaurado",
    "selante",
    "ausente",
    "extracao_indicada",
    "tratamento_canal",
    "coroa",
    "implante",
    "protese",
    "fratura",
    "sangramento",
    "mobilidade",
    "tartaro",
    "aparelho",
    "faceta",
  ];
  const faces: OdontoFace[] = ["O", "M", "D", "V", "L"];
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {status.map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-border"
              style={{ background: STATUS_COR[s] }}
            />
            <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/70">Faces:</span>
        {faces.map((f) => (
          <span key={f}>
            <span className="font-mono">{f}</span> {FACE_LABEL[f].split(" ")[0]}
          </span>
        ))}
      </div>
    </div>
  );
}
