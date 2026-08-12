import { Banknote, Zap, CreditCard, FileText, Wallet } from "lucide-react";
import type { ComposicaoGaveta } from "@/lib/caixa/fechamento";
import { saldoEsperadoGaveta } from "@/lib/caixa/fechamento";

const fmt = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface ResumoFormasProps {
  /** Saldo líquido por forma no turno (chaves: dinheiro, pix, debito…). */
  porForma: Record<string, number>;
  /** Composição do dinheiro físico para o cálculo da gaveta. */
  gaveta: ComposicaoGaveta;
}

/**
 * Cartões de resumo por forma de pagamento + memória de cálculo do saldo
 * esperado em espécie na gaveta.
 */
export function ResumoFormas({ porForma, gaveta }: ResumoFormasProps) {
  const v = (k: string) => Number(porForma[k] || 0);
  const cards = [
    { key: "dinheiro", label: "Dinheiro em espécie", value: v("dinheiro"), Icon: Banknote, cls: "text-emerald-700", bg: "bg-emerald-50" },
    { key: "pix", label: "PIX", value: v("pix"), Icon: Zap, cls: "text-teal-700", bg: "bg-teal-50" },
    { key: "credito", label: "Cartão de crédito", value: v("credito"), Icon: CreditCard, cls: "text-indigo-700", bg: "bg-indigo-50" },
    { key: "debito", label: "Cartão de débito", value: v("debito"), Icon: CreditCard, cls: "text-sky-700", bg: "bg-sky-50" },
    { key: "convenio", label: "Convênio / faturado", value: v("convenio") + v("boleto") + v("transferencia"), Icon: FileText, cls: "text-violet-700", bg: "bg-violet-50" },
  ];
  const totalGeral = Object.values(porForma).reduce((a, x) => a + Number(x || 0), 0);
  const esperado = saldoEsperadoGaveta(gaveta);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map(({ key, label, value, Icon, cls, bg }) => (
          <div key={key} className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs space-y-2">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${bg}`}>
                <Icon className={`h-3.5 w-3.5 ${cls}`} />
              </span>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider leading-tight">{label}</span>
            </div>
            <div className={`text-xl font-bold tabular-nums ${value < 0 ? "text-rose-600" : "text-slate-900"}`}>{fmt(value)}</div>
          </div>
        ))}
        <div className="bg-slate-900 text-white border border-slate-900 rounded-xl p-3.5 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/10">
              <Wallet className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70 leading-tight">Total do turno</span>
          </div>
          <div className="text-xl font-bold tabular-nums">{fmt(totalGeral)}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-xs">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Saldo esperado na gaveta (somente espécie)
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm tabular-nums">
          {[
            { l: "Saldo inicial (troco)", v: gaveta.saldoInicial, op: "" },
            { l: "Recebimentos em dinheiro", v: gaveta.recebimentosDinheiro, op: "+" },
            { l: "Suprimentos", v: gaveta.suprimentos, op: "+" },
            { l: "Sangrias", v: gaveta.sangrias, op: "−" },
            { l: "Despesas em espécie", v: gaveta.despesas, op: "−" },
          ].map((p) => (
            <div key={p.l} className="flex items-center gap-2">
              {p.op && <span className="text-slate-400 font-semibold">{p.op}</span>}
              <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{p.l}</div>
                <div className="font-semibold text-slate-800">{fmt(p.v)}</div>
              </div>
            </div>
          ))}
          <span className="text-slate-400 font-semibold">=</span>
          <div className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-indigo-600">Esperado na gaveta</div>
            <div className="font-bold text-indigo-900">{fmt(esperado)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}