import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizarTelefone } from "@/lib/atendimento/telefone";
import { agoraNaClinica } from "@/lib/nina-agora";
import { encaminhamentoSemRegistro, MOTIVO_SEM_REGISTRO, respostaSemRegistro } from "@/lib/nina/catalogo-sem-registro";
import { dadosPublicosCatalogo, resultadoExigeHumano, MOTIVO_SFP,
  respostaEncaminhamentoSfp, resultadoEncaminhamentoSfp, omitirNomeGenerico } from "@/lib/nina/regras-catalogo";

import { normalizar } from "@/lib/nina-especialidade";

const META_VERSION = "v22.0";
/** Mídia (upload/envio de áudio) usa a versão atual da Graph API. */
const META_VERSION_AUDIO = "v26.0";

/* =========================================================================
 * Templates (HSM) — Meta Cloud API
 * ========================================================================= */
export type WaTemplateComponent =
  | { type: "HEADER"; format: "TEXT"; text: string; example?: { header_text?: string[] } }
  | { type: "BODY"; text: string; example?: { body_text?: string[][] } }
  | { type: "FOOTER"; text: string }
  | { type: "BUTTONS"; buttons: Array<{ type: "QUICK_REPLY"; text: string }> };

export interface WaTemplatePayload {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: WaTemplateComponent[];
}

export async function metaListTemplates(wabaId: string, accessToken: string) {
  const url = `https://graph.facebook.com/${META_VERSION}/${wabaId}/message_templates?limit=100&fields=name,status,category,language,components,id,rejected_reason`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error?.message ?? `HTTP ${res.status}`);
  return ((json as any)?.data ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    category: string;
    language: string;
    components: WaTemplateComponent[];
    rejected_reason?: string;
  }>;
}

export async function metaCreateTemplate(
  wabaId: string,
  accessToken: string,
  payload: WaTemplatePayload,
) {
  const url = `https://graph.facebook.com/${META_VERSION}/${wabaId}/message_templates`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      (json as any)?.error?.error_user_msg ?? (json as any)?.error?.message ?? `HTTP ${res.status}`,
    );
  return json as { id: string; status: string; category: string };
}

export async function metaDeleteTemplate(wabaId: string, accessToken: string, name: string) {
  const url = `https://graph.facebook.com/${META_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error?.message ?? `HTTP ${res.status}`);
  return json as { success: boolean };
}

export interface WhatsAppConfigRow {
  clinica_id: string;
  phone_number_id: string | null;
  waba_id: string | null;
  display_phone_number: string | null;
  display_name: string | null;
  access_token: string | null;
  app_secret: string | null;
  verify_token: string;
  welcome_message: string | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  ativo: boolean;
}

export async function loadWhatsAppConfig(clinicaId: string): Promise<WhatsAppConfigRow | null> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_configs")
    .select("*")
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WhatsAppConfigRow | null) ?? null;
}

export async function metaFetchPhoneInfo(phoneNumberId: string, accessToken: string) {
  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as any)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
}

/* =========================================================================
 * Status real do número na Cloud API + registro (v26.0)
 * ========================================================================= */
const META_VERSION_STATUS = "v26.0";

export interface MetaPhoneStatus {
  id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string | null;
  name_status: string | null;
  quality_rating: string | null;
}

/** Traduz o erro bruto da Meta em mensagem amigável, preservando código/mensagem originais. */
export function traduzErroMeta(err: any): string {
  const code = Number(err?.code ?? err?.error_subcode ?? NaN);
  const msg = String(err?.error_user_msg ?? err?.message ?? "Erro desconhecido");
  if (code === 133005 || /pin/i.test(msg)) {
    return "PIN incorreto. Se o número já teve verificação em duas etapas ativada, use o PIN antigo ou redefina no Gerenciador do WhatsApp.";
  }
  if (code === 133010) return "Número ainda não registrado na Cloud API.";
  if (code === 133006) return "O número precisa ser verificado na Meta antes de registrar.";
  if (code === 190) return "Token inválido ou expirado.";
  if (code === 200 || /permission/i.test(msg)) {
    return "O token não tem permissão para inscrever o app nesta conta. Confirme que o usuário do sistema tem acesso total à conta do WhatsApp e ao app na Meta.";
  }
  return `Meta${Number.isFinite(code) ? ` (#${code})` : ""}: ${msg}`;
}

export interface MetaSubscribedApp {
  id: string | null;
  name: string | null;
}

/** Lista os apps inscritos no webhook da WABA. */
export async function metaListSubscribedApps(
  wabaId: string,
  accessToken: string,
): Promise<MetaSubscribedApp[]> {
  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION_STATUS}/${wabaId}/subscribed_apps`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(traduzErroMeta(json?.error ?? {}));
  const list: any[] = Array.isArray(json?.data) ? json.data : [];
  return list.map((item) => ({
    id: item?.whatsapp_business_api_data?.id ?? item?.id ?? null,
    name: item?.whatsapp_business_api_data?.name ?? item?.name ?? null,
  }));
}

/** Inscreve o app (dono do token) no webhook da WABA. */
export async function metaSubscribeApp(
  wabaId: string,
  accessToken: string,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION_STATUS}/${wabaId}/subscribed_apps`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(traduzErroMeta(json?.error ?? {}));
  return { success: json?.success !== false };
}

export async function metaFetchPhoneStatus(
  phoneNumberId: string,
  accessToken: string,
): Promise<MetaPhoneStatus> {
  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION_STATUS}/${phoneNumberId}?fields=id,display_phone_number,verified_name,status,name_status,quality_rating`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(traduzErroMeta(json?.error ?? {}));
  return {
    id: json?.id ?? null,
    display_phone_number: json?.display_phone_number ?? null,
    verified_name: json?.verified_name ?? null,
    status: json?.status ?? null,
    name_status: json?.name_status ?? null,
    quality_rating: json?.quality_rating ?? null,
  };
}

export async function metaRegisterPhone(
  phoneNumberId: string,
  accessToken: string,
  pin: string,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION_STATUS}/${phoneNumberId}/register`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(traduzErroMeta(json?.error ?? {}));
  return { success: json?.success !== false };
}

export async function metaSendText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
  opcoes?: { timeoutMs?: number },
): Promise<{ wa_message_id: string | null }> {
  const res = await fetch(`https://graph.facebook.com/${META_VERSION}/${phoneNumberId}/messages`, {
    signal: opcoes?.timeoutMs ? AbortSignal.timeout(opcoes.timeoutMs) : undefined,
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text.slice(0, 4000) },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const metaErr = (json as any)?.error ?? {};
    const msg = metaErr.message ?? `HTTP ${res.status}`;
    const code = metaErr.code;
    // 190 = OAuth token inválido/expirado; 200/10 = sem permissão
    if (res.status === 401 || code === 190 || /authentication/i.test(String(msg))) {
      throw new Error(
        "Token do WhatsApp inválido ou expirado. Gere um novo Access Token no Meta Business Manager e salve em Configurações → WhatsApp.",
      );
    }
    // 133010 = número existe no app, mas não foi registrado na Cloud API
    if (code === 133010 || /not registered/i.test(String(msg))) {
      throw new Error(
        "O número do WhatsApp ainda não está registrado na Cloud API da Meta. No Meta Business Manager, abra WhatsApp → Configuração da API e clique em “Registrar” no número (informando o PIN de verificação em duas etapas). Depois tente enviar novamente.",
      );
    }
    // 131030 = destinatário não está na lista de números de teste
    if (code === 131030) {
      throw new Error(
        "Este número de destino não está autorizado no ambiente de testes do WhatsApp. Adicione-o à lista de destinatários permitidos na Meta ou use um número de produção.",
      );
    }
    throw Object.assign(new Error(`WhatsApp: ${msg}`), { status: res.status });
  }
  const wa_message_id = (json as any)?.messages?.[0]?.id ?? null;
  return { wa_message_id };
}

/**
 * Envia um template aprovado (HSM) — funciona fora da janela de 24h.
 */
export async function metaSendTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[] = [],
  /** Payload de cada botão de resposta rápida, na ordem dos botões do template. */
  quickReplyPayloads: string[] = [],
): Promise<{ wa_message_id: string | null }> {
  const lista: unknown[] = [];
  if (bodyParams.length > 0) {
    lista.push({
      type: "body",
      parameters: bodyParams.map((t) => ({ type: "text", text: t.slice(0, 400) })),
    });
  }
  quickReplyPayloads.forEach((payload, index) => {
    lista.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload }],
    });
  });
  const components = lista.length > 0 ? lista : undefined;
  const res = await fetch(`https://graph.facebook.com/${META_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        ...(components ? { components } : {}),
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const metaErr = (json as any)?.error ?? {};
    const msg = metaErr.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || metaErr.code === 190) {
      throw new Error(
        "Token do WhatsApp inválido ou expirado. Gere um novo Access Token e salve em Configuração.",
      );
    }
    throw new Error(`WhatsApp: ${msg}`);
  }
  return { wa_message_id: (json as any)?.messages?.[0]?.id ?? null };
}

/**
 * Compara hora atual de São Paulo com horario_inicio/fim configurados.
 */
export function dentroHorarioAtendimento(cfg: WhatsAppConfigRow, now: Date = new Date()): boolean {
  const inicio = cfg.horario_inicio ?? "08:00";
  const fim = cfg.horario_fim ?? "18:00";
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  });
  const hhmm = fmt.format(now); // "HH:MM"
  return hhmm >= inicio.slice(0, 5) && hhmm <= fim.slice(0, 5);
}

/**
 * Gera resposta automática da Nina usando o mesmo gateway de IA da chatNina,
 * porém sem exigir sessão de usuário (chamado a partir do webhook).
 */
/**
 * Extrai possíveis identificadores (CPF, telefone, nome) do texto do paciente.
 * Usado para tentar reconhecê-lo antes de pedir dados.
 */
function extrairIdentificadores(mensagem: string): {
  cpf: string | null;
  telefone: string | null;
  nome: string | null;
} {
  const texto = mensagem ?? "";
  const cpfMatch = texto.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  const cpfDigits = cpfMatch ? cpfMatch[0].replace(/\D/g, "") : "";
  // Telefone: 10 ou 11 dígitos consecutivos (com ou sem máscara/DDI)
  const telMatch = texto.replace(/\D/g, "").match(/\d{10,13}/);
  const telDigits =
    (telMatch && telMatch[0].length !== 11) || !cpfDigits ? (telMatch?.[0] ?? "") : "";
  // Nome candidato: sequência de 2+ palavras alfabéticas iniciando com maiúsculas
  // (regex simples — a IA fará o resto)
  const nomeMatch = texto.match(
    /\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){1,4})\b/,
  );
  return {
    cpf: cpfDigits.length === 11 ? cpfDigits : null,
    telefone: telDigits && telDigits.length >= 10 ? telDigits : null,
    nome: nomeMatch ? nomeMatch[1] : null,
  };
}

/** Normaliza telefone do remetente WhatsApp (regra única do sistema). */
function normalizarTelefoneRemetente(from: string | null | undefined): string | null {
  return normalizarTelefone(from);
}

async function identificarPaciente(
  clinicaId: string,
  mensagem: string,
  telefoneRemetente: string | null,
): Promise<import("@/lib/nina/identidade-paciente").BuscaIdentidade | null> {
  const ids = extrairIdentificadores(mensagem);
  const telBusca = telefoneRemetente ?? ids.telefone;
  if (!ids.cpf && !telBusca && !ids.nome) return null;

  const { data, error } = await supabaseAdmin.rpc("buscar_paciente_contato", {
    _clinica_id: clinicaId,
    _cpf: ids.cpf ?? undefined,
    _telefone: telBusca ?? undefined,
    _nome: ids.nome ?? undefined,
  });
  if (error) {
    console.error("[Nina] buscar_paciente_contato error", error);
    return null;
  }
  const rows = (data ?? []) as Array<{
    id: string;
    nome: string;
    associado: boolean;
    convenio_nome: string | null;
  }>;
  // FASE 4 — devolve TODOS os candidatos. `rows[0]` não decide identidade.
  return {
    candidates: rows.map((r) => ({
      id: r.id,
      nome: r.nome ?? null,
      associado: Boolean(r.associado),
      convenio_nome: r.convenio_nome ?? null,
    })),
    viaCpf: Boolean(ids.cpf),
  };
}


/**
 * Estado de identidade da conversa (por telefone), para a Nina não repetir a
 * confirmação de identidade a cada resposta.
 */
export interface EstadoIdentidade {
  conversaId: string | null;
  confirmada: boolean;
  perguntadaEm: string | null;
  tentativas: number;
  /** Paciente já vinculado à conversa (identificação anterior). */
  pacienteIdConversa: string | null;
  /** Estado estruturado do fluxo da Nina, gravado na conversa. */
  fluxoEstadoBruto: unknown;
  /**
   * Momento em que a conversa foi encerrada por um atendente. Tudo que veio
   * antes disso NÃO entra no contexto da IA: encerrar = zerar a memória.
   */
  memoriaDesde: string | null;
}

async function carregarEstadoIdentidade(
  clinicaId: string,
  telefone: string | null,
): Promise<EstadoIdentidade> {
  const vazio: EstadoIdentidade = {
    conversaId: null,
    confirmada: false,
    perguntadaEm: null,
    tentativas: 0,
    pacienteIdConversa: null,
    fluxoEstadoBruto: null,
    memoriaDesde: null,
  };

  if (!telefone) return vazio;
  // Telefone sempre em dígitos: a Meta manda ora "55…", ora "+55…" — sem
  // normalizar, o mesmo contato virava duas conversas.
  const digits = String(telefone).replace(/\D/g, "");
  if (!digits) return vazio;
  const { data } = await supabaseAdmin
    .from("atend_conversas")
    .select(
      "id, identidade_confirmada, identidade_perguntada_em, identidade_tentativas, contato_paciente_id, nina_fluxo_estado, resolved_at, closed_at",
    )
    .eq("clinica_id", clinicaId)
    .in("contato_telefone", [digits, `+${digits}`])
    .order("ultima_msg_em", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (data) {
    const fim = [(data as any).resolved_at, (data as any).closed_at]
      .filter(Boolean)
      .sort()
      .pop() as string | undefined;
    return {
      conversaId: (data as any).id,
      confirmada: (data as any).identidade_confirmada === true,
      perguntadaEm: (data as any).identidade_perguntada_em ?? null,
      tentativas: Number((data as any).identidade_tentativas ?? 0),
      pacienteIdConversa: (data as any).contato_paciente_id ?? null,
      fluxoEstadoBruto: (data as any).nina_fluxo_estado ?? null,
      memoriaDesde: fim ?? null,
    };
  }


  const { data: nova } = await supabaseAdmin
    .from("atend_conversas")
    .insert({
      clinica_id: clinicaId,
      canal: "whatsapp",
      contato_telefone: digits,
      status: "aberta",
      ultima_msg_em: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  return { ...vazio, conversaId: (nova as any)?.id ?? null };
}

const CONFIRMACOES = /\b(sim|sou eu|isso|isso mesmo|correto|exato|positivo|eu mesmo|eu mesma)\b/i;

async function salvarEstadoIdentidade(
  estado: EstadoIdentidade,
  patch: {
    identidade_confirmada?: boolean;
    identidade_perguntada_em?: string | null;
    identidade_tentativas?: number;
  },
): Promise<void> {
  if (!estado.conversaId) return;
  await supabaseAdmin.from("atend_conversas").update(patch).eq("id", estado.conversaId);
}

/**
 * FASE 2 — envelope de auditoria. A geração da resposta roda dentro de um
 * coletor de evidências próprio da requisição; ao final, o que foi coletado é
 * gravado e vinculado à execução que produziu a resposta. Nada aqui altera o
 * comportamento da Nina: falha de auditoria não interrompe o atendimento.
 */
import { ehFerramentaCritica } from "@/lib/nina/revisao";
import { criarGuardiaoReservaTurno, ErroReservaTurnoPerdida } from "@/lib/nina/reserva-turno";

export async function gerarRespostaNina(
  clinicaId: string,
  mensagemPaciente: string,
  telefoneRemetente?: string | null,
  opcoes?: {
    teste?: boolean;
    /** FASE 4 — ambiente explícito de QA (produção/homologação/teste automatizado). */
    ambiente?: import("@/lib/nina/confianca-execucao").AmbienteQA;
    auditoria?: {
      execucaoId?: string | null;
      /** FASE 5 — contrato do resultado quando a resposta é determinística. */
      resultado?: import("@/lib/nina/resposta/contrato").ResultadoRespostaNina;
    };
    /** IDs reais das mensagens de entrada que originaram esta resposta. */
    mensagensEntrada?: string[];
    /**
     * FASE 4 — revisão da conversa que esta geração está processando. Serve
     * para não executar ação crítica sobre estado já ultrapassado.
     */
    revisao?: { telefone: string; valor: number };
    /**
     * FASE 5 — lote (Message Burst) tratado como UM turno do paciente.
     * `mensagensEntrada` continua sendo o histórico físico; aqui viaja o
     * vínculo lógico usado por intenção, estado e auditoria.
     */
    lote?: { batchId: string | null; revisao: number | null };
    /** Reserva do lote ainda pertence ao chamador. Falha interrompe sem fallback. */
    validarReservaTurno?: () => Promise<boolean>;
  },
): Promise<string> {
  const { comColetor } = await import("@/lib/nina/evidencias.server");
  const conferirReserva = criarGuardiaoReservaTurno(opcoes?.validarReservaTurno);
  const auditoria: {
    execucaoId?: string | null;
    resultado?: import("@/lib/nina/resposta/contrato").ResultadoRespostaNina;
  } = opcoes?.auditoria ?? { execucaoId: null };

  // TRACE — mesmo núcleo, mesma instrumentação: WhatsApp real e homologação
  // produzem o mesmo rastro (Nina → Arquitetura → Execução).
  const { criarRastro } = await import("@/lib/nina/arquitetura/tracing");
  const traceId = crypto.randomUUID();
  const rastro = criarRastro({
    trace_id: traceId,
    execution_id: traceId,
    conversation_id: null,
    message_id: opcoes?.mensagensEntrada?.[0] ?? null,
  });
  if (opcoes?.auditoria) (opcoes.auditoria as { traceId?: string }).traceId = traceId;
  rastro.iniciar("message.inbound", {
    origem: opcoes?.teste ? "homologacao" : "whatsapp",
    tamanho_mensagem: mensagemPaciente.length,
    // FASE 5 — turno lógico: quantas mensagens físicas ele agrega.
    batch_id: opcoes?.lote?.batchId ?? null,
    mensagens_no_lote: opcoes?.mensagensEntrada?.length ?? 1,
  });

  // FASE 1 (Rastreabilidade) — registro do turno: versão usada, se o modelo foi
  // chamado, origem do texto, transformações e lacunas.
  const {
    comRegistroTurno,
    gravarResumoTurno,
    diagnosticoAutorizado,
    registrarOrigemResposta,
    registrarEntregaDoTurno,
  } = await import("@/lib/nina/rastreio/turno.server");
  const podeDiagnosticar = await diagnosticoAutorizado(clinicaId);

  const { resultado: saida, registro } = await comRegistroTurno(
    {
      turnoId: traceId,
      clinicaId,
      ambiente: opcoes?.ambiente ?? (opcoes?.teste ? "homologacao" : "producao"),
      teste: opcoes?.teste === true,
      batchId: opcoes?.lote?.batchId ?? null,
      mensagensEntrada: opcoes?.mensagensEntrada ?? [],
      revisaoConversa: opcoes?.lote?.revisao ?? null,
      diagnostico: podeDiagnosticar,
    },
    async () => {
      try {
        const { resultado, coletor } = await comColetor(async (c) => {
          await conferirReserva();
          if (opcoes?.mensagensEntrada?.length) c.mensagensEntrada(opcoes.mensagensEntrada);
          const texto = await gerarRespostaNinaInterno(clinicaId, mensagemPaciente, telefoneRemetente, {
            ...opcoes,
            auditoria,
            rastro,
            validarReservaTurno: conferirReserva,
          });
          // Inclui saídas antecipadas do gate e chamadores sem transporte.
          const { removerEmojisNina } = await import("@/lib/nina/resposta/sem-emojis");
          return removerEmojisNina(texto);
        });
        await conferirReserva();
        rastro.concluir("message.inbound", { resposta_tamanho: resultado.length });
        const { hashDoTexto } = await import("@/lib/nina/confidence/hash");
        const resultadoDoTurno = auditoria.resultado;
        const avisoExistente = resultadoDoTurno?.avisoExistente;
        if (resultadoDoTurno?.estado !== "descartar") {
          registrarEntregaDoTurno({
            mensagemId: null,
            textoHash: hashDoTexto(resultado),
            tamanho: resultado.length,
            canal: opcoes?.teste ? "test-console" : "whatsapp",
          });
        } else if (avisoExistente?.estado === "confirmado" && avisoExistente.mensagemId) {
          // A saída do turno já existe: o texto vazio é apenas controle de fluxo.
          registrarEntregaDoTurno({
            mensagemId: avisoExistente.mensagemId,
            textoHash: avisoExistente.texto ? hashDoTexto(avisoExistente.texto) : null,
            tamanho: avisoExistente.texto?.length ?? null,
            canal: opcoes?.teste ? "test-console" : "whatsapp",
          });
        }
        const { gravarEvidencias } = await import("@/lib/nina/evidencias.server");
        await gravarEvidencias(auditoria.execucaoId ?? null, clinicaId, coletor);
        return { ok: true as const, resultado };
      } catch (e) {
        rastro.falhar("error.handle", e);
        rastro.falhar("message.inbound", e);
        registrarOrigemResposta(
          e instanceof ErroReservaTurnoPerdida ? "nenhuma" : "fallback_erro",
          e instanceof Error ? e.message.slice(0, 200) : "falha na geração",
        );
        return { ok: false as const, erro: e };
      }
    },
  );

  // Gravação AGUARDADA: nada depende de tarefa que o runtime possa abandonar.
  await gravarResumoTurno(registro);
  const { descarregarRastroAguardando } = await import(
    "@/lib/nina/arquitetura/tracing.server"
  );
  await descarregarRastroAguardando(clinicaId, rastro);

  if (!saida.ok) throw saida.erro;
  return saida.resultado;
}

async function gerarRespostaNinaInterno(
  clinicaId: string,
  mensagemPaciente: string,
  telefoneRemetente?: string | null,
  /**
   * Console de Homologação: mesma IA, mas tudo que grava nasce como teste.
   * `auditoria` é um objeto do chamador preenchido com o id da execução que
   * produziu a resposta final — usado para vincular a mensagem enviada ao
   * registro técnico. Não altera o comportamento da Nina.
   */
  opcoes?: {
    teste?: boolean;
    ambiente?: import("@/lib/nina/confianca-execucao").AmbienteQA;
    auditoria?: {
      execucaoId?: string | null;
      resultado?: import("@/lib/nina/resposta/contrato").ResultadoRespostaNina;
    };
    mensagensEntrada?: string[];
    revisao?: { telefone: string; valor: number };
    lote?: { batchId: string | null; revisao: number | null };
    validarReservaTurno?: () => Promise<boolean>;
    rastro?: import("@/lib/nina/arquitetura/tracing").Rastro;
  },
): Promise<string> {
  const { registrarEtapa } = await import("@/lib/nina/evidencias.server");
  const rastro = opcoes?.rastro ?? null;
  const conferirReserva = opcoes?.validarReservaTurno ?? (async () => true);
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const telefoneNorm = normalizarTelefoneRemetente(telefoneRemetente ?? null);

  const [medR, dispR, procR, cliR, pacienteInfo, medEspR, espR, estadoId, histR] =
    await Promise.all([
      // FONTE ÚNICA (catálogo publicado): médicos, escalas e procedimentos da
      // tabela operacional NÃO entram mais no prompt. O que não estiver
      // publicado no catálogo é desconhecido e vira encaminhamento humano.
      Promise.resolve({ data: [] as any[] }),
      Promise.resolve({ data: [] as any[] }),
      Promise.resolve({ data: [] as any[] }),
      supabaseAdmin
        .from("clinicas")
        .select("nome, base_importada, endereco, cidade, estado, cep, telefone, email")
        .eq("id", clinicaId)
        .maybeSingle(),
      opcoes?.teste ? Promise.resolve(null) : identificarPaciente(clinicaId, mensagemPaciente, telefoneNorm),
      Promise.resolve({ data: [] as any[] }),
      Promise.resolve({ data: [] as any[] }),
      carregarEstadoIdentidade(clinicaId, telefoneRemetente ? String(telefoneRemetente) : null),
      telefoneRemetente
        ? supabaseAdmin
            .from("whatsapp_mensagens")
            .select("id, direction, body, created_at, conversa_id, status, is_teste, enviada_por")
            .eq("clinica_id", clinicaId)
            // Marcadores de sistema (divisores de ciclo, avisos internos) são
            // só para leitura humana: nunca entram no contexto do modelo.
            .neq("status", "system")
            .or(`from_number.eq.${telefoneRemetente},to_number.eq.${telefoneRemetente}`)
            .order("created_at", { ascending: false })
            .limit(10)

        : Promise.resolve({ data: [] as any[] }),
    ]);

  const baseImportada = (cliR.data as any)?.base_importada === true;
  const clinicaRow = (cliR.data ?? null) as {
    nome?: string | null;
    endereco?: string | null;
    cidade?: string | null;
    estado?: string | null;
    cep?: string | null;
    telefone?: string | null;
    email?: string | null;
  } | null;
  const nomeUnidade = clinicaRow?.nome ?? "esta unidade";
  const enderecoUnidade = [
    clinicaRow?.endereco,
    [clinicaRow?.cidade, clinicaRow?.estado].filter(Boolean).join("/"),
    clinicaRow?.cep,
  ]
    .filter((p) => p && String(p).trim())
    .join(" - ");

  const { data: agendasData } = await supabaseAdmin
    .from("medico_agendas")
    .select("id, medico_id, nome, ativo")
    .eq("clinica_id", clinicaId);
  const agendaNome = new Map<string, string>();
  for (const a of (agendasData ?? []) as any[]) agendaNome.set(a.id, a.nome);
  const agendasPorMedico = new Map<string, number>();
  for (const a of (agendasData ?? []) as any[]) {
    if (a.ativo === false) continue;
    agendasPorMedico.set(a.medico_id, (agendasPorMedico.get(a.medico_id) ?? 0) + 1);
  }

  // Especialidades por médico
  const espNomePorId = new Map<string, string>();
  for (const e of (espR.data ?? []) as any[]) espNomePorId.set(e.id, e.nome);
  const medEspNomes = new Map<string, string[]>();
  for (const r of (medEspR.data ?? []) as any[]) {
    const nome = espNomePorId.get(r.especialidade_id);
    if (!nome) continue;
    const arr = medEspNomes.get(r.medico_id) ?? [];
    arr.push(nome);
    medEspNomes.set(r.medico_id, arr);
  }

  const medicosLista = (medR.data ?? []).map((m: any) => {
    const disps = (dispR.data ?? []).filter((d: any) => d.medico_id === m.id);
    const temMultiplas = (agendasPorMedico.get(m.id) ?? 0) > 1;
    const dias = new Set<number>(disps.map((d: any) => Number(d.dia_semana)));

    // Agrupa por agenda → dia, mescla turnos sobrepostos/contíguos
    const porAgenda = new Map<string, Map<number, Array<[string, string]>>>();
    for (const d of disps) {
      const ini = String(d.hora_inicio ?? "").slice(0, 5);
      const fim = String(d.hora_fim ?? "").slice(0, 5);
      if (!ini || !fim) continue;
      const ag = d.agenda_id ?? "_";
      if (!porAgenda.has(ag)) porAgenda.set(ag, new Map());
      const porDia = porAgenda.get(ag)!;
      const arr = porDia.get(d.dia_semana) ?? [];
      arr.push([ini, fim]);
      porDia.set(d.dia_semana, arr);
    }

    const formatPorDia = (porDia: Map<number, Array<[string, string]>>) => {
      const partes: string[] = [];
      for (const [dia, turnos] of [...porDia.entries()].sort((a, b) => a[0] - b[0])) {
        turnos.sort((a, b) => a[0].localeCompare(b[0]));
        const merged: Array<[string, string]> = [];
        for (const [ini, fim] of turnos) {
          const last = merged[merged.length - 1];
          if (last && ini <= last[1]) {
            if (fim > last[1]) last[1] = fim;
          } else {
            merged.push([ini, fim]);
          }
        }
        partes.push(`${DIAS[dia] ?? "?"} ${merged.map(([a, b]) => `${a}-${b}`).join(" e ")}`);
      }
      return partes.join(", ");
    };

    const esps = medEspNomes.get(m.id) ?? [];
    const sufixoEsp = esps.length ? ` (${esps.join(", ")})` : "";

    if (!temMultiplas) {
      // Junta tudo num único conjunto
      const unico = new Map<number, Array<[string, string]>>();
      for (const porDia of porAgenda.values()) {
        for (const [dia, turnos] of porDia.entries()) {
          const arr = unico.get(dia) ?? [];
          arr.push(...turnos);
          unico.set(dia, arr);
        }
      }
      const horarios = formatPorDia(unico);
      return {
        id: m.id,
        nome: m.nome,
        esps,
        dias,
        texto: `- ${m.nome}${sufixoEsp}${horarios ? ` | ${horarios}` : ""}`,
      };
    }

    // Mostra separado por agenda
    const blocos: string[] = [];
    for (const [ag, porDia] of porAgenda.entries()) {
      const nome = agendaNome.get(ag) ?? "Agenda";
      const horarios = formatPorDia(porDia);
      if (horarios) blocos.push(`    • ${nome}: ${horarios}`);
    }
    return {
      id: m.id,
      nome: m.nome,
      esps,
      dias,
      texto: `- ${m.nome}${sufixoEsp}${blocos.length ? `\n${blocos.join("\n")}` : ""}`,
    };
  });

  // Nada de lista de médicos, especialidades ou tabela de preços no prompt: a
  // única fonte factual é o catálogo publicado, consultado por ferramenta.
  const SEM_FONTE_NO_PROMPT =
    "(não disponível aqui — consulte SEMPRE a ferramenta consultar_base_conhecimento. Sem registro PUBLICADO, não responda por conhecimento próprio: encaminhe para atendimento humano com solicitar_atendente_humano.)";
  const medicos = SEM_FONTE_NO_PROMPT;
  const procs = SEM_FONTE_NO_PROMPT;
  const espsCadastradasTexto = SEM_FONTE_NO_PROMPT;
  void medicosLista;

  const textoNorm = normalizar(mensagemPaciente);
  const blocoFoco = "";

  /* ---------- Confirmação de identidade (uma vez por conversa) ---------- */
  // FASE 4 — o telefone só traz CANDIDATOS. A pessoa é reconhecida quando o
  // nome dito por ela casa com um candidato (isso também desempata) ou quando
  // ela confirma explicitamente um candidato único.
  const candidatosBusca = pacienteInfo?.candidates ?? [];
  const candidatoPeloNome =
    candidatosBusca.find((c) =>
      c.nome ? textoNorm.includes(normalizar(String(c.nome).split(" ")[0] ?? "")) : false,
    ) ?? null;
  const respondeuConfirmando =
    Boolean(candidatoPeloNome) ||
    (CONFIRMACOES.test(mensagemPaciente) && candidatosBusca.length === 1);
  let identidadeConfirmada = estadoId.confirmada;
  if (!identidadeConfirmada && estadoId.perguntadaEm && respondeuConfirmando) {
    identidadeConfirmada = true;
    await salvarEstadoIdentidade(estadoId, { identidade_confirmada: true });
  }

  const { resolverIdentidadePaciente, fatosRemetente, primeiroNomeSeguro } = await import(
    "@/lib/nina/identidade-paciente"
  );
  const identidadePaciente = resolverIdentidadePaciente(
    candidatoPeloNome
      ? { candidates: [candidatoPeloNome], viaCpf: pacienteInfo?.viaCpf ?? false }
      : pacienteInfo,
    {
      confirmadoNaConversa: identidadeConfirmada,
      pacienteVinculadoId: estadoId.pacienteIdConversa ?? null,
    },
  );

  const primeiroNome = primeiroNomeSeguro(identidadePaciente);
  const blocoIdentidade =
    identidadePaciente.status === "CONFIRMED"
      ? `IDENTIDADE: já confirmada nesta conversa${primeiroNome ? ` (${primeiroNome})` : ""}. NUNCA volte a perguntar quem é a pessoa; trate-a pelo primeiro nome.`
      : identidadePaciente.status === "AMBIGUOUS"
        ? `IDENTIDADE: este número está ligado a MAIS DE UM cadastro. NÃO chame a pessoa por nenhum desses nomes, não use dados, convênio, contrato ou histórico de nenhum deles. Peça, em uma linha, o nome completo de quem está falando.`
        : identidadePaciente.status === "UNIQUE_CANDIDATE"
          ? `IDENTIDADE: existe um cadastro compatível com este número, mas NÃO está confirmado. Não trate a pessoa por esse nome nem use dados desse cadastro. Se for necessário para a ação pedida, peça a confirmação do nome em uma linha, no fim da resposta.`
          : `IDENTIDADE: ainda não identificada. Você pode confirmar o nome UMA ÚNICA VEZ nesta conversa, e apenas se for necessário. Nunca abra a resposta com a confirmação: responda primeiro o que foi perguntado e, se ainda precisar, peça a confirmação no fim, em uma linha.`;


  // SESSÃO DA NINA (memória transitória com TTL deslizante, padrão 4h).
  // Encerrar a conversa NÃO apaga histórico, CRM, agendamentos nem Base: o que
  // vence é a MEMÓRIA de sessão. Dentro da janela, a Nina continua entendendo o
  // contexto; fora dela, começa uma sessão nova sem arrastar assunto antigo.
  const { resolverSessao, persistirEstadoSessao } = await import("@/lib/nina/sessao.server");
  const { ttlSessaoMinutos } = await import("@/lib/nina/sessao");
  const sessaoNina = resolverSessao(estadoId.fluxoEstadoBruto, estadoId.memoriaDesde);
  if (sessaoNina.expirou || sessaoNina.saneouEncerramento) {
    await conferirReserva();
    await persistirEstadoSessao(clinicaId, estadoId.conversaId, sessaoNina.estado);
  }
  const corteMemoria = Date.now() - ttlSessaoMinutos() * 60_000;
  const msgsMemoria = (((histR as any)?.data ?? []) as any[]).filter((m: any) => {
    const t = Date.parse(String(m?.created_at ?? ""));
    return !Number.isFinite(t) || t >= corteMemoria;
  });

  // Nome curto para a apresentação (o cadastro costuma trazer a unidade após um travessão).
  const nomeCurtoUnidade =
    String(nomeUnidade)
      .split(/\s+[—–-]\s+/)[0]
      ?.trim() || nomeUnidade;
  const dadosPublicos = {
    nome_oficial: nomeUnidade,
    nome_curto: nomeCurtoUnidade,
    endereco: enderecoUnidade || null,
    telefone: clinicaRow?.telefone ?? null,
    email: clinicaRow?.email ?? null,
  };

  // FASE 3 — leitura da intenção vira FATO no runtime context (não texto de
  // prompt). A flag da Fase 1 continua existindo para o restante do fluxo.
  const fase1Ativa = await (async () => {
    try {
      const { flagFluxoFase1Ativa } = await import("@/lib/nina/atendimento-fase1.server");
      return await flagFluxoFase1Ativa(clinicaId);
    } catch {
      return false;
    }
  })();
  const { detectarIntencoes, intencaoAmbigua } = await import("@/lib/nina/atendimento-fase1");
  const intencoesTurno = detectarIntencoes(mensagemPaciente);
  const intencaoAmbiguaTurno = intencaoAmbigua(mensagemPaciente, intencoesTurno);

  // Fatos de identificação do remetente. Nome/convênio/benefício só entram
  // quando a identidade está CONFIRMADA (FASE 4).
  const contextoRemetenteFato = fatosRemetente(identidadePaciente);



  // FASE 3 — BEHAVIOR PROMPT: única fonte comportamental é a versão PUBLICADA
  // em Arquitetura → Instruções da Nina. Placeholders permitidos: só DADOS.
  // Snapshot único por execução.
  const { promptInstrucoes } = await import("@/lib/nina/instrucoes-runtime.server");
  const { PROMPT_NINA_WHATSAPP_V4 } = await import("@/lib/nina/prompt/behavior-v4");
  // FASE 2 — IDENTIDADE EFETIVA: nome da assistente, nome e tipo do
  // estabelecimento saem do bloco publicado NA MESMA versão que gera as
  // instruções do turno. `clinicas.nome` continua sendo dado ADMINISTRATIVO
  // (segue em `dadosPublicos`) e nunca substitui a identidade de apresentação.
  const {
    resolverIdentidadeEfetiva,
    valoresIdentidade,
    fatosIdentidade,
    nomeCompletoEstabelecimento,
  } = await import("@/lib/nina/identidade-efetiva");
  // Prompt de reserva também consome a identidade efetiva: sem identidade
  // publicada ele fala de forma NEUTRA, sem fixar outra persona.
  const valoresNeutros = valoresIdentidade(
    resolverIdentidadeEfetiva({ template: "", origem: "codigo", versao: null, versaoId: null }),
  );
  const promptReserva = Object.entries(valoresNeutros).reduce(
    (texto, [marcador, valor]) => texto.split(marcador).join(valor),
    PROMPT_NINA_WHATSAPP_V4,
  );
  const instrucoesNina = await promptInstrucoes(
    "whatsapp",
    // Os valores dependem do PRÓPRIO texto da versão do turno: instruções e
    // identidade nunca vêm de versões diferentes.
    (template) =>
      valoresIdentidade(
        resolverIdentidadeEfetiva({
          template,
          origem: "publicada",
          versao: null,
          versaoId: null,
        }),
      ),
    promptReserva,
    // FASE 2 — versão FIXA por turno: todas as rodadas usam este snapshot,
    // mesmo que alguém publique no meio da resposta.
    rastro?.ids.trace_id ?? null,
  );
  const behaviorPrompt = instrucoesNina.texto;
  const identidadeEfetiva = resolverIdentidadeEfetiva({
    template: instrucoesNina.template,
    origem: instrucoesNina.origem,
    versao: instrucoesNina.versao,
    versaoId: instrucoesNina.versaoId,
  });
  const nomeApresentacao = identidadeEfetiva.apresentacao.estabelecimento;
  // A etapa usa a apresentação realmente entregue na sessão e a identidade
  // desta publicação. Recupera sessões afetadas pelo antigo detector literal,
  // sem considerar candidatos não enviados ou mensagens de outros atendentes.
  const {
    garantirSessaoAtiva,
    avaliarSaudacao,
    marcarSaudacaoConcluida,
    recuperarSaudacaoEntregue,
    contemApresentacaoPublicada,
  } = await import("@/lib/nina/saudacao-sessao");
  const recuperacaoSaudacao = identidadeEfetiva.ok
    ? recuperarSaudacaoEntregue(sessaoNina.estado, msgsMemoria, identidadeEfetiva.apresentacao, {
        conversaId: estadoId.conversaId ?? null,
        teste: opcoes?.teste === true,
      })
    : null;
  if (recuperacaoSaudacao?.recuperada) {
    await conferirReserva();
    sessaoNina.estado = recuperacaoSaudacao.estado;
    await persistirEstadoSessao(clinicaId, estadoId.conversaId, sessaoNina.estado);
  }
  const sessaoSaudacao = garantirSessaoAtiva(sessaoNina.estado);
  sessaoNina.estado = sessaoSaudacao.estado;
  const saudacaoObrigatoria = sessaoSaudacao.saudacaoObrigatoria;
  const jaSeApresentou = !saudacaoObrigatoria;
  console.info("[NINA_SESSION]", {
    conversa_id: estadoId.conversaId,
    nina_session_id: sessaoNina.estado.session_id,
    new_session: sessaoSaudacao.novaSessao || sessaoNina.expirou,
    greeting_required: saudacaoObrigatoria,
    greeting_completed: sessaoNina.estado.greeting_completed === true,
    greeting_recovered_from_message_id: recuperacaoSaudacao?.mensagemId ?? null,
  });
  if (!identidadeEfetiva.ok) {
    console.warn("[NINA_IDENTIDADE]", {
      clinica_id: clinicaId,
      versao: identidadeEfetiva.versao,
      origem_prompt: instrucoesNina.origem,
      motivo: identidadeEfetiva.motivo,
      detalhe: identidadeEfetiva.detalhe,
    });
  }

  rastro?.concluir("instructions.published", {
    versao: instrucoesNina.versao ?? null,
    origem: instrucoesNina.origem ?? null,
    publicado_em: instrucoesNina.publicadoEm ?? null,
    motivo_origem: instrucoesNina.motivo ?? null,
    identidade: fatosIdentidade(identidadeEfetiva),
  });

  // FASE 6 — rastreabilidade: guarda a REFERÊNCIA da versão usada nesta
  // execução (não o texto). Mensagens antigas continuam mostrando a versão
  // que valia na época, mesmo depois de novas publicações.
  {
    const { registrarPromptDaExecucao } = await import("@/lib/nina/evidencias.server");
    registrarPromptDaExecucao({
      escopo: "whatsapp",
      versaoId: instrucoesNina.versaoId,
      versao: instrucoesNina.versao,
      publicadoEm: instrucoesNina.publicadoEm,
      origem: instrucoesNina.origem,
      conversaId: estadoId.conversaId ?? null,
    });
    // FASE 1 (Rastreabilidade) — SELEÇÃO DA VERSÃO registrada separadamente da
    // origem da resposta. `cache` aqui é funcionamento normal (TTL); só é
    // fallback por erro quando não houve versão publicada utilizável.
    const { hashDoTexto: hashPrompt } = await import("@/lib/nina/confidence/hash");
    const {
      registrarVersaoPromptDoTurno,
      registrarConversaDoTurno,
    } = await import("@/lib/nina/rastreio/turno.server");
    registrarConversaDoTurno(estadoId.conversaId ?? null);
    registrarVersaoPromptDoTurno({
      escopo: "whatsapp",
      versaoId: instrucoesNina.versaoId,
      versao: instrucoesNina.versao,
      publicadoEm: instrucoesNina.publicadoEm,
      origem: instrucoesNina.origem,
      // FASE 2 — o próprio runtime informa se houve falha e por quê; não é
      // mais deduzido aqui.
      fallbackPorErro: instrucoesNina.fallbackPorErro,
      motivo: instrucoesNina.motivo,
      hash: hashPrompt(behaviorPrompt),
      carregadoEm: new Date().toISOString(),
    });
  }

  // ---------------------------------------------------------------- agendar
  // Quando a flag está ligada nesta clínica, a Nina deixa de ser somente
  // leitura: ela consulta a agenda REAL e marca, usando o mesmo núcleo de
  // regras da recepção. Fora disso, nada muda (comportamento antigo intacto).
  const { ferramentasAgendaAtivas } = await import("@/lib/nina/agenda-flag.server");
  const podeAgendar = await ferramentasAgendaAtivas(clinicaId);

  // Aprendizados APROVADOS pela equipe desta clínica, relevantes para a
  // mensagem atual. Nunca substituem dado vivo (preço/horário/agenda).
  const { recuperarAprendizados } = await import("@/lib/nina/aprendizado.server");
  const aprendizados = await recuperarAprendizados(clinicaId, "whatsapp", mensagemPaciente).catch(
    () => [],
  );

  // ------------------------------------------- estado estruturado do fluxo
  // Recarregado da própria conversa. É isto que faz o paciente já
  // identificado continuar identificado na mensagem seguinte.
  const { normalizarEstado, salvarFluxoEstado: salvarFluxoSemGuarda } = await import("@/lib/nina/fluxo-estado.server");
  const salvarFluxoEstado: typeof salvarFluxoSemGuarda = async (...args) => {
    await conferirReserva();
    return salvarFluxoSemGuarda(...args);
  };

  // Estado já passado pelo TTL de sessão (ver `sessaoNina` acima).
  const fluxoEstado = sessaoNina.estado ?? normalizarEstado(estadoId.fluxoEstadoBruto);
  // Fallbacks de reidratação, em ordem de confiança: estado do fluxo →
  // paciente já vinculado à conversa → identidade CONFIRMADA nesta execução.
  // FASE 4: candidato compatível por telefone NÃO entra aqui.
  let pacienteIdEfetivo =
    fluxoEstado.patient.id ?? estadoId.pacienteIdConversa ?? identidadePaciente.paciente?.id ?? null;
  let pacienteNomeEfetivo = identidadePaciente.paciente?.nome ?? null;
  if (pacienteIdEfetivo && !pacienteNomeEfetivo) {
    const { data: pRow } = await supabaseAdmin
      .from("pacientes")
      .select("nome")
      .eq("id", pacienteIdEfetivo)
      .eq("clinica_id", clinicaId)
      .maybeSingle();
    pacienteNomeEfetivo = (pRow as any)?.nome ?? null;
    if (!pacienteNomeEfetivo) pacienteIdEfetivo = null; // cadastro sumiu/outra clínica
  }
  // FASE 3: o vínculo só é gravado quando a identidade foi CONFIRMADA pelo
  // fluxo (identificação da Nina), nunca por coincidência de telefone.
  const vinculoConfirmado = Boolean(fluxoEstado.patient.id && fluxoEstado.patient.validated);
  if (vinculoConfirmado && pacienteIdEfetivo && estadoId.conversaId && !estadoId.pacienteIdConversa) {
    const { vincularPacienteConversa } = await import("@/lib/atendimento/vinculo-contato.server");
    await vincularPacienteConversa(supabaseAdmin as never, {
      clinicaId,
      conversaId: estadoId.conversaId,
      pacienteId: pacienteIdEfetivo,
      origem: "nina_identificacao",
    });
  }
  if (pacienteIdEfetivo && !fluxoEstado.patient.identified) {
    fluxoEstado.patient = {
      ...fluxoEstado.patient,
      id: pacienteIdEfetivo,
      first_name: pacienteNomeEfetivo ? pacienteNomeEfetivo.split(" ")[0]! : null,
      identified: true,
      validated: true,
    };

  }

  if (rastro && estadoId?.conversaId) rastro.ids.conversation_id = estadoId.conversaId;

  // FASE 3 — o catálogo entra como FATO (o que existe publicado). As regras de
  // leitura do catálogo vivem no prompt publicado, não aqui.
  const catalogoPublicado = await (async () => {
    try {
      const { contarCatalogoPublicado } = await import("@/lib/nina/catalogo-prompt.server");
      return await contarCatalogoPublicado(clinicaId);
    } catch {
      return { servicos: 0, profissionais: 0 };
    }
  })();
  const baseAtiva = catalogoPublicado.servicos > 0 || catalogoPublicado.profissionais > 0;
  rastro?.concluir("tool.knowledge.lookup", {
    base_ativa: baseAtiva,
    servicos: catalogoPublicado.servicos,
    profissionais: catalogoPublicado.profissionais,
  });

  // FASE 3 (entrada controlada no agendamento): a DECISÃO de estado continua
  // em código. O que saiu foi só o texto de prompt.
  await (async () => {
    try {
      const { flagFluxoFase3Ativa } = await import("@/lib/nina/atendimento-fase3.server");
      if (!(await flagFluxoFase3Ativa(clinicaId))) return;
      const { avaliarIntencaoAgendar } = await import("@/lib/nina/atendimento-fase3");
      const { confirmado } = avaliarIntencaoAgendar(mensagemPaciente, fluxoEstado);
      if (confirmado) {
        fluxoEstado.appointment = { ...fluxoEstado.appointment, intent_confirmed: true };
        if (fluxoEstado.flow.stage === "IDLE") {
          fluxoEstado.flow = { stage: "BOOKING_INTENT_CONFIRMED" };
        }
      }
    } catch {
      /* estado permanece como está */
    }
  })();

  // FASE 6: máquina de estados explícita. Deriva a etapa atual e a grava, para
  // a próxima mensagem já chegar na etapa certa.
  await (async () => {
    try {
      const { flagFluxoFase6Ativa } = await import("@/lib/nina/atendimento-fase6.server");
      if (!(await flagFluxoFase6Ativa(clinicaId))) return;
      const { derivarEtapa } = await import("@/lib/nina/atendimento-fase6");
      const etapa = derivarEtapa({
        mensagem: mensagemPaciente,
        estado: fluxoEstado,
        primeiraMensagem: !jaSeApresentou,
        intencoes: intencoesTurno as readonly string[],
      });
      fluxoEstado.flow = { stage: etapa };
    } catch {
      /* etapa permanece como está */
    }
  })();

  // Campos ainda necessários para identificar o paciente (fato, não ordem).
  const camposFaltantes = await (async () => {
    try {
      const { dadosFaltantes } = await import("@/lib/nina/atendimento-fase3");
      return dadosFaltantes(fluxoEstado, telefoneNorm) as readonly string[];
    } catch {
      return [] as readonly string[];
    }
  })();

  const { consultaAgendaAguardandoPaciente } =
    await import("@/lib/nina/consulta-agenda");
  const { historicoParaConsultaAgenda } = await import("@/lib/nina/consulta-agenda-historico");
  const idsDoTurno = new Set(opcoes?.mensagensEntrada ?? []);
  // A verificação da continuidade não pode usar o resumo truncado do modelo.
  // O count permite declarar explicitamente se o histórico da sessão veio completo.
  let historicoFluxoCompleto = false;
  let mensagensFluxo: Array<{
    id: string; conversa_id: string | null; direction: string; body: string | null;
    created_at: string; status: string | null; is_teste: boolean | null;
  }> = [];
  const inicioFluxo = sessaoNina.estado.session_started_at;
  if (estadoId.conversaId && inicioFluxo && Number.isFinite(Date.parse(inicioFluxo))) {
    const corteFluxo = new Date(Date.parse(inicioFluxo)).toISOString();
    let consultaHistorico = supabaseAdmin.from("whatsapp_mensagens")
      .select("id, conversa_id, direction, body, created_at, status, is_teste", { count: "exact" })
      .eq("clinica_id", clinicaId)
      .eq("conversa_id", estadoId.conversaId)
      .gte("created_at", corteFluxo);
    consultaHistorico = opcoes?.teste === true
      ? consultaHistorico.eq("is_teste", true)
      : consultaHistorico.or("is_teste.eq.false,is_teste.is.null");
    const h = await consultaHistorico.order("created_at", { ascending: true }).limit(1000);
    mensagensFluxo = h.data ?? [];
    historicoFluxoCompleto = !h.error && h.count !== null && h.count === mensagensFluxo.length;
  }
  // Snapshot só de mensagens já entregues da sessão. Respostas candidatas do
  // modelo e argumentos de ferramentas não podem fabricar aceite do paciente.
  const contextoConsultaAgenda: import("@/lib/nina/consulta-agenda").ContextoConsultaAgenda = {
    mensagemAtual: mensagemPaciente,
    mensagemAtualId: opcoes?.mensagensEntrada?.[0] ?? null,
    clinicaId,
    sessaoId: fluxoEstado.session_id ?? null,
    historico: historicoParaConsultaAgenda(historicoFluxoCompleto ? mensagensFluxo : msgsMemoria, {
      conversaId: estadoId.conversaId,
      inicioSessao: sessaoNina.estado.session_started_at ?? null,
      corteMemoria,
      teste: opcoes?.teste === true,
      idsDoTurno,
      incluirIds: true,
    }),
    medicoEscolhido: {
      id: fluxoEstado.appointment.doctor_id,
      nome: fluxoEstado.appointment.doctor_name,
    },
    disponibilidadeJaConsultada: Boolean(
      (fluxoEstado.appointment.slot_inicio && fluxoEstado.appointment.slot_fim) ||
      (fluxoEstado.appointment.slot_options?.session_id === fluxoEstado.session_id &&
        fluxoEstado.appointment.slot_options?.vagas.length),
    ),
  };

  // ------------------------------------------------------------------
  // PRECEDÊNCIA DO TURNO — antes do modelo, e agora também no fluxo NORMAL.
  // As regras da versão publicada aplicáveis a ESTA mensagem, ambiente e
  // sessão resolvem o conflito com a regra geral de apresentação. Se a
  // exceção publicada proíbe saudação, o contexto deixa de dizer que ela é
  // obrigatória — em vez de o prompt mandar uma coisa e o fato dizer outra.
  const { resolverPrecedenciaDoTurno } = await import("@/lib/nina/prompt/precedencia-turno");
  const { hashDoTexto: hashPrecedencia } = await import("@/lib/nina/confidence/hash");
  // Instruções adicionais do turno (esclarecimento, correção de rota) entram
  // pelo MESMO contrato, com origem, prioridade e motivo registrados.
  const instrucoesAdicionaisTurno: Array<{
    codigo: string;
    origem: string;
    motivo: string;
    texto: string;
  }> = [];
  // O motor antigo não impõe pendências aos novos turnos.
  fluxoEstado.clarification = undefined;
  const precedenciaTurno = resolverPrecedenciaDoTurno({
    instrucoesAdicionais: instrucoesAdicionaisTurno,
    textoPublicado: behaviorPrompt,
    escopo: "whatsapp",
    hash: hashPrecedencia(behaviorPrompt) ?? null,
    versao: instrucoesNina.versao != null ? String(instrucoesNina.versao) : null,
    versaoId: instrucoesNina.versaoId ?? null,
    publicadoEm: instrucoesNina.publicadoEm ?? null,
    mensagemPaciente,
    ambiente: opcoes?.teste ? "homologacao" : "producao",
    saudacaoObrigatoria,
  });
  const saudacaoObrigatoriaEfetivaTurno = precedenciaTurno.saudacaoObrigatoria;
  const saudacaoDispensadaPor = precedenciaTurno.saudacaoDispensadaPor;

  // ------------------------------------------------------------------
  // FASE 3 — RUNTIME CONTEXT: só FATOS. Nenhuma regra conversacional aqui.
  // ------------------------------------------------------------------
  const { conhecimentoDaMesmaSessao } = await import("@/lib/nina/confidence/conhecimento-sessao");
  const conhecimentoAnterior = conhecimentoDaMesmaSessao(fluxoEstado.knowledge_context, clinicaId, fluxoEstado.session_id ?? null);
  fluxoEstado.knowledge_context = conhecimentoAnterior;
  const runtimeContext = {
    canal: "whatsapp",
    ambiente: opcoes?.teste ? "homologacao" : "producao",
    // Dados ADMINISTRATIVOS da clínica correta (cadastro): nome oficial,
    // endereço e contatos. Não é a identidade de apresentação.
    unidade: dadosPublicos,
    // FASE 2 — identidade de APRESENTAÇÃO da versão publicada do turno.
    identidade_atendimento: fatosIdentidade(identidadeEfetiva),
    data_hora_atual: agoraNaClinica(),
    fluxo_fase1_ativo: fase1Ativa,
    intencoes: intencoesTurno,
    intencao_ambigua: intencaoAmbiguaTurno,
    sessao: {
      session_id: sessaoNina.estado.session_id ?? null,
      nova_sessao: sessaoSaudacao.novaSessao || sessaoNina.expirou,
      expirou: sessaoNina.expirou,
      continuacao: sessaoNina.continuacao,
      // Fato JÁ resolvido pela precedência: quando uma exceção publicada
      // aplicável proíbe saudação, o contexto não pode continuar dizendo que
      // ela é obrigatória.
      saudacao_obrigatoria: saudacaoObrigatoriaEfetivaTurno,
      saudacao_dispensada_por: saudacaoDispensadaPor,
    },
    identidade: {
      confirmada: identidadeConfirmada,
      ja_perguntada: Boolean(estadoId.perguntadaEm),
      primeiro_nome: primeiroNome,
    },
    paciente: {
      ...contextoRemetenteFato,
      identificado: Boolean(fluxoEstado.patient.identified && fluxoEstado.patient.id),
      primeiro_nome: fluxoEstado.patient.first_name ?? null,
    },
    base_pacientes_importada: baseImportada,
    campos_faltantes: camposFaltantes,
    etapa: fluxoEstado.flow.stage,
    agendamento: {
      modalidade_atendimento: fluxoEstado.appointment.modalidade_atendimento ?? null,
      agenda_id: fluxoEstado.appointment.agenda_id ?? null,
      intencao_confirmada: Boolean(fluxoEstado.appointment.intent_confirmed),
      procedimento: fluxoEstado.appointment.procedure ?? null,
      especialidade: fluxoEstado.appointment.specialty ?? null,
      profissional: fluxoEstado.appointment.doctor_name ?? null,
      data: fluxoEstado.appointment.date ?? null,
      hora: fluxoEstado.appointment.time ?? null,
      slot_inicio: fluxoEstado.appointment.slot_inicio ?? null,
      slot_fim: fluxoEstado.appointment.slot_fim ?? null,
      agendamento_id: fluxoEstado.appointment.appointment_id ?? null,
      opcoes_consultadas: fluxoEstado.appointment.slot_options?.session_id === fluxoEstado.session_id
        ? fluxoEstado.appointment.slot_options?.vagas ?? [] : [],
      confirmacao_final: fluxoEstado.appointment.confirmation ?? null,
    },
    catalogo: {
      publicado: baseAtiva,
      servicos: catalogoPublicado.servicos,
      profissionais: catalogoPublicado.profissionais,
      // Referência do assunto/pergunta, sem preços ou outros fatos antigos.
      referencia_da_sessao: conhecimentoAnterior
        ? {
            consulta: conhecimentoAnterior.consulta,
            esclarecimento: conhecimentoAnterior.esclarecimento ?? null,
            esclarecimento_tentativas:
              conhecimentoAnterior.esclarecimentoTentativas ??
              (conhecimentoAnterior.esclarecimento ? 1 : 0),
            esclarecimento_perguntas: conhecimentoAnterior.esclarecimentoPerguntas ?? [],
          }
        : null,
    },
    ferramentas: {
      pode_agendar: podeAgendar,
    },
    consulta_agenda: {
      ferramentas_de_consulta_disponiveis: true,
      interpretacao_intencao: "modelo_com_historico_da_sessao",
      permite_reservar: false,
      referencia_anterior_profissional: contextoConsultaAgenda.medicoEscolhido?.nome ?? null,
      fonte_horarios_habituais: "catalogo_publicado",
      fonte_vagas: "agenda",
    },
    aprendizados: (aprendizados as Array<{ tipo?: string; titulo?: string; conteudo?: string }>)
      .map((a) => ({
        tipo: a.tipo ?? null,
        titulo: a.titulo ?? null,
        conteudo: a.conteudo ?? null,
      })),
  };

  // COMPOSER — ponto único de montagem. Depois daqui nada mais é concatenado
  // ao system prompt.
  const { comporRequestNina } = await import("@/lib/nina/prompt-composer");
  const requestNina = comporRequestNina({
    behaviorPrompt,
    runtimeContext,
    contratoPrecedencia: precedenciaTurno.contrato,
  });
  const systemPromptFinal = requestNina.systemPrompt;

  // AUDITORIA DAS INSTRUÇÕES — regras identificadas no texto publicado deste
  // turno. Aplicáveis vêm da precedência já resolvida; as demais ficam
  // registradas como NÃO aplicáveis, e as sem interpretação como limitação.
  const auditoriaRegrasTurno = await (async () => {
    const { extrairRegrasPublicadas } = await import(
      "@/lib/nina/confidence/regras-publicadas"
    );
    const extracao = extrairRegrasPublicadas(behaviorPrompt, {
      escopo: "whatsapp",
      hash: hashPrecedencia(behaviorPrompt) ?? null,
      versao: instrucoesNina.versao != null ? String(instrucoesNina.versao) : null,
      versaoId: instrucoesNina.versaoId ?? null,
    });
    const aplicaveis = precedenciaTurno.regrasAplicaveis;
    const naoInterpretadas = extracao.regras.filter((r) => !r.interpretada);
    return {
      identificadas: extracao.regras,
      aplicaveis,
      naoInterpretadas,
      // Falha de interpretação: há texto com regras, mas NENHUMA foi
      // interpretada — nunca é o mesmo que "sem regras".
      falhaDeInterpretacao:
        extracao.regras.length > 0 && extracao.regras.every((r) => !r.interpretada),
      limitacoes: precedenciaTurno.resumo.limitacoes,
      suprimidas: precedenciaTurno.resultado.suprimidas.map((codigo) => ({
        codigo,
        motivo: "suprimida por exceção publicada aplicável a este turno",
        por: precedenciaTurno.saudacaoDispensadaPor,
      })),
      blocos: [
        { rotulo: "envelope técnico", origem: "sistema", texto: requestNina.envelope },
        {
          rotulo: "comportamento publicado",
          origem: "aba Arquitetura (versão publicada)",
          texto: behaviorPrompt,
        },
        {
          rotulo: "contrato de precedência",
          origem: "resolvedor de precedência do turno",
          texto: requestNina.contratoPrecedencia,
        },
        {
          rotulo: "contexto de execução",
          origem: "sistema (fatos do turno)",
          texto: JSON.stringify(requestNina.runtimeContext),
        },
      ],
    };
  })();


  let ctxFerramentas: import("@/lib/nina/paciente-tools.server").CtxNinaPaciente | null = null;
  let ferramentas: unknown[] | undefined;
  let executar:
    | typeof import("@/lib/nina/paciente-tools.server").executarFerramentaPaciente
    | null = null;
  {
    // Consulta de agenda vale para TODAS as clínicas (não cria nada, não
    // expõe paciente). Só as ferramentas que gravam dependem da flag.
    const mod = await import("@/lib/nina/paciente-tools.server");
    ferramentas = podeAgendar
      ? [...mod.FERRAMENTAS_NINA_PACIENTE]
      : [...mod.FERRAMENTAS_NINA_CONSULTA];
    // As leituras ficam acessíveis em todos os turnos. A escolha de consultar
    // vem da interpretação do modelo; expressões literais não removem tools.
    executar = async (...args) => {
      await conferirReserva();
      return mod.executarFerramentaPaciente(...args);
    };
    ctxFerramentas = {
      clinicaId,
      telefone: telefoneNorm,
      // Identificação persistente: telefone do remetente OU identificação
      // feita em qualquer mensagem anterior desta mesma conversa.
      pacienteId: pacienteIdEfetivo,
      pacienteNome: pacienteNomeEfetivo,
      conversaId: estadoId.conversaId,
      origem: opcoes?.teste ? "homologacao" : "whatsapp",
      podeAgendar,
      estado: fluxoEstado,
      teste: opcoes?.teste === true,
      consultaAgenda: contextoConsultaAgenda,
      nomeUnidade: identidadeEfetiva.ok ? nomeCompletoEstabelecimento(identidadeEfetiva.apresentacao) : "nossa clínica",
      opcoesAgendamentoInicioTurno: Boolean(
        fluxoEstado.appointment.slot_options?.session_id === fluxoEstado.session_id &&
        fluxoEstado.appointment.slot_options?.vagas.length),
    };
  }

  // ---------------------------------------------------------------------
  // REGRA DE NEGÓCIO (não é prompt): confirmou a vaga -> pedir nome + CPF +
  // nascimento -> identificar -> revalidar -> gravar -> confirmar. A ordem é
  // decidida aqui, em código, antes de qualquer chamada ao modelo.
  // ---------------------------------------------------------------------
  if (podeAgendar && ctxFerramentas && executar !== null) {
    const { aplicarGateIdentificacao } = await import("@/lib/nina/identificacao-gate.server");
    // FASE 5 — o texto do gate sai do template publicado (ou do padrão).
    const { carregarTemplatesPublicados } = await import("@/lib/nina/resposta/templates.server");
    const templatesGate = await carregarTemplatesPublicados({
      clinicaId,
      inicioDeTurno: true,
    }).catch(() => ({ textos: {}, versaoInstrucoes: null, recusadas: [] }));
    const respostaGate = await aplicarGateIdentificacao({
      mensagem: mensagemPaciente,
      estado: fluxoEstado,
      ctx: ctxFerramentas,
      executar,
      textos: templatesGate.textos,
      nomeUnidade: identidadeEfetiva.ok
        ? nomeCompletoEstabelecimento(identidadeEfetiva.apresentacao)
        : "nossa clínica",
      encaminharVagaIndisponivel: async (motivo) => {
        await conferirReserva();
        if (opcoes?.revisao?.valor) {
          const { respostaObsoleta } = await import("@/lib/nina/revisao-conversa.server");
          if (await respostaObsoleta({ clinicaId, telefone: opcoes.revisao.telefone,
            revisaoProcessada: opcoes.revisao.valor })) return false;
        }
        const { executarHandoffTool } = await import("@/lib/nina/handoff-tool.server");
        const r = await executarHandoffTool({ clinicaId, conversaId: estadoId.conversaId ?? null },
          JSON.stringify({ motivo, resumo: motivo, setor: "Agendamento" }));
        registrarEtapa({ tipo: "ferramenta", fonte: "atendimento", titulo: "Encaminhamento para conferir o agendamento",
          dados: { motivo, handoff_confirmado: r.ok, resultado: r },
          codigo: { arquivo: "src/lib/nina/identificacao-gate.server.ts", funcao: "aplicarGateIdentificacao" } });
        return r.ok;
      },
    }).catch((e) => {
      console.error("[NINA_BOOKING_FLOW] gate falhou", e);
      return null;
    });
    if (respostaGate) {
      await salvarFluxoEstado(supabaseAdmin as never, clinicaId, estadoId.conversaId, fluxoEstado);
      // FASE 1 — caminho SEM modelo: o texto veio da regra determinística de
      // identificação. Nenhuma chamada ao modelo é inventada no registro.
      {
        const { registrarOrigemResposta } = await import("@/lib/nina/rastreio/turno.server");
        registrarOrigemResposta("gate", "gate de identificação respondeu antes do modelo");
      }
      rastro?.pular("llm.generate", "gate de identificação respondeu antes do modelo");
      registrarEtapa({
        tipo: "resposta_original",
        fonte: "sistema",
        titulo: "Resposta produzida pelo gate de identificação (sem modelo)",
        dados: {
          origem: "gate",
          tamanho: respostaGate.texto.length,
          template: respostaGate.chaveTemplate,
        },
        codigo: {
          arquivo: "src/lib/nina/identificacao-gate.server.ts",
          funcao: "aplicarGateIdentificacao",
        },
      });
      // O contrato completo viaja na auditoria: quem envia precisa saber o
      // que já está comprovado e o que é proibido afirmar.
      if (opcoes?.auditoria)
        (opcoes.auditoria as { resultado?: unknown }).resultado = respostaGate;
      return respostaGate.texto;
    }
    runtimeContext.etapa = fluxoEstado.flow.stage;
  }




  // Handoff humano: disponível SEMPRE, mesmo sem a flag de agenda.
  const { FERRAMENTA_HANDOFF } = await import("@/lib/nina/handoff-tool.server");
  const { respostaParaModelo } = await import("@/lib/nina/tool-broker");
  ferramentas = [...(ferramentas ?? []), FERRAMENTA_HANDOFF];
  const ctxHandoff = { clinicaId, conversaId: estadoId.conversaId ?? null };
  // FASE 4 — Tool Broker: ponto único de execução das ferramentas reais.
  const { criarToolBroker } = await import("@/lib/nina/tool-broker.server");
  const brokerSemGuarda = criarToolBroker({
    ctxPaciente: ctxFerramentas,
    ctxHandoff,
    executarPaciente: executar
      ? (ctx, nome, args) => executar!(ctx, nome, args as never)
      : null,
  });
  const broker = {
    ...brokerSemGuarda,
    executar: async (...args: Parameters<typeof brokerSemGuarda.executar>) => {
      await conferirReserva();
      return brokerSemGuarda.executar(...args);
    },
  };
  // FASE 3 — as regras de handoff vivem no prompt publicado. Aqui não se
  // concatena mais nenhum comportamento ao system prompt.




  type MsgIA = {
    role: string;
    content: string | null;
    tool_calls?: Array<{ id: string; type?: "function"; function?: { name?: string; arguments?: string } }>;
    tool_call_id?: string;
  };
  // FASE 4 — Context Builder: só o necessário vai ao modelo (instruções,
  // janela recente de mensagens, campos mínimos do paciente). Planilha,
  // histórico completo, CRM e Agenda inteiros nunca são enviados.
  const { montarContexto } = await import("@/lib/nina/context-builder");
  const contexto = montarContexto({
    systemBlocos: [systemPromptFinal],
    // Mesma sessão, em ordem, somente mensagens recebidas/entregues. O builder
    // aplica a janela e o limite de conteúdo uma única vez, sem corte prévio.
    historico: contextoConsultaAgenda.historico as MsgIA[],
    mensagemAtual: mensagemPaciente,
    // Deduplicação por ID: a mensagem atual já está gravada no histórico.
    idsMensagemAtual: opcoes?.mensagensEntrada ?? null,
    paciente: pacienteIdEfetivo
      ? {
          primeiro_nome: pacienteNomeEfetivo ? pacienteNomeEfetivo.split(" ")[0]! : null,
          identificado: true,
          validado: true,
        }
      : null,
  });
  // FASE 4 — a pendência de esclarecimento entra no contrato de SISTEMA, e
  // agora dentro do CONTRATO DE PRECEDÊNCIA do turno (com origem, prioridade e
  // motivo), montado no composer. Nada mais é concatenado aqui.
  const mensagens: MsgIA[] = contexto.messages as MsgIA[];
  rastro?.concluir("context.load", {
    mensagens_contexto: mensagens.length,
    paciente_identificado: Boolean(pacienteIdEfetivo),
  });
  rastro?.concluir("prompt.compose", {
    tamanho_prompt: systemPromptFinal.length,
    ferramentas: Array.isArray(ferramentas) ? ferramentas.length : 0,
    pode_agendar: podeAgendar,
  });

  // FASE 5 — SNAPSHOT IMUTÁVEL, capturado AGORA (antes da chamada ao modelo).
  // É este conteúdo, e não o prompt atual, que audita e avalia esta mensagem.
  async function registrarPromptEfetivo(requestEfetivo: typeof requestNina) {
    const { hashDoTexto } = await import("@/lib/nina/confidence/hash");
    const { registrarSnapshotPrompt } = await import("@/lib/nina/evidencias.server");
    registrarSnapshotPrompt({
      behaviorPromptTemplate: instrucoesNina.template ?? null,
      behaviorPromptRendered: behaviorPrompt,
      behaviorPromptHash: hashDoTexto(behaviorPrompt) ?? "",
      envelopeTecnico: requestEfetivo.envelope,
      runtimeContext: JSON.parse(JSON.stringify(requestEfetivo.runtimeContext)),
      requestFinal: requestEfetivo.systemPrompt,
      // O modelo efetivamente roteado fica em `nina_execucoes.model` da MESMA
      // execução; aqui guardamos os parâmetros decididos antes da chamada.
      model: null,
      modelParameters: {
        perfil: "whatsapp",
        pode_agendar: podeAgendar,
        max_rodadas: podeAgendar ? 6 : 3,
        mensagens_contexto: mensagens.length,
      },
      toolSchemas: (ferramentas ?? []).map((f) => {
        const fn = (f as { function?: { name?: string } })?.function;
        return fn?.name ?? null;
      }),
    });
  }



  let resposta = "";
  let textoModeloAtual = "";
  let houveHandoff = false;
  let finalizacaoHandoff: { texto: string; textoModelo: string; handoffConfirmado: boolean; motivo: string } | null = null;
  let resumoEscolha: import("@/lib/nina/resposta/contrato").ResultadoRespostaNina | null = null;
  const { encaminhamentoSemVagas, respostaSemVagas } = await import("@/lib/nina/agenda-sem-vagas");
  // FASE 4 — vira true quando a conversa avançou durante a geração.
  let turnoObsoleto = false;
  // Só vira `true` quando a ferramenta "agendar" devolve sucesso COM
  // appointment_id verificado no banco — ou quando a conversa JÁ tem um
  // agendamento gravado (senão a Nina não conseguiria nem falar sobre a
  // consulta já marcada nos turnos seguintes).
  const { reservaDaSessaoAtual } = await import("@/lib/nina/agendamento-sessao");
  const jaTinhaAgendamento = reservaDaSessaoAtual(fluxoEstado);
  let agendamentoConfirmado = jaTinhaAgendamento;

  let correcaoFalsoSucessoUsada = false;
  // Retornos oficiais alimentam o modelo sem avaliação de confiança.
  // FASE 2 — fatos concretos e consultas do turno (com retry consolidado).
  const fatosDoTurno: import("@/lib/nina/confidence/evidencia").FatoRecuperado[] = [];
  const consultasDoTurno: import("@/lib/nina/confidence/evidencia").ConsultaDoTurno[] = [];
  // FASE 4 — desfecho explícito quando o laço termina sem resposta textual.
  let limiteRodadasAtingido = false;
  // Modalidade publicada ("atendimento agendado") não é uma reserva do
  // paciente. Uma afirmação real de reserva continua exigindo confirmação.
  const { afirmaOuPrometeAgendamento } = await import("@/lib/nina/afirmacao-agendamento");
  const MAX_RODADAS = podeAgendar ? 6 : 3;
  // Estado do turno para o Reasoning Router (Fase 2).
  const nomesFerramentasTurno: string[] = [];
  let conflitoFerramenta = false;
  let nivelAnteriorTurno: "low" | "medium" | "high" | undefined;
  // Conhecimento da sessão é uma referência de pesquisa, nunca prova velha.
  // A Nina interpreta a mensagem e o histórico ANTES de escolher os termos
  // da busca. Só resultados de consultas reais alimentam os fatos do turno.
  const { lembrarConsultaComprovada, compararReferenciasConhecimento } =
    await import("@/lib/nina/confidence/conhecimento-sessao");
  const { incorporarResultadoOficial, limitarRetornoParaModelo } =
    await import("@/lib/nina/confidence/evidencias-turno");
  const { resolverSelecaoContextual, normalizarSelecaoContextual } =
    await import("@/lib/nina/confidence/selecao-contextual");
  const { encaminharAposEsclarecimento, prepararSegundaPergunta, MOTIVO_IDENTIFICACAO_PENDENTE } =
    await import("@/lib/nina/catalogo-esclarecimento");
  let selecaoDoTurno:
    | import("@/lib/nina/confidence/selecao-contextual").ResultadoSelecaoContextual
    | null = null;
  async function encaminharRegraCatalogo(
    ferramentaOrigem: string,
    ausencia?: NonNullable<ReturnType<typeof encaminhamentoSemRegistro>>,
  ) {
    if (finalizacaoHandoff || turnoObsoleto) return;
    if (opcoes?.revisao?.valor) {
      const { respostaObsoleta } = await import("@/lib/nina/revisao-conversa.server");
      if (await respostaObsoleta({ clinicaId, telefone: opcoes.revisao.telefone,
        revisaoProcessada: opcoes.revisao.valor })) {
        turnoObsoleto = true;
        return;
      }
    }
    const argumentos = ausencia ?? {
      motivo: MOTIVO_SFP,
      resumo:
        "O atendimento solicitado está publicado com profissional SFP. A equipe humana deve continuar o atendimento.",
      urgencia: "normal",
    };
    const origem =
      ausencia?.motivo === MOTIVO_IDENTIFICACAO_PENDENTE
        ? "regra_catalogo_limite_esclarecimento"
        : ausencia
          ? "regra_catalogo_sem_registro"
          : "regra_catalogo_sfp";
    rastro?.iniciar("tool.execute", {
      ferramenta: "solicitar_atendente_humano",
      origem_solicitacao: origem,
    });
    const rh = await broker.executar("solicitar_atendente_humano", JSON.stringify(argumentos));
    await compartilharResultado("solicitar_atendente_humano", argumentos, rh);
    const confirmado = rh.success && !rh.erro;
    houveHandoff ||= confirmado;
    const { limparEscolhaAgendamento } = await import("@/lib/nina/agendamento-escolha");
    limparEscolhaAgendamento(fluxoEstado);
    fluxoEstado.appointment.slot_options = null;
    fluxoEstado.flow.stage = "HANDOFF";
    finalizacaoHandoff = { texto: ausencia ? respostaSemRegistro(confirmado, opcoes?.teste === true) : respostaEncaminhamentoSfp(confirmado), textoModelo: textoModeloAtual,
      handoffConfirmado: confirmado, motivo: argumentos.motivo };
    registrarEtapa({ tipo: "ferramenta", fonte: "atendimento", titulo: "Encaminhamento obrigatório pelo catálogo",
      dados: { origem_solicitacao: "servidor", motivo: argumentos.motivo, ferramenta_origem: ferramentaOrigem,
        handoff_confirmado: confirmado, erro: rh.erro ?? null, resultado: rh.dados },
      codigo: { arquivo: "src/lib/whatsapp.server.ts", funcao: "encaminharRegraCatalogo" } });
    if (confirmado) rastro?.concluir("tool.execute", { ferramenta: "solicitar_atendente_humano", origem_solicitacao: origem });
    else rastro?.falhar("tool.execute", rh.erro ?? "handoff não confirmado", { ferramenta: "solicitar_atendente_humano" });
  }
  async function compartilharResultado(
    nome: string,
    args: unknown,
    r: import("@/lib/nina/tool-broker").ResultadoBroker,
  ) {
    let parametros: Record<string, unknown> = {};
    try {
      const parsed: unknown = typeof args === "string" ? JSON.parse(args) : args;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        parametros = parsed as Record<string, unknown>;
    } catch {
      /* inválido não vira referência */
    }
    const referenciaAnterior =
      nome === "consultar_base_conhecimento" && parametros.nova_solicitacao === true
        ? null
        : conhecimentoAnterior;
    r = prepararSegundaPergunta(referenciaAnterior, r);
    const ex = incorporarResultadoOficial({
      clinicaId,
      nome,
      args,
      resultado: r,
      fatos: fatosDoTurno,
      consultas: consultasDoTurno,
    });
    if (!r.reused) nomesFerramentasTurno.push(nome);
    if (!r.success || r.erro) conflitoFerramenta = true;
    const payload = dadosPublicosCatalogo(respostaParaModelo(r));
    if (
      r.capacidade === "requestHumanHandoff" &&
      r.success &&
      (r.dados as { sem_mensagem_paciente?: boolean } | null)?.sem_mensagem_paciente === true
    ) {
      houveHandoff = true;
      const { limparEscolhaAgendamento } = await import("@/lib/nina/agendamento-escolha");
      limparEscolhaAgendamento(fluxoEstado);
      fluxoEstado.appointment.slot_options = null;
      fluxoEstado.flow.stage = "HANDOFF";
      finalizacaoHandoff = {
        texto: "",
        textoModelo: textoModeloAtual,
        handoffConfirmado: true,
        motivo: MOTIVO_SFP,
      };
    }
    if (r.capacidade !== "searchKnowledgeBase" && r.capacidade !== "listCatalog") {
      if (r.erro === "PROFISSIONAL_SFP") await encaminharRegraCatalogo(nome);
      return limitarRetornoParaModelo(payload);
    }
    const esclarecimentoAtual = (
      r.dados as import("@/lib/nina/knowledge-contract").ResultadoConhecimento | null
    )?.esclarecimento;
    const { normalizarTipoAtendimentoCatalogo } = await import("@/lib/nina/catalogo-pesquisa");
    const tipoAtendimento = normalizarTipoAtendimentoCatalogo(
      (r.dados as import("@/lib/nina/knowledge-contract").ResultadoConhecimento | null)
        ?.tipo_atendimento ?? parametros.tipo_atendimento,
    );
    if (esclarecimentoAtual) {
      if (ctxFerramentas) ctxFerramentas.esclarecimentoCatalogo = esclarecimentoAtual;
      fluxoEstado.knowledge_context = lembrarConsultaComprovada({
        clinicaId,
        sessionId: fluxoEstado.session_id ?? null,
        fatos: ex.fatos,
        args: {
          termo: String(
            parametros.termo ?? parametros.especialidade ?? parametros.nome ?? mensagemPaciente,
          ).slice(0, 200),
          ...(tipoAtendimento ? { tipo_atendimento: tipoAtendimento } : {}),
          ...(typeof parametros.medico === "string" ? { medico: parametros.medico } : {}),
        },
        anterior: referenciaAnterior,
        esclarecimento: esclarecimentoAtual,
      });
    }
    if (nome === "consultar_base_conhecimento" && typeof parametros.termo === "string") {
      const esclarecimento = (
        r.dados as import("@/lib/nina/knowledge-contract").ResultadoConhecimento | null
      )?.esclarecimento;
      const referencia =
        ex.consulta.status === "com_itens" || esclarecimento
          ? lembrarConsultaComprovada({
              clinicaId,
              sessionId: fluxoEstado.session_id ?? null,
              fatos: ex.fatos,
              args: {
                termo: parametros.termo,
                ...(tipoAtendimento ? { tipo_atendimento: tipoAtendimento } : {}),
                ...(typeof parametros.medico === "string" ? { medico: parametros.medico } : {}),
              },
              anterior: referenciaAnterior,
              esclarecimento,
            })
          : null;
      fluxoEstado.knowledge_context = referencia;
      selecaoDoTurno = resolverSelecaoContextual({
        mensagem: mensagemPaciente,
        clinicaId,
        sessaoId: fluxoEstado.session_id ?? "",
        fatosOficiais: fatosDoTurno,
        selecaoAnterior: normalizarSelecaoContextual(conhecimentoAnterior?.selecao),
        agora: new Date().toISOString(),
      });
      if (referencia) referencia.selecao = selecaoDoTurno.selecao;
      contextoConsultaAgenda.selecaoRevalidada = selecaoDoTurno.selecao;
      runtimeContext.consulta_agenda.referencia_anterior_profissional =
        selecaoDoTurno.selecao?.medicoNome ?? contextoConsultaAgenda.medicoEscolhido?.nome ?? null;
      registrarEtapa({
        tipo: "consulta",
        fonte: "catalogo",
        titulo: "Dados atuais da base compartilhados com a Nina",
        dados: {
          consulta: ex.consulta.id,
          status: ex.consulta.status,
          referencias: referencia?.referencias ?? [],
          ...compararReferenciasConhecimento(
            conhecimentoAnterior?.referencias ?? [],
            referencia?.referencias ?? [],
          ),
          selecao: selecaoDoTurno,
          interpretacao_intencao: "modelo_com_historico_da_sessao",
          ferramentas_de_consulta_disponiveis: true,
          fatos_antigos_reutilizados: false,
        },
        codigo: {
          arquivo: "src/lib/whatsapp.server.ts",
          funcao: "compartilharResultado",
        },
      });
    }
    const ausencia =
      encaminharAposEsclarecimento(referenciaAnterior, r, mensagemPaciente) ??
      encaminhamentoSemRegistro(r, args);
    if (ausencia) await encaminharRegraCatalogo(nome, ausencia);
    else if (
      r.success &&
      resultadoExigeHumano(
        r.dados,
        selecaoDoTurno?.selecao?.raizesFonte.map((r) => r.registro),
      )
    )
      await encaminharRegraCatalogo(nome);
    return {
      ...(limitarRetornoParaModelo(payload) as Record<string, unknown>),
      // A seleção legada auxilia referências internas; não é uma declaração
      // de intenção do paciente. Essa interpretação cabe ao modelo no histórico.
      consulta_agenda: {
        ferramentas_de_consulta_disponiveis: true,
        interpretacao_intencao: "modelo_com_historico_da_sessao",
        permite_reservar: false,
        fonte_vagas: "agenda",
        fonte_horarios_habituais: "catalogo_publicado",
      },
    };
  }
  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    if (finalizacaoHandoff || turnoObsoleto) break;
    if (ctxFerramentas?.esclarecimentoCatalogo) {
      resposta = ctxFerramentas.esclarecimentoCatalogo.pergunta;
      break;
    }
    // Escolhas por extenso e referências ("o segundo horário") são interpretadas
    // pelo modelo sobre as mesmas opções oficiais guardadas pelo executor.
    runtimeContext.agendamento.opcoes_consultadas =
      fluxoEstado.appointment.slot_options?.session_id === fluxoEstado.session_id
        ? fluxoEstado.appointment.slot_options?.vagas ?? [] : [];
    runtimeContext.agendamento.confirmacao_final = fluxoEstado.appointment.confirmation ?? null;
    // Atualiza somente os fatos de execução no composer oficial. O texto
    // publicado permanece idêntico e a auditoria captura a requisição usada.
    const requestEfetivo = comporRequestNina({ behaviorPrompt, runtimeContext,
      contratoPrecedencia: precedenciaTurno.contrato });
    const systemMessage = mensagens.find(m => m.role === "system");
    if (systemMessage) systemMessage.content = requestEfetivo.systemPrompt;
    const blocoRuntime = auditoriaRegrasTurno.blocos.find(b => b.rotulo === "contexto de execução");
    if (blocoRuntime) blocoRuntime.texto = JSON.stringify(requestEfetivo.runtimeContext);
    await registrarPromptEfetivo(requestEfetivo);
    // Toda chamada de modelo da Nina passa pelo Nina AI Gateway.
    const { ninaAIGateway } = await import("@/lib/nina/ai-gateway.server");
    await conferirReserva();
    if (rastro && rodada > 0) rastro.novoCiclo();
    rastro?.iniciar("llm.generate", { rodada });
    const respostaIA = await ninaAIGateway({
      clinicaId,
      perfil: "whatsapp",
      conversaId: estadoId.conversaId ?? null,
      ferramentasUsadas: nomesFerramentasTurno,
      messages: mensagens as never,
      ...(ferramentas ? { tools: ferramentas as readonly unknown[] } : {}),
      raciocinio: {
        mensagem: mensagemPaciente,
        rodada,
        temFerramentas: Boolean(ferramentas),
        ferramentasExecutadas: nomesFerramentasTurno.length,
        nomesFerramentas: nomesFerramentasTurno,
        houveConflito: conflitoFerramenta,
        ...(nivelAnteriorTurno ? { nivelAnterior: nivelAnteriorTurno } : {}),
      },
    });
    nivelAnteriorTurno = respostaIA.nivel;
    // Guarda a execução mais recente: é a que produz o texto devolvido.
    if (opcoes?.auditoria && respostaIA.execucaoId) {
      opcoes.auditoria.execucaoId = respostaIA.execucaoId;
    }
    // O trace passa a apontar para a execução real registrada pelo gateway.
    if (rastro && respostaIA.execucaoId) rastro.ids.execution_id = respostaIA.execucaoId;
    // FASE 1 — contagem explícita de rodadas do modelo neste turno.
    {
      const { registrarRodadaModelo, registroTurnoAtual } = await import(
        "@/lib/nina/rastreio/turno.server"
      );
      registrarRodadaModelo({
        execucaoId: respostaIA.execucaoId ?? null,
        modelo: respostaIA.modelo ?? null,
      });
      // AUDITORIA — como as instruções publicadas foram aplicadas NESTA rodada,
      // com a resposta ORIGINAL do modelo, antes de qualquer intervenção.
      {
        const { registrarAuditoriaInstrucoes } = await import(
          "@/lib/nina/rastreio/turno.server"
        );
        registrarAuditoriaInstrucoes({
          rodada: rodada + 1,
          execucaoId: respostaIA.execucaoId ?? null,
          modelo: respostaIA.modelo ?? null,
          blocos: auditoriaRegrasTurno.blocos,
          regrasIdentificadas: auditoriaRegrasTurno.identificadas,
          regrasAplicaveis: auditoriaRegrasTurno.aplicaveis,
          regrasNaoInterpretadas: auditoriaRegrasTurno.naoInterpretadas,
          regrasSuprimidas: auditoriaRegrasTurno.suprimidas,
          falhaDeInterpretacao: auditoriaRegrasTurno.falhaDeInterpretacao,
          limitacoes: auditoriaRegrasTurno.limitacoes,
          respostaOriginal: respostaIA.conteudo ?? null,
        });
      }
      // DIAGNÓSTICO AUTORIZADO: só quando a clínica ligou a flag. Guarda o
      // payload efetivo da rodada (mensagens e schemas), com marca de corte.
      if (registroTurnoAtual()?.diagnostico) {
        const { truncarParaDiagnostico } = await import("@/lib/nina/rastreio/turno");
        const payload = truncarParaDiagnostico(mensagens, 12000);
        const schemas = truncarParaDiagnostico(ferramentas ?? [], 8000);
        registrarEtapa({
          tipo: "contexto_modelo",
          fonte: "sistema",
          titulo: `Payload efetivo enviado ao modelo (rodada ${rodada + 1})`,
          dados: {
            rodada: rodada + 1,
            execucao_id: respostaIA.execucaoId ?? null,
            modelo: respostaIA.modelo ?? null,
            mensagens: payload.texto,
            mensagens_truncado: payload.truncado,
            ferramentas_schema: schemas.texto,
            ferramentas_truncado: schemas.truncado,
            resposta_original: truncarParaDiagnostico(respostaIA.conteudo ?? "", 8000).texto,
          },
          codigo: { arquivo: "src/lib/whatsapp.server.ts", funcao: "gerarRespostaNinaInterno" },
        });
      }
    }

    if (!respostaIA.ok) {
      rastro?.falhar("llm.generate", respostaIA.erro ?? "Falha IA", {
        modelo: respostaIA.modelo ?? null,
      });
      throw new Error(respostaIA.erro ?? "Falha IA");
    }
    rastro?.concluir("llm.generate", {
      modelo: respostaIA.modelo ?? null,
      nivel: respostaIA.nivel ?? null,
      ferramentas_pedidas: (respostaIA.toolCalls ?? []).length,
    });
    const msg = { content: respostaIA.conteudo, tool_calls: respostaIA.toolCalls };
    textoModeloAtual = msg.content ?? "";
    const chamadas = msg.tool_calls ?? [];

    if (chamadas.length === 0) {
      const texto = (msg?.content ?? "").trim();
      // ---------------- defesa contra falso sucesso ----------------
      // O modelo afirmou uma reserva sem gravação confirmada. A tentativa
      // de correção não constitui autorização para criar um agendamento.
      if (
        podeAgendar &&
        !agendamentoConfirmado &&
        afirmaOuPrometeAgendamento(texto) &&
        !correcaoFalsoSucessoUsada &&
        rodada < MAX_RODADAS - 1
      ) {
        correcaoFalsoSucessoUsada = true;
        console.warn("[NINA_APPOINTMENT] falso sucesso bloqueado", {
          conversa_id: estadoId.conversaId,
          texto: texto.slice(0, 200),
        });
        mensagens.push({ role: "assistant", content: texto });
        // FASE 4 — restrição interna viaja no contrato de sistema, nunca como
        // uma falsa mensagem do paciente.
        mensagens.push({
          role: "system",
          content:
            "Não há confirmação de um agendamento gravado para este paciente. Corrija a afirmação de reserva ou promessa sem confirmação, preservando as informações publicadas que respondem ao pedido atual. Descrever a modalidade de atendimento agendado não significa que uma consulta foi marcada. Esta correção não autoriza consultar vagas, agendar nem coletar dados sem a solicitação e as condições exigidas pelo fluxo. Não transforme um pedido de informação em pedido de agendamento.",
        });
        continue;
      }
      if (podeAgendar && !agendamentoConfirmado && afirmaOuPrometeAgendamento(texto)) {
        resposta = "Não consegui concluir seu agendamento neste momento. Vou verificar novamente.";
        {
          const { registrarOrigemResposta } = await import("@/lib/nina/rastreio/turno.server");
          registrarOrigemResposta(
            "codigo",
            "texto do modelo substituído: falso sucesso de agendamento sem gravação",
          );
        }
        break;
      }
      resposta = texto;
      {
        const { registrarOrigemResposta } = await import("@/lib/nina/rastreio/turno.server");
        registrarOrigemResposta("modelo", "texto devolvido pelo modelo, sem substituição");
      }
      break;
    }


    mensagens.push({ role: "assistant", content: msg?.content ?? null, tool_calls: chamadas });
    for (const c of chamadas) {
      const nome = String(c.function?.name ?? "");
      // Toda execução passa pelo broker: ele valida o retorno, aplica
      // idempotência de turno e nunca transforma erro em sucesso.
      // FASE 4 — ação crítica NUNCA roda sobre estado obsoleto: se chegou
      // mensagem nova durante a geração, o turno é abortado antes de gravar.
      if (opcoes?.revisao?.valor && ehFerramentaCritica(nome)) {
        const { respostaObsoleta } = await import("@/lib/nina/revisao-conversa.server");
        const obsoleta = await respostaObsoleta({
          clinicaId,
          telefone: opcoes.revisao.telefone,
          revisaoProcessada: opcoes.revisao.valor,
        });
        if (obsoleta) {
          console.warn("[nina] ação crítica abortada por revisão obsoleta", {
            ferramenta: nome,
            revisao_processada: opcoes.revisao.valor,
          });
          rastro?.falhar("tool.execute", "STALE_CONVERSATION_REVISION", { ferramenta: nome });
          mensagens.push({
            role: "tool",
            tool_call_id: c.id,
            content: JSON.stringify({ ok: false, erro: "STALE_CONVERSATION_REVISION" }),
          });
          turnoObsoleto = true;
          break;
        }
      }

      rastro?.iniciar("tool.execute", { ferramenta: nome });
      const r = await broker.executar(nome, c.function?.arguments);
      if (consultaAgendaAguardandoPaciente(r.dados)) {
        // Médico ausente/ambíguo não é agenda vazia nem falha técnica.
        // Registra a tentativa, sem produzir evidência de consulta à agenda.
        rastro?.pular("tool.execute", "consulta de vagas aguardando identificação inequívoca do médico");
        registrarEtapa({
          tipo: "consulta",
          fonte: "sistema",
          titulo: "Consulta à agenda não realizada: aguardando o paciente",
          dados: { ferramenta: nome, ...respostaParaModelo(r) },
          codigo: { arquivo: "src/lib/nina/consulta-agenda.ts", funcao: "consultaAgendaPendente" },
        });
        mensagens.push({
          role: "tool",
          tool_call_id: c.id,
          content: JSON.stringify(respostaParaModelo(r)),
        });
        continue;
      }
      if (r.success && !r.erro) rastro?.concluir("tool.execute", { ferramenta: nome });
      else rastro?.falhar("tool.execute", r.erro ?? "falha na ferramenta", { ferramenta: nome });
      if (r.capacidade === "requestHumanHandoff" && r.success) houveHandoff = true;
      if (r.appointment_confirmed) {
        agendamentoConfirmado = reservaDaSessaoAtual(fluxoEstado);
      }
      if (r.capacidade === "createAppointment") {
        console.info("[NINA_APPOINTMENT]", {
          conversation_id: estadoId.conversaId,
          create_appointment_called: true,
          appointment_id:
            (r.dados as { appointment_id?: string } | null)?.appointment_id ?? null,
          final_result: r.success ? "SUCCESS" : "FAILED",
          error_code: r.erro ?? null,
          reused: r.reused,
        });
      }
      const resultadoCompartilhado = await compartilharResultado(nome, c.function?.arguments ?? null, r);
      mensagens.push({
        role: "tool",
        tool_call_id: c.id,
        content: JSON.stringify(resultadoCompartilhado),
      });
      if ((r.dados as { codigo?: string } | null)?.codigo === "CATALOGO_QUERY_NAO_INTERPRETADA") {
        // Uma pesquisa recusada não é "não encontrado". Devolve ao modelo
        // para reformular antes de executar outras decisões do mesmo lote.
        for (const pendente of chamadas.slice(chamadas.indexOf(c) + 1)) {
          mensagens.push({ role: "tool", tool_call_id: pendente.id, content: JSON.stringify({
            ok: false, erro: "PESQUISA_PENDENTE_DE_INTERPRETACAO", executada: false,
            mensagem: "Chamada não executada: primeiro reformule a pesquisa recusada com o atendimento identificado e seus objetivos.",
          }) });
        }
        break;
      }
      if (ctxFerramentas?.esclarecimentoCatalogo) break;
      if (finalizacaoHandoff || turnoObsoleto) break;
      const dadosAgendamento = r.dados as Record<string, unknown> | null;
      if (r.success && dadosAgendamento?.sem_agendamento === true &&
        dadosAgendamento.modalidade_atendimento === "chegada_sem_pre_agendamento" &&
        typeof dadosAgendamento.orientacao_atendimento === "string") {
        const { criarResultado } = await import("@/lib/nina/resposta/contrato");
        resumoEscolha = criarResultado({ origem: "gate", texto: dadosAgendamento.orientacao_atendimento,
          fatosConfirmados: ["modalidade:chegada_sem_pre_agendamento"], restricoes: ["sem_reserva_individual"] });
        break;
      }
      if (nome === "agendar" && r.success && dadosAgendamento?.verificado_no_banco === true && dadosAgendamento.appointment_id) {
        const { resultadoAgendamentoConfirmado } = await import("@/lib/nina/resposta/agendamento");
        resumoEscolha = resultadoAgendamentoConfirmado(dadosAgendamento, fluxoEstado,
          ctxFerramentas?.nomeUnidade || "nossa clínica", null, estadoId.conversaId);
        if (resumoEscolha) break;
      }
      if (nome === "selecionar_horario" && r.success &&
        typeof (r.dados as { resumo_confirmacao?: unknown })?.resumo_confirmacao === "string") {
        const { criarResultado } = await import("@/lib/nina/resposta/contrato");
        resumoEscolha = criarResultado({ origem: "gate",
          texto: (r.dados as { resumo_confirmacao: string }).resumo_confirmacao,
          fatosConfirmados: ["vaga_escolhida_validada"], restricoes: ["aguardar_aceite_do_resumo"] });
        // Nenhuma ferramenta do mesmo lote pode gravar antes do novo aceite.
        break;
      }
      const encaminhamento = encaminhamentoSemVagas(r, c.function?.arguments);
      if (encaminhamento) {
        // A consulta é leitura, mas o encaminhamento é escrita: conferir de
        // novo a revisão antes de silenciar a Nina ou atribuir a conversa.
        if (opcoes?.revisao?.valor) {
          const { respostaObsoleta } = await import("@/lib/nina/revisao-conversa.server");
          if (await respostaObsoleta({ clinicaId, telefone: opcoes.revisao.telefone,
            revisaoProcessada: opcoes.revisao.valor })) {
            turnoObsoleto = true;
            rastro?.falhar("tool.execute", "STALE_CONVERSATION_REVISION", {
              ferramenta: "solicitar_atendente_humano", origem_solicitacao: "agenda_sem_vagas",
            });
            break;
          }
        }
        rastro?.iniciar("tool.execute", {
          ferramenta: "solicitar_atendente_humano", origem_solicitacao: "agenda_sem_vagas",
        });
        const rh = await broker.executar("solicitar_atendente_humano", JSON.stringify(encaminhamento));
        await compartilharResultado("solicitar_atendente_humano", encaminhamento, rh);
        const confirmado = rh.success && !rh.erro;
        houveHandoff ||= confirmado;
        const { limparEscolhaAgendamento } = await import("@/lib/nina/agendamento-escolha");
        limparEscolhaAgendamento(fluxoEstado);
        fluxoEstado.appointment.slot_options = null;
        fluxoEstado.flow.stage = "HANDOFF";
        finalizacaoHandoff = {
          texto: respostaSemVagas(confirmado, encaminhamento.motivo.startsWith("VAGA_ESCOLHIDA_INDISPONIVEL"), encaminhamento.motivo.startsWith("MODALIDADE_")),
          textoModelo: msg.content ?? "", handoffConfirmado: confirmado, motivo: encaminhamento.motivo,
        };
        registrarEtapa({
          tipo: "ferramenta", fonte: "atendimento", titulo: encaminhamento.motivo.startsWith("MODALIDADE_")
            ? "Encaminhamento para conferir a modalidade" : "Encaminhamento por ausência de vagas",
          dados: { origem_solicitacao: "servidor", motivo: encaminhamento.motivo,
            ferramenta_origem: nome, consulta: r.dados, argumentos: encaminhamento,
            handoff_confirmado: confirmado, erro: rh.erro ?? null, resultado: rh.dados },
          codigo: { arquivo: "src/lib/whatsapp.server.ts", funcao: "gerarRespostaNina" },
        });
        if (confirmado) rastro?.concluir("tool.execute", {
          ferramenta: "solicitar_atendente_humano", origem_solicitacao: "agenda_sem_vagas",
        });
        else rastro?.falhar("tool.execute", rh.erro ?? "handoff não confirmado", {
          ferramenta: "solicitar_atendente_humano",
        });
        // Encerra também o lote: não procura outro médico, não agenda e não
        // consome rodadas adicionais do modelo depois de decidir transferir.
        break;
      }
    }
    if (turnoObsoleto) {
      // Sem resposta: o próximo lote reprocessa com o contexto atualizado.
      resposta = "";
      {
        const { registrarOrigemResposta } = await import("@/lib/nina/rastreio/turno.server");
        registrarOrigemResposta("nenhuma", "turno abortado por revisão obsoleta da conversa");
      }
      break;
    }
    if (finalizacaoHandoff || resumoEscolha) break;
    if (rodada === MAX_RODADAS - 1) limiteRodadasAtingido = true;
  }

  // FASE 4 — LIMITE DE RODADAS: desfecho explícito. O último rascunho NÃO
  // vira resposta entregue; tenta-se a transferência e o paciente recebe a
  // verdade sobre o que aconteceu.
  if (turnoObsoleto) {
    const { registrarOrigemResposta } = await import("@/lib/nina/rastreio/turno.server");
    registrarOrigemResposta("nenhuma", "turno abortado por revisão obsoleta da conversa");
    return "";
  }
  if (limiteRodadasAtingido && resposta.trim() === "") {
    const rhLimite = await broker
      .executar(
        "solicitar_atendente_humano",
        JSON.stringify({
          motivo: `LIMITE_RODADAS: ${MAX_RODADAS} rodadas sem resposta textual`,
          urgencia: "normal",
        }),
      )
      .catch(() => ({ success: false, erro: "handoff_indisponivel" }) as { success: boolean; erro?: string });
    const { desfechoLimiteRodadas } = await import("@/lib/nina/confidence/desfecho");
    const desfecho = desfechoLimiteRodadas({
      handoffConfirmado: rhLimite.success === true,
      rodadas: MAX_RODADAS,
      erro: rhLimite.erro ?? null,
    });
    if (desfecho.handoffConfirmado) houveHandoff = true;
    resposta = desfecho.resposta;
    {
      const { registrarOrigemResposta } = await import("@/lib/nina/rastreio/turno.server");
      registrarOrigemResposta("codigo", `${desfecho.estado}: ${desfecho.explicacao}`);
    }
  }


  // Texto tal como saiu do modelo, antes dos ajustes obrigatórios abaixo.
  const respostaDoModelo = finalizacaoHandoff?.textoModelo ?? (ctxFerramentas?.esclarecimentoCatalogo ? textoModeloAtual : resposta);

  // Persiste o estado estruturado: o que as ferramentas descobriram nesta
  // rodada (paciente identificado, horário oferecido, agendamento criado)
  // vale para as próximas mensagens da MESMA conversa.
  await salvarFluxoEstado(supabaseAdmin as never, clinicaId, estadoId.conversaId, fluxoEstado);

  // DESFECHO: agendamento concluído agora. O resumo interno é regerado para
  // refletir o sucesso; o resumo anterior (tentativa/falha) vira histórico.
  if (agendamentoConfirmado && !jaTinhaAgendamento && estadoId.conversaId) {
    try {
      const { registrarDesfechoResumo } = await import(
        "@/lib/atendimento/handoff-resumo.server"
      );
      await registrarDesfechoResumo({
        clinicaId,
        conversaId: estadoId.conversaId,
        desfecho: "agendamento_concluido",
      });

    } catch (e) {
      console.error("[nina] falha ao atualizar resumo pós-agendamento", e);
    }
  }




  // FASE 1 — daqui para baixo TODA alteração do texto é registrada como
  // transformação, para responder "quem mudou a resposta do modelo".
  const {
    registrarTransformacaoResposta,
    registrarOrigemResposta: marcarOrigem,
    registrarVersaoTexto,
  } = await import("@/lib/nina/rastreio/turno.server");
  const { hashDoTexto: hashTurno } = await import("@/lib/nina/confidence/hash");
  // CADEIA DO TEXTO — o ponto de partida é a resposta original do modelo.
  // Cada versão seguinte é preservada com etapa, motivo e impressão digital,
  // para que nenhuma nota fique solta entre dois textos diferentes.
  registrarVersaoTexto({
    etapa: "modelo.resposta",
    motivo: "texto original devolvido pelo modelo",
    origem: "modelo",
    texto: respostaDoModelo,
    hash: respostaDoModelo ? hashTurno(respostaDoModelo) : null,
  });
  const transformar = (
    etapa: string,
    motivo: string,
    antes: string,
    depois: string,
    origem: import("@/lib/nina/rastreio/versoes-texto").OrigemVersaoTexto = "sistema",
  ) => {
    if (antes === depois) return;
    registrarTransformacaoResposta({
      etapa,
      motivo,
      antesHash: hashTurno(antes),
      depoisHash: hashTurno(depois),
    });
    // O MOTIVO DA SUBSTITUIÇÃO fica junto do texto que passou a valer.
    registrarVersaoTexto({
      etapa,
      motivo,
      origem,
      texto: depois,
      hash: depois ? hashTurno(depois) : null,
    });
  };

  if (!finalizacaoHandoff && !houveHandoff && ctxFerramentas?.esclarecimentoCatalogo) {
    resposta = ctxFerramentas.esclarecimentoCatalogo.pergunta;
    transformar(
      "catalogo.esclarecimento",
      "até duas perguntas para identificar o atendimento",
      respostaDoModelo,
      resposta,
      "aviso_operacional",
    );
    marcarOrigem("codigo", "identificação pendente: aguardar uma resposta do paciente");
  }
  if (finalizacaoHandoff) {
    const antes = respostaDoModelo;
    resposta = finalizacaoHandoff.texto;
    transformar(
      finalizacaoHandoff.motivo === MOTIVO_SFP
        ? "catalogo.sfp"
        : finalizacaoHandoff.motivo === MOTIVO_IDENTIFICACAO_PENDENTE
          ? "catalogo.limite_esclarecimento"
          : finalizacaoHandoff.motivo === MOTIVO_SEM_REGISTRO
            ? "catalogo.sem_registro"
            : "agenda.sem_vagas",
      finalizacaoHandoff.motivo,
      antes,
      resposta,
      "aviso_operacional",
    );
    marcarOrigem(
      "codigo",
      `${finalizacaoHandoff.motivo}; transferência ${finalizacaoHandoff.handoffConfirmado ? "confirmada" : "não confirmada"}`,
    );
    if (finalizacaoHandoff.motivo === MOTIVO_SFP && finalizacaoHandoff.handoffConfirmado) {
      // Não deixar o fallback de texto vazio, o rodapé ou o transporte recriar
      // uma mensagem depois da atribuição silenciosa solicitada pela clínica.
      if (opcoes?.auditoria) opcoes.auditoria.resultado = resultadoEncaminhamentoSfp(true);
      marcarOrigem("nenhuma", "profissional SFP: encaminhamento silencioso confirmado");
      registrarEtapa({ tipo: "mensagem_final", fonte: "sistema",
        titulo: "Encaminhamento SFP sem mensagem ao paciente",
        dados: { texto: "", handoff_confirmado: true, sem_mensagem_paciente: true },
        codigo: { arquivo: "src/lib/whatsapp.server.ts", funcao: "gerarRespostaNina" } });
      const { fecharAuditoriaInstrucoesDoTurno } = await import("@/lib/nina/rastreio/turno.server");
      fecharAuditoriaInstrucoesDoTurno({ textoEntregue: "" });
      rastro?.concluir("response.validate", { handoff: true, sem_mensagem_paciente: true });
      rastro?.pular("message.outbound", "profissional SFP: apenas encaminhar para a equipe");
      return "";
    }
  }

  if (resumoEscolha) {
    transformar("agenda.resposta_modalidade", "orientação, resumo ou confirmação com a modalidade oficial do atendimento", resposta, resumoEscolha.texto);
    resposta = resumoEscolha.texto;
    marcarOrigem("gate", resumoEscolha.restricoes.includes("aguardar_aceite_do_resumo")
      ? "resumo final vinculado à vaga escolhida, aguardando aceite do paciente"
      : resumoEscolha.acoesConcluidas.length ? "confirmação da reserva comprovada com a modalidade oficial"
      : "orientação da modalidade sem reserva individual");
    if (opcoes?.auditoria) opcoes.auditoria.resultado = resumoEscolha;
  }

  const semNomeGenerico = omitirNomeGenerico(resposta);
  if (semNomeGenerico !== resposta) {
    transformar("catalogo.nome_profissional", "omitir cargo, equipe ou setor usado como nome do profissional", resposta, semNomeGenerico);
    resposta = semNomeGenerico;
    if (resumoEscolha) resumoEscolha.texto = resposta;
  }

  if (!resposta && houveHandoff) {
    const antes = resposta;
    resposta =
      "Certo! Já chamei uma atendente da nossa equipe para continuar com você por aqui 💛";
    transformar("handoff.texto_padrao", "handoff sem texto do modelo", antes, resposta);
    marcarOrigem("codigo", "texto fixo de transferência (sem texto do modelo)");
  }

  // Aviso explícito ao paciente: ele precisa saber que saiu da IA e foi para
  // uma pessoa. A frase é fixa para nunca depender do humor do modelo.
  if (houveHandoff && !(opcoes?.teste && finalizacaoHandoff?.motivo === MOTIVO_SEM_REGISTRO)) {
    const AVISO_TRANSFERENCIA =
      "*Transferido para atendimento humano.* Você não está mais falando com a Nina — uma atendente da equipe assume esta conversa e responde por aqui mesmo.";
    if (!resposta.includes("Transferido para atendimento humano")) {
      const antes = resposta;
      resposta = `${resposta.trim()}\n\n${AVISO_TRANSFERENCIA}`.trim();
      transformar("handoff.aviso", "aviso obrigatório de transferência", antes, resposta);
    }
  }


  if (!resposta) {
    const antes = resposta;
    resposta =
      "Consegui iniciar aqui, mas preciso de um instante — vou pedir para uma atendente concluir com você.";
    transformar("resposta.vazia", "modelo não devolveu texto utilizável", antes, resposta);
    marcarOrigem("fallback_erro", "turno terminou sem texto do modelo");
  }

  // FASE 6 — a apresentação é comportamento e vem SOMENTE do Behavior Prompt
  // publicado em Arquitetura. Aqui apenas OBSERVAMOS o resultado (telemetria):
  // nada é acrescentado ao texto, para não gerar "Sou a Nina... Sou a Nina...".
  // FASE 2 — a apresentação é conferida contra o nome PUBLICADO do turno.
  // FASE 3 — a apresentação é conferida contra a IDENTIDADE PUBLICADA do turno
  // (nome da assistente + estabelecimento), nunca contra a palavra "Nina" nem
  // contra o nome administrativo da clínica.
  const diagnosticoSaudacao = avaliarSaudacao(
    resposta,
    identidadeEfetiva.ok
      ? {
          assistente: identidadeEfetiva.apresentacao.assistente,
          estabelecimento: identidadeEfetiva.apresentacao.estabelecimento,
        }
      : { assistente: null, estabelecimento: nomeApresentacao },
    { obrigatoria: saudacaoObrigatoriaEfetivaTurno },
  );
  if (diagnosticoSaudacao.saudacaoDuplicada || diagnosticoSaudacao.saudacaoAusente) {
    console.warn("[NINA_SAUDACAO]", {
      conversa_id: estadoId.conversaId,
      saudacao_obrigatoria: saudacaoObrigatoria,
      saudacao_duplicada: diagnosticoSaudacao.saudacaoDuplicada,
      saudacao_ausente: diagnosticoSaudacao.saudacaoAusente,
      elementos: diagnosticoSaudacao.elementos,
    });
  }
  // A marcação usa o texto FINAL liberado, pois uma correção pode acrescentar
  // ou remover a apresentação. Pedido concreto não exige perguntar como ajudar.
  // A exceção publicada continua separada de uma apresentação observada.
  const confirmarApresentacaoEntregue = async (textoFinal: string, entregue: boolean) => {
    if (!saudacaoObrigatoria) return;
    if (!saudacaoObrigatoriaEfetivaTurno) {
      fluxoEstado.greeting_waived = true;
      fluxoEstado.greeting_waived_by = saudacaoDispensadaPor;
      await salvarFluxoEstado(supabaseAdmin as never, clinicaId, estadoId.conversaId, fluxoEstado);
      return;
    }
    if (
      !entregue ||
      !identidadeEfetiva.ok ||
      !contemApresentacaoPublicada(textoFinal, identidadeEfetiva.apresentacao)
    )
      return;
    const estadoComSaudacao = marcarSaudacaoConcluida(fluxoEstado);
    fluxoEstado.greeting_completed = true;
    await salvarFluxoEstado(
      supabaseAdmin as never,
      clinicaId,
      estadoId.conversaId,
      estadoComSaudacao,
    );
  };

  // Se a resposta pediu confirmação de identidade, marca na conversa para não repetir.
  if (
    !identidadeConfirmada &&
    /confirmar\s+se\s+voc[eê]|voc[eê]\s+[eé]\s+o?\(?a?\)?\s|falo\s+com\s+o?\(?a?\)?\s|confirma\s+seu\s+nome/i.test(
      resposta,
    )
  ) {
    await salvarEstadoIdentidade(estadoId, {
      identidade_perguntada_em: new Date().toISOString(),
      identidade_tentativas: estadoId.tentativas + 1,
    });
  }
  // ---------------- FINALIZAÇÃO E ENTREGA DIRETA ----------------
  // Template publicado, despedida e checagem de promessa sem prova acontecem
  // AQUI. O texto final é entregue sem revisão de confiança; o transporte
  // não acrescenta nada depois. Quem envia chama
  // o mesmo serviço com a mesma chave de turno e recebe o resultado guardado,
  // sem repetir nenhum efeito.
  const chaveTurnoFinalizacaoBase =
    (opcoes?.auditoria as { traceId?: string } | undefined)?.traceId ??
    rastro?.ids.trace_id ??
    `${clinicaId}|${telefoneNorm ?? "-"}|${estadoId.conversaId ?? "-"}`;
  const chaveTurnoFinalizacao = chaveTurnoFinalizacaoBase;
  try {
    if (resposta) {
      const [{ finalizarResposta }, { criarResultado }] = await Promise.all([
        import("@/lib/nina/resposta/finalizacao.server"),
        import("@/lib/nina/resposta/contrato"),
      ]);
      const baseResultado = resumoEscolha ??
        ((opcoes?.auditoria as { resultado?: unknown } | undefined)?.resultado as
          | import("@/lib/nina/resposta/contrato").ResultadoRespostaNina
          | undefined) ?? criarResultado({
            origem: finalizacaoHandoff ? (finalizacaoHandoff.handoffConfirmado ? "handoff" : "erro") : "modelo",
            texto: resposta,
          });
      if (finalizacaoHandoff && opcoes?.auditoria) opcoes.auditoria.resultado = baseResultado;
      // Somente uma reserva comprovada neste turno recebe o aviso de presença
      // e a despedida; citar um agendamento antigo não dispara esse bloco.
      if (
        agendamentoConfirmado && !jaTinhaAgendamento && !houveHandoff &&
        !finalizacaoHandoff && fluxoEstado.appointment.appointment_id
      ) {
        baseResultado.variaveis.unidade = identidadeEfetiva.ok
          ? nomeCompletoEstabelecimento(identidadeEfetiva.apresentacao)
          : "nossa clínica";
        if (!baseResultado.acoesConcluidas.some((acao) => acao.acao === "agendar")) {
          baseResultado.acoesConcluidas.push({
            acao: "agendar",
            idempotencia: `agendar|${estadoId.conversaId}|${fluxoEstado.appointment.slot_inicio ?? ""}`,
            confirmada: true,
            evidencia: fluxoEstado.appointment.appointment_id,
          });
        }
        if (opcoes?.auditoria) opcoes.auditoria.resultado = baseResultado;
      }
      const finalizada = await finalizarResposta({
        clinicaId,
        canal: opcoes?.teste === true ? "test-console" : "whatsapp",
        chaveTurno: chaveTurnoFinalizacao,
        // FASE 4 — o transporte procura a última aprovação por esta raiz.
        chaveTurnoRaiz: chaveTurnoFinalizacaoBase,
        // FASE 4 — identidade do turno registrada junto do texto entregue.
        identidade: {
          versao: identidadeEfetiva.versao,
          versaoId: identidadeEfetiva.versaoId,
          origem: identidadeEfetiva.origem,
          assistente: identidadeEfetiva.apresentacao.assistente,
          estabelecimento: identidadeEfetiva.apresentacao.estabelecimento,
        },
        conversaId: estadoId.conversaId ?? null,
        telefone: telefoneNorm ?? null,
        mensagemPaciente: mensagemPaciente || null,
        resultado: { ...baseResultado, texto: resposta },
        handoffPendente: houveHandoff || finalizacaoHandoff !== null,
        // Encerramento automático só no caminho real de atendimento e SÓ no
        // primeiro passe: correção de texto não repete efeito externo.
        avaliarEncerramento:
          opcoes?.teste !== true &&
          Boolean(mensagemPaciente),
      });
      resposta = finalizada.texto;
      if (finalizada.resultado.estado === "descartar" && opcoes?.auditoria) {
        opcoes.auditoria.resultado = finalizada.resultado;
      }
      if (opcoes?.auditoria) {
        (opcoes.auditoria as { finalizacao?: unknown }).finalizacao = finalizada;
      }
    }
  } catch (e) {
    console.error("[nina] finalização da resposta falhou", e);
  }
  // Registra a apresentação observada, sem revisão de confiança.
  try {
    await confirmarApresentacaoEntregue(resposta, true);
  } catch {
    /* telemetria nunca interrompe o atendimento */
  }

  // Evidências finais: estado/sessão no momento da resposta, regras aplicáveis,
  // alterações posteriores ao texto do modelo e a mensagem realmente enviada.
  try {
    const codigo = {
      arquivo: "src/lib/whatsapp.server.ts",
      funcao: "gerarRespostaNina",
    } as const;
    registrarEtapa({
      tipo: "estado_sessao",
      fonte: "atendimento",
      titulo: "Estado e sessão no momento da resposta",
      dados: {
        conversa_id: estadoId.conversaId,
        session_id: (fluxoEstado as { session_id?: string | null }).session_id ?? null,
        greeting_completed: Boolean(fluxoEstado.greeting_completed),
        identidade_confirmada: identidadeConfirmada,
        handoff: houveHandoff,
        agendamento_confirmado: agendamentoConfirmado,
        teste: Boolean(opcoes?.teste),
      },
      codigo,
    });
    registrarEtapa({
      tipo: "regras_instrucoes",
      fonte: "sistema",
      titulo: "Regras e versão das instruções aplicadas",
      dados: {
        ferramentas_do_turno: nomesFerramentasTurno,
        saudacao_obrigatoria: saudacaoObrigatoria,
        conflito_ferramenta: conflitoFerramenta,
      },
      codigo,
    });
    if (respostaDoModelo !== resposta) {
      registrarEtapa({
        tipo: "alteracao_posterior",
        fonte: "sistema",
        titulo: "Alterações aplicadas depois da resposta do modelo",
        dados: { antes: respostaDoModelo, depois: resposta },
        codigo,
      });
    }
    // Fecha a auditoria com o texto REALMENTE entregue (inclusive quando a
    // entrega é encaminhamento ou aviso controlado) e suas intervenções.
    {
      const { fecharAuditoriaInstrucoesDoTurno } = await import(
        "@/lib/nina/rastreio/turno.server"
      );
      fecharAuditoriaInstrucoesDoTurno({
        textoEntregue: resposta,
      });
    }
    registrarEtapa({
      tipo: "mensagem_final",
      fonte: "sistema",
      titulo: "Mensagem final enviada",
      dados: { texto: resposta },
      codigo,
    });
  } catch {
    /* auditoria nunca interrompe o atendimento */
  }

  if (rastro) {
    rastro.concluir("response.validate", {
      alterada_apos_modelo: respostaDoModelo !== resposta,
      handoff: houveHandoff,
      agendamento_confirmado: agendamentoConfirmado,
    });
    rastro.concluir("message.outbound", { tamanho: resposta.length });
  }

  return resposta;
}

/* =========================================================================
 * Áudio (nota de voz) — upload de mídia + envio
 * ========================================================================= */

/** Sobe um arquivo de áudio para a Meta e devolve o `media_id`. */
export async function metaUploadMedia(
  phoneNumberId: string,
  accessToken: string,
  bytes: Uint8Array,
  mime: string,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: mime }), filename);
  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION_AUDIO}/${phoneNumberId}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    throw new Error(json?.error?.message ?? `Falha no upload de áudio (${res.status})`);
  }
  return String(json.id);
}

/** Envia uma nota de voz já enviada para a Meta (`media_id`). */
export async function metaSendAudio(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  mediaId: string,
  opcoes?: { timeoutMs?: number },
): Promise<{ wa_message_id: string | null }> {
  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION_AUDIO}/${phoneNumberId}/messages`,
    {
      signal: opcoes?.timeoutMs ? AbortSignal.timeout(opcoes.timeoutMs) : undefined,
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "audio",
        audio: { id: mediaId },
      }),
    },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok)
    throw Object.assign(
      new Error(json?.error?.message ?? `Falha ao enviar áudio (${res.status})`),
      {
        status: res.status,
      },
    );
  return { wa_message_id: json?.messages?.[0]?.id ?? null };
}
