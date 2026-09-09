/**
 * Regra ÚNICA de identificação visual da conversa.
 *
 * FASE 1 — duas identidades SEPARADAS, que não são a mesma coisa:
 *
 *   CONTACT IDENTITY (identidade do contato WhatsApp)
 *     quem está falando naquele número/canal, agora.
 *     Fonte canônica: `atend_conversas.whatsapp_profile_name`
 *     (`value.contacts[].profile.name` entregue pela Meta); na falta dele,
 *     `contato_nome` (legado) + `contato_telefone`.
 *
 *   PATIENT IDENTITY (paciente cadastrado)
 *     registro clínico explicitamente vinculado à conversa.
 *     Fonte: `atend_conversas.contato_paciente_id` → `pacientes.nome`.
 *     Pode estar ausente, desatualizado ou vinculado ao paciente errado.
 *
 * O paciente cadastrado NÃO substitui silenciosamente o nome do contato no
 * título da conversa. Prioridade da identificação principal:
 *   1. `whatsapp_profile_name` válido;
 *   2. `contato_nome` (legado), quando é nome de verdade — o webhook e o
 *      gatilho de criação gravam o próprio telefone nesse campo, e telefone
 *      não é nome;
 *   3. nome do paciente vinculado, apenas quando não há NENHUM nome de
 *      contato (conversas antigas);
 *   4. nada: a interface mostra "Paciente não identificado".
 *
 * Isto é apresentação. Telefone, número da conversa, vínculo e destino de envio
 * continuam sendo os identificadores técnicos e não são alterados aqui.
 * Nenhuma função deste arquivo grava, vincula, desvincula ou altera cadastro.
 */

export const SEM_NOME = "Paciente não identificado";

/** Conversa como chega das consultas da Inbox (campos opcionais de propósito). */
export type ConversaComNome = {
  /** Nome do perfil do WhatsApp (fonte canônica do contato). */
  whatsapp_profile_name?: string | null;
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

/** De onde saiu o nome do contato. */
export type FonteContato = "perfil_whatsapp" | "contato_legacy" | null;

/** Nome do CONTATO WhatsApp, quando é um nome de verdade. */
export function nomeContato(c: ConversaComNome | null | undefined): string | null {
  if (!c) return null;
  return (
    nomeValido(c.whatsapp_profile_name, c.contato_telefone) ??
    nomeValido(c.contato_nome, c.contato_telefone)
  );
}

/** Qual campo forneceu o nome do contato (perfil WhatsApp ou campo legado). */
export function fonteContato(c: ConversaComNome | null | undefined): FonteContato {
  if (!c) return null;
  if (nomeValido(c.whatsapp_profile_name, c.contato_telefone)) return "perfil_whatsapp";
  if (nomeValido(c.contato_nome, c.contato_telefone)) return "contato_legacy";
  return null;
}

/** Nome do PACIENTE cadastrado vinculado à conversa, quando existe o vínculo. */
export function nomePacienteVinculado(c: ConversaComNome | null | undefined): string | null {
  if (!c) return null;
  const nome = String(c.pacientes?.nome ?? "").trim();
  return nome || null;
}

export type OrigemIdentidade = "contato_whatsapp" | "paciente_vinculado" | "nenhuma";

export type IdentidadeConversa = {
  /** Identidade do contato WhatsApp (quem está conversando). */
  contato: { nome: string | null; telefone: string | null; fonte: FonteContato };
  /** Identidade clínica vinculada — informativa, nunca substitui o contato. */
  paciente: { nome: string | null; vinculado: boolean };
  /** Nome usado como identificação principal da conversa. */
  principal: string | null;
  origem: OrigemIdentidade;
  /** Contato e cadastro têm nomes diferentes: útil para sinalizar na FASE 2. */
  divergente: boolean;
};

/** Contrato único: devolve as duas identidades separadas, sem misturá-las. */
export function identidadeConversa(c: ConversaComNome | null | undefined): IdentidadeConversa {
  const contato = nomeContato(c);
  const paciente = nomePacienteVinculado(c);
  const principal = contato ?? paciente ?? null;
  return {
    contato: { nome: contato, telefone: c?.contato_telefone ?? null, fonte: fonteContato(c) },
    paciente: { nome: paciente, vinculado: !!paciente },
    principal,
    origem: contato ? "contato_whatsapp" : paciente ? "paciente_vinculado" : "nenhuma",
    divergente: !!contato && !!paciente && contato.trim() !== paciente.trim(),
  };
}

/** Nome principal da conversa; `null` quando não há nome nenhum. */
export function nomeConversa(c: ConversaComNome | null | undefined): string | null {
  return identidadeConversa(c).principal;
}

/** Título exibido na lista, no cabeçalho, na busca e nas filas. */
export function tituloConversa(c: ConversaComNome | null | undefined): string {
  return nomeConversa(c) ?? SEM_NOME;
}
