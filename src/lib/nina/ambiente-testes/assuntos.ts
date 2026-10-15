/**
 * Ambiente de testes da Nina — assuntos sorteados do catálogo publicado.
 *
 * Consulta: especialidades de profissionais publicados com escala.
 * Exame: exames e procedimentos publicados com preço.
 * Livre: o próprio paciente escolhe (modo "fora do comum").
 *
 * Módulo puro: sem banco e sem rede. O sorteio recebe a função aleatória para
 * poder ser testado.
 */
import type { TipoAssunto } from "./modos";

export type CatalogoAssuntos = { consultas: string[]; exames: string[] };

const ASSUNTO_LIVRE =
  "algo que talvez a clínica não ofereça (escolha você: uma especialidade rara, um procedimento estético ou atendimento em casa)";

/** Nomes sem repetição e sem itens que não fazem sentido para um paciente. */
export function limparNomes(nomes: readonly string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bruto of nomes) {
    const nome = String(bruto ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (nome.length < 3 || nome.length > 80) continue;
    if (/\b(?:teste|interno|nao usar|não usar|inativo)\b/i.test(nome)) continue;
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(nome);
  }
  return saida;
}

/**
 * Um assunto por modo, sem repetir dentro da rodada quando há opções
 * suficientes. Consulta vira "consulta de <especialidade>".
 */
export function sortearAssuntos(
  tipos: readonly TipoAssunto[],
  catalogo: CatalogoAssuntos,
  aleatorio: () => number = Math.random,
): string[] {
  const restantes = {
    consulta: limparNomes(catalogo.consultas),
    exame: limparNomes(catalogo.exames),
  };
  const usados = new Set<string>();
  return tipos.map((tipo) => {
    if (tipo === "livre") return ASSUNTO_LIVRE;
    const lista = restantes[tipo].length ? restantes[tipo] : restantes.consulta;
    if (!lista.length) return ASSUNTO_LIVRE;
    const livres = lista.filter((n) => !usados.has(n));
    const opcoes = livres.length ? livres : lista;
    const nome = opcoes[Math.floor(aleatorio() * opcoes.length) % opcoes.length]!;
    usados.add(nome);
    return tipo === "consulta" && restantes.consulta.includes(nome)
      ? `consulta de ${nome.toLowerCase()}`
      : nome;
  });
}
