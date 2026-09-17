/**
 * Fechamento dos caixas das operadoras, consolidado para o Movimento de Caixa.
 *
 * O financeiro recolhe o dinheiro das gavetas e paga os médicos com ele. Para
 * saber quanto recolheu no dia, abria a modal "Sessão de caixa" de cada
 * atendente e anotava as sangrias à mão. Aqui a mesma leitura sai somada, por
 * operadora e no total do período.
 *
 * Dois saldos, que NÃO são o mesmo número:
 *  - `calculado` é o "Calculado" da modal: recebimentos de TODAS as formas
 *    (dinheiro, PIX, cartões) − sangrias − estornos. Conferido em produção:
 *    Amanda, 16/09/2026, R$ 2.604,00 recebidos − R$ 120,00 de estorno =
 *    R$ 2.484,00 gravados, com só R$ 662,00 em dinheiro. Serve para bater com
 *    a modal, não com a gaveta.
 *  - `gaveta` é o dinheiro em espécie que deveria sobrar fisicamente: troco
 *    de abertura + dinheiro recebido (líquido de estorno em dinheiro) +
 *    suprimentos − sangrias − despesas em espécie. É o número que a tesouraria
 *    cruza com o que recolheu. Mesma conta de `saldoEsperadoGaveta`.
 */
import { saldoDeMovimentos, saldoEsperadoGaveta } from "./fechamento";

export interface SessaoOperadora {
  id: string;
  user_id: string;
  user_nome: string | null;
  status: string;
  valor_abertura: number | string | null;
  valor_fechamento_calculado: number | string | null;
  diferenca: number | string | null;
}

export interface MovOperadora {
  sessao_id: string;
  tipo: string;
  valor: number | string | null;
  forma_pagamento: string | null;
}

export interface LinhaOperadora {
  userId: string;
  nome: string;
  sessoes: number;
  /** Alguma sessão do período ainda não foi fechada. */
  emAberto: boolean;
  recebidoDinheiro: number;
  sangrias: number;
  gaveta: number;
  calculado: number;
  /** Soma das diferenças dos fechamentos; null se nenhuma sessão foi fechada. */
  diferenca: number | null;
}

export interface ResumoOperadoras {
  linhas: LinhaOperadora[];
  total: Omit<LinhaOperadora, "userId" | "nome">;
}

const num = (v: number | string | null | undefined) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

const ehDinheiro = (forma: string | null) => (forma ?? "").trim().toLowerCase() === "dinheiro";

/**
 * Sangria, suprimento e despesa sem forma preenchida contam como dinheiro —
 * mesma regra de `bucketDeMov` na tela do Caixa.
 */
const saiDaGaveta = (forma: string | null) => !(forma ?? "").trim() || ehDinheiro(forma);

export function resumoOperadoras(
  sessoes: SessaoOperadora[],
  movs: MovOperadora[],
): ResumoOperadoras {
  const movsPorSessao = new Map<string, MovOperadora[]>();
  for (const m of movs) {
    const lista = movsPorSessao.get(m.sessao_id) ?? [];
    lista.push(m);
    movsPorSessao.set(m.sessao_id, lista);
  }

  const porUsuario = new Map<string, LinhaOperadora>();
  for (const s of sessoes) {
    const ms = movsPorSessao.get(s.id) ?? [];
    let recebidoDinheiro = 0;
    let sangrias = 0;
    let suprimentos = 0;
    let despesas = 0;
    for (const m of ms) {
      const v = num(m.valor);
      if (m.tipo === "recebimento" && ehDinheiro(m.forma_pagamento)) recebidoDinheiro += v;
      else if (m.tipo === "estorno" && ehDinheiro(m.forma_pagamento)) recebidoDinheiro -= v;
      else if (m.tipo === "sangria") sangrias += v;
      else if (m.tipo === "suprimento" && saiDaGaveta(m.forma_pagamento)) suprimentos += v;
      else if (m.tipo === "despesa" && saiDaGaveta(m.forma_pagamento)) despesas += v;
    }
    const fechada = s.status === "fechado";
    const gaveta = saldoEsperadoGaveta({
      saldoInicial: num(s.valor_abertura),
      recebimentosDinheiro: recebidoDinheiro,
      suprimentos,
      sangrias,
      despesas,
    });
    // Igual à modal: sessão fechada mostra o valor gravado no fechamento (é o
    // registro de auditoria); sessão aberta, a conta em tempo real.
    const calculado =
      fechada && s.valor_fechamento_calculado != null
        ? num(s.valor_fechamento_calculado)
        : saldoDeMovimentos(ms);

    const linha = porUsuario.get(s.user_id) ?? {
      userId: s.user_id,
      nome: s.user_nome?.trim() || "Sem nome",
      sessoes: 0,
      emAberto: false,
      recebidoDinheiro: 0,
      sangrias: 0,
      gaveta: 0,
      calculado: 0,
      diferenca: null,
    };
    linha.sessoes += 1;
    linha.emAberto ||= !fechada;
    linha.recebidoDinheiro = r2(linha.recebidoDinheiro + recebidoDinheiro);
    linha.sangrias = r2(linha.sangrias + sangrias);
    linha.gaveta = r2(linha.gaveta + gaveta);
    linha.calculado = r2(linha.calculado + calculado);
    if (fechada) linha.diferenca = r2((linha.diferenca ?? 0) + num(s.diferenca));
    porUsuario.set(s.user_id, linha);
  }

  const linhas = Array.from(porUsuario.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const total = linhas.reduce<ResumoOperadoras["total"]>(
    (acc, l) => ({
      sessoes: acc.sessoes + l.sessoes,
      emAberto: acc.emAberto || l.emAberto,
      recebidoDinheiro: r2(acc.recebidoDinheiro + l.recebidoDinheiro),
      sangrias: r2(acc.sangrias + l.sangrias),
      gaveta: r2(acc.gaveta + l.gaveta),
      calculado: r2(acc.calculado + l.calculado),
      diferenca: l.diferenca == null ? acc.diferenca : r2((acc.diferenca ?? 0) + l.diferenca),
    }),
    {
      sessoes: 0,
      emAberto: false,
      recebidoDinheiro: 0,
      sangrias: 0,
      gaveta: 0,
      calculado: 0,
      diferenca: null,
    },
  );
  return { linhas, total };
}
