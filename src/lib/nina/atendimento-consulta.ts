import { normalizar, type RegistroConhecimento } from "./knowledge-contract";
import type { AtendimentoPublicado } from "./catalogo-estrutura";
import { detectarEspecialidades } from "@/lib/nina-especialidade";

/** Preferência do paciente, sem preço/regra copiados. Revalidada em cada publicação. */
export type PreferenciaAtendimentoConsulta = {
  especialidade: string;
  nome?: string;
  preventivo?: "com" | "sem";
};

export type EscopoAtendimentoConsulta = {
  atendimento: string;
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
  const escolhidos = exatos.length && !variantesPreventivo ? exatos : familia;
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
