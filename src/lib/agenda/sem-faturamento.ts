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
 *
 * DUAS TRAVAS, porque a marcação apaga uma receita da clínica com um clique:
 *
 *   1. Só a supervisão marca ou desmarca (`ROLES_AUTORIZAM_SEM_FATURAMENTO`).
 *      A recepção continua podendo iniciar a ação, mas a tela exige a senha de
 *      um supervisor na hora — o mesmo desenho já usado no desconto.
 *   2. Marcar exige MOTIVO escrito, que fica gravado na linha e no histórico
 *      do agendamento junto com quem autorizou e quando. Sem isso, um mês
 *      depois ninguém sabe dizer por que aquele atendimento não foi cobrado.
 *
 * A GUIA IMPRESSA (GR) não fala nada disso, de propósito: ver o comentário em
 * `src/lib/print-gr.ts`. A trava é interna, administrativa; o cupom que o
 * médico e o paciente recebem sai neutro.
 */

/** Papéis que podem marcar (ou desmarcar) um atendimento como sem faturamento. */
export const ROLES_AUTORIZAM_SEM_FATURAMENTO = ["admin", "gestor", "supervisor"] as const;

/**
 * Motivos oferecidos na tela. A lista existe para que a conferência do mês
 * some casos comparáveis: se cada funcionária escrever o motivo com palavras
 * próprias, não há como contar quantos toxicológicos passaram sem faturamento.
 * "Outro" continua existindo porque a clínica sempre acha um caso novo.
 */
export const MOTIVO_SEM_FATURAMENTO_OUTRO = "Outro (descrever)";

export const MOTIVOS_SEM_FATURAMENTO = [
  "Exame de parceiro (Toxicológico / Detran)",
  "Convênio fatura direto com o parceiro",
  "Acordo da diretoria",
  "Campanha / mutirão institucional",
  "Atendimento de colaborador da clínica",
  MOTIVO_SEM_FATURAMENTO_OUTRO,
] as const;

/** Colunas da marcação, para reaproveitar no SELECT das telas. */
export const SEM_FATURAMENTO_COLUNAS =
  "sem_faturamento,sem_faturamento_em,sem_faturamento_por,sem_faturamento_por_nome,sem_faturamento_motivo,sem_faturamento_autorizado_por,sem_faturamento_autorizado_por_nome" as const;

export type MarcacaoSemFaturamento = {
  sem_faturamento?: boolean | null;
  sem_faturamento_em?: string | null;
  sem_faturamento_por?: string | null;
  sem_faturamento_por_nome?: string | null;
  sem_faturamento_motivo?: string | null;
  sem_faturamento_autorizado_por?: string | null;
  sem_faturamento_autorizado_por_nome?: string | null;
};

/** true → este atendimento está marcado para não gerar cobrança nenhuma. */
export function ehSemFaturamento(a: MarcacaoSemFaturamento | null | undefined): boolean {
  return a?.sem_faturamento === true;
}

/** true → o papel deste usuário pode marcar/desmarcar sozinho, sem pedir senha. */
export function podeAutorizarSemFaturamento(role: string | null | undefined): boolean {
  return (ROLES_AUTORIZAM_SEM_FATURAMENTO as readonly string[]).includes(role ?? "");
}

/**
 * Junta a opção escolhida na lista com o texto livre e devolve o motivo final,
 * ou `null` quando ainda não dá para gravar.
 *
 * Um motivo de duas letras ("ok", "x") não explica nada seis meses depois, na
 * hora em que a diretoria pergunta por que aquele exame não entrou no caixa —
 * por isso o mínimo de 4 caracteres, que é a mesma regra repetida no banco.
 */
export function motivoSemFaturamentoFinal(
  opcao: string | null | undefined,
  textoLivre: string | null | undefined,
): string | null {
  const escolha = (opcao ?? "").trim();
  if (!escolha) return null;
  if (escolha !== MOTIVO_SEM_FATURAMENTO_OUTRO) return escolha;
  const livre = (textoLivre ?? "").trim();
  if (livre.length < 4) return null;
  return livre.slice(0, 300);
}

/**
 * Texto do balãozinho do selo na agenda: por que, quem autorizou e quando.
 *
 * O nome de quem marcou fica gravado no próprio agendamento
 * (`sem_faturamento_por_nome`) e não é buscado em `profiles` na hora de
 * desenhar a lista — a agenda mostra centenas de linhas por dia e uma consulta
 * por linha custaria caro. É o mesmo desenho já usado pela sinalização
 * (bandeira laranja).
 */
export function rotuloSemFaturamento(a: MarcacaoSemFaturamento): string {
  if (!a.sem_faturamento) return "";
  const partes = ["Sem faturamento — o paciente paga direto ao parceiro"];
  const motivo = (a.sem_faturamento_motivo ?? "").trim();
  if (motivo) partes.push(`Motivo: ${motivo}`);
  const autorizador = (a.sem_faturamento_autorizado_por_nome ?? "").trim();
  if (autorizador) partes.push(`Autorizado por ${autorizador}`);
  const quem = (a.sem_faturamento_por_nome ?? "").trim();
  let quando = "";
  if (a.sem_faturamento_em) {
    const d = new Date(a.sem_faturamento_em);
    if (!Number.isNaN(d.getTime())) {
      quando = d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  if (quem && quando) partes.push(`Marcado por ${quem} em ${quando}`);
  else if (quem) partes.push(`Marcado por ${quem}`);
  else if (quando) partes.push(`Marcado em ${quando}`);
  return `${partes.join(". ")}.`;
}

export type OperadorSemFaturamento = {
  id?: string | null;
  nome?: string | null;
  email?: string | null;
};

export type AutorizadorSemFaturamento = { id?: string | null; nome?: string | null };

export type DefinirSemFaturamentoInput = {
  agendamentoId: string;
  clinicaId: string;
  /** true = marcar; false = voltar a faturar. */
  marcar: boolean;
  /** Quem está operando a tela (pode ser a recepção). */
  operador: OperadorSemFaturamento;
  /** Quem autorizou — a própria pessoa, se for da supervisão, ou quem digitou a senha. */
  autorizador: AutorizadorSemFaturamento;
  /** Obrigatório ao marcar; ignorado ao desmarcar. */
  motivo?: string | null;
};

/**
 * Liga ou desliga a marcação no banco e deixa o rastro no histórico.
 *
 * Devolve os campos já preenchidos para que a tela possa atualizar a linha na
 * hora, sem esperar um recarregamento da agenda inteira — a recepção usa esta
 * ação com o paciente na frente do balcão.
 *
 * Não decide sozinha se PODE marcar: a trava de "já tem pagamento registrado"
 * e a de permissão ficam na tela (que conhece o estado da linha e o papel do
 * usuário) e, como rede de segurança, no próprio banco.
 *
 * A nota do histórico é gravada DEPOIS do update e uma falha nela não derruba
 * a operação: o rastro principal já está nas colunas do agendamento, e travar
 * a recepção por causa do registro secundário seria pior.
 */
export async function definirSemFaturamento(
  input: DefinirSemFaturamentoInput,
): Promise<{ ok: true; patch: MarcacaoSemFaturamento } | { ok: false; erro: unknown }> {
  const { agendamentoId, clinicaId, marcar, operador, autorizador } = input;
  const motivo = (input.motivo ?? "").trim();
  if (marcar && motivo.length < 4) {
    return { ok: false, erro: new Error("Informe o motivo da isenção antes de marcar.") };
  }
  const patch: MarcacaoSemFaturamento = {
    sem_faturamento: marcar,
    sem_faturamento_em: marcar ? new Date().toISOString() : null,
    sem_faturamento_por: marcar ? (operador.id ?? null) : null,
    sem_faturamento_por_nome: marcar ? (operador.nome ?? null) : null,
    sem_faturamento_motivo: marcar ? motivo : null,
    // O autorizador é gravado NOS DOIS SENTIDOS, e não só ao marcar: quem
    // remove a marcação também precisa de alçada, e é este campo que prova ao
    // banco que um supervisor liberou. A senha do supervisor é validada numa
    // sessão temporária e a gravação sai pela sessão de quem opera a tela, de
    // modo que o banco só enxerga a recepcionista — sem este campo, a trava
    // recusaria a remoção autorizada.
    sem_faturamento_autorizado_por: autorizador.id ?? null,
    sem_faturamento_autorizado_por_nome: autorizador.nome ?? null,
  };
  const { error } = await supabase
    .from("agendamentos")
    .update(patch as never)
    .eq("id", agendamentoId);
  if (error) return { ok: false, erro: error };

  const autorizadorNome = (autorizador.nome ?? "").trim() || "supervisão";
  const texto = marcar
    ? `SEM FATURAMENTO: atendimento marcado como isento de cobrança. Motivo: ${motivo}. Autorizado por: ${autorizadorNome}.`
    : `SEM FATURAMENTO: marcação removida com autorização de ${autorizadorNome}. O atendimento volta a ser cobrado normalmente.`;
  try {
    await supabase.from("agendamento_historico_notas" as never).insert({
      clinica_id: clinicaId,
      agendamento_id: agendamentoId,
      user_email: operador.email ?? null,
      user_nome: operador.nome ?? null,
      texto,
    } as never);
  } catch (_) {
    /* o rastro principal está nas colunas acima; a nota é registro secundário */
  }
  return { ok: true, patch };
}
