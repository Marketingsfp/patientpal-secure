import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizarTelefone } from "@/lib/atendimento/telefone";
import { consolidarTentativas } from "@/lib/nina/confidence/evidencia";
import { agoraNaClinica } from "@/lib/nina-agora";

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
  | { type: "FOOTER"; text: string };

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
): Promise<{ wa_message_id: string | null }> {
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
    throw new Error(`WhatsApp: ${msg}`);
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
): Promise<{ wa_message_id: string | null }> {
  const components =
    bodyParams.length > 0
      ? [
          {
            type: "body",
            parameters: bodyParams.map((t) => ({ type: "text", text: t.slice(0, 400) })),
          },
        ]
      : undefined;
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
/**
 * O retorno de uma consulta ao catálogo/base traz conteúdo aproveitável?
 * Usado só pelo Confidence Engine: "consultei" não é o mesmo que "achei".
 */
function temConteudoUtil(dados: unknown): boolean {
  if (dados === null || dados === undefined) return false;
  if (Array.isArray(dados)) return dados.length > 0;
  if (typeof dados !== "object") return String(dados).trim().length > 0;
  const o = dados as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k === "ok" || k === "erro" || k === "success" || k === "source" || k === "instrucao") continue;
    if (Array.isArray(v)) {
      if (v.length > 0) return true;
      continue;
    }
    if (v !== null && v !== undefined && String(v).trim() !== "") return true;
  }
  return false;
}

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
      resultado?: unknown;
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
     * vínculo lógico usado por intenção, estado, Confidence e auditoria.
     */
    lote?: { batchId: string | null; revisao: number | null };
  },
): Promise<string> {
  const { comColetor } = await import("@/lib/nina/evidencias.server");
  const auditoria = opcoes?.auditoria ?? { execucaoId: null as string | null };

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
  // chamado, origem do texto, transformações, confiança e lacunas.
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
          if (opcoes?.mensagensEntrada?.length) c.mensagensEntrada(opcoes.mensagensEntrada);
          return await gerarRespostaNinaInterno(clinicaId, mensagemPaciente, telefoneRemetente, {
            ...opcoes,
            auditoria,
            rastro,
          });
        });
        rastro.concluir("message.inbound", { resposta_tamanho: resultado.length });
        const { hashDoTexto } = await import("@/lib/nina/confidence/hash");
        registrarEntregaDoTurno({
          mensagemId: null,
          textoHash: hashDoTexto(resultado),
          tamanho: resultado.length,
          canal: opcoes?.teste ? "test-console" : "whatsapp",
        });
        const { gravarEvidencias } = await import("@/lib/nina/evidencias.server");
        await gravarEvidencias(auditoria.execucaoId ?? null, clinicaId, coletor);
        return { ok: true as const, resultado };
      } catch (e) {
        rastro.falhar("error.handle", e);
        rastro.falhar("message.inbound", e);
        registrarOrigemResposta(
          "fallback_erro",
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
    auditoria?: { execucaoId?: string | null };
    mensagensEntrada?: string[];
    revisao?: { telefone: string; valor: number };
    lote?: { batchId: string | null; revisao: number | null };
    rastro?: import("@/lib/nina/arquitetura/tracing").Rastro;
  },
): Promise<string> {
  const { registrarEtapa } = await import("@/lib/nina/evidencias.server");
  const rastro = opcoes?.rastro ?? null;
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
      identificarPaciente(clinicaId, mensagemPaciente, telefoneNorm),
      Promise.resolve({ data: [] as any[] }),
      Promise.resolve({ data: [] as any[] }),
      carregarEstadoIdentidade(clinicaId, telefoneRemetente ? String(telefoneRemetente) : null),
      telefoneRemetente
        ? supabaseAdmin
            .from("whatsapp_mensagens")
            .select("id, direction, body, created_at")
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
  if (sessaoNina.expirou) {
    await persistirEstadoSessao(clinicaId, estadoId.conversaId, sessaoNina.estado);
  }
  const corteMemoria = Date.now() - ttlSessaoMinutos() * 60_000;
  const msgsMemoria = (((histR as any)?.data ?? []) as any[]).filter((m: any) => {
    const t = Date.parse(String(m?.created_at ?? ""));
    return !Number.isFinite(t) || t >= corteMemoria;
  });

  const historico = msgsMemoria

    .slice()
    .reverse()
    .map((m: any) => ({
      role: m.direction === "out" ? "assistant" : "user",
      content: String(m.body ?? "").slice(0, 1500),
      // O ID físico viaja com a mensagem: é ele que permite tirar do histórico
      // a mensagem atual do turno sem apagar repetições legítimas.
      id: m.id ? String(m.id) : null,
    }))
    .filter((m: any) => m.content);


  // Nome curto para a apresentação (o cadastro costuma trazer a unidade após um travessão).
  const nomeCurtoUnidade =
    String(nomeUnidade)
      .split(/\s+[—–-]\s+/)[0]
      ?.trim() || nomeUnidade;
  // REGRA ESTRUTURAL: a apresentação completa da Nina é obrigatória na
  // PRIMEIRA resposta de cada sessão operacional (conversa nova, sessão
  // expirada por TTL ou conversa resolvida que voltou a receber mensagem).
  // Não depende do modelo lembrar: o estado manda.
  const { garantirSessaoAtiva, avaliarSaudacao, marcarSaudacaoConcluida } =
    await import("@/lib/nina/saudacao-sessao");
  const inicioSessaoTs = Date.parse(String(sessaoNina.estado.session_started_at ?? ""));
  const jaRespondeuNestaSessao = msgsMemoria.some((m: any) => {
    if (m.direction !== "out") return false;
    const t = Date.parse(String(m?.created_at ?? ""));
    if (!Number.isFinite(inicioSessaoTs)) return true;
    return Number.isFinite(t) ? t >= inicioSessaoTs : false;
  });
  const sessaoSaudacao = garantirSessaoAtiva(sessaoNina.estado, { jaRespondeuNestaSessao });
  sessaoNina.estado = sessaoSaudacao.estado;
  const saudacaoObrigatoria = sessaoSaudacao.saudacaoObrigatoria;
  const jaSeApresentou = !saudacaoObrigatoria;
  console.info("[NINA_SESSION]", {
    conversa_id: estadoId.conversaId,
    nina_session_id: sessaoNina.estado.session_id,
    new_session: sessaoSaudacao.novaSessao || sessaoNina.expirou,
    greeting_required: saudacaoObrigatoria,
    greeting_completed: sessaoNina.estado.greeting_completed === true,
  });
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
  const { resolverIdentidadeEfetiva, valoresIdentidade, fatosIdentidade } = await import(
    "@/lib/nina/identidade-efetiva"
  );
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
  const { normalizarEstado, salvarFluxoEstado } = await import("@/lib/nina/fluxo-estado.server");

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
      return dadosFaltantes(fluxoEstado) as readonly string[];
    } catch {
      return [] as readonly string[];
    }
  })();

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
  {
    const { blocoContratoEsclarecimento, normalizarPendencia: normPend } = await import(
      "@/lib/nina/confidence/esclarecimento"
    );
    const bloco = blocoContratoEsclarecimento(normPend(fluxoEstado.clarification));
    if (bloco) {
      instrucoesAdicionaisTurno.push({
        codigo: "ESCLARECIMENTO_PENDENTE",
        origem: "motor de confiabilidade (estado do fluxo)",
        motivo: "há pendência de esclarecimento aberta nesta conversa",
        texto: bloco,
      });
    }
  }
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
      intencao_confirmada: Boolean(fluxoEstado.appointment.intent_confirmed),
      procedimento: fluxoEstado.appointment.procedure ?? null,
      especialidade: fluxoEstado.appointment.specialty ?? null,
      profissional: fluxoEstado.appointment.doctor_name ?? null,
      data: fluxoEstado.appointment.date ?? null,
      hora: fluxoEstado.appointment.time ?? null,
      slot_inicio: fluxoEstado.appointment.slot_inicio ?? null,
      slot_fim: fluxoEstado.appointment.slot_fim ?? null,
      agendamento_id: fluxoEstado.appointment.appointment_id ?? null,
    },
    catalogo: {
      publicado: baseAtiva,
      servicos: catalogoPublicado.servicos,
      profissionais: catalogoPublicado.profissionais,
    },
    ferramentas: {
      pode_agendar: podeAgendar,
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
    executar = mod.executarFerramentaPaciente;
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
  }




  // Handoff humano: disponível SEMPRE, mesmo sem a flag de agenda.
  const { FERRAMENTA_HANDOFF } = await import("@/lib/nina/handoff-tool.server");
  const { respostaParaModelo } = await import("@/lib/nina/tool-broker");
  ferramentas = [...(ferramentas ?? []), FERRAMENTA_HANDOFF];
  const ctxHandoff = { clinicaId, conversaId: estadoId.conversaId ?? null };
  // FASE 4 — Tool Broker: ponto único de execução das ferramentas reais.
  const { criarToolBroker } = await import("@/lib/nina/tool-broker.server");
  const broker = criarToolBroker({
    ctxPaciente: ctxFerramentas,
    ctxHandoff,
    executarPaciente: executar
      ? (ctx, nome, args) => executar!(ctx, nome, args as never)
      : null,
  });
  // FASE 3 — as regras de handoff vivem no prompt publicado. Aqui não se
  // concatena mais nenhum comportamento ao system prompt.




  type MsgIA = {
    role: string;
    content: string | null;
    tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
    tool_call_id?: string;
  };
  // FASE 4 — Context Builder: só o necessário vai ao modelo (instruções,
  // janela recente de mensagens, campos mínimos do paciente). Planilha,
  // histórico completo, CRM e Agenda inteiros nunca são enviados.
  const { montarContexto } = await import("@/lib/nina/context-builder");
  const contexto = montarContexto({
    systemBlocos: [systemPromptFinal],
    historico: historico as MsgIA[],
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
  {
    const { hashDoTexto } = await import("@/lib/nina/confidence/hash");
    const { registrarSnapshotPrompt } = await import("@/lib/nina/evidencias.server");
    registrarSnapshotPrompt({
      behaviorPromptTemplate: instrucoesNina.template ?? null,
      behaviorPromptRendered: behaviorPrompt,
      behaviorPromptHash: hashDoTexto(behaviorPrompt) ?? "",
      envelopeTecnico: requestNina.envelope,
      runtimeContext: requestNina.runtimeContext,
      requestFinal: systemPromptFinal,
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
  // FASE 5 — guardados para a verificação da RESPOSTA FINAL (answer_confidence),
  // que roda depois de todo o pós-processamento, sobre o texto realmente enviado.
  let estadoTurnoFinal:
    | import("@/lib/nina/confidence/runtime").EstadoDoTurno
    | null = null;
  let avaliacaoAcao:
    | import("@/lib/nina/confidence/types").ResultadoConfianca
    | null = null;
  let execucaoIdFinal: string | null = null;
  let houveHandoff = false;
  // FASE 4 — vira true quando a conversa avançou durante a geração.
  let turnoObsoleto = false;
  // Só vira `true` quando a ferramenta "agendar" devolve sucesso COM
  // appointment_id verificado no banco — ou quando a conversa JÁ tem um
  // agendamento gravado (senão a Nina não conseguiria nem falar sobre a
  // consulta já marcada nos turnos seguintes).
  const jaTinhaAgendamento = Boolean(fluxoEstado.appointment.appointment_id);
  let agendamentoConfirmado = jaTinhaAgendamento;

  let correcaoFalsoSucessoUsada = false;
  // ------------------- CONFIDENCE DECISION ENGINE -------------------
  // Evidências reais do turno: o que rodou, se deu certo e se o catálogo
  // publicado devolveu registro. É isso — e não o "achismo" do modelo —
  // que autoriza afirmar valor, horário, profissional, preparo ou regra.
  const evidenciasFerramentas: Array<{
    nome: string;
    capacidade: string | null;
    fonte: string | null;
    success: boolean;
    erro?: string | undefined;
    /** FASE 5 — escopo (argumentos) da consulta, para identificar retry real. */
    escopo?: string | null;
  }> = [];
  let catalogoEncontrou = false;
  // FASE 2 — fatos concretos e consultas do turno (com retry consolidado).
  const fatosDoTurno: import("@/lib/nina/confidence/evidencia").FatoRecuperado[] = [];
  const consultasDoTurno: import("@/lib/nina/confidence/evidencia").ConsultaDoTurno[] = [];
  let esclarecimentoConfiancaUsado = false;
  // FASE 4 — esclarecimento é ESTADO da conversa, não rodada interna do
  // modelo. A pendência persistida sobrevive a reinício, lote agrupado e
  // retomada; a tentativa só é consumida quando o paciente responde e a
  // dúvida continua. O limite vive na política central.
  const {
    abrirPendencia,
    fecharPendencia,
    normalizarPendencia,
    perguntaParaPaciente,
    reavaliarPendencia,
  } = await import("@/lib/nina/confidence/esclarecimento");
  const pendenciaAnterior = normalizarPendencia(fluxoEstado.clarification);
  let pendenciaAvaliada = false;
  let tentativasEsclarecimentoConfianca = 0;
  // FASE 4 — desfecho explícito quando o laço termina sem resposta aprovada.
  let limiteRodadasAtingido = false;
  // Disponibilidade confirmada em tempo real nesta conversa (pré-commit).
  let disponibilidadeConfirmada = false;
  // Dados já coletados no turno — entram no resumo estruturado do handoff.
  const dadosColetados: Record<string, unknown> = {};
  // Frases que afirmam/prometem agendamento. Se aparecerem sem gravação
  // confirmada, a resposta é falso sucesso e não pode ir ao paciente.
  const AFIRMA_AGENDAMENTO =
    /(estou|vou|irei)\s+agend|agendando|agendei|agendada|agendado|marcada|marquei|reserv(ei|ada)|confirmad[oa]\s+(seu|sua)\s+(consulta|agendamento|hor[áa]rio)/i;
  const MAX_RODADAS = podeAgendar ? 6 : 3;
  // Estado do turno para o Reasoning Router (Fase 2).
  const nomesFerramentasTurno: string[] = [];
  let conflitoFerramenta = false;
  let nivelAnteriorTurno: "low" | "medium" | "high" | undefined;
  // FASE 5 — quantas rodadas de modelo o turno consumiu. Caminho sem modelo
  // termina com 0 e é registrado como tal, sem inventar execução de LLM.
  let rodadasDoTurno = 0;
  // AUDITORIA — resultado da verificação de cada exigência publicada, lido da
  // avaliação final. Fica vazio quando o validador não rodou; ausência de
  // verificação nunca vira "restrições cumpridas".
  let verificacoesInstrucoesTurno: {
    verificacoes: import("@/lib/nina/rastreio/auditoria-instrucoes").VerificacaoExigencia[];
    falhaDeInterpretacao: boolean;
  } | null = null;
  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    rodadasDoTurno = rodada + 1;
    // Toda chamada de modelo da Nina passa pelo Nina AI Gateway.
    const { ninaAIGateway } = await import("@/lib/nina/ai-gateway.server");
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
    const chamadas = msg.tool_calls ?? [];

    if (chamadas.length === 0) {
      const texto = (msg?.content ?? "").trim();
      // ---------------- defesa contra falso sucesso ----------------
      // O modelo encerrou o turno afirmando que agendou, mas nenhuma
      // gravação foi confirmada. Damos UMA chance de chamar a ferramenta.
      if (
        podeAgendar &&
        !agendamentoConfirmado &&
        AFIRMA_AGENDAMENTO.test(texto) &&
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
            "Nenhum agendamento foi gravado. É PROIBIDO dizer que agendou, que está agendando ou que vai agendar sem chamar a ferramenta 'agendar' e receber appointment_id. Chame agora a ferramenta 'agendar' com os campos inicio/fim exatos do horário confirmado. Se não for possível, responda apenas: 'Não consegui concluir seu agendamento neste momento. Vou verificar novamente.'",
        });
        continue;
      }
      if (podeAgendar && !agendamentoConfirmado && AFIRMA_AGENDAMENTO.test(texto)) {
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
      // --------- CONFIDENCE DECISION ENGINE: antes de a resposta sair ---------
      // Mesmo motor central da Fase 1-3 (validadores + política de pesos e
      // bloqueadores). Vale igual para atendimento real e homologação.
      const {
        decidirNoTurno,
        motivoHandoff,
        paraDecisaoLegado,
        resumoHandoffEstruturado,
      } = await import("@/lib/nina/confidence/runtime");
      const [
        { montarRegistroAuditoria },
        { detectarIntencoes, intencaoAmbigua },
        { montarContextoCanonicoTurno },
      ] = await Promise.all([
        import("@/lib/nina/confidence/auditoria"),
        import("@/lib/nina/atendimento-fase1"),
        import("@/lib/nina/confidence/contexto-turno"),
      ]);
      // FASE 2 — UMA ÚNICA VERDADE: motor e auditoria leem o mesmo objeto.
      // `podeAgendar` fica em `capacidades` e NÃO define a ação do paciente.
      const canonico = montarContextoCanonicoTurno(
        {
          mensagemPaciente,
          podeAgendar,
          // FASE 1 (refatoração) — intenção não é ação. Só o estágio real do
          // fluxo autoriza `criar_agendamento`.
          stage: fluxoEstado.flow.stage,
          messageIdEntrada: opcoes?.mensagensEntrada?.[0] ?? null,
          // FASE 5 — a intenção e o estágio são lidos do TURNO COMPLETO
          // (`mensagemPaciente` já é o lote inteiro), não de cada fragmento.
          lote: {
            batchId: opcoes?.lote?.batchId ?? null,
            messageIds: opcoes?.mensagensEntrada ?? [],
            conversationRevision: opcoes?.lote?.revisao ?? null,
          },
        },
        { detectarIntencoes, intencaoAmbigua },
      );
      if (!pendenciaAvaliada) {
        const rev = reavaliarPendencia({
          anterior: pendenciaAnterior,
          intentAtual: canonico.intent ?? null,
          messageIdAtual: canonico.messageIdEntrada ?? null,
        });
        tentativasEsclarecimentoConfianca = rev.tentativas;
        fluxoEstado.clarification = rev.pendencia;
        pendenciaAvaliada = true;
      }
      // FASE 1 (motor) — instruções PUBLICADAS desta execução entram no
      // contexto avaliado como conteúdo confiável, na versão do turno.
      const { montarInstrucoesDoTurno } = await import(
        "@/lib/nina/confidence/contexto-avaliacao"
      );
      const { hashDoTexto: hashInstrucoes } = await import("@/lib/nina/confidence/hash");
      const instrucoesDoTurno = montarInstrucoesDoTurno({
        escopo: "whatsapp",
        versao: instrucoesNina.versao === null || instrucoesNina.versao === undefined
          ? null
          : String(instrucoesNina.versao),
        versaoId: instrucoesNina.versaoId ?? null,
        publicadoEm: instrucoesNina.publicadoEm ?? null,
        origem: instrucoesNina.origem ?? null,
        hash: hashInstrucoes(behaviorPrompt),
        texto: behaviorPrompt,
      });
      const estadoTurno = {
        texto,
        mensagemPaciente,
        instrucoes: instrucoesDoTurno,
        intent: canonico.intent,
        acao: canonico.requestedAction,
        // FASE 1 — natureza do turno: uma saudação não exige fonte, ferramenta
        // nem avaliação de segurança de ação.
        tipoTurno: canonico.turnType,
        intentAmbiguo: canonico.intentAmbiguo,
        messageId: canonico.messageIdEntrada,
        ferramentas: evidenciasFerramentas,
        fatos: fatosDoTurno,
        consultas: consolidarTentativas(consultasDoTurno),
        catalogoEncontrou,
        agendamentoConfirmado,
        pacienteIdentificado: Boolean(pacienteIdEfetivo),
        esclarecimentoUsado: esclarecimentoConfiancaUsado,
        handoffSolicitado: houveHandoff,
        ambiente: (opcoes?.teste === true ? "homologacao" : "producao") as
          | "producao"
          | "homologacao",
        clinicaId,
        conversaId: estadoId.conversaId ?? null,
        entities: dadosColetados,
        // FASE 4 — estado REAL do fluxo (leitura da máquina de estados que já
        // existe). O motor compara o que a Nina diz com o que o sistema tem.
        estadoOperacional: {
          bookingIntentConfirmed: fluxoEstado.appointment.intent_confirmed === true,
          appointmentFlowActive: fluxoEstado.flow.stage !== "IDLE",
          patientDataComplete: Boolean(
            fluxoEstado.patient.identified && fluxoEstado.patient.id,
          ),
          slotSelected: Boolean(
            fluxoEstado.appointment.slot_inicio && fluxoEstado.appointment.slot_fim,
          ),
          finalConfirmationReceived:
            fluxoEstado.appointment.slot_confirmed_by_patient === true,
          appointmentAttempted: evidenciasFerramentas.some(
            (f) => f.capacidade === "createAppointment" || /agendar/i.test(f.nome),
          ),
          appointmentToolCalled: evidenciasFerramentas.some(
            (f) => f.capacidade === "createAppointment" || /agendar/i.test(f.nome),
          ),
          appointmentCreated: agendamentoConfirmado,
          appointmentId: fluxoEstado.appointment.appointment_id,
          workflowState: fluxoEstado.flow.stage,
        },
        // Regras determinísticas do agendamento, derivadas do estado real.
        regrasNegocio:
          canonico.requestedAction === "criar_agendamento"
            ? ([
                {
                  id: "agendamento_exige_paciente_identificado",
                  descricao: "Agendar exige paciente identificado",
                  satisfeita: Boolean(pacienteIdEfetivo),
                },
                {
                  id: "agendamento_exige_vaga_confirmada",
                  descricao: "Agendar exige vaga escolhida e confirmada",
                  satisfeita: Boolean(
                    fluxoEstado.appointment.slot_inicio &&
                      fluxoEstado.appointment.slot_fim,
                  ),
                },
              ])
            : [],
      };
      // FASE 9 — a política só difere da padrão se um ajuste tiver sido
      // aprovado E aplicado por uma pessoa. A Nina nunca altera pesos sozinha.
      // FASE 6 — configuração efetiva e etapa carregadas UMA VEZ por turno:
      // mudança publicada no meio da resposta só vale no próximo turno.
      const { configuracaoDoTurno } = await import(
        "@/lib/nina/confidence/configuracao-turno.server"
      );
      const cfgTurno = await configuracaoDoTurno(clinicaId);
      // FASE 5 — esta avaliação é de SEGURANÇA DA AÇÃO (action_safety):
      // decide esclarecer, transferir ou bloquear ANTES de agir. Ela não é a
      // nota da mensagem: essa é medida no fim, sobre o texto final.
      const decisao = decidirNoTurno(estadoTurno, cfgTurno.configuracao.parametros);
      estadoTurnoFinal = estadoTurno;
      avaliacaoAcao = decisao;
      execucaoIdFinal = respostaIA.execucaoId ?? null;

      // FASE 8 — ATIVAÇÃO PROGRESSIVA: etapa A só observa; B aplica handoff e
      // bloqueio; C acrescenta esclarecimento; D endurece o agendamento.
      const { aplicarEtapa } = await import("@/lib/nina/confidence/etapas");
      const etapa = cfgTurno.etapa;
      const modo = cfgTurno.modo;
      const aplicado = aplicarEtapa(decisao, etapa);

      // FASE 4 — confiança baixa, sozinha, NÃO transfere. O destino do turno
      // combina motivo da incerteza, tipo do turno, recuperabilidade,
      // segurança da ação e política operacional.
      const { decidirHandoff } = await import("@/lib/nina/confidence/handoff-decision");
      const plano = decidirHandoff({
        avaliacaoAcao: decisao,
        decisaoEfetiva: aplicado.decisaoEfetiva,
        tipoTurno: canonico.turnType,
        pedidoHumanoExplicito: canonico.turnType === "HANDOFF",
        tentativasEsclarecimento: tentativasEsclarecimentoConfianca,
      });
      rastro?.concluir("confidence.decision", {
        handoff_decision: plano.decision,
        handoff_reason: plano.reason,
        handoff_recuperavel: plano.recuperavel,
        score: decisao.score,
        nivel: decisao.level,
        acao: decisao.decision,
        modo,
        etapa,
        decisao_efetiva: aplicado.decisaoEfetiva,
        teria_permitido: aplicado.teriaPermitido,
        motivo_etapa: aplicado.motivoEtapa ?? null,
        bloqueios: decisao.hardBlockers ?? [],
        categorias: decisao.evidence.categorias,
      });

      {
        const { registrarDecisaoConfianca } = await import(
          "@/lib/nina/confidence-engine.server"
        );
        void registrarDecisaoConfianca({
          clinicaId,
          conversaId: estadoId.conversaId ?? null,
          execucaoId: respostaIA.execucaoId ?? null,
          traceId: rastro?.ids.trace_id ?? null,
          teste: opcoes?.teste === true,
          // FASE 4 — separa produção, homologação e teste automatizado.
          ambiente:
            opcoes?.ambiente ?? (opcoes?.teste === true ? "homologacao" : "producao"),
          decisao: paraDecisaoLegado(decisao),
          modo,
          teriaPermitido: aplicado.teriaPermitido,
          // FASE 6 — configuração histórica realmente usada neste turno.
          configId: cfgTurno.configuracao.configId,
          configOrigem: cfgTurno.configuracao.origem,
          etapaAtivacao: etapa,
          // FASE 5 — telemetria da política de handoff, sem dado do paciente.
          handoffDecision: plano.decision,
          handoffReason: plano.reason,
          handoffOcorreu: plano.decision === "HANDOFF",
          // Evidência observável apenas: validadores, motivos, fontes,
          // ferramentas e bloqueios. Nunca o rascunho ou o raciocínio interno.
          auditoria: montarRegistroAuditoria(decisao, {
            conversationId: estadoId.conversaId ?? null,
            messageId: canonico.messageIdEntrada,
            batchId: canonico.lote.batchId,
            batchMessageIds: canonico.lote.messageIds,
            conversationRevision: canonico.lote.conversationRevision,
            executionId: respostaIA.execucaoId ?? null,
            intencao: canonico.intent,
            // Mesma ação vista pelo motor. Capacidade de agenda não entra aqui.
            acaoSolicitada: canonico.requestedAction,
            turnType: canonico.turnType ?? null,
            ferramentas: evidenciasFerramentas,
          }),
        });
        // FASE 1 — política/etapa de confiança aplicada neste turno.
        const { registrarConfiancaDoTurno } = await import("@/lib/nina/rastreio/turno.server");
        registrarConfiancaDoTurno({
          avaliacao: "action_safety",
          decisao: plano.decision,
          etapa,
          modo,
          // FASE 2 — decisão operacional: fora do modo shadow ela foi aplicada.
          aplicada: modo !== "shadow",
          score: decisao.score,
          nivel: decisao.level,
        });
      }

      // FASE 4 — confiança intermediária: UMA pergunta curta ao paciente, a
      // pendência é persistida e o TURNO TERMINA. A reavaliação depende de
      // nova entrada do paciente — reavaliar a mesma mensagem não consome
      // tentativa nem justifica transferência.
      if (plano.decision === "CLARIFY" || (plano.decision === "BLOCK_ACTION" && plano.clarify)) {
        esclarecimentoConfiancaUsado = true;
        fluxoEstado.clarification = abrirPendencia({
          resultado: decisao,
          intent: canonico.intent ?? null,
          messageId: canonico.messageIdEntrada ?? null,
          tentativasConsumidas: tentativasEsclarecimentoConfianca,
        });
        resposta = perguntaParaPaciente(decisao, canonico.turnType);
        {
          const { registrarOrigemResposta } = await import("@/lib/nina/rastreio/turno.server");
          registrarOrigemResposta(
            "codigo",
            `pergunta de esclarecimento emitida (${plano.reason}); turno encerrado aguardando o paciente`,
          );
        }
        break;
      }

      // Confiança baixa ou bloqueio absoluto: transfere pelo mesmo caminho já
      // existente (evento, fila, protocolo e aviso ao paciente), levando o
      // resumo estruturado para a atendente.
      // Só chega aqui quando a Nina não tem como resolver sozinha: bloqueio
      // sem recuperação, fonte oficial ausente, pedido explícito por pessoa
      // ou esclarecimento repetido sem avanço.
      if (plano.decision === "HANDOFF" || plano.decision === "BLOCK_ACTION") {
        const rh = await broker.executar(
          "solicitar_atendente_humano",
          JSON.stringify({
            motivo: `${plano.reason}: ${plano.explicacao} — ${motivoHandoff(decisao)}`.slice(0, 500),
            resumo: resumoHandoffEstruturado(estadoTurno, decisao),
            urgencia: "normal",
          }),
        );
        // FASE 4 — só se anuncia transferência DEPOIS da confirmação do
        // serviço. Em falha, o paciente recebe a verdade sobre a limitação;
        // o rascunho reprovado nunca é enviado.
        const { desfechoDeHandoff } = await import("@/lib/nina/confidence/desfecho");
        const desfecho = desfechoDeHandoff({
          confirmado: rh.success === true,
          motivo: `${plano.decision}/${plano.reason}`,
          erro: rh.erro ?? null,
        });
        if (desfecho.handoffConfirmado) houveHandoff = true;
        if (!desfecho.handoffConfirmado) {
          console.error("[NINA_HANDOFF] transferência não confirmada", {
            conversa_id: estadoId.conversaId,
            motivo: plano.reason,
            erro: rh.erro ?? null,
          });
        }
        // Estado recuperável: a pendência fica registrada para a retomada.
        fluxoEstado.clarification = fecharPendencia();
        resposta = desfecho.resposta;
        {
          const { registrarOrigemResposta } = await import("@/lib/nina/rastreio/turno.server");
          registrarOrigemResposta("codigo", `${desfecho.estado}: ${desfecho.explicacao}`);
        }
        registrarEtapa({
          tipo: "resposta_original",
          fonte: "sistema",
          titulo: `Desfecho do turno: ${desfecho.estado}`,
          dados: {
            estado: desfecho.estado,
            handoff_confirmado: desfecho.handoffConfirmado,
            requer_retomada_humana: desfecho.requerRetomadaHumana,
            decisao_recomendada: decisao.decision,
            decisao_aplicada: aplicado.decisaoEfetiva,
            plano: plano.decision,
            motivo: plano.reason,
            erro: desfecho.erro,
          },
          codigo: { arquivo: "src/lib/whatsapp.server.ts", funcao: "gerarRespostaNinaInterno" },
        });
        break;
      }

      resposta = texto;
      // A dúvida foi resolvida neste turno: a pendência deixa de existir.
      fluxoEstado.clarification = fecharPendencia();
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
      // ---- validação final imediatamente antes de gravar o agendamento ----
      let argsObj: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(String(c.function?.arguments ?? "{}"));
        if (parsed && typeof parsed === "object") argsObj = parsed as Record<string, unknown>;
      } catch {
        argsObj = {};
      }
      for (const [k, v] of Object.entries(argsObj)) {
        if (v !== null && v !== undefined && String(v).trim() !== "") dadosColetados[k] = v;
      }
      if (nome === "agendar") {
        const [{ validarAgendamentoAntesDoCommit }, { configuracaoDoTurno }] = await Promise.all([
          import("@/lib/nina/confidence/runtime"),
          import("@/lib/nina/confidence/configuracao-turno.server"),
        ]);
        const gate = validarAgendamentoAntesDoCommit({
          args: argsObj,
          ferramentas: evidenciasFerramentas,
          pacienteIdentificado: Boolean(pacienteIdEfetivo),
          disponibilidadeConfirmada,
        });
        // FASE 8 — a trava só vale nas clínicas que já avançaram para a etapa D
        // (rigor no agendamento). Nas demais o motor apenas observa e registra,
        // exatamente como nas decisões ALLOW/CLARIFY/HANDOFF.
        const etapaAtual = (await configuracaoDoTurno(clinicaId)).etapa;
        const aplicaTrava = etapaAtual === "D";
        if (!gate.liberado) {
          console.warn("[NINA_APPOINTMENT] pré-commit reprovado pelo Confidence Engine", {
            conversa_id: estadoId.conversaId,
            faltas: gate.faltas,
            etapa: etapaAtual,
            aplicado: aplicaTrava,
          });
        }
        if (!gate.liberado && aplicaTrava) {
          rastro?.falhar("tool.execute", gate.motivo, { ferramenta: nome });
          mensagens.push({
            role: "tool",
            tool_call_id: c.id,
            content: JSON.stringify({
              ok: false,
              erro: "PRECOMMIT_VALIDATION_FAILED",
              detalhe: gate.motivo,
              instrucao:
                "NÃO diga que agendou nem que está agendando. Resolva o que falta (confirmar horário disponível, dados do paciente ou o procedimento) antes de chamar 'agendar' novamente.",
            }),
          });
          continue;
        }
      }

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
      if (r.success && !r.erro) rastro?.concluir("tool.execute", { ferramenta: nome });
      else rastro?.falhar("tool.execute", r.erro ?? "falha na ferramenta", { ferramenta: nome });
      const resultado = respostaParaModelo(r);
      if (r.capacidade === "requestHumanHandoff" && r.success) houveHandoff = true;
      if (r.appointment_confirmed) agendamentoConfirmado = true;
      if (r.capacidade === "checkAvailability" && r.success && !r.erro) {
        disponibilidadeConfirmada = true;
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
      nomesFerramentasTurno.push(nome);
      // Evidência estruturada: fatos reais do retorno + status da consulta.
      try {
        const { extrairEvidencia } = await import("@/lib/nina/confidence/evidencia-extrator");
        const ex = extrairEvidencia({
          ferramenta: nome,
          capacidade: r.capacidade,
          fonte: r.fonte,
          args: c.function?.arguments ?? null,
          success: r.success,
          erro: r.erro ?? null,
          dados: r.dados,
          clinicaId,
        } as never);
        fatosDoTurno.push(...ex.fatos);
        consultasDoTurno.push(ex.consulta);
      } catch {
        // Extração é observacional: nunca interrompe o atendimento.
      }
      // Evidência para o Confidence Engine (não altera o que o modelo vê).
      evidenciasFerramentas.push({
        nome,
        capacidade: r.capacidade,
        fonte: r.fonte,
        success: r.success,
        erro: r.erro,
        // FASE 5 — escopo da consulta: só conta como falha recuperada quando a
        // NOVA tentativa repete exatamente a mesma pergunta.
        escopo: String(c.function?.arguments ?? "").trim().slice(0, 400) || null,
      });
      if (
        r.success &&
        !r.erro &&
        (r.capacidade === "searchKnowledgeBase" || r.capacidade === "listCatalog") &&
        temConteudoUtil(r.dados)
      ) {
        catalogoEncontrou = true;
      }
      if (!r.success || r.erro) conflitoFerramenta = true;
      mensagens.push({
        role: "tool",
        tool_call_id: c.id,
        content: JSON.stringify(resultado).slice(0, 8000),
      });
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
    if (rodada === MAX_RODADAS - 1) limiteRodadasAtingido = true;
  }

  // FASE 4 — LIMITE DE RODADAS: desfecho explícito. O último rascunho NÃO
  // vira resposta aprovada; tenta-se a transferência e o paciente recebe a
  // verdade sobre o que aconteceu.
  if (limiteRodadasAtingido && !turnoObsoleto && resposta.trim() === "") {
    const rhLimite = await broker
      .executar(
        "solicitar_atendente_humano",
        JSON.stringify({
          motivo: `LIMITE_RODADAS: ${MAX_RODADAS} rodadas sem resposta aprovada`,
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
  const respostaDoModelo = resposta;

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
  const { registrarTransformacaoResposta, registrarOrigemResposta: marcarOrigem } = await import(
    "@/lib/nina/rastreio/turno.server"
  );
  const { hashDoTexto: hashTurno } = await import("@/lib/nina/confidence/hash");
  const transformar = (etapa: string, motivo: string, antes: string, depois: string) => {
    if (antes === depois) return;
    registrarTransformacaoResposta({
      etapa,
      motivo,
      antesHash: hashTurno(antes),
      depoisHash: hashTurno(depois),
    });
  };

  if (!resposta && houveHandoff) {
    const antes = resposta;
    resposta =
      "Certo! Já chamei uma atendente da nossa equipe para continuar com você por aqui 💛";
    transformar("handoff.texto_padrao", "handoff sem texto do modelo", antes, resposta);
    marcarOrigem("codigo", "texto fixo de transferência (sem texto do modelo)");
  }

  // Aviso explícito ao paciente: ele precisa saber que saiu da IA e foi para
  // uma pessoa. A frase é fixa para nunca depender do humor do modelo.
  if (houveHandoff) {
    const AVISO_TRANSFERENCIA =
      "🔁 *Transferido para atendimento humano.* Você não está mais falando com a Nina — uma atendente da equipe assume esta conversa e responde por aqui mesmo.";
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
  const diagnosticoSaudacao = avaliarSaudacao(resposta, nomeCurtoUnidade, {
    obrigatoria: saudacaoObrigatoriaEfetivaTurno,
  });
  if (diagnosticoSaudacao.saudacaoDuplicada || diagnosticoSaudacao.saudacaoAusente) {
    console.warn("[NINA_SAUDACAO]", {
      conversa_id: estadoId.conversaId,
      saudacao_obrigatoria: saudacaoObrigatoria,
      saudacao_duplicada: diagnosticoSaudacao.saudacaoDuplicada,
      saudacao_ausente: diagnosticoSaudacao.saudacaoAusente,
      elementos: diagnosticoSaudacao.elementos,
    });
  }
  // `greeting_completed` passa a significar APRESENTAÇÃO REALMENTE FEITA.
  // Apresentação dispensada por exceção publicada é registrada à parte
  // (`greeting_waived`), sem fingir que a Nina se apresentou.
  if (saudacaoObrigatoria && !saudacaoObrigatoriaEfetivaTurno) {
    fluxoEstado.greeting_waived = true;
    fluxoEstado.greeting_waived_by = saudacaoDispensadaPor;
    await salvarFluxoEstado(supabaseAdmin as never, clinicaId, estadoId.conversaId, fluxoEstado);
  } else if (saudacaoObrigatoriaEfetivaTurno && !diagnosticoSaudacao.saudacaoAusente) {
    const estadoComSaudacao = marcarSaudacaoConcluida(fluxoEstado);
    fluxoEstado.greeting_completed = true;
    await salvarFluxoEstado(
      supabaseAdmin as never,
      clinicaId,
      estadoId.conversaId,
      estadoComSaudacao,
    );
  }

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
  // ---------------- FASE 5: FINALIZAÇÃO ANTES DA AVALIAÇÃO ----------------
  // Template publicado, despedida e checagem de promessa sem prova acontecem
  // AQUI, antes de a nota ser calculada. Assim o texto avaliado é exatamente o
  // texto entregue: o transporte não acrescenta nada depois. Quem envia chama
  // o mesmo serviço com a mesma chave de turno e recebe o resultado guardado,
  // sem repetir nenhum efeito.
  const chaveTurnoFinalizacaoBase =
    (opcoes?.auditoria as { traceId?: string } | undefined)?.traceId ??
    rastro?.ids.trace_id ??
    `${clinicaId}|${telefoneNorm ?? "-"}|${estadoId.conversaId ?? "-"}`;
  // CONTROLE DE ENVIO x VERIFICAÇÃO: finalização e avaliação rodam no mesmo
  // laço. Quando uma regra publicada bloqueante é descumprida, o modelo
  // reescreve o texto e TUDO é conferido de novo — inclusive templates e
  // demais intervenções —, respeitando o limite de tentativas.
  let correcoesPorRegras = 0;
  let podeCorrigirPorRegras = true;
  let repetirVerificacaoRegras = true;
  let passeVerificacaoRegras = 0;
  const LIMITE_PASSES_VERIFICACAO = 4;
  while (repetirVerificacaoRegras) {
  repetirVerificacaoRegras = false;
  passeVerificacaoRegras += 1;
  const chaveTurnoFinalizacao =
    passeVerificacaoRegras === 1
      ? chaveTurnoFinalizacaoBase
      : `${chaveTurnoFinalizacaoBase}#correcao-${passeVerificacaoRegras}`;
  try {
    if (resposta) {
      const [{ finalizarResposta }, { criarResultado }] = await Promise.all([
        import("@/lib/nina/resposta/finalizacao.server"),
        import("@/lib/nina/resposta/contrato"),
      ]);
      const baseResultado =
        ((opcoes?.auditoria as { resultado?: unknown } | undefined)?.resultado as
          | import("@/lib/nina/resposta/contrato").ResultadoRespostaNina
          | undefined) ?? criarResultado({ origem: "modelo", texto: resposta });
      const finalizada = await finalizarResposta({
        clinicaId,
        canal: opcoes?.teste === true ? "test-console" : "whatsapp",
        chaveTurno: chaveTurnoFinalizacao,
        conversaId: estadoId.conversaId ?? null,
        telefone: telefoneNorm ?? null,
        mensagemPaciente: mensagemPaciente || null,
        resultado: { ...baseResultado, texto: resposta },
        // Encerramento automático só no caminho real de atendimento e SÓ no
        // primeiro passe: correção de texto não repete efeito externo.
        avaliarEncerramento:
          passeVerificacaoRegras === 1 &&
          opcoes?.teste !== true &&
          Boolean(mensagemPaciente),
      });
      if (finalizada.texto) resposta = finalizada.texto;
      if (opcoes?.auditoria) {
        (opcoes.auditoria as { finalizacao?: unknown }).finalizacao = finalizada;
      }
    }
  } catch (e) {
    console.error("[nina] finalização antes da avaliação falhou", e);
  }
  // ---------------- FASE 5: FINAL ANSWER VERIFICATION ----------------

  // A partir daqui o texto não muda mais. É ESTE texto — com saudação
  // obrigatória, avisos internos e banner de transferência já aplicados — que
  // é avaliado, persistido e enviado. O score de um texto anterior nunca é
  // reaproveitado: se a mensagem mudou depois da avaliação da ação, o motor
  // roda de novo sobre a mensagem final.
  // FASE 5 — REVISÃO FINAL ÚNICA: toda origem de texto (modelo, template,
  // gate, fallback, encerramento, transferência e limite de rodadas) passa por
  // este mesmo ponto, depois dos ajustes de conteúdo e antes da persistência e
  // do envio. Quando o turno não chegou a montar o estado do modelo, a revisão
  // roda sobre um estado mínimo VERDADEIRO: o que falta continua ausente.
  const estadoParaRevisao = estadoTurnoFinal ?? {
    texto: resposta,
    mensagemPaciente: mensagemPaciente || null,
    intent: null,
    acao: null,
    tipoTurno: null,
    messageId: null,
    ferramentas: evidenciasFerramentas,
    catalogoEncontrou,
    agendamentoConfirmado,
    pacienteIdentificado: Boolean(pacienteIdEfetivo),
    esclarecimentoUsado: esclarecimentoConfiancaUsado,
    handoffSolicitado: houveHandoff,
    ambiente: (opcoes?.teste === true ? "homologacao" : "producao") as
      | "producao"
      | "homologacao",
    clinicaId,
    conversaId: estadoId.conversaId ?? null,
  };
  try {
    if (resposta) {
      const [
        { garantirScoreDoTextoEnviado, paraDecisaoLegado },
        { montarRegistroAuditoria },
        { configuracaoDoTurno },
      ] = await Promise.all([
        import("@/lib/nina/confidence/runtime"),
        import("@/lib/nina/confidence/auditoria"),
        import("@/lib/nina/confidence/configuracao-turno.server"),
      ]);
      // Mesma configuração do início do turno: publicar um ajuste durante a
      // geração não muda a régua no meio da avaliação.
      const cfgFinal = await configuracaoDoTurno(clinicaId);
      const estadoParaTextoFinal = {
        ...estadoParaRevisao,
        texto: resposta,
        handoffSolicitado: houveHandoff,
        agendamentoConfirmado,
      };
      const gate = garantirScoreDoTextoEnviado(
        estadoParaTextoFinal,
        resposta,
        // A avaliação da ação nunca serve como nota da mensagem final: ela é
        // action_safety, então o gate sempre a invalida e recalcula.
        avaliacaoAcao,
        cfgFinal.configuracao.parametros,
      );
      const respostaFinalAvaliada = gate.resultado;

      rastro?.concluir("answer.verify", {
        score: respostaFinalAvaliada.score,
        nivel: respostaFinalAvaliada.level,
        cobertura: respostaFinalAvaliada.evidenceCoverage,
        claims_total: respostaFinalAvaliada.claims?.total ?? 0,
        claims_sem_evidencia: respostaFinalAvaliada.claims?.semEvidencia.length ?? 0,
        recalculado: gate.recalculado,
        motivo_gate: gate.motivo,
        texto_hash: respostaFinalAvaliada.textoAvaliadoHash,
      });

      const { registrarDecisaoConfianca, registrarEntregaSaida } = await import(
        "@/lib/nina/confidence-engine.server"
      );
      const { identidadeEvidencias } = await import("@/lib/nina/confidence/entrega");
      const { registroTurnoAtual } = await import("@/lib/nina/rastreio/turno.server");
      const registroDoTurno = registroTurnoAtual();
      const evidenciasHash = identidadeEvidencias(evidenciasFerramentas as unknown[]);
      // FASE 5 — a gravação é AGUARDADA: o vínculo da saída depende do id
      // desta linha, e disparar as duas em paralelo criava corrida.
      const registro = await registrarDecisaoConfianca({
        clinicaId,
        conversaId: estadoId.conversaId ?? null,
        execucaoId: execucaoIdFinal,
        traceId: rastro?.ids.trace_id ?? null,
        teste: opcoes?.teste === true,
        ambiente:
          opcoes?.ambiente ?? (opcoes?.teste === true ? "homologacao" : "producao"),
        avaliacao: "answer_confidence",
        textoFinalHash: respostaFinalAvaliada.textoAvaliadoHash,
        claims: respostaFinalAvaliada.claims ?? null,
        // FASE 6 — sessão da Nina preservada junto do snapshot.
        ninaSessionId:
          (fluxoEstado as { session_id?: string | null }).session_id ?? null,
        decisao: paraDecisaoLegado(respostaFinalAvaliada),
        modo: "shadow",
        // FASE 5 — contexto ao qual esta nota pertence.
        revisaoConversa: opcoes?.lote?.revisao ?? null,
        evidenciasHash,
        origemResposta: registroDoTurno?.origemResposta ?? null,
        // Caminho sem modelo fica com 0 rodadas: nada de execução inventada.
        rodadas: registroDoTurno?.rodadas ?? rodadasDoTurno,
        representacao: "texto_completo",
        // FASE 6 — a mesma configuração histórica do turno.
        configId: cfgFinal.configuracao.configId,
        configOrigem: cfgFinal.configuracao.origem,
        etapaAtivacao: cfgFinal.etapa,
        auditoria: montarRegistroAuditoria(respostaFinalAvaliada, {
          conversationId: estadoId.conversaId ?? null,
          messageId: estadoParaRevisao.messageId ?? null,
          batchId: opcoes?.lote?.batchId ?? null,
          batchMessageIds: opcoes?.mensagensEntrada ?? [],
          conversationRevision: opcoes?.lote?.revisao ?? null,
          executionId: execucaoIdFinal ?? null,
          intencao: estadoParaRevisao.intent ?? null,
          acaoSolicitada: estadoParaRevisao.acao ?? "desconhecida",
          turnType: estadoParaRevisao.tipoTurno ?? null,
          ferramentas: evidenciasFerramentas,
        }),
      });
      // O snapshot da resposta final viaja para quem vai enviar: é ele que liga
      // a nota à mensagem realmente gravada, sem violar a imutabilidade.
      if (opcoes?.auditoria) {
        (
          opcoes.auditoria as {
            decisaoId?: string | null;
            textoFinalHash?: string | null;
          }
        ).decisaoId = registro.id;
        (
          opcoes.auditoria as { textoFinalHash?: string | null }
        ).textoFinalHash = respostaFinalAvaliada.textoAvaliadoHash ?? null;
        // FASE 6 — quem entrega a resposta em ÁUDIO precisa avaliar o conteúdo
        // que vai ser falado quando ele diferir do texto. O resumo falado é
        // outro conteúdo e nunca herda a nota do texto completo.
        (
          opcoes.auditoria as {
            avaliarRepresentacao?: (
              texto: string,
              representacao: "audio_integral" | "audio_resumo",
            ) => Promise<{ decisaoId: string | null; textoHash: string | null } | null>;
          }
        ).avaliarRepresentacao = async (textoFalado, representacao) => {
          try {
            const gateFala = garantirScoreDoTextoEnviado(
              { ...estadoParaTextoFinal, texto: textoFalado },
              textoFalado,
              null,
              cfgFinal.configuracao.parametros,
            );
            const avaliacaoFala = gateFala.resultado;
            const registroFala = await registrarDecisaoConfianca({
              clinicaId,
              conversaId: estadoId.conversaId ?? null,
              execucaoId: execucaoIdFinal,
              traceId: rastro?.ids.trace_id ?? null,
              teste: opcoes?.teste === true,
              ambiente:
                opcoes?.ambiente ?? (opcoes?.teste === true ? "homologacao" : "producao"),
              avaliacao: "answer_confidence",
              textoFinalHash: avaliacaoFala.textoAvaliadoHash,
              claims: avaliacaoFala.claims ?? null,
              decisao: paraDecisaoLegado(avaliacaoFala),
              modo: "shadow",
              revisaoConversa: opcoes?.lote?.revisao ?? null,
              evidenciasHash,
              origemResposta: registroDoTurno?.origemResposta ?? null,
              rodadas: registroDoTurno?.rodadas ?? rodadasDoTurno,
              representacao,
              configId: cfgFinal.configuracao.configId,
              configOrigem: cfgFinal.configuracao.origem,
              etapaAtivacao: cfgFinal.etapa,
            });
            return {
              decisaoId: registroFala.id,
              textoHash: avaliacaoFala.textoAvaliadoHash ?? null,
            };
          } catch (e) {
            console.warn(
              "[nina-confianca] avaliação do conteúdo falado falhou:",
              e instanceof Error ? e.message : e,
            );
            return null;
          }
        };
      }
      // Saída PREPARADA: avaliada e aprovada. Ainda não foi gravada nem enviada.
      if (registro.ok) {
        await registrarEntregaSaida({
          clinicaId,
          decisaoId: registro.id,
          execucaoId: execucaoIdFinal,
          conversaId: estadoId.conversaId ?? null,
          representacao: "texto_completo",
          estado: "preparada",
          textoHash: respostaFinalAvaliada.textoAvaliadoHash ?? null,
          detalhe: {
            origem: registroDoTurno?.origemResposta ?? null,
            recalculado: gate.recalculado,
            motivo_gate: gate.motivo,
          },
        });
      }

      // FASE 1 — a nota da mensagem final também entra no registro do turno.
      const { registrarConfiancaDoTurno } = await import("@/lib/nina/rastreio/turno.server");
      // FASE 5 — REVISÃO FINAL: avaliação, decisão recomendada, decisão
      // aplicada e resultado comprovado, cada uma no seu lugar. A etapa da
      // clínica continua mandando (A só observa); as proteções obrigatórias
      // são identificadas à parte porque valem em qualquer etapa.
      const { origemDaSaida, revisarSaida, confirmarResultadoRevisao } = await import(
        "@/lib/nina/confidence/revisao-final"
      );
      const revisao = revisarSaida({
        origem: origemDaSaida(registroDoTurno?.origemResposta ?? null, {
          handoff: houveHandoff,
          limiteRodadas: limiteRodadasAtingido,
        }),
        textoFinal: resposta,
        avaliacao: respostaFinalAvaliada,
        etapa: cfgFinal.etapa,
        risco: agendamentoConfirmado || houveHandoff ? "operacional" : "informativo",
        operacaoAfirmada: agendamentoConfirmado,
        operacaoComprovada: Boolean(fluxoEstado.appointment.appointment_id),
      });
      {
        const { verificacoesDasInstrucoes } = await import(
          "@/lib/nina/confidence/conformidade-entrega"
        );
        verificacoesInstrucoesTurno = verificacoesDasInstrucoes(respostaFinalAvaliada);
      }
      const comprovado = confirmarResultadoRevisao(revisao, {
        executada: revisao.aplicada,
        comprovacao: houveHandoff ? (estadoId.conversaId ?? null) : null,
      });
      rastro?.concluir("answer.review", {
        origem: revisao.origem,
        motivo: revisao.motivo,
        acao_recomendada: revisao.acaoRecomendada,
        acao_aplicada: revisao.acaoAplicada,
        aplicada: revisao.aplicada,
        apenas_observou: revisao.apenasObservou,
        protecao_obrigatoria: revisao.protecaoObrigatoria,
        etapa: revisao.etapa,
        motivo_nao_aplicacao: revisao.motivoNaoAplicacao,
        degradado: revisao.degradado,
        aprovada: revisao.aprovada,
        resultado_comprovado: comprovado.comprovado,
      });

      registrarConfiancaDoTurno({
        avaliacao: "answer_confidence",
        decisao: respostaFinalAvaliada.decision ?? null,
        etapa: cfgFinal.etapa,
        modo: revisao.aplicada ? "enforce" : "shadow",
        // A revisão diz se ESTA avaliação alterou o atendimento. Etapa A
        // observa; proteção obrigatória aplica e fica declarada como tal.
        aplicada: revisao.aplicada,
        score: respostaFinalAvaliada.score,
        nivel: respostaFinalAvaliada.level,
      });

      // REGRA OBRIGATÓRIA — BAIXA CONFIABILIDADE ENCAMINHA PARA HUMANO.
      // Prevalece sobre a etapa de ativação (inclusive A) e sobre a decisão
      // recomendada pelo motor (inclusive CLARIFY). O conteúdo candidato é
      // descartado para envio em TODAS as representações (texto, áudio e
      // resumo falado, que derivam deste texto) e o paciente recebe apenas o
      // aviso controlado.
      const {
        decidirBloqueioBaixaConfianca,
        saidaControladaBaixaConfianca,
        ehAvisoControlado,
      } = await import("@/lib/nina/confidence/baixa-confiabilidade");
      const ambienteSaida: "producao" | "homologacao" =
        opcoes?.ambiente === "producao" && opcoes?.teste !== true
          ? "producao"
          : opcoes?.ambiente || opcoes?.teste === true
            ? "homologacao"
            : "producao";
      const bloqueio = decidirBloqueioBaixaConfianca({
        nivel: respostaFinalAvaliada.level ?? null,
        score: respostaFinalAvaliada.score ?? null,
        decisaoMotor: respostaFinalAvaliada.decision ?? null,
        etapa: cfgFinal.etapa,
        ambiente: ambienteSaida,
        configId: cfgFinal.configuracao.configId,
        jaEncaminhado: houveHandoff,
        avisoJaAplicado: ehAvisoControlado(resposta),
        conteudoCandidatoHash: respostaFinalAvaliada.textoAvaliadoHash ?? null,
      });
      if (bloqueio.bloquear && !bloqueio.jaAplicado) {
        let resultadoEnc:
          | { tipo: "real"; confirmado: boolean; comprovacao?: string | null; erro?: string | null }
          | { tipo: "simulado" };
        if (ambienteSaida === "homologacao") {
          // Homologação NÃO tem atribuição real: o desfecho é simulado.
          resultadoEnc = { tipo: "simulado" };
        } else if (!bloqueio.encaminhar) {
          // Idempotência: o encaminhamento deste turno já aconteceu.
          resultadoEnc = {
            tipo: "real",
            confirmado: true,
            comprovacao: estadoId.conversaId ?? null,
          };
        } else {
          const rhBaixa = await broker
            .executar(
              "solicitar_atendente_humano",
              JSON.stringify({
                motivo:
                  "BAIXA_CONFIABILIDADE: resposta reprovada na avaliação final (nível Baixa)",
                urgencia: "normal",
              }),
            )
            .catch(
              () =>
                ({ success: false, erro: "handoff_indisponivel" }) as {
                  success: boolean;
                  erro?: string;
                },
            );
          if (rhBaixa.success === true) houveHandoff = true;
          resultadoEnc = {
            tipo: "real",
            confirmado: rhBaixa.success === true,
            comprovacao: rhBaixa.success === true ? (estadoId.conversaId ?? null) : null,
            erro: rhBaixa.erro ?? null,
          };
        }
        const saidaControlada = saidaControladaBaixaConfianca(resultadoEnc);
        const antesBloqueio = resposta;
        resposta = saidaControlada.aviso;
        transformar(
          "confianca.baixa.encaminhamento",
          `${bloqueio.motivo}: conteúdo candidato descartado (${saidaControlada.encaminhamento})`,
          antesBloqueio,
          resposta,
        );
        marcarOrigem(
          "codigo",
          `${saidaControlada.registro} (origem: ${saidaControlada.origem})`,
        );
        rastro?.concluir("answer.low_confidence_handoff", {
          motivo: bloqueio.motivo,
          nivel: bloqueio.nivel,
          score: bloqueio.score,
          decisao_motor: bloqueio.decisaoMotor,
          etapa: bloqueio.etapa,
          precede_etapa_ativacao: bloqueio.precedeEtapaAtivacao,
          precede_decisao_motor: bloqueio.precedeDecisaoMotor,
          config_id: bloqueio.configId,
          ambiente: ambienteSaida,
          conteudo_candidato_hash: bloqueio.conteudoCandidatoHash,
          candidato_descartado: true,
          encaminhamento: saidaControlada.encaminhamento,
          encaminhamento_confirmado: saidaControlada.encaminhamentoConfirmado,
          exige_intervencao: saidaControlada.exigeIntervencao,
          registro: saidaControlada.registro,
          aviso_origem: saidaControlada.origem,
          aviso_herda_nota_do_candidato: false,
          erro: saidaControlada.erro,
        });
      }

      // ---- CONFORMIDADE COM AS INSTRUÇÕES PUBLICADAS x CONTROLE DE ENVIO ----
      // Detectar a violação não basta: o candidato NÃO é entregue quando uma
      // regra publicada bloqueante foi descumprida (ou não pôde ser
      // conferida), mesmo com nota média ou alta e mesmo na etapa A.
      if (!bloqueio.bloquear && revisao.bloqueiaEntrega) {
        const { decidirEntregaPorConformidade, instrucaoDeCorrecaoPorRegras } = await import(
          "@/lib/nina/confidence/conformidade-entrega"
        );
        const decisaoEntrega = decidirEntregaPorConformidade({
          conformidade: revisao.conformidade,
          tentativa: correcoesPorRegras,
          limiteTentativas: revisao.limiteTentativas,
          correcaoDisponivel: podeCorrigirPorRegras,
        });
        rastro?.concluir("answer.rule_compliance", {
          estado: revisao.conformidade.estado,
          motivo: revisao.conformidade.motivoBloqueio,
          violacoes: revisao.conformidade.violacoes.map((v) => v.regraId ?? v.id),
          nao_verificadas: revisao.conformidade.naoVerificadas.map((v) => v.regraId ?? v.id),
          score: respostaFinalAvaliada.score,
          nivel: respostaFinalAvaliada.level,
          nota_nao_compensa: true,
          entregar: decisaoEntrega.entregar,
          corrigir: decisaoEntrega.corrigir,
          desfecho_humano: decisaoEntrega.desfechoHumano,
          tentativa: decisaoEntrega.tentativa,
          limite: decisaoEntrega.limiteTentativas,
        });

        if (decisaoEntrega.corrigir) {
          // Correção TEXTUAL: o modelo reescreve. Nenhuma ferramenta é
          // oferecida, então nenhuma operação com efeito externo se repete.
          const { ninaAIGateway } = await import("@/lib/nina/ai-gateway.server");
          const correcaoIA = await ninaAIGateway({
            clinicaId,
            perfil: "whatsapp",
            conversaId: estadoId.conversaId ?? null,
            ferramentasUsadas: nomesFerramentasTurno,
            messages: [
              ...mensagens,
              { role: "assistant", content: resposta },
              { role: "system", content: instrucaoDeCorrecaoPorRegras(revisao.conformidade) },
            ] as never,
            raciocinio: {
              mensagem: mensagemPaciente,
              rodada: correcoesPorRegras + 1,
              temFerramentas: false,
              ferramentasExecutadas: nomesFerramentasTurno.length,
              nomesFerramentas: nomesFerramentasTurno,
              houveConflito: conflitoFerramenta,
            },
          }).catch(() => null);
          const textoCorrigido = (
            correcaoIA && correcaoIA.ok ? (correcaoIA.conteudo ?? "") : ""
          ).trim();
          if (textoCorrigido && textoCorrigido !== resposta) {
            const antesCorrecao = resposta;
            resposta = textoCorrigido;
            correcoesPorRegras += 1;
            repetirVerificacaoRegras = true;
            transformar(
              "confianca.regras.correcao",
              `${revisao.conformidade.motivoBloqueio}: nova versão pedida ao modelo (tentativa ${correcoesPorRegras}/${revisao.limiteTentativas})`,
              antesCorrecao,
              resposta,
            );
            // Origem registrada: o texto continua sendo do MODELO, corrigido
            // após a verificação — nada é substituído por código.
            marcarOrigem(
              "modelo_transformado",
              "reescrita do próprio modelo após violação de regra publicada",
            );
          } else {
            // Sem nova versão utilizável: encerra a correção e vai ao desfecho.
            podeCorrigirPorRegras = false;
            repetirVerificacaoRegras = true;
          }
        } else {
          // Exigência crítica segue descumprida ou não verificável: o
          // candidato é bloqueado e vale o desfecho de atendimento humano.
          let resultadoRegra:
            | { tipo: "real"; confirmado: boolean; comprovacao?: string | null; erro?: string | null }
            | { tipo: "simulado" };
          if (ambienteSaida === "homologacao") {
            resultadoRegra = { tipo: "simulado" };
          } else if (houveHandoff) {
            resultadoRegra = {
              tipo: "real",
              confirmado: true,
              comprovacao: estadoId.conversaId ?? null,
            };
          } else {
            const rhRegra = await broker
              .executar(
                "solicitar_atendente_humano",
                JSON.stringify({
                  motivo: `${revisao.conformidade.motivoBloqueio}: resposta bloqueada por instrução publicada`,
                  urgencia: "normal",
                }),
              )
              .catch(
                () =>
                  ({ success: false, erro: "handoff_indisponivel" }) as {
                    success: boolean;
                    erro?: string;
                  },
              );
            if (rhRegra.success === true) houveHandoff = true;
            resultadoRegra = {
              tipo: "real",
              confirmado: rhRegra.success === true,
              comprovacao: rhRegra.success === true ? (estadoId.conversaId ?? null) : null,
              erro: rhRegra.erro ?? null,
            };
          }
          const saidaRegra = saidaControladaBaixaConfianca(resultadoRegra);
          const antesRegra = resposta;
          resposta = saidaRegra.aviso;
          transformar(
            "confianca.regras.bloqueio",
            `${revisao.conformidade.motivoBloqueio}: conteúdo candidato descartado (${saidaRegra.encaminhamento})`,
            antesRegra,
            resposta,
          );
          marcarOrigem("codigo", `${saidaRegra.registro} (origem: ${saidaRegra.origem})`);
          rastro?.concluir("answer.rule_block", {
            motivo: revisao.conformidade.motivoBloqueio,
            estado: revisao.conformidade.estado,
            score: respostaFinalAvaliada.score,
            nivel: respostaFinalAvaliada.level,
            etapa: cfgFinal.etapa,
            ambiente: ambienteSaida,
            candidato_descartado: true,
            candidato_hash: respostaFinalAvaliada.textoAvaliadoHash ?? null,
            encaminhamento: saidaRegra.encaminhamento,
            encaminhamento_confirmado: saidaRegra.encaminhamentoConfirmado,
            correcoes_tentadas: correcoesPorRegras,
            limite_tentativas: revisao.limiteTentativas,
            erro: saidaRegra.erro,
          });
        }
      }
    }
  } catch (e) {
    // Falha técnica do avaliador NUNCA vira aprovação: fica registrada como
    // liberação degradada (ou desfecho explícito, conforme o risco).
    const erro = e instanceof Error ? e.message : String(e);
    console.warn("[nina-confianca] falha na verificação da resposta final:", erro);
    try {
      const { origemDaSaida, revisarSaida } = await import(
        "@/lib/nina/confidence/revisao-final"
      );
      const { registroTurnoAtual, registrarConfiancaDoTurno } = await import(
        "@/lib/nina/rastreio/turno.server"
      );
      const revisao = revisarSaida({
        origem: origemDaSaida(registroTurnoAtual()?.origemResposta ?? null, {
          handoff: houveHandoff,
          limiteRodadas: limiteRodadasAtingido,
        }),
        textoFinal: resposta,
        avaliacao: null,
        falhaAvaliador: erro,
        etapa: "A",
        risco: agendamentoConfirmado || houveHandoff ? "operacional" : "informativo",
        operacaoAfirmada: agendamentoConfirmado,
        operacaoComprovada: Boolean(fluxoEstado.appointment.appointment_id),
      });
      rastro?.falhar("answer.review", "AVALIADOR_INDISPONIVEL", {
        origem: revisao.origem,
        acao_recomendada: revisao.acaoRecomendada,
        degradado: revisao.degradado,
        aprovada: revisao.aprovada,
      });
      registrarConfiancaDoTurno({
        avaliacao: "answer_confidence",
        decisao: null,
        etapa: null,
        modo: "shadow",
        aplicada: false,
        score: null,
        nivel: null,
      });
    } catch {
      /* registro da degradação nunca interrompe o atendimento */
    }
    }
    // Limite duro do laço: nenhuma correção infinita, mesmo com erro.
    if (passeVerificacaoRegras > LIMITE_PASSES_VERIFICACAO) repetirVerificacaoRegras = false;
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
        ...(verificacoesInstrucoesTurno
          ? {
              verificacoes: verificacoesInstrucoesTurno.verificacoes,
              estadoFalhaDeInterpretacao: verificacoesInstrucoesTurno.falhaDeInterpretacao,
            }
          : {}),
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
): Promise<{ wa_message_id: string | null }> {
  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION_AUDIO}/${phoneNumberId}/messages`,
    {
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
  if (!res.ok) throw new Error(json?.error?.message ?? `Falha ao enviar áudio (${res.status})`);
  return { wa_message_id: json?.messages?.[0]?.id ?? null };
}
