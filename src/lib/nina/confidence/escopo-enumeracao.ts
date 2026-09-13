/** Liga uma lista de horários ao profissional explicitamente apresentado no texto. */
import { normalizarTexto } from "./evidencia";

export type EscopoEnumeracaoMedica = {
  medicoNome?: string;
  indeterminado?: string;
};

function nomesExplicitos(texto: string): string[] {
  const nomes = [
    ...texto
      .replace(/[*_]/g, "")
      .matchAll(
        /\b(?:(?:[Dd][Rr][Aa]?|[Dd]outor(?:a)?|DRA?|DOUTORA?)\.?[ \t]+|[Pp]rofissional:[ \t]*)([A-ZÀ-Ú][\p{L}'’-]+(?:[ \t]+(?:(?:de|da|do|das|dos)[ \t]+)?[A-ZÀ-Ú][\p{L}'’-]+)*)/gu,
      ),
  ]
    .map((m) => m[1]!.trim())
    .filter((nome) => nome.length <= 160);
  return [...new Map(nomes.map((nome) => [normalizarTexto(nome), nome])).values()];
}

const PRONOME_SINGULAR =
  /\b(?:dele|dela|desse\s+(?:medico|profissional)|dessa\s+(?:medica|profissional)|deste\s+(?:medico|profissional)|desta\s+(?:medica|profissional)|ele\s+atende|ela\s+atende)\b/;
const REFERENCIA_PLURAL =
  /\b(?:deles|delas|ambos|ambas|drs|dras|doutores|doutoras|dos\s+(?:medicos|profissionais)|das\s+(?:medicas|profissionais))\b/;
const NOME_APRESENTADO = /\b(?:(?:dra?|doutora?)\.?\s+|profissional:\s*)\p{L}/u;
const LINHA_DE_ESCALA =
  /^\s*(?:(?:[-•]|\d+[.)])\s*)?(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)s?\b/;

function antecedenteUnico(texto: string): EscopoEnumeracaoMedica {
  const nomes = nomesExplicitos(texto);
  // Uma referência sem antecedente ou com dois profissionais possíveis não
  // autoriza procurar qualquer horário coincidente no catálogo inteiro.
  return nomes.length === 1
    ? { medicoNome: nomes[0] }
    : {
        indeterminado: "a referência ao profissional da escala não tem antecedente único no texto",
      };
}

/**
 * `linha` é a posição da lista no texto completo da própria resposta.
 * Nenhum nome é escolhido pela ordem dos registros, memória ou similaridade.
 */
export function escopoDaEnumeracaoMedica(texto: string, linha: number): EscopoEnumeracaoMedica {
  const linhas = texto.split(/\r?\n/);
  const atual = (linhas[linha] ?? "").replace(/[*_]/g, "");
  const nomesAtuais = nomesExplicitos(atual);
  if (nomesAtuais.length > 1) {
    return {
      indeterminado:
        "o mesmo horário foi associado a mais de um profissional e precisa ser conferido para cada um",
    };
  }
  if (nomesAtuais.length === 1) return { medicoNome: nomesAtuais[0] };
  if (NOME_APRESENTADO.test(normalizarTexto(atual))) {
    return {
      indeterminado:
        "o nome completo apresentado na escala não pôde ser identificado com segurança",
    };
  }
  if (REFERENCIA_PLURAL.test(normalizarTexto(atual))) {
    return {
      indeterminado: "referência plural de profissionais não identifica de quem é cada horário",
    };
  }
  if (PRONOME_SINGULAR.test(normalizarTexto(atual))) {
    return antecedenteUnico(linhas.slice(0, linha).join("\n"));
  }
  if (!LINHA_DE_ESCALA.test(normalizarTexto(atual))) return {};

  let inicio = linha - 1;
  while (inicio >= 0) {
    const anterior = normalizarTexto(linhas[inicio]!.replace(/[*_]/g, ""));
    if (anterior && !LINHA_DE_ESCALA.test(anterior)) break;
    inicio--;
  }
  if (inicio < 0) return {};
  const cabecalho = linhas[inicio]!.replace(/[*_]/g, "");
  const normalizado = normalizarTexto(cabecalho);
  const nomes = nomesExplicitos(cabecalho);
  if (nomes.length > 1 || REFERENCIA_PLURAL.test(normalizado)) {
    return {
      indeterminado: "o cabeçalho da lista cita mais de um profissional sem associar cada horário",
    };
  }
  if (nomes.length === 1) return { medicoNome: nomes[0] };
  if (NOME_APRESENTADO.test(normalizado)) {
    return {
      indeterminado: "o nome completo do cabeçalho não pôde ser identificado com segurança",
    };
  }
  if (
    /\b(?:dias?|horarios?|escala|atendimentos?)\b/.test(normalizado) &&
    PRONOME_SINGULAR.test(normalizado)
  ) {
    return antecedenteUnico(linhas.slice(0, inicio).join("\n"));
  }
  return {};
}
