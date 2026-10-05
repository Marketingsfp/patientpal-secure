import { normalizar, type RegistroConhecimento } from "./knowledge-contract";
import type { AtendimentoPublicado } from "./catalogo-estrutura";
import { detectarEspecialidades } from "@/lib/nina-especialidade";

export const REGRA_SELECAO_ATENDIMENTO_CONSULTA = `TIPO DE CONSULTA E PERÍODO: preserve atendimento, médico, data e período pedidos ao passar do catálogo à agenda. Consulta comum, revisão/retorno, risco cirúrgico e consulta noturna são atendimentos distintos, mesmo quando pertencem à mesma especialidade ou ao mesmo médico. Não ofereça revisão como consulta comum. Envie à ferramenta de vagas o período informado; consulta noturna não pode ser oferecida pela manhã ou à tarde. Escalas genéricas copiadas entre atendimentos não comprovam que uma consulta noturna ocorra de manhã.
Quando a ferramenta retornar ATENDIMENTO_CONSULTA_PENDENTE, não trate como falta de vaga nem falha operacional: faça somente a pergunta indicada, aguarde a resposta e reconsulte o catálogo pelo título escolhido. Preserve médico e filtros já informados. Se faltar apenas o período para distinguir comum de noturna, pergunte o período. Não escolha uma alternativa por preço ou posição na lista. A escolha do tipo de consulta não autoriza reserva: mantenha escolha da vaga, cadastro e aceite do resumo final.`;

/** Preferência do paciente, sem preço/regra copiados. Revalidada em cada publicação. */
export type PreferenciaAtendimentoConsulta = {
  especialidade: string;
  nome?: string;
  preventivo?: "com" | "sem";
};

export type EscopoAtendimentoConsulta = {
  atendimento: string;
  /** Filtro já interpretado pela ferramenta; não deduz horário de uma escala genérica. */
  periodo?: "madrugada" | "manha" | "tarde" | "noite" | "qualquer" | null;
  /** Referências da pesquisa já identificada, revalidadas na publicação atual. */
  referencias?: Array<{ registro: string; procedimento: string | null }>;
  /** Quando presente, a modalidade pertence ao serviço, nunca à consulta do médico. */
  procedimentoId?: string;
  preferencia?: PreferenciaAtendimentoConsulta | null;
};

export const chaveConsulta = (nome: string) => normalizar(nome)
  .replace(/^consulta\b\s*[—–:-]?\s*/, "").trim();

/** Seleciona blocos publicados, sem misturar regras de outros atendimentos.
 * Um título específico prevalece sobre a especialidade genérica. A pergunta
 * por ginecologia ainda conserva as variantes com/sem preventivo para escolha. */
export function selecionarAtendimentosConsulta(
  itens: AtendimentoPublicado[], escopo: EscopoAtendimentoConsulta,
): AtendimentoPublicado[] {
  const alvo = chaveConsulta(escopo.atendimento);
  const permitidos = itens.filter(i => atendePreferenciaConsulta(i, escopo.preferencia));
  const preventivo = pedidoPreventivo(alvo);
  if (preventivo) {
    const especialidade = alvo.replace(/\b(?:com|sem|o|preventivo)\b/g, " ")
      .replace(/[+—–:-]/g, " ").replace(/\s+/g, " ").trim();
    return permitidos.filter(i => (!especialidade || chaveConsulta(i.especialidade ?? "") === especialidade) &&
      (preventivo === "com" || normalizar(i.especialidade) === "ginecologia") &&
      atendePreferenciaConsulta(i, { especialidade: i.especialidade ?? "", preventivo }));
  }
  const exatos = permitidos.filter(i => [i.atendimento, nomeCompletoConsulta(i)].some(n => chaveConsulta(n) === alvo));
  const familia = permitidos.filter(i => chaveConsulta(i.especialidade ?? "") === alvo);
  const variantesPreventivo = familia.some(i => /\bpreventivo\b/.test(normalizar(i.atendimento)));
  let escolhidos = exatos.length && !variantesPreventivo ? exatos : familia;
  if (!exatos.length && !escopo.preferencia?.nome) {
    // Revisão/retorno e risco cirúrgico são atendimentos próprios. Uma busca
    // genérica pela especialidade não equivale a pedir esses serviços.
    escolhidos = escolhidos.filter(i => !/\b(revisao|retorno|risco cirurgico)\b/.test(normalizar(i.atendimento)));
  }
  const noturna = (i: AtendimentoPublicado) => /\bnoturn[ao]\b/.test(normalizar(i.atendimento));
  if (escopo.periodo === "manha" || escopo.periodo === "tarde") {
    escolhidos = escolhidos.filter(i => !noturna(i));
  } else if (escopo.periodo === "noite" && !exatos.length && !escopo.preferencia?.nome && escolhidos.some(noturna)) {
    escolhidos = escolhidos.filter(noturna);
  }
  // O bloco genérico de escala não é uma segunda consulta. Só o omite quando
  // existe um atendimento específico identificado na mesma publicação.
  return escolhidos.some(i => normalizar(i.atendimento) !== "atendimento")
    ? escolhidos.filter(i => normalizar(i.atendimento) !== "atendimento" || i.modalidade || i.complemento?.modalidade)
    : escolhidos;
}

export function pedidoPreventivo(mensagem: string): "com" | "sem" | null {
  const m = normalizar(mensagem);
  if (!/\bpreventivo\b/.test(m) || /\bcom\b.*\b(?:ou|e)\b.*\bsem\b|\bsem\b.*\b(?:ou|e)\b.*\bcom\b/.test(m)) return null;
  return /\bsem\s+(?:o\s+)?preventivo\b|\bnao\s+(?:quero|desejo|preciso)(?:\s+fazer)?\s+(?:o\s+)?preventivo\b/.test(m) ? "sem" : "com";
}

/** O pacote de consulta não pode ser substituído por uma pesquisa auxiliar
 * do exame isolado. Uma mudança explícita para só o exame continua válida. */
export function pedidoConsultaComPreventivo(mensagem: string): boolean {
  const m = normalizar(mensagem);
  if (pedidoPreventivo(m) !== "com" ||
      /\bnao\s+(?:quero|preciso|desejo)\s+(?:a\s+)?consulta\b/.test(m) ||
      /\b(?:quero|preciso|desejo|fazer)\s+(?:so|apenas|somente)\s+(?:o\s+)?(?:exame|preventivo)\b/.test(m)) return false;
  return /\bconsulta(?:\s+(?:de\s+)?(?:ginecologia|ginecologica))?\s*(?:com|e|\+)\s*(?:o\s+)?preventivo\b/.test(m);
}

export function normalizarPreferenciaAtendimento(v: unknown): PreferenciaAtendimentoConsulta | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (typeof p.especialidade !== "string" || !p.especialidade.trim() || p.especialidade.length > 200) return null;
  const nome = typeof p.nome === "string" ? p.nome.trim().slice(0, 200) : "";
  const preventivo = p.preventivo === "com" || p.preventivo === "sem" ? p.preventivo : undefined;
  return nome || preventivo ? { especialidade: p.especialidade.trim(), ...(nome ? { nome } : {}),
    ...(preventivo ? { preventivo } : {}) } : null;
}

export function atendePreferenciaConsulta(item: AtendimentoPublicado, p?: PreferenciaAtendimentoConsulta | null) {
  if (!p) return true;
  if (normalizar(item.especialidade) !== normalizar(p.especialidade)) return false;
  const nome = normalizar(item.atendimento);
  if (p.preventivo) {
    const inclui = /\bpreventivo\b/.test(nome) && !/\bsem\s+preventivo\b/.test(nome);
    if (inclui !== (p.preventivo === "com")) return false;
  }
  return !p.nome || normalizar(p.nome) === nome;
}

/** Só títulos estruturados e especialidades oficiais identificam a preferência. */
export function atualizarPreferenciaAtendimento(e: {
  mensagem: string; registros: RegistroConhecimento[]; anterior?: PreferenciaAtendimentoConsulta | null;
}): PreferenciaAtendimentoConsulta | null {
  const itens = e.registros.flatMap(r => Array.isArray(r.extras?.atendimentos_publicados)
    ? r.extras.atendimentos_publicados as AtendimentoPublicado[] : []).filter(i => i.especialidade && i.atendimento);
  const m = normalizar(e.mensagem).replace(/\s+/g, " ");
  const especialidadesCitadas = detectarEspecialidades(m, [...new Set(itens.map(i => i.especialidade!))]);
  const anterior = e.anterior && (!especialidadesCitadas.length ||
    especialidadesCitadas.some(s => normalizar(s) === normalizar(e.anterior!.especialidade))) ? e.anterior : null;
  const preventivo = pedidoPreventivo(m);
  if (preventivo) {
    const especialidades = [...new Set(itens.filter(i => /\bpreventivo\b/.test(normalizar(i.atendimento)))
      .map(i => i.especialidade!))];
    const ginecologia = itens.find(i => normalizar(i.especialidade) === "ginecologia")?.especialidade;
    const especialidade = especialidades.length === 1 ? especialidades[0] : anterior?.especialidade ?? ginecologia;
    if (especialidade) return { especialidade, preventivo };
  }
  const citados = itens.filter(i => normalizar(i.atendimento).length > 8 && m.includes(normalizar(i.atendimento)));
  const unicos = [...new Map(citados.map(i => [`${normalizar(i.especialidade)}|${normalizar(i.atendimento)}`, i])).values()];
  if (unicos.length === 1) return { especialidade: unicos[0]!.especialidade!, nome: unicos[0]!.atendimento };
  return anterior;
}

export function nomeCompletoConsulta(item: AtendimentoPublicado): string {
  const especialidade = item.especialidade?.trim();
  return especialidade && !normalizar(item.atendimento).includes(normalizar(especialidade))
    ? `${item.atendimento} — ${especialidade}` : item.atendimento;
}
