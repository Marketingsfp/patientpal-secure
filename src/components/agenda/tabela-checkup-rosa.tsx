import {
  NOME_ITEM_CHECKUP_ROSA,
  PACOTES_CHECKUP_ROSA,
  PRECO_TABELA_CHECKUP_ROSA,
  type ItemCheckupRosa,
} from "@/lib/agenda/checkup-rosa";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const valor = (n: number) => (n === 0 ? "GRATUITO" : brl(n));

/**
 * "Colinha" da recepção: os quatro pacotes CHECKUP ROSA no mesmo formato da
 * planilha da campanha — cada serviço com o valor em dinheiro (D) e em
 * Pix/cartão (C), o total e, no Completo, o total com o desconto da
 * mamografia. Os números saem da mesma tabela que a cobrança usa.
 */
export function TabelaCheckupRosa({ colunas = 4 }: { colunas?: 2 | 4 }) {
  return (
    <div
      className={`grid gap-2 grid-cols-1 sm:grid-cols-2 ${colunas === 4 ? "xl:grid-cols-4" : ""}`}
    >
      {PACOTES_CHECKUP_ROSA.map((p) => {
        const itens = Object.keys(p.itens) as ItemCheckupRosa[];
        const cheio = itens.reduce(
          (s, i) => ({
            d: s.d + PRECO_TABELA_CHECKUP_ROSA[i].dinheiro,
            c: s.c + PRECO_TABELA_CHECKUP_ROSA[i].cartao,
          }),
          { d: 0, c: 0 },
        );
        const pacote = itens.reduce(
          (s, i) => ({ d: s.d + p.itens[i]!.dinheiro, c: s.c + p.itens[i]!.cartao }),
          { d: 0, c: 0 },
        );
        const temDesconto = pacote.d !== cheio.d || pacote.c !== cheio.c;
        return (
          <table
            key={p.id}
            className="w-full text-[11px] border border-pink-200 dark:border-pink-900 tabular-nums"
          >
            <thead>
              <tr className="bg-pink-100 dark:bg-pink-950/50">
                <th colSpan={3} className="px-1.5 py-1 text-center font-bold">
                  {p.nome}
                </th>
              </tr>
              <tr className="bg-sky-50 dark:bg-sky-950/30">
                <th className="px-1.5 py-0.5" />
                <th className="px-1.5 py-0.5 text-right font-semibold">D</th>
                <th className="px-1.5 py-0.5 text-right font-semibold">C</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i} className="border-t border-pink-100 dark:border-pink-950">
                  <td className="px-1.5 py-0.5 uppercase">
                    {NOME_ITEM_CHECKUP_ROSA[i].replace(" (grátis)", "")}
                  </td>
                  <td className="px-1.5 py-0.5 text-right">
                    {valor(PRECO_TABELA_CHECKUP_ROSA[i].dinheiro)}
                  </td>
                  <td className="px-1.5 py-0.5 text-right">
                    {valor(PRECO_TABELA_CHECKUP_ROSA[i].cartao)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-pink-200 bg-pink-50 font-semibold dark:border-pink-900 dark:bg-pink-950/30">
                <td className="px-1.5 py-0.5">TOTAL</td>
                <td className="px-1.5 py-0.5 text-right">{brl(cheio.d)}</td>
                <td className="px-1.5 py-0.5 text-right">{brl(cheio.c)}</td>
              </tr>
              {temDesconto && (
                <tr className="font-bold text-pink-700 dark:text-pink-300">
                  <td className="px-1.5 py-0.5">COM DESCONTO</td>
                  <td className="px-1.5 py-0.5 text-right">{brl(pacote.d)}</td>
                  <td className="px-1.5 py-0.5 text-right">{brl(pacote.c)}</td>
                </tr>
              )}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
