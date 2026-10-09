// Relatório "Agendamentos por usuário" — regras de apresentação.
//
// A contagem é feita no banco (função `rel_agendamentos_por_usuario`, em
// supabase/migrations/20261007150000_rel_agendamentos_por_usuario.sql), a
// partir da auditoria e pela DATA DA AÇÃO. Aqui fica só como o resultado vira
// tabela — igual na tela, no Excel e no papel.
//
// Diferença para "Marcações por atendente": aquele conta um agendamento por
// ficha, pela data do ATENDIMENTO, e o total bate com a Agenda. Este conta
// AÇÕES (marcar, confirmar, cancelar, remarcar) feitas no período — uma mesma
// ficha pode aparecer em mais de uma coluna e em mais de um usuário.

/** Linha crua vinda da função do banco. */
export type LinhaAgendamentosUsuario = {
  usuario_id: string | null;
  usuario_nome: string | null;
  marcados: number;
  confirmados: number;
  cancelados: number;
  remarcados: number;
};

export type LinhaProdutividade = {
  usuarioId: string | null;
  nome: string;
  marcados: number;
  confirmados: number;
  cancelados: number;
  remarcados: number;
  total: number;
  /** Ações sem usuário logado (Nina, totem, integrações): linha "Sistema". */
  ehSistema: boolean;
};

export type TotaisProdutividade = Omit<LinhaProdutividade, "usuarioId" | "nome" | "ehSistema">;

export type RelatorioProdutividade = {
  linhas: LinhaProdutividade[];
  totais: TotaisProdutividade;
};

/** Chave de filtro da linha "Sistema", que não tem `usuario_id`. */
export const USUARIO_SISTEMA = "__sistema__";

export function chaveUsuario(l: Pick<LinhaProdutividade, "usuarioId">): string {
  return l.usuarioId ?? USUARIO_SISTEMA;
}

const n = (v: unknown): number => Number(v ?? 0) || 0;

/**
 * Ordena (maior total primeiro, empate pelo nome; "Sistema" sempre no fim) e
 * soma os totais. Com `usuario` diferente de "todos", mantém só aquela linha.
 */
export function montarRelatorioProdutividade(
  cruas: readonly LinhaAgendamentosUsuario[],
  usuario = "todos",
): RelatorioProdutividade {
  const linhas: LinhaProdutividade[] = cruas.map((c) => {
    const marcados = n(c.marcados);
    const confirmados = n(c.confirmados);
    const cancelados = n(c.cancelados);
    const remarcados = n(c.remarcados);
    return {
      usuarioId: c.usuario_id,
      nome: (c.usuario_nome ?? "").trim() || "Sistema",
      marcados,
      confirmados,
      cancelados,
      remarcados,
      total: marcados + confirmados + cancelados + remarcados,
      ehSistema: c.usuario_id === null,
    };
  });
  const filtradas =
    usuario === "todos" ? linhas : linhas.filter((l) => chaveUsuario(l) === usuario);
  filtradas.sort((a, b) => {
    if (a.ehSistema !== b.ehSistema) return a.ehSistema ? 1 : -1;
    if (b.total !== a.total) return b.total - a.total;
    return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  });
  const totais = filtradas.reduce<TotaisProdutividade>(
    (t, l) => ({
      marcados: t.marcados + l.marcados,
      confirmados: t.confirmados + l.confirmados,
      cancelados: t.cancelados + l.cancelados,
      remarcados: t.remarcados + l.remarcados,
      total: t.total + l.total,
    }),
    { marcados: 0, confirmados: 0, cancelados: 0, remarcados: 0, total: 0 },
  );
  return { linhas: filtradas, totais };
}

/** Colunas numéricas, na ordem da tela, da planilha e do papel. */
export const COLUNAS_PRODUTIVIDADE: { chave: keyof TotaisProdutividade; rotulo: string }[] = [
  { chave: "marcados", rotulo: "Marcados" },
  { chave: "confirmados", rotulo: "Confirmados" },
  { chave: "cancelados", rotulo: "Cancelados" },
  { chave: "remarcados", rotulo: "Remarcados" },
  { chave: "total", rotulo: "Total de ações" },
];

// ── Dia a dia ───────────────────────────────────────────────────────────────
// Função `rel_agendamentos_por_usuario_dia` (migração 20261007180000): mesma
// contagem, quebrada pelo dia da ação. Somando os dias de um usuário dá o
// número do período inteiro.

/** Linha crua: um usuário num dia (`dia` em AAAA-MM-DD). */
export type LinhaAgendamentosUsuarioDia = LinhaAgendamentosUsuario & { dia: string };

export type DiaProdutividade = TotaisProdutividade & { dia: string };

export type LinhaProdutividadeComDias = LinhaProdutividade & { dias: DiaProdutividade[] };

export type RelatorioProdutividadeDiario = {
  linhas: LinhaProdutividadeComDias[];
  totais: TotaisProdutividade;
};

/**
 * Agrupa as linhas por usuário (ordem, filtro e totais iguais aos de
 * `montarRelatorioProdutividade`) e pendura em cada um os seus dias, do mais
 * antigo para o mais recente.
 */
export function montarRelatorioPorDia(
  cruas: readonly LinhaAgendamentosUsuarioDia[],
  usuario = "todos",
): RelatorioProdutividadeDiario {
  const somadas = new Map<string, LinhaAgendamentosUsuario>();
  const dias = new Map<string, DiaProdutividade[]>();
  for (const c of cruas) {
    const chave = c.usuario_id ?? USUARIO_SISTEMA;
    const s = somadas.get(chave) ?? {
      usuario_id: c.usuario_id,
      usuario_nome: null,
      marcados: 0,
      confirmados: 0,
      cancelados: 0,
      remarcados: 0,
    };
    const dia: DiaProdutividade = {
      dia: c.dia,
      marcados: n(c.marcados),
      confirmados: n(c.confirmados),
      cancelados: n(c.cancelados),
      remarcados: n(c.remarcados),
      total: 0,
    };
    dia.total = dia.marcados + dia.confirmados + dia.cancelados + dia.remarcados;
    s.usuario_nome = s.usuario_nome?.trim() ? s.usuario_nome : c.usuario_nome;
    s.marcados += dia.marcados;
    s.confirmados += dia.confirmados;
    s.cancelados += dia.cancelados;
    s.remarcados += dia.remarcados;
    somadas.set(chave, s);
    dias.set(chave, [...(dias.get(chave) ?? []), dia]);
  }
  const base = montarRelatorioProdutividade([...somadas.values()], usuario);
  return {
    totais: base.totais,
    linhas: base.linhas.map((l) => ({
      ...l,
      dias: [...(dias.get(chaveUsuario(l)) ?? [])].sort((a, b) => a.dia.localeCompare(b.dia)),
    })),
  };
}

// ── Lista do dia ────────────────────────────────────────────────────────────
// Função `rel_agendamentos_por_usuario_lista`: as ações de um usuário num dia.

export type TipoAcaoAgenda = "marcado" | "confirmado" | "cancelado" | "remarcado";

export type AcaoAgenda = {
  agendamento_id: string | null;
  /** Quando a ação foi feita. */
  feito_em: string;
  tipo: TipoAcaoAgenda;
  paciente_nome: string | null;
  /** Data e hora do atendimento marcado. */
  inicio: string | null;
  medico_nome: string | null;
  procedimento: string | null;
};

export const ROTULO_ACAO: Record<TipoAcaoAgenda, string> = {
  marcado: "Marcado",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  remarcado: "Remarcado",
};

const FUSO = "America/Sao_Paulo";

/** "14:32" no horário de Brasília. */
export function horaBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
}

/** "07/10/2026 14:30" no horário de Brasília. */
export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const data = d.toLocaleDateString("pt-BR", { timeZone: FUSO });
  return `${data} ${horaBR(iso)}`;
}
