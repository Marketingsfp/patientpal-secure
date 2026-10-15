/**
 * Segunda tentativa de achar o paciente quando o nome lido do pedido manuscrito não bate
 * com nenhum cadastro (ex.: "QUAIDIMA" lido onde está escrito "QUEDIMA").
 *
 * Regras puras, sem rede: quem chama busca no cadastro por cada palavra do nome lido e passa
 * os candidatos aqui, que devolve só os parecidos, do mais para o menos parecido. Nunca é
 * escolha automática — a recepção confirma qual é o paciente.
 */
import { normalizarBusca } from "@/lib/busca/relevancia";

/** "de", "da", "dos", "e"… não ajudam a distinguir pessoas. */
const PARTICULAS = new Set(["de", "da", "das", "do", "dos", "e", "d"]);

/** Palavras do nome, sem acento, em minúsculas e sem partículas. "S." vira "s.". */
function palavras(nome: string): string[] {
  return normalizarBusca(nome)
    .replace(/[^a-z.]+/g, " ")
    .replace(/\.+/g, ". ")
    .split(/\s+/)
    .filter((p) => p !== "" && p !== "." && !PARTICULAS.has(p.replace(".", "")));
}

/**
 * Chave fonética simples do português: grafias que soam igual ficam iguais
 * (QU/K/C duro, Ç/SS/Z/S, CH/X, PH/F, Y/I, W/V, H mudo, letras dobradas).
 */
export function chaveFonetica(palavra: string): string {
  return palavra
    .replace(/ph/g, "f")
    .replace(/ch/g, "x")
    .replace(/lh/g, "li")
    .replace(/nh/g, "ni")
    .replace(/h/g, "")
    .replace(/q[u]?(?=[ei])/g, "k")
    .replace(/qu?/g, "k")
    .replace(/c(?=[ei])/g, "s")
    .replace(/c/g, "k")
    .replace(/g(?=[ei])/g, "j")
    .replace(/[zç]/g, "s")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/n$/g, "m")
    .replace(/(.)\1+/g, "$1");
}

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    anterior = atual;
  }
  return anterior[b.length];
}

/** 0 a 1: o quanto a palavra lida parece com a palavra do cadastro. */
function semelhancaPalavra(lida: string, cadastro: string): number {
  if (lida.endsWith(".")) {
    // Sobrenome abreviado no pedido ("S."): vale se o cadastro tem palavra com a inicial.
    return cadastro.startsWith(lida.slice(0, -1)) ? 0.9 : 0;
  }
  if (lida === cadastro) return 1;
  const a = chaveFonetica(lida);
  const b = chaveFonetica(cadastro);
  if (a === b) return 0.95;
  const maior = Math.max(a.length, b.length);
  return maior === 0 ? 0 : 1 - distancia(a, b) / maior;
}

/** Primeiro nome lido precisa lembrar o primeiro nome do cadastro pelo menos assim. */
const MINIMO_PRIMEIRO_NOME = 0.6;
/** Média das palavras lidas (cada uma com a palavra mais parecida do cadastro). */
const MINIMO_GERAL = 0.75;

/** 0 a 1: o quanto o nome lido parece com o nome do cadastro (0 = não serve). */
export function semelhancaNome(nomeLido: string, nomeCadastro: string): number {
  const lidas = palavras(nomeLido);
  const cadastro = palavras(nomeCadastro);
  if (lidas.length === 0 || cadastro.length === 0) return 0;
  if (semelhancaPalavra(lidas[0], cadastro[0]) < MINIMO_PRIMEIRO_NOME) return 0;
  const total = lidas.reduce(
    (s, l) => s + Math.max(...cadastro.map((c) => semelhancaPalavra(l, c))),
    0,
  );
  const media = total / lidas.length;
  return media >= MINIMO_GERAL ? media : 0;
}

/**
 * Palavras do nome lido usadas para buscar candidatos no cadastro: as mais longas primeiro
 * (sobrenome raro filtra mais), sem partículas nem abreviações.
 */
export function termosParaBuscaParecida(nomeLido: string, maximo = 4): string[] {
  const unicas = [...new Set(palavras(nomeLido).filter((p) => !p.endsWith(".") && p.length >= 4))];
  return unicas.sort((a, b) => b.length - a.length).slice(0, maximo);
}

/** Candidatos com nome parecido com o lido, do mais para o menos parecido. */
export function pacientesComNomeParecido<T extends { id: string; nome: string | null }>(
  nomeLido: string,
  candidatos: readonly T[],
  limite = 5,
): T[] {
  const vistos = new Set<string>();
  return candidatos
    .filter((c) => !vistos.has(c.id) && vistos.add(c.id))
    .map((c) => ({ c, nota: semelhancaNome(nomeLido, c.nome ?? "") }))
    .filter((x) => x.nota > 0)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, limite)
    .map((x) => x.c);
}
