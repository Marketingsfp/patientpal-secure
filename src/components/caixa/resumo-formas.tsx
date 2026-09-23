import { Banknote, Zap, CreditCard, FileText, Wallet, AlertTriangle } from "lucide-react";
import type { ComposicaoGaveta } from "@/lib/caixa/fechamento";
import { saldoEsperadoGaveta } from "@/lib/caixa/fechamento";

const fmt = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface ResumoFormasProps {
  /** Saldo líquido por forma no turno (chaves: dinheiro, pix, debito…). */
  porForma: Record<string, number>;
  /** Composição do dinheiro físico para o cálculo da gaveta. */
  gaveta: ComposicaoGaveta;
  /**
   * Aceite da sugestão de lançar o suprimento que repõe o dinheiro que falta
   * na gaveta. Recebe o valor faltante, já positivo.
   *
   * Ausente = a sugestão não é oferecida e o texto manda ajustar a sangria.
   * É o caso do caixa de dia anterior: lançar suprimento nele é bloqueado
   * (ver `trg_caixa_trava_dia_anterior`), então o único caminho para fechá-lo
   * é corrigir o valor da sangria que ficou maior do que o dinheiro entregue.
   */
  onSuprimentoDevolucao?: (falta: number) => void;
}

/**
 * Cartões de resumo por forma de pagamento + memória de cálculo do saldo
 * esperado em espécie na gaveta.
 */
export function ResumoFormas({ porForma, gaveta, onSuprimentoDevolucao }: ResumoFormasProps) {
  const v = (k: string) => Number(porForma[k] || 0);
  const cards = [
    {
      key: "dinheiro",
      label: "Dinheiro em espécie",
      value: v("dinheiro"),
      Icon: Banknote,
      cls: "text-emerald-700",
      bg: "bg-emerald-50",
    },
    {
      key: "pix",
      label: "PIX",
      value: v("pix"),
      Icon: Zap,
      cls: "text-teal-700",
      bg: "bg-teal-50",
    },
    {
      key: "credito",
      label: "Cartão de crédito",
      value: v("credito"),
      Icon: CreditCard,
      cls: "text-indigo-700",
      bg: "bg-indigo-50",
    },
    {
      key: "debito",
      label: "Cartão de débito",
      value: v("debito"),
      Icon: CreditCard,
      cls: "text-sky-700",
      bg: "bg-sky-50",
    },
    {
      key: "convenio",
      label: "Convênio / faturado",
      value: v("convenio") + v("boleto") + v("transferencia"),
      Icon: FileText,
      cls: "text-violet-700",
      bg: "bg-violet-50",
    },
  ];
  const totalGeral = Object.values(porForma).reduce((a, x) => a + Number(x || 0), 0);
  const esperado = saldoEsperadoGaveta(gaveta);
  /** Quanto falta de dinheiro físico para a gaveta deixar de estar negativa. */
  const faltaEspecie = esperado < -0.005 ? Math.abs(esperado) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map(({ key, label, value, Icon, cls, bg }) => (
          <div
            key={key}
            className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${bg}`}>
                <Icon className={`h-3.5 w-3.5 ${cls}`} />
              </span>
              <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider leading-tight">
                {label}
              </span>
            </div>
            <div
              className={`text-xl font-bold tabular-nums ${value < 0 ? "text-rose-600" : "text-slate-900"}`}
            >
              {fmt(value)}
            </div>
          </div>
        ))}
        <div className="bg-slate-900 text-white border border-slate-900 rounded-xl p-3.5 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/10">
              <Wallet className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-white/70 leading-tight">
              Total do turno
            </span>
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
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                  {p.l}
                </div>
                <div className="font-semibold text-slate-800">{fmt(p.v)}</div>
              </div>
            </div>
          ))}
          <span className="text-slate-400 font-semibold">=</span>
          <div
            className={`rounded-lg px-3 py-2 border ${
              faltaEspecie > 0 ? "border-rose-300 bg-rose-50" : "border-primary/40 bg-primary/10"
            }`}
          >
            <div
              className={`text-[11px] uppercase tracking-wider font-semibold ${
                faltaEspecie > 0 ? "text-rose-700" : "text-primary"
              }`}
            >
              Esperado na gaveta
            </div>
            <div className={`font-bold ${faltaEspecie > 0 ? "text-rose-700" : "text-primary"}`}>
              {fmt(esperado)}
            </div>
          </div>
        </div>

        {/*
          Gaveta negativa: saiu mais dinheiro em espécie do que entrou no turno.
          Na prática isso tem uma causa dominante — o dinheiro foi todo sangrado
          e DEPOIS houve devolução em dinheiro ao paciente, então a devolução
          saiu de um dinheiro que já não estava mais na gaveta.

          Enquanto isso não for resolvido o caixa não fecha (o fechamento barra
          saldo negativo por forma). O aviso fica aqui, junto da conta que ficou
          negativa, e oferece a correção que descreve o que aconteceu de fato:
          o dinheiro voltou da sangria para a gaveta, então entra como
          suprimento. A sangria original fica intacta, com o comprovante que já
          foi impresso e assinado ainda valendo.
        */}
        {faltaEspecie > 0 && (
          <div className="mt-3 rounded-lg border-2 border-rose-300 bg-rose-50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-rose-900">
                  Faltam {fmt(faltaEspecie)} em espécie na gaveta — o caixa não fecha assim
                </p>
                <p className="text-xs text-rose-800">
                  Isso acontece quando o dinheiro do turno já foi sangrado e depois houve devolução
                  em dinheiro a um paciente: a devolução saiu de um dinheiro que já não estava na
                  gaveta.
                </p>
                <p className="text-xs text-rose-800">
                  {onSuprimentoDevolucao
                    ? "Se você pegou esse dinheiro de volta da sangria para devolver ao paciente, registre o suprimento abaixo — é o comprovante de que o dinheiro voltou para a gaveta. A sangria original continua valendo."
                    : "Corrija o valor da sangria na lista de sangrias do turno, logo abaixo: informe quanto foi realmente entregue. Neste caixa não é possível lançar suprimento."}
                </p>
              </div>
            </div>
            {onSuprimentoDevolucao && (
              <button
                type="button"
                onClick={() => onSuprimentoDevolucao(faltaEspecie)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer"
              >
                <Banknote className="h-3.5 w-3.5" /> Lançar suprimento de devolução de{" "}
                {fmt(faltaEspecie)}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
