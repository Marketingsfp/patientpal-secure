import { brl } from "@/lib/financeiro/format";

export interface KpiData {
  tempoMedioPagamentoMin: number | null;
  maiorFila: { qtd: number; hora: string } | null;
  tempoMedioCaixaMin: number | null;
  receitaSessao: number;
  receitaHoje: number;
  atendimentos: number;
}

function fmtMin(m: number | null) {
  if (m == null) return "—";
  if (m < 1) return "<1min";
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h > 0 ? `${h}h${String(r).padStart(2, "0")}` : `${r}min`;
}

export function KpiBar({ data }: { data: KpiData }) {
  return (
    <div
      className="text-[11px] text-muted-foreground border-t bg-muted/30 px-3 py-1.5 flex flex-wrap gap-x-4 gap-y-1 tabular-nums"
      data-testid="caixa-kpi-bar"
    >
      <span>
        Tempo até pgto: <b className="text-foreground">{fmtMin(data.tempoMedioPagamentoMin)}</b>
      </span>
      <span>
        Maior fila:{" "}
        <b className="text-foreground">
          {data.maiorFila ? `${data.maiorFila.qtd} (${data.maiorFila.hora})` : "—"}
        </b>
      </span>
      <span>
        Tempo em caixa: <b className="text-foreground">{fmtMin(data.tempoMedioCaixaMin)}</b>
      </span>
      <span>
        Receita sessão: <b className="text-foreground">{brl(data.receitaSessao)}</b>
      </span>
      <span>
        Receita hoje: <b className="text-foreground">{brl(data.receitaHoje)}</b>
      </span>
      <span>
        Atendimentos: <b className="text-foreground">{data.atendimentos}</b>
      </span>
    </div>
  );
}
