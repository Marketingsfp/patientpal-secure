/**
 * Regra ÚNICA de identificação visual da conversa.
 *
 * Prioridade:
 *   1. nome do PACIENTE efetivamente vinculado (`atend_conversas.contato_paciente_id`);
 *   2. nome do contato já existente na conversa (`contato_nome`), quando é um
 *      nome de verdade — o webhook e o gatilho de criação gravam o próprio
 *      telefone nesse campo, e telefone não é nome;
 *   3. nada: a interface mostra "Paciente não identificado".
 *
 * Isto é apresentação. Telefone, número da conversa, vínculo e destino de envio
 * continuam sendo os identificadores técnicos e não são alterados aqui.
 */

export const SEM_NOME = "Paciente não identificado";

/** Conversa como chega das consultas da Inbox (campos opcionais de propósito). */
export type ConversaComNome = {
  contato_nome?: string | null;
  contato_telefone?: string | null;
  /** Vem do vínculo `contato_paciente_id` embutido na própria consulta. */
  pacientes?: { nome?: string | null } | null;
};

function apenasDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** Um "nome" que na verdade é o telefone (ou só números) não identifica ninguém. */
function nomeValido(bruto: unknown, telefone?: string | null): string | null {
  const nome = String(bruto ?? "").trim();
  if (!nome) return null;
  if (/^(undefined|null|-|—)$/i.test(nome)) return null;
  const digitos = apenasDigitos(nome);
  // Só dígitos/pontuação, ou o próprio telefone escrito de outro jeito.
  if (digitos.length >= 8 && digitos.length === apenasDigitos(nome.replace(/[^\d\s()+-]/g, "")).length) {
    if (!/[a-zA-ZÀ-ÿ]/.test(nome)) return null;
  }
  if (digitos && telefone && digitos === apenasDigitos(telefone)) return null;
  return nome;
}

/** Nome do paciente/contato quando existe; `null` quando não há nome cadastrado. */
export function nomeConversa(c: ConversaComNome | null | undefined): string | null {
  if (!c) return null;
  const doPaciente = String(c.pacientes?.nome ?? "").trim();
  if (doPaciente) return doPaciente;
  return nomeValido(c.contato_nome, c.contato_telefone);
}

/** Título exibido na lista, no cabeçalho, na busca e nas filas. */
export function tituloConversa(c: ConversaComNome | null | undefined): string {
  return nomeConversa(c) ?? SEM_NOME;
}
