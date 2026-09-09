// Relatório de marcações por atendente — regras de apresentação.
//
// A contagem em si é feita no banco (função `rel_marcacoes_por_atendente`,
// entregue em APLICAR-RELATORIO-MARCACOES-POR-ATENDENTE-2026-09-09.sql).
// Aqui ficam só as decisões de como esse resultado vira tabela na tela, no
// Excel e no papel — que precisam ser as mesmas nos três lugares, senão o
// supervisor imprime um número e vê outro na tela.
//
// Vale registrar o que ESTE relatório mede, porque o nome engana: ele conta
// AGENDAMENTOS, um por ficha, creditados a quem fez a marcação mais recente.
// Não é o número de ligações atendidas nem de tentativas — é o resultado que
// ficou gravado na agenda, igual à coluna "USUÁRIO MARCAÇÃO" do sistema
// antigo.

/** Uma linha crua vinda da função do banco. */
export type LinhaMarcacoes = {
  usuario_id: string | null;
  usuario_nome: string | null;
  qtd: number;
};

/** Linha já pronta para a tabela, com o percentual calculado. */
export type LinhaRelatorio = {
  usuarioId: string | null;
  nome: string;
  qtd: number;
  /** Fatia do total, de 0 a 100. */
  percentual: number;
  /**
   * `true` quando a linha não é uma colaboradora: marcações feitas pela
   * integração ("sistema"), sem usuário identificado, ou anteriores ao início
   * da auditoria. Elas entram no total — esconder faria a soma não bater com
   * a Agenda — mas a tela as marca para ninguém ler como produtividade de
   * alguém.
   */
  ehLinhaTecnica: boolean;
};

export type RelatorioMarcacoes = {
  linhas: LinhaRelatorio[];
  total: number;
};

/** Nomes que a função do banco devolve quando não há uma pessoa por trás. */
const NOMES_TECNICOS = new Set(["sistema", "(não identificado)", "(marcado antes do registro)"]);

/**
 * Ordena, calcula percentuais e soma o total.
 *
 * A ordenação é por quantidade decrescente e, no empate, por nome — assim a
 * mesma consulta impressa duas vezes sai na mesma ordem. As linhas técnicas
 * vão para o fim da tabela independentemente da quantidade: o supervisor lê o
 * ranking da equipe de cima para baixo, e uma linha "sistema" no meio do
 * pódio confunde.
 */
export function montarRelatorio(linhas: readonly LinhaMarcacoes[]): RelatorioMarcacoes {
  const total = linhas.reduce((s, l) => s + (l.qtd ?? 0), 0);
  const prontas: LinhaRelatorio[] = linhas.map((l) => {
    const nome = (l.usuario_nome ?? "").trim() || "(não identificado)";
    return {
      usuarioId: l.usuario_id,
      nome,
      qtd: l.qtd ?? 0,
      percentual: total > 0 ? (100 * (l.qtd ?? 0)) / total : 0,
      ehLinhaTecnica: NOMES_TECNICOS.has(nome.toLowerCase()) || NOMES_TECNICOS.has(nome),
    };
  });
  prontas.sort((a, b) => {
    if (a.ehLinhaTecnica !== b.ehLinhaTecnica) return a.ehLinhaTecnica ? 1 : -1;
    if (b.qtd !== a.qtd) return b.qtd - a.qtd;
    return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  });
  return { linhas: prontas, total };
}

/** Percentual no formato do relatório: uma casa decimal e vírgula. */
export function formatarPercentual(p: number): string {
  return `${p.toFixed(1).replace(".", ",")}%`;
}

/** Data AAAA-MM-DD em DD/MM/AAAA; devolve "" para vazio. */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

export type FiltrosRelatorio = {
  atendIni: string;
  atendFim: string;
  marcIni: string;
  marcFim: string;
  /** Rótulo já legível da situação ("Todas", "Atendidos"…). */
  situacaoRotulo: string;
  /** Nome do profissional, ou vazio para todos. */
  medicoNome?: string | null;
  /** Nome da especialidade, ou vazio para todas. */
  especialidadeNome?: string | null;
};

/**
 * Descreve os filtros em uma linha de texto, para o cabeçalho da planilha e
 * do papel. Sem isso, uma folha impressa vira um número sem contexto — e é
 * exatamente essa folha que circula na reunião de supervisão.
 */
export function descreverFiltros(f: FiltrosRelatorio): string[] {
  const partes: string[] = [];
  const atend =
    f.atendIni || f.atendFim
      ? `${dataBR(f.atendIni) || "início"} a ${dataBR(f.atendFim) || "hoje"}`
      : "todo o período";
  partes.push(`Atendimento: ${atend}`);
  if (f.marcIni || f.marcFim) {
    partes.push(`Marcação: ${dataBR(f.marcIni) || "início"} a ${dataBR(f.marcFim) || "hoje"}`);
  }
  partes.push(`Situação: ${f.situacaoRotulo}`);
  partes.push(`Profissional: ${f.medicoNome?.trim() || "Todos"}`);
  partes.push(`Especialidade: ${f.especialidadeNome?.trim() || "Todas"}`);
  return partes;
}

/** Situações da ficha, na ordem em que aparecem no seletor da tela. */
export const SITUACOES: { valor: string; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todas" },
  { valor: "agendado", rotulo: "Agendados" },
  { valor: "confirmado", rotulo: "Confirmados / presentes" },
  { valor: "em_atendimento", rotulo: "Em atendimento" },
  { valor: "realizado", rotulo: "Atendidos" },
  { valor: "cancelado", rotulo: "Cancelados" },
  { valor: "faltou", rotulo: "Faltas" },
];

export function rotuloSituacao(valor: string): string {
  return SITUACOES.find((s) => s.valor === valor)?.rotulo ?? "Todas";
}
