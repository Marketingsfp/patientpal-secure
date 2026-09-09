/**
 * FASE 3 — usar a mensagem que o tempo real já entregou.
 *
 * Antes, o evento do banco servia apenas como aviso: a tela ouvia "chegou algo"
 * e ia buscar de novo a MESMA linha no servidor. Isso somava uma ida e volta a
 * cada mensagem.
 *
 * Aqui a linha entregue pelo tempo real é conferida e normalizada no mesmo
 * formato usado na conversa. Se estiver completa, a bolha aparece na hora; se
 * vier incompleta ou de outra clínica/conversa, nada é adivinhado — a tela cai
 * no caminho antigo (busca incremental).
 *
 * Isto é apresentação, não segurança: o canal já é filtrado por clínica e todo
 * o acesso continua protegido pelo RLS e pelas funções autenticadas. Nenhuma
 * validação do servidor deixa de existir por causa deste atalho.
 */

import type { EventoRealtime } from "./realtime-roteador";

/** Campos que a conversa realmente usa para desenhar a mensagem. */
const CAMPOS = [
  "id",
  "direction",
  "from_number",
  "to_number",
  "body",
  "tipo",
  "enviada_por",
  "recebida_em",
  "media_url",
  "media_mime",
  "status",
  "execucao_id",
  "client_message_id",
] as const;

export type ResultadoRealtime =
  | { usar: true; mensagem: Record<string, any>; conversaId: string }
  /** `motivo` é técnico: só serve para diagnóstico e para escolher o fallback. */
  | { usar: false; motivo: string };

export type ContextoMensagem = {
  clinicaId: string | null;
  conversaAberta: string | null;
};

export function normalizarMensagemRealtime(
  evento: EventoRealtime,
  ctx: ContextoMensagem,
): ResultadoRealtime {
  if (evento.table !== "whatsapp_mensagens") return { usar: false, motivo: "tabela" };
  const tipoEvento = evento.eventType ?? "INSERT";
  if (tipoEvento !== "INSERT" && tipoEvento !== "UPDATE")
    return { usar: false, motivo: "evento_nao_suportado" };

  const linha = evento.new;
  if (!linha || typeof linha !== "object") return { usar: false, motivo: "sem_linha" };
  if (linha.is_teste === true) return { usar: false, motivo: "homologacao" };

  // Sem a clínica na linha não dá para provar a origem: cai no fallback.
  if (!linha.clinica_id || !ctx.clinicaId) return { usar: false, motivo: "clinica_ausente" };
  if (linha.clinica_id !== ctx.clinicaId) return { usar: false, motivo: "outra_clinica" };

  const conversaId = String(linha.conversa_id ?? "");
  if (!conversaId) return { usar: false, motivo: "conversa_ausente" };
  if (!ctx.conversaAberta || conversaId !== ctx.conversaAberta)
    return { usar: false, motivo: "conversa_nao_aberta" };

  // Linha incompleta (payload cortado, coluna faltando): não inventa nada.
  if (!linha.id) return { usar: false, motivo: "sem_id" };
  if (!linha.recebida_em) return { usar: false, motivo: "sem_data" };
  if (linha.direction !== "in" && linha.direction !== "out")
    return { usar: false, motivo: "direcao_invalida" };
  const temConteudo =
    (typeof linha.body === "string" && linha.body.length > 0) || !!linha.media_url;
  if (!temConteudo) return { usar: false, motivo: "sem_conteudo" };

  const mensagem: Record<string, any> = {};
  for (const campo of CAMPOS) if (linha[campo] !== undefined) mensagem[campo] = linha[campo];
  mensagem.optimistic = false;

  return { usar: true, mensagem, conversaId };
}
