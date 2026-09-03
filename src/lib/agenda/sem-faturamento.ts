import { supabase } from "@/integrations/supabase/client";

/**
 * "Agenda sem faturamento" — o atendimento acontece na clínica, mas o dinheiro
 * nunca passa pelo caixa dela.
 *
 * O caso que originou a função (e que o sistema antigo já tinha) é o exame
 * TOXICOLÓGICO: quem cobra é o laboratório/parceiro, direto do paciente. A
 * clínica só faz a coleta e entrega a guia. Marcar assim é diferente de tudo
 * o que já existia:
 *
 *   - CORTESIA / RETORNO / GRATUIDADE: existe um lançamento financeiro de
 *     R$ 0,00 no caixa, com categoria própria, e alguém autorizou a isenção de
 *     um valor que era da clínica. Aqui não há isenção nenhuma — o valor nunca
 *     foi da clínica.
 *   - ATENDIMENTO EXTERNO (`origem_externa`): o paciente veio de OUTRA unidade
 *     do grupo, que faturou lá. Aqui não há outra unidade: quem fatura é uma
 *     empresa de fora.
 *   - PAGO NO SISTEMA ANTERIOR: houve pagamento, só que antes da virada de
 *     sistema. Aqui não há pagamento a registrar em momento nenhum.
 *
 * Por isso a marcação é uma coluna própria do agendamento, e não mais uma
 * categoria financeira: o atendimento marcado NÃO gera lançamento, então não
 * há onde pendurar uma categoria. É justamente essa ausência de lançamento que
 * mantém o caixa e os relatórios de contas a receber limpos.
 */

/** Tarja impressa na Guia de Atendimento (GR) de um atendimento sem faturamento. */
export const SEM_FATURAMENTO_ROTULO = "SEM FATURAMENTO";

/** Linha de explicação logo abaixo da tarja, na GR. */
export const SEM_FATURAMENTO_SUBTITULO = "COBRANÇA FEITA PELO PARCEIRO — NADA A RECEBER NO CAIXA";

/** Colunas da marcação, para reaproveitar no SELECT das telas. */
export const SEM_FATURAMENTO_COLUNAS =
  "sem_faturamento,sem_faturamento_em,sem_faturamento_por,sem_faturamento_por_nome" as const;

export type MarcacaoSemFaturamento = {
  sem_faturamento?: boolean | null;
  sem_faturamento_em?: string | null;
  sem_faturamento_por?: string | null;
  sem_faturamento_por_nome?: string | null;
};

/** true → este atendimento está marcado para não gerar cobrança nenhuma. */
export function ehSemFaturamento(a: MarcacaoSemFaturamento | null | undefined): boolean {
  return a?.sem_faturamento === true;
}

/**
 * Texto do balãozinho do selo na agenda: quem marcou e quando.
 *
 * O nome de quem marcou fica gravado no próprio agendamento
 * (`sem_faturamento_por_nome`) e não é buscado em `profiles` na hora de
 * desenhar a lista — a agenda mostra centenas de linhas por dia e uma consulta
 * por linha custaria caro. É o mesmo desenho já usado pela sinalização
 * (bandeira laranja).
 */
export function rotuloSemFaturamento(a: MarcacaoSemFaturamento): string {
  if (!a.sem_faturamento) return "";
  const base = "Sem faturamento — o paciente paga direto ao parceiro";
  if (!a.sem_faturamento_em) return base;
  const d = new Date(a.sem_faturamento_em);
  if (Number.isNaN(d.getTime())) return base;
  const quando = d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const quem = (a.sem_faturamento_por_nome ?? "").trim();
  return quem ? `${base}. Marcado por ${quem} em ${quando}.` : `${base}. Marcado em ${quando}.`;
}

/**
 * Liga ou desliga a marcação no banco.
 *
 * Devolve os campos já preenchidos para que a tela possa atualizar a linha na
 * hora, sem esperar um recarregamento da agenda inteira — a recepção usa esta
 * ação com o paciente na frente do balcão.
 *
 * Não decide sozinha se PODE marcar: a trava de "já tem pagamento registrado"
 * fica na tela (que conhece o estado da linha) e, como rede de segurança, no
 * próprio banco, que recusa lançar receita em atendimento marcado.
 */
export async function definirSemFaturamento(
  agendamentoId: string,
  marcar: boolean,
  usuario: { id?: string | null; nome?: string | null },
): Promise<{ ok: true; patch: MarcacaoSemFaturamento } | { ok: false; erro: unknown }> {
  const patch: MarcacaoSemFaturamento = {
    sem_faturamento: marcar,
    sem_faturamento_em: marcar ? new Date().toISOString() : null,
    sem_faturamento_por: marcar ? (usuario.id ?? null) : null,
    sem_faturamento_por_nome: marcar ? (usuario.nome ?? null) : null,
  };
  const { error } = await supabase
    .from("agendamentos")
    .update(patch as never)
    .eq("id", agendamentoId);
  if (error) return { ok: false, erro: error };
  return { ok: true, patch };
}
