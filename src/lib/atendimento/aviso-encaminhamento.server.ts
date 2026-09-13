/**
 * COORDENAÇÃO DO AVISO DE ENCAMINHAMENTO (persistência).
 *
 * Guarda de duplicidade que NÃO depende de memória de processo: a operação
 * tem uma chave única no banco (clínica, ambiente, conversa, sessão e turno de
 * origem). Duas chamadas concorrentes disputam a MESMA linha; só uma ganha a
 * reserva e envia. Retry do mesmo turno reaproveita a linha existente.
 *
 * Nada aqui apaga mensagem histórica: o registro anterior continua legível.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  chaveAvisoEncaminhamento,
  decidirEntregaAviso,
  decisaoProduzMensagem,
  type AmbienteAviso,
  type DecisaoEntrega,
  type EstadoAviso,
  type OrigemAviso,
  type RegistroAviso,
  type ResultadoAvisoEncaminhamento,
} from "./aviso-encaminhamento";

const TABELA = "atend_aviso_encaminhamento";

type LinhaAviso = {
  chave: string;
  ambiente: string;
  estado: string;
  protocolo: string | null;
  texto: string | null;
  mensagem_id: string | null;
  transporte_id: string | null;
  tentativas: number | null;
  updated_at: string | null;
};

const COLUNAS =
  "chave, ambiente, estado, protocolo, texto, mensagem_id, transporte_id, tentativas, updated_at";

function paraRegistro(l: LinhaAviso | null | undefined): RegistroAviso | null {
  if (!l) return null;
  return {
    chave: l.chave,
    estado: l.estado as EstadoAviso,
    protocolo: l.protocolo,
    texto: l.texto,
    mensagemId: l.mensagem_id,
    transporteId: l.transporte_id,
    tentativas: l.tentativas ?? 0,
    atualizadoEm: l.updated_at,
  };
}

export function resultadoDoRegistro(
  registro: RegistroAviso | null,
  ambiente: AmbienteAviso,
  reaproveitado: boolean,
): ResultadoAvisoEncaminhamento | null {
  if (!registro) return null;
  return {
    chave: registro.chave,
    ambiente,
    estado: registro.estado,
    protocolo: registro.protocolo,
    texto: registro.texto,
    mensagemId: registro.mensagemId,
    transporteId: registro.transporteId,
    entregue: registro.estado === "confirmado",
    reaproveitado,
  };
}

export async function lerAviso(chave: string): Promise<RegistroAviso | null> {
  const { data, error } = await supabaseAdmin
    .from(TABELA)
    .select(COLUNAS)
    .eq("chave", chave)
    .maybeSingle();
  if (error) {
    console.error("[aviso-handoff] falha ao ler registro", error.message);
    return null;
  }
  return paraRegistro(data as LinhaAviso | null);
}

/** O aviso já registrado para esta operação (usado pelos outros módulos). */
export async function avisoDaOperacao(
  origem: OrigemAviso,
): Promise<ResultadoAvisoEncaminhamento | null> {
  const chave = chaveAvisoEncaminhamento(origem);
  return resultadoDoRegistro(await lerAviso(chave), origem.ambiente, true);
}

export type ReservaAviso = {
  chave: string;
  decisao: DecisaoEntrega;
  /** Esta chamada ganhou o direito de enviar. */
  reservado: boolean;
  registro: RegistroAviso | null;
};

/**
 * Tenta reservar o envio. A criação da linha usa a unicidade da chave: quem
 * inseriu envia; quem colidiu lê o estado e decide (reaproveitar, aguardar,
 * conferir antes de reenviar, ou reenviar dentro do limite de tentativas).
 */
export async function reservarEnvioAviso(args: {
  origem: OrigemAviso;
  protocolo?: string | null;
  texto?: string | null;
  textoHash?: string | null;
  execucaoId?: string | null;
  handoffEventoId?: string | null;
  preparadoPor?: string | null;
}): Promise<ReservaAviso> {
  const chave = chaveAvisoEncaminhamento(args.origem);
  const base = {
    chave,
    clinica_id: args.origem.clinicaId,
    ambiente: args.origem.ambiente,
    conversa_id: args.origem.conversaId,
    sessao_id: args.origem.sessaoId ?? null,
    turno_id: args.origem.turnoId ?? null,
    execucao_id: args.execucaoId ?? null,
    handoff_evento_id: args.handoffEventoId ?? null,
    protocolo: args.protocolo ?? null,
    texto: args.texto ?? null,
    texto_hash: args.textoHash ?? null,
    preparado_por: args.preparadoPor ?? null,
  };

  // 1) Corrida resolvida pelo banco: só um INSERT sobrevive à chave única.
  const { data: criada, error: erroInsert } = await supabaseAdmin
    .from(TABELA)
    .upsert(
      { ...base, estado: "envio_pendente", tentativas: 1, enviado_em: new Date().toISOString() },
      { onConflict: "chave", ignoreDuplicates: true },
    )
    .select(COLUNAS)
    .maybeSingle();
  if (erroInsert) {
    console.error("[aviso-handoff] falha ao reservar", erroInsert.message);
  }
  const linhaCriada = paraRegistro(criada as LinhaAviso | null);
  if (linhaCriada) return { chave, decisao: "enviar", reservado: true, registro: linhaCriada };

  // 2) Já existe: a decisão vem do estado persistido, nunca de memória.
  const existente = await lerAviso(chave);
  const decisao = decidirEntregaAviso(existente);
  if (!decisaoProduzMensagem(decisao)) {
    return { chave, decisao, reservado: false, registro: existente };
  }

  // 3) Nova tentativa: só assume a reserva quem consegue mudar o estado.
  const { data: assumida } = await supabaseAdmin
    .from(TABELA)
    .update({
      estado: "envio_pendente",
      tentativas: (existente?.tentativas ?? 0) + 1,
      texto: args.texto ?? existente?.texto ?? null,
      texto_hash: args.textoHash ?? null,
      protocolo: args.protocolo ?? existente?.protocolo ?? null,
      enviado_em: new Date().toISOString(),
    })
    .eq("chave", chave)
    .in("estado", ["preparado", "falhou"])
    .select(COLUNAS)
    .maybeSingle();
  const registro = paraRegistro(assumida as LinhaAviso | null) ?? existente;
  return { chave, decisao, reservado: Boolean(assumida), registro };
}

/** Entrega comprovada: existe mensagem e, quando há transporte, identificador. */
export async function confirmarEnvioAviso(args: {
  chave: string;
  mensagemId: string | null;
  transporte: string | null;
  transporteId: string | null;
  protocolo?: string | null;
  texto?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABELA)
    .update({
      estado: "confirmado",
      mensagem_id: args.mensagemId,
      transporte: args.transporte,
      transporte_id: args.transporteId,
      ...(args.protocolo ? { protocolo: args.protocolo } : {}),
      ...(args.texto ? { texto: args.texto } : {}),
      confirmado_em: new Date().toISOString(),
      ultimo_erro: null,
    })
    .eq("chave", args.chave);
  if (error) console.error("[aviso-handoff] falha ao confirmar", error.message);
}

/** Falha conhecida: pode haver nova tentativa dentro do limite. */
export async function registrarFalhaAviso(args: {
  chave: string;
  erro: string;
  transporte?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABELA)
    .update({
      estado: "falhou",
      transporte: args.transporte ?? null,
      ultimo_erro: args.erro.slice(0, 500),
    })
    .eq("chave", args.chave);
  if (error) console.error("[aviso-handoff] falha ao registrar erro", error.message);
}

/**
 * Resultado desconhecido (timeout/exceção do transporte). Reenviar às cegas
 * duplicaria o aviso: o estado fica explícito para a próxima tentativa
 * conferir antes.
 */
export async function marcarResultadoIncerto(args: {
  chave: string;
  erro: string;
  transporte?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABELA)
    .update({
      estado: "incerto",
      transporte: args.transporte ?? null,
      ultimo_erro: args.erro.slice(0, 500),
    })
    .eq("chave", args.chave);
  if (error) console.error("[aviso-handoff] falha ao marcar incerto", error.message);
}

/**
 * Conferência antes de reenviar: o aviso desta operação já existe na conversa?
 * Procura a mensagem de saída com o mesmo texto a partir do momento em que a
 * operação foi criada. Encontrando, a operação é confirmada — sem nova bolha.
 */
export async function conferirAvisoJaEnviado(args: {
  clinicaId: string;
  conversaId: string;
  texto: string;
  desde?: string | null;
}): Promise<{ mensagemId: string; transporteId: string | null } | null> {
  let q = supabaseAdmin
    .from("whatsapp_mensagens")
    .select("id, wa_message_id, recebida_em")
    .eq("clinica_id", args.clinicaId)
    .eq("conversa_id", args.conversaId)
    .eq("direction", "out")
    .eq("body", args.texto)
    .order("recebida_em", { ascending: false })
    .limit(1);
  if (args.desde) q = q.gte("recebida_em", args.desde);
  const { data, error } = await q;
  if (error) {
    console.error("[aviso-handoff] falha ao conferir envio anterior", error.message);
    return null;
  }
  const linha = (data ?? [])[0] as { id?: string; wa_message_id?: string | null } | undefined;
  if (!linha?.id) return null;
  return { mensagemId: linha.id, transporteId: linha.wa_message_id ?? null };
}
