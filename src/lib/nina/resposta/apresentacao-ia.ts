/**
 * Apresentação como IA sem repetir "eu sou".
 *
 * A frase obrigatória "eu sou inteligência artificial" somada a uma
 * apresentação "Eu sou a Maria" gera "Eu sou a Maria, eu sou inteligência
 * artificial". O texto entregue usa a mesma forma da apresentação montada
 * pelo código (identidade-efetiva.ts): "Me chamo Maria e eu sou inteligência
 * artificial", que a conferência da apresentação publicada continua aceitando.
 */

const APRESENTACAO_REPETIDA =
  /(^|[^\p{L}])((?:eu\s+)?sou)\s+(?:a|o)\s+([^,.!?;:\n]{1,40}?)\s*(?:,\s*(?:e\s+)?|\s+e\s+)(?:eu\s+)?sou\s+(?:uma\s+)?(intelig[eê]ncia\s+artificial)/giu;

export function corrigirApresentacaoRepetida(texto: string): string {
  if (!texto) return texto;
  return texto.replace(
    APRESENTACAO_REPETIDA,
    (_trecho, antes: string, verbo: string, nome: string, ia: string) => {
      const chamo = verbo[0] === verbo[0]!.toUpperCase() ? "Me chamo" : "me chamo";
      return `${antes}${chamo} ${nome.trim()} e eu sou ${ia}`;
    },
  );
}
