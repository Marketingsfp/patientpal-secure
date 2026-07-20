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
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-md p-0.5 transition ${
        selecionado ? "ring-2 ring-primary" : orcado ? "ring-2 ring-amber-400/60" : ""
      }`}
      title={`Dente ${dente}${orcado ? " · orçado" : ""}`}
    >
      <span className={`text-[10px] font-mono ${decidua ? "text-amber-700" : "text-foreground/70"}`}>{dente}</span>
      <svg viewBox="0 0 40 40" className="h-10 w-10">
        {/* Vestibular (topo) */}
        <polygon
          points="0,0 40,0 30,10 10,10"
          fill={c("V")}
          stroke="hsl(var(--border))"
          strokeWidth="0.7"
          className="cursor-pointer hover:opacity-80"
          onClick={(e) => { e.stopPropagation(); onClickFace(dente, "V"); }}
        >
          <title>{`${dente} · Vestibular · ${STATUS_LABEL[s("V")]}`}</title>
        </polygon>
        {/* Mesial (direita — lado da linha média) */}
        <polygon
          points="40,0 40,40 30,30 30,10"
          fill={c("M")}
          stroke="hsl(var(--border))"
          strokeWidth="0.7"
          className="cursor-pointer hover:opacity-80"
          onClick={(e) => { e.stopPropagation(); onClickFace(dente, "M"); }}
        >
          <title>{`${dente} · Mesial · ${STATUS_LABEL[s("M")]}`}</title>
        </polygon>
        {/* Lingual/Palatina (base) */}
        <polygon
          points="0,40 40,40 30,30 10,30"
          fill={c("L")}
          stroke="hsl(var(--border))"
          strokeWidth="0.7"
          className="cursor-pointer hover:opacity-80"
          onClick={(e) => { e.stopPropagation(); onClickFace(dente, "L"); }}
        >
          <title>{`${dente} · Lingual/Palatina · ${STATUS_LABEL[s("L")]}`}</title>
        </polygon>
        {/* Distal (esquerda) */}
        <polygon
          points="0,0 0,40 10,30 10,10"
          fill={c("D")}
          stroke="hsl(var(--border))"
          strokeWidth="0.7"
          className="cursor-pointer hover:opacity-80"
          onClick={(e) => { e.stopPropagation(); onClickFace(dente, "D"); }}
        >
          <title>{`${dente} · Distal · ${STATUS_LABEL[s("D")]}`}</title>
        </polygon>
        {/* Oclusal / Incisal (centro) */}
        <rect
          x="10" y="10" width="20" height="20"
          fill={c("O")}
          stroke="hsl(var(--border))"
          strokeWidth="0.7"
          className="cursor-pointer hover:opacity-80"
          onClick={(e) => { e.stopPropagation(); onClickFace(dente, "O"); }}
        >
          <title>{`${dente} · Oclusal/Incisal · ${STATUS_LABEL[s("O")]}`}</title>
        </rect>
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