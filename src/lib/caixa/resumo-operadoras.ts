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
  /** Dia da clínica (AAAA-MM-DD) em que a sessão abriu — só para o detalhe. */
  dia?: string;
  valor_abertura: number | string | null;
  valor_fechamento_calculado: number | string | null;
  diferenca: number | string | null;
}

export interface MovOperadora {
  sessao_id: string;
  tipo: string;
  valor: number | string | null;
  forma_pagamento: string | null;
  /** Hora do movimento — só a conta "desde a última sangria" usa. */
  created_at?: string | null;
}

/**
 * Recebido por forma, líquido de estorno na mesma forma. "outros" junta o que
 * não é dinheiro, PIX ou cartão (misto, boleto…); sem cobrança e gratuidade
 * valem R$ 0,00 e não mudam nada.
 */
export interface PorForma {
  dinheiro: number;
  pix: number;
  credito: number;
  debito: number;
  outros: number;
}

/** Uma sessão de caixa, para a janela de detalhe da operadora. */
export interface DetalheSessaoOperadora {
  sessaoId: string;
  dia: string;
  fechada: boolean;
  porForma: PorForma;
  sangrias: number;
  gaveta: number;
  calculado: number;
  diferenca: number | null;
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
  porForma: PorForma;
  /** Sessões do período, em ordem de dia. */
  detalhe: DetalheSessaoOperadora[];
}

export interface ResumoOperadoras {
  linhas: LinhaOperadora[];
  total: Omit<LinhaOperadora, "userId" | "nome" | "detalhe">;
}

const num = (v: number | string | null | undefined) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

const ehDinheiro = (forma: string | null) => (forma ?? "").trim().toLowerCase() === "dinheiro";

/**
 * Sangria, suprimento e despesa sem forma preenchida contam como dinheiro —
 * mesma regra de `bucketDeMov` na tela do Caixa.
 */
const saiDaGaveta = (forma: string | null) => !(forma ?? "").trim() || ehDinheiro(forma);

const zeroFormas = (): PorForma => ({ dinheiro: 0, pix: 0, credito: 0, debito: 0, outros: 0 });

function chaveForma(forma: string | null): keyof PorForma {
  const f = (forma ?? "").trim().toLowerCase();
  if (f === "dinheiro") return "dinheiro";
  if (f === "pix") return "pix";
  if (f === "cartao_credito" || f === "credito") return "credito";
  if (f === "cartao_debito" || f === "debito") return "debito";
  return "outros";
}

function somaFormas(a: PorForma, b: PorForma): PorForma {
  return {
    dinheiro: r2(a.dinheiro + b.dinheiro),
    pix: r2(a.pix + b.pix),
    credito: r2(a.credito + b.credito),
    debito: r2(a.debito + b.debito),
    outros: r2(a.outros + b.outros),
  };
}

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
    const porForma = zeroFormas();
    for (const m of ms) {
      const v = num(m.valor);
      if (m.tipo === "recebimento") porForma[chaveForma(m.forma_pagamento)] += v;
      else if (m.tipo === "estorno") porForma[chaveForma(m.forma_pagamento)] -= v;
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
      porForma: zeroFormas(),
      detalhe: [],
    };
    linha.sessoes += 1;
    linha.emAberto ||= !fechada;
    linha.recebidoDinheiro = r2(linha.recebidoDinheiro + recebidoDinheiro);
    linha.sangrias = r2(linha.sangrias + sangrias);
    linha.gaveta = r2(linha.gaveta + gaveta);
    linha.calculado = r2(linha.calculado + calculado);
    if (fechada) linha.diferenca = r2((linha.diferenca ?? 0) + num(s.diferenca));
    const formasSessao = somaFormas(porForma, zeroFormas());
    linha.porForma = somaFormas(linha.porForma, formasSessao);
    linha.detalhe.push({
      sessaoId: s.id,
      dia: s.dia ?? "",
      fechada,
      porForma: formasSessao,
      sangrias: r2(sangrias),
      gaveta: r2(gaveta),
      calculado: r2(calculado),
      diferenca: fechada ? r2(num(s.diferenca)) : null,
    });
    porUsuario.set(s.user_id, linha);
  }

  const linhas = Array.from(porUsuario.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
  for (const l of linhas) l.detalhe.sort((a, b) => a.dia.localeCompare(b.dia));
  const total = linhas.reduce<ResumoOperadoras["total"]>(
    (acc, l) => ({
      sessoes: acc.sessoes + l.sessoes,
      emAberto: acc.emAberto || l.emAberto,
      recebidoDinheiro: r2(acc.recebidoDinheiro + l.recebidoDinheiro),
      sangrias: r2(acc.sangrias + l.sangrias),
      gaveta: r2(acc.gaveta + l.gaveta),
      calculado: r2(acc.calculado + l.calculado),
      diferenca: l.diferenca == null ? acc.diferenca : r2((acc.diferenca ?? 0) + l.diferenca),
      porForma: somaFormas(acc.porForma, l.porForma),
    }),
    {
      sessoes: 0,
      emAberto: false,
      recebidoDinheiro: 0,
      sangrias: 0,
      gaveta: 0,
      calculado: 0,
      diferenca: null,
      porForma: zeroFormas(),
    },
  );
  return { linhas, total };
}

/** Uma operadora com caixa aberto, no card "Total em espécie (pré-sangria)". */
export interface LinhaPreSangria {
  userId: string;
  nome: string;
  /** Dinheiro recebido de paciente que ainda não saiu da gaveta por sangria. */
  especie: number;
  /** Hora (ISO) da última sangria; null se ainda não houve sangria no caixa. */
  ultimaSangria: string | null;
}

export interface ResumoPreSangria {
  linhas: LinhaPreSangria[];
  total: number;
}

/**
 * Quanto falta recolher de cada gaveta: dinheiro recebido (líquido de estorno
 * em dinheiro) − sangrias − despesas pagas da gaveta. Pedido do dono em
 * 06/10/2026, para o financeiro não abrir sessão por sessão.
 *
 * NÃO é "o que entrou depois da última sangria": a sangria sai em valor
 * redondo e deixa resto na gaveta. Mayara, 06/10/2026: às 12:56 tinha
 * R$ 3.092 em dinheiro e a sangria levou R$ 2.800 — os R$ 292 continuavam lá.
 * Contar só depois da última sangria dava R$ 1.426 no fim do dia; o que havia
 * para entregar era R$ 1.663.
 *
 * Só caixa aberto entra: o de caixa fechado foi entregue no fechamento
 * ("Sobra entregue no fechamento"). Troco de abertura e suprimento ficam de
 * fora — não são dinheiro recebido de paciente. Se a sangria levou também o
 * troco, o pendente é zero, nunca negativo.
 */
export function especiePreSangria(
  sessoes: SessaoOperadora[],
  movs: MovOperadora[],
): ResumoPreSangria {
  const abertas = new Set(sessoes.filter((s) => s.status !== "fechado").map((s) => s.id));
  const saldoPorSessao = new Map<string, number>();
  const ultimaPorSessao = new Map<string, string>();
  for (const m of movs) {
    if (!abertas.has(m.sessao_id)) continue;
    const v = num(m.valor);
    let delta = 0;
    if (m.tipo === "recebimento" && ehDinheiro(m.forma_pagamento)) delta = v;
    else if (m.tipo === "estorno" && ehDinheiro(m.forma_pagamento)) delta = -v;
    else if (m.tipo === "sangria") delta = -v;
    else if (m.tipo === "despesa" && saiDaGaveta(m.forma_pagamento)) delta = -v;
    if (delta) saldoPorSessao.set(m.sessao_id, (saldoPorSessao.get(m.sessao_id) ?? 0) + delta);
    if (m.tipo === "sangria" && m.created_at) {
      const atual = ultimaPorSessao.get(m.sessao_id);
      if (!atual || Date.parse(m.created_at) > Date.parse(atual)) {
        ultimaPorSessao.set(m.sessao_id, m.created_at);
      }
    }
  }

  const porUsuario = new Map<string, LinhaPreSangria>();
  for (const s of sessoes) {
    if (!abertas.has(s.id)) continue;
    const linha = porUsuario.get(s.user_id) ?? {
      userId: s.user_id,
      nome: s.user_nome?.trim() || "Sem nome",
      especie: 0,
      ultimaSangria: null,
    };
    linha.especie = r2(linha.especie + Math.max(0, saldoPorSessao.get(s.id) ?? 0));
    const corte = ultimaPorSessao.get(s.id) ?? null;
    if (corte && (!linha.ultimaSangria || Date.parse(corte) > Date.parse(linha.ultimaSangria))) {
      linha.ultimaSangria = corte;
    }
    porUsuario.set(s.user_id, linha);
  }

  const linhas = Array.from(porUsuario.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
  return { linhas, total: r2(linhas.reduce((acc, l) => acc + l.especie, 0)) };
}
