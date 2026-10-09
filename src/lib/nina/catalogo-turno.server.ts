/** Uma leitura do cadastro por resposta, compartilhada por todas as ferramentas.
 *
 * A seleção manual é lida uma vez por turno, igual no real e na homologação.
 * Nunca mistura fontes nem faz fallback entre elas. Não armazena vagas ou pacientes. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { ProfissionalPublicado, ServicoPublicado } from "./catalogo-conhecimento";
import { registrarEtapa } from "./evidencias.server";
import { lerFonteOperacional } from "./fonte-operacional.server";
import { lerSelecaoFonte } from "./fonte-consulta-config.server";
import { lerFonteEditorial } from "./fonte-editorial.server";
import { ROTULOS_FONTE, type SelecaoFonte } from "./fonte-consulta";

/** Apenas campos publicados; nunca carregar nota interna ou rascunho. */
export const COLUNAS_SERVICO =
  "id, procedimento_id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento, estrutura, status, updated_at";
export const COLUNAS_PROFISSIONAL =
  "id, medico_id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome), estrutura, status, updated_at";
export const TAMANHO_PAGINA = 250;
type Tabela = "servicos" | "profissionais";
type Catalogo = {
  selecao: SelecaoFonte;
  servicos: ServicoPublicado[];
  // O vínculo operacional fica no servidor; o conversor de resposta não o expõe.
  profissionais: (ProfissionalPublicado & { medico_id: string | null })[];
};
const escopo = new AsyncLocalStorage<{ clinicaId: string; leitura?: Promise<Catalogo> }>();

export function comCatalogoDoTurno<T>(clinicaId: string, fn: () => Promise<T>): Promise<T> {
  const atual = escopo.getStore();
  if (atual) {
    if (atual.clinicaId !== clinicaId)
      throw new Error("Fonte solicitada fora da clínica deste turno.");
    return fn();
  }
  return escopo.run({ clinicaId }, fn);
}

async function lerFonteSelecionada(clinicaId: string): Promise<Catalogo> {
  const selecao = await lerSelecaoFonte(clinicaId);
  const dados =
    selecao.fonte === "base_conhecimento"
      ? await lerFonteEditorial(clinicaId)
      : await lerFonteOperacional(clinicaId);
  registrarEtapa({
    tipo: "consulta",
    fonte: "sistema",
    titulo: `Fonte de consulta: ${ROTULOS_FONTE[selecao.fonte]}`,
    dados: {
      clinica_id: clinicaId,
      fonte_consulta: selecao.fonte,
      revisao: selecao.revisao,
      servicos: dados.servicos.length,
      profissionais: dados.profissionais.length,
      escopo: "resposta",
    },
    codigo: { arquivo: "src/lib/nina/catalogo-turno.server.ts", funcao: "lerFonteSelecionada" },
  });
  return { ...dados, selecao };
}

export function temCatalogoDoTurno(): boolean {
  return Boolean(escopo.getStore()?.leitura);
}

/** Dentro de uma resposta, seleção e leitura são memorizadas no escopo dela. */
function leituraDoTurno(clinicaId: string): Promise<Catalogo> | null {
  const turno = escopo.getStore();
  if (!turno) return null;
  if (turno.clinicaId !== clinicaId)
    throw new Error("O catálogo solicitado não pertence à clínica deste turno.");
  // Memoriza a promessa ANTES de aguardar: chamadas concorrentes e falhas não
  // provocam outra leitura. Uma nova resposta sempre cria outro escopo.
  turno.leitura ??= lerFonteSelecionada(clinicaId);
  return turno.leitura;
}

/** Fonte completa da clínica; fora de um turno, confere novamente a seleção. */
export function catalogoDoTurno(clinicaId: string): Promise<Catalogo> {
  return (leituraDoTurno(clinicaId) ?? lerFonteSelecionada(clinicaId)).then((catalogo) =>
    structuredClone(catalogo),
  );
}

/** A contagem não precisa criar uma cópia de todos os registros. */
export function contagemCatalogoDoTurno(clinicaId: string) {
  return (leituraDoTurno(clinicaId) ?? lerFonteSelecionada(clinicaId)).then((catalogo) => ({
    selecao: { ...catalogo.selecao },
    servicos: catalogo.servicos.length,
    profissionais: catalogo.profissionais.length,
  }));
}

export async function lerPublicados<T extends { id: string }>(
  tabela: Tabela,
  colunas: string,
  clinicaId: string,
  ids?: string[],
): Promise<T[]> {
  const catalogo = await (leituraDoTurno(clinicaId) ?? lerFonteSelecionada(clinicaId));
  const linhas = tabela === "servicos" ? catalogo.servicos : catalogo.profissionais;
  // Filtra e projeta ANTES da cópia. Um pedido por nome/id não deve duplicar
  // serviços, profissionais e estruturas que nem serão usados. A cópia do
  // resultado preserva o isolamento de campos aninhados entre consumidores.
  return structuredClone(
    linhas
      .filter((r) => !ids || ids.includes(r.id))
      .map((r) => {
        const fonte = r as unknown as Record<string, unknown>;
        return Object.fromEntries(
          colunas
            .split(",")
            .map((c) => c.trim())
            .map((c) => {
              if (c === "aliases:estrutura->aliases")
                return ["aliases", (fonte.estrutura as { aliases?: unknown } | null)?.aliases];
              const campo = c === "unidades(nome)" ? "unidades" : c;
              return [campo, fonte[campo]];
            }),
        ) as T;
      }),
  );
}
