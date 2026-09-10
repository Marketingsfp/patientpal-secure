import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizarTelefone } from "@/lib/atendimento/telefone";
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
    auditoria?: { execucaoId?: string | null };
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
    const { gravarEvidencias } = await import("@/lib/nina/evidencias.server");
    await gravarEvidencias(auditoria.execucaoId ?? null, clinicaId, coletor);
    return resultado;
  } catch (e) {
    rastro.falhar("error.handle", e);
    rastro.falhar("message.inbound", e);
    throw e;
  } finally {
    const { descarregarRastro } = await import("@/lib/nina/arquitetura/tracing.server");
    descarregarRastro(clinicaId, rastro);
  }
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
            .select("direction, body, created_at")
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
  const instrucoesNina = await promptInstrucoes(
    "whatsapp",
    {
      "${nomeUnidade}": nomeUnidade,
      "${nomeCurtoUnidade}": nomeCurtoUnidade,
    },
    PROMPT_NINA_WHATSAPP_V4.split("${nomeUnidade}")
      .join(nomeUnidade)
      .split("${nomeCurtoUnidade}")
      .join(nomeCurtoUnidade),
  );
  const behaviorPrompt = instrucoesNina.texto;

  rastro?.concluir("instructions.published", {
    versao: instrucoesNina.versao ?? null,
    origem: instrucoesNina.origem ?? null,
    publicado_em: instrucoesNina.publicadoEm ?? null,
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
  // FASE 3 — RUNTIME CONTEXT: só FATOS. Nenhuma regra conversacional aqui.
  // ------------------------------------------------------------------
  const runtimeContext = {
    canal: "whatsapp",
    ambiente: opcoes?.teste ? "homologacao" : "producao",
    unidade: dadosPublicos,
    data_hora_atual: agoraNaClinica(),
    fluxo_fase1_ativo: fase1Ativa,
    intencoes: intencoesTurno,
    intencao_ambigua: intencaoAmbiguaTurno,
    sessao: {
      session_id: sessaoNina.estado.session_id ?? null,
      nova_sessao: sessaoSaudacao.novaSessao || sessaoNina.expirou,
      expirou: sessaoNina.expirou,
      continuacao: sessaoNina.continuacao,
      saudacao_obrigatoria: saudacaoObrigatoria,
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
  const requestNina = comporRequestNina({ behaviorPrompt, runtimeContext });
  const systemPromptFinal = requestNina.systemPrompt;


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
    const respostaGate = await aplicarGateIdentificacao({
      mensagem: mensagemPaciente,
      estado: fluxoEstado,
      ctx: ctxFerramentas,
      executar,
    }).catch((e) => {
      console.error("[NINA_BOOKING_FLOW] gate falhou", e);
      return null;
    });
    if (respostaGate) {
      await salvarFluxoEstado(supabaseAdmin as never, clinicaId, estadoId.conversaId, fluxoEstado);
      return respostaGate;
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
    paciente: pacienteIdEfetivo
      ? {
          primeiro_nome: pacienteNomeEfetivo ? pacienteNomeEfetivo.split(" ")[0]! : null,
          identificado: true,
          validado: true,
        }
      : null,
  });
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
  }> = [];
  let catalogoEncontrou = false;
  let esclarecimentoConfiancaUsado = false;
  // FASE 4 — quantas vezes a Nina já tentou esclarecer neste atendimento.
  // O limite vive na política central (POLITICA_RECUPERACAO_PADRAO).
  let tentativasEsclarecimentoConfianca = 0;
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
  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
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
        mensagens.push({
          role: "user",
          content:
            "[SISTEMA] Nenhum agendamento foi gravado. É PROIBIDO dizer que agendou, que está agendando ou que vai agendar sem chamar a ferramenta 'agendar' e receber appointment_id. Chame agora a ferramenta 'agendar' com os campos inicio/fim exatos do horário confirmado. Se não for possível, responda apenas: 'Não consegui concluir seu agendamento neste momento. Vou verificar novamente.'",
        });
        continue;
      }
      if (podeAgendar && !agendamentoConfirmado && AFIRMA_AGENDAMENTO.test(texto)) {
        resposta = "Não consegui concluir seu agendamento neste momento. Vou verificar novamente.";
        break;
      }
      // --------- CONFIDENCE DECISION ENGINE: antes de a resposta sair ---------
      // Mesmo motor central da Fase 1-3 (validadores + política de pesos e
      // bloqueadores). Vale igual para atendimento real e homologação.
      const {
        decidirNoTurno,
        instrucaoEsclarecimentoDirigida,
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
      const estadoTurno = {
        texto,
        mensagemPaciente,
        intent: canonico.intent,
        acao: canonico.requestedAction,
        // FASE 1 — natureza do turno: uma saudação não exige fonte, ferramenta
        // nem avaliação de segurança de ação.
        tipoTurno: canonico.turnType,
        intentAmbiguo: canonico.intentAmbiguo,
        messageId: canonico.messageIdEntrada,
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
      const { politicaEfetiva } = await import(
        "@/lib/nina/confidence/politica-override.server"
      );
      // FASE 5 — esta avaliação é de SEGURANÇA DA AÇÃO (action_safety):
      // decide esclarecer, transferir ou bloquear ANTES de agir. Ela não é a
      // nota da mensagem: essa é medida no fim, sobre o texto final.
      const decisao = decidirNoTurno(estadoTurno, await politicaEfetiva(clinicaId));
      estadoTurnoFinal = estadoTurno;
      avaliacaoAcao = decisao;
      execucaoIdFinal = respostaIA.execucaoId ?? null;

      // FASE 8 — ATIVAÇÃO PROGRESSIVA: etapa A só observa; B aplica handoff e
      // bloqueio; C acrescenta esclarecimento; D endurece o agendamento.
      const [{ etapaConfianca, modoDaEtapa }, { aplicarEtapa }] = await Promise.all([
        import("@/lib/nina/confidence/etapas-flag.server"),
        import("@/lib/nina/confidence/etapas"),
      ]);
      const etapa = await etapaConfianca(clinicaId);
      const modo = modoDaEtapa(etapa);
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
      }

      // Confiança intermediária: UMA pergunta objetiva ao paciente e depois o
      // motor roda inteiro de novo (nada de reaproveitar a pontuação).
      if (
        (plano.decision === "CLARIFY" || (plano.decision === "BLOCK_ACTION" && plano.clarify)) &&
        rodada < MAX_RODADAS - 1
      ) {
        esclarecimentoConfiancaUsado = true;
        tentativasEsclarecimentoConfianca += 1;
        mensagens.push({ role: "assistant", content: texto });
        mensagens.push({ role: "user", content: instrucaoEsclarecimentoDirigida(decisao) });
        continue;
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
        if (rh.success) houveHandoff = true;
        resposta = rh.success
          ? "Para não te passar uma informação errada, vou chamar uma atendente da nossa equipe para confirmar isso com você."
          : texto;
        break;
      }

      resposta = texto;
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
        const [{ validarAgendamentoAntesDoCommit }, { etapaConfianca }] = await Promise.all([
          import("@/lib/nina/confidence/runtime"),
          import("@/lib/nina/confidence/etapas-flag.server"),
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
        const etapaAtual = await etapaConfianca(clinicaId);
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
      // Evidência para o Confidence Engine (não altera o que o modelo vê).
      evidenciasFerramentas.push({
        nome,
        capacidade: r.capacidade,
        fonte: r.fonte,
        success: r.success,
        erro: r.erro,
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
      break;
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




  if (!resposta && houveHandoff) {
    resposta =
      "Certo! Já chamei uma atendente da nossa equipe para continuar com você por aqui 💛";
  }

  // Aviso explícito ao paciente: ele precisa saber que saiu da IA e foi para
  // uma pessoa. A frase é fixa para nunca depender do humor do modelo.
  if (houveHandoff) {
    const AVISO_TRANSFERENCIA =
      "🔁 *Transferido para atendimento humano.* Você não está mais falando com a Nina — uma atendente da equipe assume esta conversa e responde por aqui mesmo.";
    if (!resposta.includes("Transferido para atendimento humano")) {
      resposta = `${resposta.trim()}\n\n${AVISO_TRANSFERENCIA}`.trim();
    }
  }


  if (!resposta) {
    resposta =
      "Consegui iniciar aqui, mas preciso de um instante — vou pedir para uma atendente concluir com você.";
  }

  // FASE 6 — a apresentação é comportamento e vem SOMENTE do Behavior Prompt
  // publicado em Arquitetura. Aqui apenas OBSERVAMOS o resultado (telemetria):
  // nada é acrescentado ao texto, para não gerar "Sou a Nina... Sou a Nina...".
  const diagnosticoSaudacao = avaliarSaudacao(resposta, nomeCurtoUnidade, {
    obrigatoria: saudacaoObrigatoria,
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
  if (saudacaoObrigatoria) {
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
  // ---------------- FASE 5: FINAL ANSWER VERIFICATION ----------------
  // A partir daqui o texto não muda mais. É ESTE texto — com saudação
  // obrigatória, avisos internos e banner de transferência já aplicados — que
  // é avaliado, persistido e enviado. O score de um texto anterior nunca é
  // reaproveitado: se a mensagem mudou depois da avaliação da ação, o motor
  // roda de novo sobre a mensagem final.
  try {
    if (estadoTurnoFinal) {
      const [{ garantirScoreDoTextoEnviado, paraDecisaoLegado }, { montarRegistroAuditoria }, { politicaEfetiva }] =
        await Promise.all([
          import("@/lib/nina/confidence/runtime"),
          import("@/lib/nina/confidence/auditoria"),
          import("@/lib/nina/confidence/politica-override.server"),
        ]);
      const estadoParaTextoFinal = {
        ...estadoTurnoFinal,
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
        await politicaEfetiva(clinicaId),
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

      const { registrarDecisaoConfianca } = await import(
        "@/lib/nina/confidence-engine.server"
      );
      void registrarDecisaoConfianca({
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
        auditoria: montarRegistroAuditoria(respostaFinalAvaliada, {
          conversationId: estadoId.conversaId ?? null,
          messageId: estadoTurnoFinal.messageId ?? null,
          batchId: opcoes?.lote?.batchId ?? null,
          batchMessageIds: opcoes?.mensagensEntrada ?? [],
          conversationRevision: opcoes?.lote?.revisao ?? null,
          executionId: execucaoIdFinal ?? null,
          intencao: estadoTurnoFinal.intent ?? null,
          acaoSolicitada: estadoTurnoFinal.acao ?? "desconhecida",
          turnType: estadoTurnoFinal.tipoTurno ?? null,
          ferramentas: evidenciasFerramentas,
        }),
      });
    }
  } catch (e) {
    // Verificação da resposta final é observabilidade: nunca derruba o envio.
    console.warn(
      "[nina-confianca] falha na verificação da resposta final:",
      e instanceof Error ? e.message : e,
    );
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
