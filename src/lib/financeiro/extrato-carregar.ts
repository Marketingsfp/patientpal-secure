/**
 * Carrega as movimentações do período para o relatório "Movimentação
 * Financeira" (Financeiro → Relatórios).
 *
 * Este arquivo é só o acesso ao banco. Toda a regra — quem é o favorecido, qual
 * é a categoria, o que soma como entrada e o que soma como saída — mora em
 * `./extrato-caixa`, que é puro e coberto por teste.
 *
 * O relatório junta DUAS origens, porque o caixa geral da clínica é a soma das
 * duas e conferir só uma nunca fecha:
 *
 *   - `fin_lancamentos` — receitas (paciente pagando) e despesas (fornecedor,
 *     repasse médico, boleto, compra).
 *   - `caixa_movimentos` — sangrias e suprimentos, o dinheiro físico saindo da
 *     gaveta da recepção para o financeiro e voltando. Não são receita nem
 *     despesa, mas passam pelo caixa e aparecem no extrato como transferência.
 *
 * Lançamento cancelado fica fora: ele não é dinheiro, e somá-lo faria o total
 * do relatório não bater com o extrato do banco.
 */
import { supabase } from "@/integrations/supabase/client";
import { carregarCategorias, mapaDeCategorias } from "./categorias-carregar";
import { classificarForma, LABEL_FORMA } from "./formas-pagamento";
import { ehLancamentoRetroativo, mapaDaGaveta, TIPOS_QUE_PESAM_NA_GAVETA } from "./retroativos";
import type { MovimentacaoExtrato } from "./extrato-caixa";

/** Linhas por página nas consultas paginadas (limite do PostgREST). */
const PAGINA = 1000;

/**
 * Teto de páginas por consulta — 20 mil linhas.
 *
 * A clínica passa de 900 mil lançamentos no histórico, e um período largo
 * escolhido por engano (um ano inteiro) baixaria tudo isso para o navegador.
 * O mesmo teto vale na tela de Mov. Caixa, pelo mesmo motivo.
 */
const MAX_PAGINAS = 20;

/** Nomes buscados em lotes: a lista de ids viaja na URL da consulta. */
const LOTE_IDS = 300;

async function buscarTudo<T>(montar: () => { range: (de: number, ate: number) => unknown }) {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = (await montar().range(p * PAGINA, (p + 1) * PAGINA - 1)) as {
      data: T[] | null;
      error: { message: string } | null;
    };
    if (error) throw error;
    const lote = data ?? [];
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

/** `2026-08-19` deslocado em N dias. Meio-dia UTC para não tropeçar em fuso. */
function diaDeslocado(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** HH:MM local a partir de um timestamp do banco (que vem em UTC). */
function horaLocal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Resolve id → nome numa tabela qualquer, em lotes. */
async function nomesPorId(
  tabela: "pacientes" | "medicos" | "profiles",
  ids: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unicos.length; i += LOTE_IDS) {
    const { data, error } = await supabase
      .from(tabela)
      .select("id, nome")
      .in("id", unicos.slice(i, i + LOTE_IDS));
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ id: string; nome: string | null }>) {
      if (r.nome) mapa.set(r.id, r.nome);
    }
  }
  return mapa;
}

type LancamentoBruto = {
  id: string;
  tipo: "receita" | "despesa" | "transferencia";
  descricao: string | null;
  valor: number | string;
  data: string;
  status: string;
  categoria_id: string | null;
  conta_id: string | null;
  forma_pagamento: string | null;
  observacoes: string | null;
  criado_por: string | null;
  medico_id: string | null;
  paciente_id: string | null;
  agendamento_id: string | null;
  created_at: string | null;
};

type MovimentoBruto = {
  id: string;
  tipo: "sangria" | "suprimento";
  valor: number | string;
  descricao: string | null;
  forma_pagamento: string | null;
  user_id: string | null;
  created_at: string;
  destino_nome: string | null;
};

/**
 * Todas as movimentações do período, já com nomes resolvidos e prontas para
 * `linhasExtrato`.
 */
export async function carregarMovimentacao(params: {
  clinicaId: string;
  de: string;
  ate: string;
}): Promise<MovimentacaoExtrato[]> {
  const { clinicaId, de, ate } = params;

  const [lancamentos, sangrias, categorias, contas] = await Promise.all([
    buscarTudo<LancamentoBruto>(() =>
      supabase
        .from("fin_lancamentos")
        .select(
          "id, tipo, descricao, valor, data, status, categoria_id, conta_id, forma_pagamento, observacoes, criado_por, medico_id, paciente_id, agendamento_id, created_at",
        )
        .eq("clinica_id", clinicaId)
        .neq("status", "cancelado")
        .gte("data", de)
        .lte("data", ate)
        .order("data"),
    ),
    // Sangria e suprimento não têm competência própria: o recorte delas é o
    // `created_at`, porque o dinheiro físico se move na hora em que a
    // atendente entrega o envelope.
    buscarTudo<MovimentoBruto>(() =>
      supabase
        .from("caixa_movimentos")
        .select("id, tipo, valor, descricao, forma_pagamento, user_id, created_at, destino_nome")
        .eq("clinica_id", clinicaId)
        .in("tipo", ["sangria", "suprimento"])
        .gte("created_at", `${de}T00:00:00`)
        .lte("created_at", `${ate}T23:59:59`)
        .order("created_at"),
    ),
    // Mesmo cadastro que alimenta o seletor de Categoria da tela de Relatórios
    // — ver `./categorias-carregar`.
    carregarCategorias(clinicaId),
    supabase.from("fin_contas").select("id, nome, banco").eq("clinica_id", clinicaId),
  ]);

  if (contas.error) throw contas.error;

  const catMap = mapaDeCategorias(categorias);
  const contaMap = new Map(
    ((contas.data ?? []) as Array<{ id: string; nome: string; banco: string | null }>).map((c) => [
      c.id,
      c,
    ]),
  );

  // Ficha e paciente do agendamento vinculado. O paciente daqui é a única via
  // para a coluna Favorecido nas receitas de atendimento: conferido em
  // produção, só 14% delas têm `paciente_id` gravado no próprio lançamento —
  // nas outras o nome existe apenas dentro do texto da descrição.
  const agIds = Array.from(
    new Set(lancamentos.map((l) => l.agendamento_id).filter((x): x is string => !!x)),
  );
  const fichaMap = new Map<string, number | null>();
  const agPacienteMap = new Map<string, string | null>();
  for (let i = 0; i < agIds.length; i += LOTE_IDS) {
    const { data, error } = await supabase
      .from("agendamentos")
      .select("id, ficha_numero, paciente_id")
      .in("id", agIds.slice(i, i + LOTE_IDS));
    if (error) throw error;
    for (const a of (data ?? []) as Array<{
      id: string;
      ficha_numero: number | null;
      paciente_id: string | null;
    }>) {
      fichaMap.set(a.id, a.ficha_numero);
      agPacienteMap.set(a.id, a.paciente_id);
    }
  }

  const pacienteIdDe = (l: LancamentoBruto): string | null =>
    l.paciente_id ?? (l.agendamento_id ? (agPacienteMap.get(l.agendamento_id) ?? null) : null);

  const [pacMap, medMap, userMap] = await Promise.all([
    nomesPorId(
      "pacientes",
      lancamentos.map(pacienteIdDe).filter((x): x is string => !!x),
    ),
    nomesPorId(
      "medicos",
      lancamentos.map((l) => l.medico_id).filter((x): x is string => !!x),
    ),
    nomesPorId("profiles", [
      ...lancamentos.map((l) => l.criado_por).filter((x): x is string => !!x),
      ...sangrias.map((s) => s.user_id).filter((x): x is string => !!x),
    ]),
  ]);

  // Marca de ajuste retroativo: competência de um dia, digitação de outro, sem
  // dinheiro na gaveta daquele dia. É o que explica, na conferência, um valor
  // com data antiga que não estava no cupom impresso. A janela de um dia em
  // volta do período cobre a sessão de caixa aberta na virada.
  const iniJanela = `${diaDeslocado(de, -1)}T00:00:00`;
  const fimJanela = `${diaDeslocado(ate, 1)}T23:59:59`;
  const [movsGaveta, sessoes] = await Promise.all([
    buscarTudo<{ lancamento_id: string | null; tipo: string; sessao_id: string }>(() =>
      supabase
        .from("caixa_movimentos")
        .select("lancamento_id, tipo, sessao_id")
        .eq("clinica_id", clinicaId)
        .in("tipo", [...TIPOS_QUE_PESAM_NA_GAVETA])
        .not("lancamento_id", "is", null)
        .gte("created_at", iniJanela)
        .lte("created_at", fimJanela),
    ),
    buscarTudo<{ id: string; aberto_em: string; fechado_em: string | null }>(() =>
      supabase
        .from("caixa_sessoes")
        .select("id, aberto_em, fechado_em")
        .eq("clinica_id", clinicaId)
        .gte("aberto_em", iniJanela)
        .lte("aberto_em", fimJanela),
    ),
  ]);
  const gaveta = mapaDaGaveta(movsGaveta, sessoes);

  const saida: MovimentacaoExtrato[] = lancamentos.map((l) => {
    const conta = l.conta_id ? contaMap.get(l.conta_id) : undefined;
    const pacId = pacienteIdDe(l);
    return {
      data: l.data,
      hora: horaLocal(l.created_at),
      tipo: l.tipo,
      descricao: l.descricao ?? "",
      valor: Number(l.valor) || 0,
      categoriaNome: l.categoria_id ? (catMap.get(l.categoria_id) ?? null) : null,
      contaNome: conta?.nome ?? null,
      contaBanco: conta?.banco ?? null,
      // O rótulo canônico é o mesmo que a tela de Mov. Caixa mostra, para que
      // "Recebido em PIX" queira dizer a mesma coisa nas duas telas.
      formaPagamento: LABEL_FORMA[classificarForma(l.forma_pagamento)],
      formaCanonica: classificarForma(l.forma_pagamento),
      observacoes: l.observacoes,
      pacienteNome: pacId ? (pacMap.get(pacId) ?? null) : null,
      medicoNome: l.medico_id ? (medMap.get(l.medico_id) ?? null) : null,
      usuarioNome: l.criado_por ? (userMap.get(l.criado_por) ?? null) : null,
      fichaNumero: l.agendamento_id ? (fichaMap.get(l.agendamento_id) ?? null) : null,
      status: l.status,
      retroativo: ehLancamentoRetroativo(
        { data: l.data, created_at: l.created_at, origem: "fin" },
        gaveta.get(l.id) ?? null,
      ),
    };
  });

  for (const m of sangrias) {
    const base = m.tipo === "sangria" ? "Sangria" : "Suprimento";
    const label = m.tipo === "sangria" ? "Entregue a" : "Recebido de";
    const partes = [base];
    if (m.descricao?.trim()) partes.push(m.descricao.trim());
    if (m.destino_nome?.trim()) partes.push(`${label}: ${m.destino_nome.trim()}`);
    saida.push({
      // `created_at` é UTC: fatiar sem converter joga a sangria das 21h para o
      // dia seguinte e a da manhã para o anterior.
      data: new Date(m.created_at).toLocaleDateString("en-CA"),
      hora: horaLocal(m.created_at),
      tipo: "transferencia",
      transferSentido: m.tipo === "sangria" ? "saida" : "entrada",
      descricao: partes.join(" — "),
      valor: Number(m.valor) || 0,
      formaPagamento: LABEL_FORMA[classificarForma(m.forma_pagamento ?? "dinheiro")],
      formaCanonica: classificarForma(m.forma_pagamento ?? "dinheiro"),
      usuarioNome: m.user_id ? (userMap.get(m.user_id) ?? null) : null,
      status: "confirmado",
    });
  }

  return saida;
}
