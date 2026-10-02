/**
 * Vaga vazia da grade.
 *
 * A agenda pré-gera os horários livres do médico como linhas "DISPONIVEL" sem
 * paciente vinculado. Elas não são atendimentos e não podem entrar em nenhum
 * indicador — num dia de ~310 agendamentos a tabela tem mais de 800 linhas, e
 * os Relatórios chegaram a mostrar o número inflado por contá-las.
 *
 * Regra única do Dashboard Operacional e dos Relatórios.
 */
export const ehVagaLivre = (a: { paciente_nome: string | null; paciente_id?: string | null }) => {
  if (a.paciente_id) return false;
  const nome = (a.paciente_nome ?? "").trim().toUpperCase();
  return nome === "" || nome === "DISPONIVEL" || nome === "DISPONÍVEL";
};

/**
 * Pré-filtro para `.or(...)` do PostgREST: descarta no banco as vagas
 * "DISPONIVEL" (o grosso delas), para não trazê-las ao navegador. Não cobre
 * nome vazio nem variações de caixa — sempre aplicar `ehVagaLivre` depois.
 */
export const FILTRO_SEM_VAGA_LIVRE = "paciente_nome.is.null,paciente_nome.neq.DISPONIVEL";
