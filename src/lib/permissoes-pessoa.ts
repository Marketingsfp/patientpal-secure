// Exceções de acesso por PESSOA, aplicadas por cima da regra do cargo.
//
// A regra vive aqui, fora do componente e fora do hook, por dois motivos:
// é a única parte da autorização que pode TIRAR acesso de alguém, e precisa
// valer igual no menu lateral, na guarda de rota e na tela de Perfis. Um
// arquivo só, com teste, é mais barato do que descobrir a divergência em
// produção.

import type { Acesso } from "@/lib/permissoes-presets";

/** Uma linha de `usuario_permissoes`: o acesso desta pessoa neste módulo. */
export type ExcecaoDePessoa = { modulo: string | null; acesso: Acesso | null };

/** O acesso já calculado pelo cargo, do jeito que o hook de permissões guarda. */
export type AcessoCalculado = {
  /** Módulos visíveis (acesso diferente de "none"). */
  allowed: Set<string>;
  /** Nível de cada módulo visível. */
  nivel: Map<string, "read" | "write">;
  /**
   * Módulos com decisão explícita gravada. Importa para os submódulos: um
   * submódulo que aparece aqui não volta a herdar o módulo pai, mesmo estando
   * fora de `allowed` — é o que permite fechar "Escala e Horários" para uma
   * pessoa sem fechar a Agenda dela.
   */
  configured: Set<string>;
};

/**
 * Aplica as exceções da pessoa sobre o acesso que o cargo concedeu.
 *
 * Muda `base` no lugar (é o formato que o hook já monta) e devolve a mesma
 * referência, por conveniência de quem chama.
 *
 * - exceção "read"/"write" → a pessoa passa a ver aquele módulo naquele nível,
 *   mesmo que o cargo dela não dê;
 * - exceção "none" → a pessoa deixa de ver, mesmo que o cargo dê;
 * - módulo sem exceção → continua exatamente como o cargo definiu.
 */
export function aplicarExcecoesDaPessoa(
  base: AcessoCalculado,
  excecoes: ReadonlyArray<ExcecaoDePessoa> | null | undefined,
): AcessoCalculado {
  for (const linha of excecoes ?? []) {
    const modulo = linha?.modulo;
    if (!modulo) continue;
    base.configured.add(modulo);
    if (linha.acesso === "read" || linha.acesso === "write") {
      base.allowed.add(modulo);
      base.nivel.set(modulo, linha.acesso);
    } else {
      base.allowed.delete(modulo);
      base.nivel.delete(modulo);
    }
  }
  return base;
}

/**
 * O que a tela de Perfis precisa gravar e apagar ao salvar uma pessoa.
 *
 * Só vira linha no banco o módulo que ficou DIFERENTE do cargo. Módulo que
 * voltou a valer o mesmo que o cargo é APAGADO, e não gravado com o valor
 * igual: gravar congelaria a pessoa no valor de hoje, e uma mudança futura no
 * cargo deixaria de alcançá-la sem ninguém entender por quê.
 */
export function diffDaPessoa(
  modulos: ReadonlyArray<string>,
  doCargo: Readonly<Record<string, Acesso>>,
  daPessoa: Readonly<Record<string, Acesso>>,
  jaGravados: ReadonlyArray<string>,
): { gravar: Array<{ modulo: string; acesso: Acesso }>; apagar: string[] } {
  const gravar: Array<{ modulo: string; acesso: Acesso }> = [];
  const aindaExcecao = new Set<string>();
  for (const modulo of modulos) {
    const valor = daPessoa[modulo] ?? "none";
    const padrao = doCargo[modulo] ?? "none";
    if (valor === padrao) continue;
    gravar.push({ modulo, acesso: valor });
    aindaExcecao.add(modulo);
  }
  const apagar = jaGravados.filter((m) => !aindaExcecao.has(m));
  return { gravar, apagar };
}
