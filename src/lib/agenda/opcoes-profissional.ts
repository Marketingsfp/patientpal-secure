/**
 * Opções do seletor "PROFISSIONAL" — fonte única para a tela de Agenda e para
 * o Movimento de Caixa (Financeiro).
 *
 * Regra do rótulo (a mesma que o balcão já vê na Agenda):
 * - profissional com UMA agenda ativa que gera horário → nome limpo;
 * - profissional com MAIS DE UMA → uma entrada por agenda, escrita
 *   `NOME — AGENDA`.
 *
 * O nome da agenda serve apenas para separar as entradas. Ele NUNCA decide se
 * um atendimento é consulta ou exame: isso vem do tipo do serviço cadastrado.
 */

export const normalizarProfissional = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Chave de comparação do nome de uma agenda (sem acento, caixa ou espaço duplo). */
export const chaveNomeAgenda = (s: string) =>
  normalizarProfissional(s)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type OpcaoProfissional = {
  /** Identificador da entrada na lista (médico, ou médico + agenda). */
  key: string;
  /** Id do médico (ou "todos"). */
  medicoId: string;
  /** Filtro de agenda: "todos" ou `nome:<chave>`. */
  agendaFiltro: string;
  /** Rótulo exibido na lista e escrito no campo ao escolher. */
  rotulo: string;
  /** Texto normalizado usado na busca por digitação. */
  busca: string;
};

export type MedicoOpcao = { id: string; nome: string };
export type AgendaOpcao = { id: string; nome: string };

/**
 * Numera cadastros ativos homônimos ("(cadastro 1)", "(cadastro 2)") para que
 * duas linhas idênticas não fiquem indistinguíveis no seletor.
 */
export function rotulosDeMedicos(lista: MedicoOpcao[]): Map<string, string> {
  const contagem = new Map<string, number>();
  for (const m of lista) {
    const k = normalizarProfissional(m.nome);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  const vistos = new Map<string, number>();
  const map = new Map<string, string>();
  for (const m of lista) {
    const k = normalizarProfissional(m.nome);
    if ((contagem.get(k) ?? 0) < 2) {
      map.set(m.id, m.nome);
      continue;
    }
    const n = (vistos.get(k) ?? 0) + 1;
    vistos.set(k, n);
    map.set(m.id, `${m.nome} (cadastro ${n})`);
  }
  return map;
}

/** Ordena recursos de enfermagem ("🩺 ...") primeiro, depois nome. */
export function ordenarProfissionais(medicos: MedicoOpcao[]): MedicoOpcao[] {
  const isRec = (n: string) => n.startsWith("🩺");
  return [...medicos].sort((a, b) => {
    const ra = isRec(a.nome) ? 0 : 1;
    const rb = isRec(b.nome) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export function montarOpcoesProfissional(params: {
  medicos: MedicoOpcao[];
  agendasPorMedico: Map<string, AgendaOpcao[]>;
  /** Agendas que geram horário; sobras de importação ficam de fora. */
  agendasComGrade: Set<string>;
  /** Linha "TODOS OS PROFISSIONAIS" no topo. */
  incluirTodos?: boolean;
  onlyMedicoId?: string | null;
}): { opcoes: OpcaoProfissional[]; rotuloMedico: Map<string, string> } {
  const { medicos, agendasPorMedico, agendasComGrade, incluirTodos, onlyMedicoId } = params;
  const lista = ordenarProfissionais(
    medicos.filter((m) => !onlyMedicoId || m.id === onlyMedicoId),
  );
  const rotuloMedico = rotulosDeMedicos(lista);
  const out: OpcaoProfissional[] = [];
  if (incluirTodos && !onlyMedicoId) {
    out.push({
      key: "todos",
      medicoId: "todos",
      agendaFiltro: "todos",
      rotulo: "TODOS OS PROFISSIONAIS",
      busca: normalizarProfissional("TODOS OS PROFISSIONAIS"),
    });
  }
  for (const m of lista) {
    const base = rotuloMedico.get(m.id) ?? m.nome;
    // Agendas de mesmo nome viram uma linha só: o filtro por agenda trabalha
    // por nome, então duas linhas iguais fariam exatamente a mesma coisa.
    const agendas: { chave: string; nome: string }[] = [];
    const vistas = new Set<string>();
    for (const a of agendasPorMedico.get(m.id) ?? []) {
      if (!agendasComGrade.has(a.id)) continue;
      const chave = chaveNomeAgenda(a.nome ?? "");
      if (!chave || vistas.has(chave)) continue;
      vistas.add(chave);
      agendas.push({ chave, nome: (a.nome ?? "").trim() });
    }
    if (agendas.length < 2) {
      out.push({
        key: m.id,
        medicoId: m.id,
        agendaFiltro: "todos",
        rotulo: base,
        busca: normalizarProfissional(base),
      });
      continue;
    }
    for (const a of agendas) {
      out.push({
        key: `${m.id}|${a.chave}`,
        medicoId: m.id,
        agendaFiltro: `nome:${a.chave}`,
        rotulo: `${base} — ${a.nome}`,
        busca: normalizarProfissional(`${base} ${a.nome}`),
      });
    }
  }
  return { opcoes: out, rotuloMedico };
}

/**
 * Rótulo `NOME — AGENDA` de um lançamento/atendimento, usando as MESMAS
 * opções do seletor. Sem agenda correspondente (ou profissional com agenda
 * única), devolve o nome limpo.
 */
export function rotuloProfissionalAgenda(
  opcoes: OpcaoProfissional[],
  rotuloMedico: Map<string, string>,
  medicoId: string | null | undefined,
  agendaNome: string | null | undefined,
): string | null {
  if (!medicoId) return null;
  const chave = chaveNomeAgenda(agendaNome ?? "");
  if (chave) {
    const exata = opcoes.find(
      (o) => o.medicoId === medicoId && o.agendaFiltro === `nome:${chave}`,
    );
    if (exata) return exata.rotulo;
  }
  const simples = opcoes.find((o) => o.medicoId === medicoId && o.agendaFiltro === "todos");
  return simples?.rotulo ?? rotuloMedico.get(medicoId) ?? null;
}
