/** Uma leitura do cadastro por resposta, compartilhada por todas as ferramentas.
 *
 * Desde 30/09/2026 a Nina NÃO lê mais a base de conhecimentos (catálogo editorial): a fonte é o
 * cadastro do sistema (médicos, horários e procedimentos), convertido por `fonte-operacional`.
 * Não armazena vagas, pacientes ou reservas; o cadastro fica em cache de 60 s por clínica. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { ProfissionalPublicado, ServicoPublicado } from "./catalogo-conhecimento";
import { registrarEtapa } from "./evidencias.server";
import { lerFonteOperacional } from "./fonte-operacional.server";

/** Apenas campos publicados; nunca carregar nota interna ou rascunho. */
export const COLUNAS_SERVICO =
  "id, procedimento_id, nome, valor, valor_observacao, descricao_publica, preparo, restricoes, executantes, formas_pagamento, estrutura, status, updated_at";
export const COLUNAS_PROFISSIONAL =
  "id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, unidades(nome), estrutura, status, updated_at";
export const TAMANHO_PAGINA = 250;
type Tabela = "nina_cat_servicos" | "nina_cat_profissionais";
type Catalogo = {
  servicos: ServicoPublicado[];
  // O vínculo operacional fica no servidor; o conversor de resposta não o expõe.
  profissionais: (ProfissionalPublicado & { medico_id: string | null })[];
};
const escopo = new AsyncLocalStorage<{ clinicaId: string; leitura?: Promise<Catalogo> }>();

export function comCatalogoDoTurno<T>(clinicaId: string, fn: () => Promise<T>): Promise<T> {
  return escopo.run({ clinicaId }, fn);
}

export function temCatalogoDoTurno(): boolean {
  return Boolean(escopo.getStore()?.leitura);
}

/** Dentro de uma resposta, a leitura é memorizada no escopo dela; fora dela vale o cache do cadastro. */
function leituraDoTurno(clinicaId: string): Promise<Catalogo> | null {
  const turno = escopo.getStore();
  if (!turno) return null;
  if (turno.clinicaId !== clinicaId) throw new Error("O catálogo solicitado não pertence à clínica deste turno.");
  // Memoriza a promessa ANTES de aguardar: chamadas concorrentes e falhas não
  // provocam outra leitura. Uma nova resposta sempre cria outro escopo.
  turno.leitura ??= lerFonteOperacional(clinicaId).then(({ servicos, profissionais }) => {
    registrarEtapa({ tipo: "consulta", fonte: "sistema", titulo: "Leitura única do cadastro nesta resposta",
      dados: { clinica_id: clinicaId, servicos: servicos.length,
        profissionais: profissionais.length, escopo: "resposta", cache: true },
      codigo: { arquivo: "src/lib/nina/catalogo-turno.server.ts", funcao: "catalogoDoTurno" } });
    return { servicos, profissionais };
  });
  return turno.leitura;
}

/** Cadastro completo da clínica (dentro de uma resposta, a mesma leitura; fora dela, o cache). */
export function catalogoDoTurno(clinicaId: string): Promise<Catalogo> {
  return (leituraDoTurno(clinicaId) ?? lerFonteOperacional(clinicaId)).then(catalogo => structuredClone(catalogo));
}

/** A contagem não precisa criar uma cópia de todos os registros. */
export function contagemCatalogoDoTurno(clinicaId: string) {
  return (leituraDoTurno(clinicaId) ?? lerFonteOperacional(clinicaId)).then(catalogo => ({
    servicos: catalogo.servicos.length,
    profissionais: catalogo.profissionais.length,
  }));
}

export async function lerPublicados<T extends { id: string }>(
  tabela: Tabela, colunas: string, clinicaId: string, ids?: string[],
): Promise<T[]> {
  const catalogo = await (leituraDoTurno(clinicaId) ?? lerFonteOperacional(clinicaId));
  const linhas = tabela === "nina_cat_servicos" ? catalogo.servicos : catalogo.profissionais;
  // Filtra e projeta ANTES da cópia. Um pedido por nome/id não deve duplicar
  // serviços, profissionais e estruturas que nem serão usados. A cópia do
  // resultado preserva o isolamento de campos aninhados entre consumidores.
  return structuredClone(linhas.filter(r => !ids || ids.includes(r.id)).map(r => {
    const fonte = r as unknown as Record<string, unknown>;
    return Object.fromEntries(colunas.split(",").map(c => c.trim()).map(c => {
      if (c === "aliases:estrutura->aliases") return ["aliases", (fonte.estrutura as { aliases?: unknown } | null)?.aliases];
      const campo = c === "unidades(nome)" ? "unidades" : c;
      return [campo, fonte[campo]];
    })) as T;
  }));
}
