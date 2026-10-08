/** Nome único do laboratório nos relatórios (ver `unificarServicoLaboratorio`). */
export const SERVICO_LABORATORIO = "LABORATÓRIO";

/**
 * O mesmo laboratório chega aos relatórios com três nomes: "EXAMES
 * LABORATORIAIS" e "LABORATORIO" (dois serviços do cadastro) e, desde o
 * orçamento de exames, "LABORATÓRIO (2 EXAMES): EAS, ..." (texto livre). Nas
 * Estatísticas isso virava várias linhas para o mesmo setor. Só muda o nome
 * exibido: filtro, grupo e repasse continuam pelo serviço do cadastro.
 */
export function unificarServicoLaboratorio(nome: string): string {
  const n = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (n === "LABORATORIO" || n === "EXAMES LABORATORIAIS") return SERVICO_LABORATORIO;
  if (/^LABORATORIO \(\d+ EXAMES?\)/.test(n)) return SERVICO_LABORATORIO;
  return nome;
}
