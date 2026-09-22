/**
 * Cartão Terapêutico no repasse do Financeiro.
 *
 * O produto Cartão Terapêutico é atendido dentro da agenda da psicóloga, então
 * o repasse desses atendimentos saía no nome dela. O financeiro precisa
 * identificar e dar baixa nesse repasse como "CARTÃO TERAPÊUTICO" — o rótulo é
 * do produto, não da pessoa. Isso NÃO mexe em cadastro: `medico_id` continua
 * sendo o da profissional (um único cadastro), o valor do repasse continua o
 * calculado pela grade dela e a Agenda permanece como está.
 */
export const NOME_REPASSE_CARTAO_TERAPEUTICO = "CARTÃO TERAPÊUTICO";

/**
 * Valor sentinela do filtro "Médico" quando o financeiro quer ver só o Cartão
 * Terapêutico. NÃO é um `medico_id`: nunca pode ser enviado ao banco como
 * filtro de coluna — quem o recebe filtra pelo serviço com
 * `ehServicoCartaoTerapeutico`.
 */
export const FILTRO_MEDICO_CARTAO_TERAPEUTICO = "cartao-terapeutico";

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * O serviço é do Cartão Terapêutico?
 *
 * Casa "TERAPEUTICA"/"TERAPEUTICO" como PALAVRA INTEIRA: pega "CONSULTA
 * TERAPEUTICA 1 (PSICOLOGIA)", "AVALIACAO TERAPEUTICA (PSICOLOGIA)" e o antigo
 * "CARTAO TERAPEUTICO", e deixa de fora "FISIOTERAPIA"/"FISIOTERAPEUTICA", que
 * são serviços de outra profissional.
 */
export const ehServicoCartaoTerapeutico = (procedimento?: string | null): boolean =>
  /\bTERAPEUTIC[AO]\b/.test(semAcento(procedimento ?? "").toUpperCase());

/** Nome que o Financeiro mostra e imprime no repasse desta linha. */
export const nomeRepasseExibido = (
  procedimento: string | null | undefined,
  nomeMedico: string,
): string =>
  ehServicoCartaoTerapeutico(procedimento) ? NOME_REPASSE_CARTAO_TERAPEUTICO : nomeMedico;

/**
 * Repasse da MENSALIDADE do plano mensal do Cartão Terapêutico: metade do que
 * entrou. É a mesma divisão do avulso (R$ 290,00 → R$ 145,00 para o
 * profissional e R$ 145,00 para a clínica), confirmada pela clínica em
 * 22/09/2026. Taxa de adesão não entra nesta conta.
 */
export const PERCENTUAL_REPASSE_MENSALIDADE_CT = 50;

export const repasseMensalidadeCartaoTerapeutico = (valorRecebido: number): number =>
  +(((Number(valorRecebido) || 0) * PERCENTUAL_REPASSE_MENSALIDADE_CT) / 100).toFixed(2);
