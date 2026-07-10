import { brl } from "@/lib/financeiro/format";
import { cn } from "@/lib/utils";

export interface ResumoData {
  saldo: number;
  recebidoHoje: number;
  recebidoSessao: number;
  particular: number;
  associado: number; // "Associado" = plano/Cartão de Benefícios (nunca "Convênio")
  dinheiro: number;
  pix: number;
  cartao: number;
  pendentesFila: number;
  aguardandoPagamento: number;
}

function Card({
  label,
  value,
  tone = "default",
  testId,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warn" | "info";
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-lg border bg-card px-3 py-2 min-w-[130px] shadow-sm",
        "flex flex-col justify-between",
        tone === "success" && "border-status-paid/40",
        tone === "warn" && "border-status-waiting/40",
        tone === "info" && "border-status-in-service/40",
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}

export function PainelResumo({ data, sessaoInfo }: { data: ResumoData; sessaoInfo: string }) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b pb-2 pt-1">
      <div className="flex gap-2 overflow-x-auto scrollbar-thin -mx-1 px-1">
        <div className="rounded-lg border bg-primary/5 px-3 py-2 min-w-[190px] shadow-sm">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
            Sessão
          </div>
          <div className="text-sm font-medium truncate">{sessaoInfo}</div>
          <div className="text-base font-semibold tabular-nums">{brl(data.saldo)}</div>
        </div>
        <Card
          label="Recebido hoje"
          value={brl(data.recebidoHoje)}
          tone="success"
          testId="kpi-hoje"
        />
        <Card
          label="Recebido sessão"
          value={brl(data.recebidoSessao)}
          tone="success"
          testId="kpi-sessao"
        />
        <Card label="Particular" value={brl(data.particular)} testId="kpi-particular" />
        <Card label="Associado" value={brl(data.associado)} testId="kpi-associado" />
        <Card label="Dinheiro" value={brl(data.dinheiro)} testId="kpi-dinheiro" />
        <Card label="PIX" value={brl(data.pix)} testId="kpi-pix" />
        <Card label="Cartão" value={brl(data.cartao)} testId="kpi-cartao" />
        <Card
          label="Pendentes fila"
          value={data.pendentesFila}
          tone="warn"
          testId="kpi-pendentes"
        />
        <Card
          label="Aguardando pgto"
          value={data.aguardandoPagamento}
          tone="info"
          testId="kpi-aguardando"
        />
      </div>
    </div>
  );
}
