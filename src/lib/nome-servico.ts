/**
 * Regra de nome único de serviço (tabela `procedimentos`).
 *
 * Dentro de uma clínica não pode haver dois serviços ATIVOS com o mesmo nome,
 * ignorando maiúsculas/minúsculas, acentos e espaços extras. Outra unidade pode
 * ter o mesmo nome (tabelas de preço independentes).
 *
 * Espelha a função do banco `public.servico_nome_chave` e o índice
 * `uq_procedimentos_clinica_nome_ativo`
 * (supabase/migrations/20261002170000_trava_servico_nome_unico_por_unidade.sql).
 * O banco é quem garante a regra; esta cópia só serve para avisar antes de salvar.
 */

export const MSG_SERVICO_JA_CADASTRADO =
  "Serviço já cadastrado. Utilize a edição do registro existente.";

export const INDICE_SERVICO_NOME_UNICO = "uq_procedimentos_clinica_nome_ativo";

export function chaveNomeServicoUnico(nome: string | null | undefined): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
