/**
 * Apresentação como IA: "Me chamo Maria, sou a inteligência artificial da …"
 * (forma pedida em 13/10/2026, com o artigo "a" antes de inteligência artificial).
 *
 * Corrige o que a IA escrever de outro jeito:
 *  - "Eu sou a Maria, eu sou inteligência artificial" (repetição de "eu sou");
 *  - "Me chamo Maria e eu sou inteligência artificial" (forma antiga, sem artigo);
 *  - "eu sou (uma) inteligência artificial" solto.
 * A conferência da apresentação publicada continua aceitando o texto corrigido.
 */

const APRESENTACAO_REPETIDA =
  /(^|[^\p{L}])((?:eu\s+)?sou)\s+(?:a|o)\s+([^,.!?;:\n]{1,40}?)\s*(?:,\s*(?:e\s+)?|\s+e\s+)(?:eu\s+)?sou\s+(?:uma\s+)?(intelig[eê]ncia\s+artificial)/giu;
const ME_CHAMO_SEM_ARTIGO =
  /(me\s+chamo\s+[^,.!?;:\n]{1,40}?)\s*(?:,\s*|\s+)(?:e\s+)?(?:eu\s+)?sou\s+(?:uma\s+)?(intelig[eê]ncia\s+artificial)/giu;
const SOU_SEM_ARTIGO = /(^|[^\p{L}])((?:eu\s+)?sou)\s+(?:uma\s+)?(intelig[eê]ncia\s+artificial)/giu;

export function corrigirApresentacaoRepetida(texto: string): string {
  if (!texto) return texto;
  return texto
    .replace(
      APRESENTACAO_REPETIDA,
      (_trecho, antes: string, verbo: string, nome: string, ia: string) => {
        const chamo = verbo[0] === verbo[0]!.toUpperCase() ? "Me chamo" : "me chamo";
        return `${antes}${chamo} ${nome.trim()}, sou a ${ia}`;
      },
    )
    .replace(ME_CHAMO_SEM_ARTIGO, (_trecho, chamo: string, ia: string) => `${chamo}, sou a ${ia}`)
    .replace(
      SOU_SEM_ARTIGO,
      (_trecho, antes: string, verbo: string, ia: string) => `${antes}${verbo} a ${ia}`,
    );
}
