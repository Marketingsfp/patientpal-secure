import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MAPA_VIEWBOX,
  TIPO_COR,
  TIPO_LABEL,
  regioesDaVista,
  type FisioTipo,
  type FisioVista,
  type RegiaoCorporal,
} from "@/lib/fisio";

interface Props {
  vista: FisioVista;
  onVistaChange: (v: FisioVista) => void;
  /** Tipo da marcação mais recente de cada região (chave = código da região). */
  marcado: Record<string, FisioTipo>;
  /** Quantidade de marcações por região, para o número no canto. */
  contagem?: Record<string, number>;
  selecionada?: string | null;
  onClickRegiao: (regiao: RegiaoCorporal) => void;
}

/**
 * Mapa corporal interativo — silhueta montada por regiões clicáveis.
 *
 * A silhueta é desenhada pelas próprias regiões (cabeça, tronco, membros),
 * como nas fichas de fisioterapia em papel: cada peça é a área de clique, o
 * que evita depender de um traçado anatômico frágil e mantém o alvo do clique
 * grande o bastante para uso em tablet.
 */
export function MapaCorporal({
  vista,
  onVistaChange,
  marcado,
  contagem,
  selecionada,
  onClickRegiao,
}: Props) {
  const regioes = regioesDaVista(vista);

  return (
    <div className="space-y-3">
      <Tabs value={vista} onValueChange={(v) => onVistaChange(v as FisioVista)}>
        <TabsList>
          <TabsTrigger value="frente">Frente</TabsTrigger>
          <TabsTrigger value="costas">Costas</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex justify-center">
        <svg
          viewBox={`0 0 ${MAPA_VIEWBOX.largura} ${MAPA_VIEWBOX.altura}`}
          className="w-full max-w-[280px] h-auto select-none"
          role="img"
          aria-label={`Mapa corporal — vista de ${vista}`}
        >
          {regioes.map((r) => {
            const tipo = marcado[r.codigo];
            const ativa = selecionada === r.codigo;
            const qtd = contagem?.[r.codigo] ?? 0;
            const fill = tipo ? TIPO_COR[tipo] : "#e2e8f0";
            const props = {
              fill,
              fillOpacity: tipo ? 0.75 : 0.55,
              stroke: ativa ? "#0f172a" : "#94a3b8",
              strokeWidth: ativa ? 2.5 : 1,
              className: "cursor-pointer",
            };
            return (
              <g key={r.codigo} onClick={() => onClickRegiao(r)}>
                <title>
                  {r.label}
                  {tipo ? ` — ${TIPO_LABEL[tipo]}` : ""}
                  {qtd > 1 ? ` (${qtd} registros)` : ""}
                </title>
                {r.forma.tipo === "ellipse" ? (
                  <ellipse
                    cx={r.forma.cx}
                    cy={r.forma.cy}
                    rx={r.forma.rx}
                    ry={r.forma.ry}
                    {...props}
                  />
                ) : (
                  <rect
                    x={r.forma.x}
                    y={r.forma.y}
                    width={r.forma.w}
                    height={r.forma.h}
                    rx={r.forma.r ?? 6}
                    {...props}
                  />
                )}
                {qtd > 0 && (
                  <text
                    x={r.forma.tipo === "ellipse" ? r.forma.cx : r.forma.x + r.forma.w / 2}
                    y={(r.forma.tipo === "ellipse" ? r.forma.cy : r.forma.y + r.forma.h / 2) + 3.5}
                    textAnchor="middle"
                    className="pointer-events-none"
                    fontSize="9"
                    fontWeight="700"
                    fill="#0f172a"
                  >
                    {qtd}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <Legenda />
    </div>
  );
}

function Legenda() {
  const tipos = Object.keys(TIPO_LABEL) as FisioTipo[];
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
      {tipos.map((t) => (
        <span key={t} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm border border-border"
            style={{ background: TIPO_COR[t] }}
          />
          {TIPO_LABEL[t]}
        </span>
      ))}
    </div>
  );
}
