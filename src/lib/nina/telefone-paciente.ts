import { normalizarTelefone } from "@/lib/atendimento/telefone";
import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";

export const PEDIR_TELEFONE = "Informe o telefone que deseja usar no cadastro, com DDD.";
/** Homologação não altera cadastro de contato: o número da conversa virtual continua valendo. */
export const TELEFONE_SIMULADO =
  "Nesta simulação o telefone não é alterado; seguimos com o número desta conversa.";
/** Falha real na troca não prende o paciente: a equipe confere o contato (regra de 26/09/2026). */
export function motivoTelefoneNaoAtualizado(
  erro: string | null | undefined,
  temAgendamento: boolean,
) {
  return (
    `TELEFONE_NAO_ATUALIZADO: o paciente pediu para corrigir o telefone e a alteração não foi gravada (${erro ?? "SEM_CODIGO"}). ` +
    (temAgendamento
      ? "O agendamento já gravado não foi alterado; a equipe deve atualizar o contato."
      : "Nenhum agendamento foi gravado; a equipe deve atualizar o contato e concluir o atendimento.")
  );
}
export const TELEFONE_FALHA_SEM_ENCAMINHAMENTO =
  "Não consegui registrar o novo telefone nem confirmar o encaminhamento agora. Por favor, fale com a recepção para atualizar seu contato.";
const NEGACAO_ALTERACAO =
  /\bnao\s+(?:(?:quero|precisa|preciso|desejo|pode)\s+)?(?:alter\w*|tro[qc]\w*|mud\w*|corrig\w*|corrija|atualiz\w*)\b/;
const normalizarTexto = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Só a mensagem do paciente autoriza a correção; argumento do modelo não basta. */
export function pedidoAlteracaoTelefone(
  mensagem: string,
  aguardando = false,
): { telefone: string | null } | null {
  const t = normalizarTexto(mensagem);
  const assunto = /\b(telefone|celular|numero|contato|whatsapp|wpp)\b/.test(t);
  if (NEGACAO_ALTERACAO.test(t)) return null;
  const trecho = assunto
    ? mensagem.slice(t.search(/\b(telefone|celular|numero|contato|whatsapp|wpp)\b/))
    : mensagem;
  const numeros = [...trecho.matchAll(/\+?\d[\d\s().-]*\d/g)].map((m) => m[0].replace(/\D/g, ""));
  const instrucao =
    /\b(?:alter\w*|tro[qc]\w*|mud\w*|corrig\w*|corrija|atualiz\w*|use|usar|coloq\w*|cadastre|registre|prefiro)\b/.test(
      t,
    );
  const declaracao =
    numeros.length > 0 &&
    /\b(?:novo|correto|meu (?:telefone|celular|numero|contato) (?:e|eh))\b/.test(t);
  const explicito = assunto && (instrucao || declaracao);
  const soNumero = /^[\s+\d().-]+$/.test(t);
  if (!explicito && !(aguardando && (soNumero || assunto))) return null;
  // Não trunca números longos, não adivinha DDD e não escolhe entre dois contatos.
  if (numeros.length !== 1) return { telefone: null };
  const digits = numeros[0]!;
  if (!/^(?:\d{10,11}|55\d{10,11})$/.test(digits)) return { telefone: null };
  return { telefone: normalizarTelefone(digits) };
}

export function registrarPedidoTelefone(estado: EstadoFluxoNina, mensagem: string): boolean {
  const t = normalizarTexto(mensagem);
  if (
    estado.patient.alteracao_telefone &&
    (NEGACAO_ALTERACAO.test(t) || /\bmantenha (?:o )?(?:mesmo|telefone|numero)/.test(t))
  ) {
    estado.patient.alteracao_telefone = null;
    return true;
  }
  const pedido = pedidoAlteracaoTelefone(
    mensagem,
    estado.patient.alteracao_telefone?.telefone === null,
  );
  if (!pedido) return false;
  estado.patient.alteracao_telefone = { ...pedido, paciente_id: estado.patient.id, mensagem };
  if (estado.appointment.confirmation) estado.appointment.confirmation.aceita = false;
  estado.appointment.slot_confirmed_by_patient = false;
  estado.appointment.intent_confirmed = false;
  return true;
}
