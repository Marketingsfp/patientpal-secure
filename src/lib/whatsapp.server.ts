import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { agoraNaClinica, blocoDataHoraAgora, somarDiasIso } from "@/lib/nina-agora";
import {
  detectarEspecialidades,
  detectarProcedimentos,
  normalizar,
  pareceCitarEspecialidade,
} from "@/lib/nina-especialidade";

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

/** Normaliza telefone do remetente WhatsApp para os últimos 10-11 dígitos (formato BR). */
function normalizarTelefoneRemetente(from: string | null | undefined): string | null {
  const d = String(from ?? "").replace(/\D/g, "");
  if (!d) return null;
  // Remove DDI 55 se presente e retorna os últimos 11 dígitos
  const semDdi = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  return semDdi.slice(-11);
}

async function identificarPaciente(
  clinicaId: string,
  mensagem: string,
  telefoneRemetente: string | null,
) {
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
  return rows[0] ?? null;
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

export async function gerarRespostaNina(
  clinicaId: string,
  mensagemPaciente: string,
  telefoneRemetente?: string | null,
  /** Console de Homologação: mesma IA, mas tudo que grava nasce como teste. */
  opcoes?: { teste?: boolean },
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const telefoneNorm = normalizarTelefoneRemetente(telefoneRemetente ?? null);

  const [medR, dispR, procR, cliR, pacienteInfo, medEspR, espR, estadoId, histR] =
    await Promise.all([
      supabaseAdmin
        .from("medicos")
        .select("id, nome")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true),
      supabaseAdmin
        .from("medico_disponibilidades")
        .select("medico_id, agenda_id, dia_semana, hora_inicio, hora_fim, observacoes")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true),
      supabaseAdmin
        .from("procedimentos")
        .select("nome, grupo, valor_dinheiro_pix, valor_cartao, preparo")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true),
      supabaseAdmin
        .from("clinicas")
        .select("nome, base_importada, endereco, cidade, estado, cep, telefone, email")
        .eq("id", clinicaId)
        .maybeSingle(),
      identificarPaciente(clinicaId, mensagemPaciente, telefoneNorm),
      supabaseAdmin.from("medico_especialidades").select("medico_id, especialidade_id"),
      supabaseAdmin.from("especialidades").select("id, nome").eq("ativo", true),
      carregarEstadoIdentidade(clinicaId, telefoneRemetente ? String(telefoneRemetente) : null),
      telefoneRemetente
        ? supabaseAdmin
            .from("whatsapp_mensagens")
            .select("direction, body, created_at")
            .eq("clinica_id", clinicaId)
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

  const medicos = medicosLista.map((m) => m.texto).join("\n");

  const procs = (procR.data ?? [])
    .map(
      (p: any) =>
        `- ${p.nome}${p.grupo ? ` [${p.grupo}]` : ""}: PIX R$ ${Number(p.valor_dinheiro_pix).toFixed(2)} / cartão R$ ${Number(p.valor_cartao).toFixed(2)}${p.preparo ? ` | PREPARO: ${String(p.preparo).replace(/\s+/g, " ").trim()}` : ""}`,
    )
    .join("\n");

  /* ---------- Foco da pergunta: especialidade / procedimento / dia ---------- */
  const espsCadastradas = [...new Set((espR.data ?? []).map((e: any) => String(e.nome)))];
  const espsPedidas = detectarEspecialidades(mensagemPaciente, espsCadastradas);
  const espCitadaSemCadastro =
    espsPedidas.length === 0 ? pareceCitarEspecialidade(mensagemPaciente) : null;
  const procsPedidos = detectarProcedimentos(
    mensagemPaciente,
    (procR.data ?? []).map((p: any) => String(p.nome)),
  );

  const agora = agoraNaClinica();
  const textoNorm = normalizar(mensagemPaciente);
  let diaAlvo: number | null = null;
  let rotuloDia = "";
  if (/\bhoje\b/.test(textoNorm)) {
    diaAlvo = agora.diaSemana;
    rotuloDia = "hoje";
  } else if (/\bamanha\b/.test(textoNorm)) {
    diaAlvo = (agora.diaSemana + 1) % 7;
    rotuloDia = "amanhã";
  }

  const temEsp = (m: (typeof medicosLista)[number], esp: string) =>
    m.esps.some((e) => normalizar(e) === normalizar(esp));

  let blocoFoco = "";
  if (espCitadaSemCadastro) {
    blocoFoco = `FOCO DA PERGUNTA: o paciente pediu "${espCitadaSemCadastro}", que NÃO existe no cadastro de especialidades desta clínica (${espsCadastradas.join(", ") || "nenhuma"}). Responda que a clínica não atende essa especialidade e ofereça listar as que atende. NÃO liste a agenda geral.`;
  } else if (espsPedidas.length > 0) {
    const partes: string[] = [];
    for (const esp of espsPedidas) {
      const daEsp = medicosLista.filter((m) => temEsp(m, esp));
      const noDia = diaAlvo === null ? daEsp : daEsp.filter((m) => m.dias.has(diaAlvo!));
      if (noDia.length > 0) {
        const mostra = noDia.slice(0, 5);
        const restantes = noDia.length - mostra.length;
        partes.push(
          `${esp}${rotuloDia ? ` — ${rotuloDia}` : ""}:\n${mostra.map((m) => m.texto).join("\n")}${
            restantes > 0
              ? `\n(mais ${restantes} profissional(is) de ${esp} — diga ao paciente quantos faltam e ofereça mostrar o restante)`
              : ""
          }`,
        );
      } else if (daEsp.length === 0) {
        partes.push(
          `${esp}: a clínica não tem profissional ativo cadastrado nesta especialidade. Informe isso e ofereça as especialidades atendidas.`,
        );
      } else {
        // Procura o próximo dia com atendimento nessa especialidade
        let proximo: { rotulo: string; lista: typeof daEsp } | null = null;
        for (let i = 1; i <= 14 && !proximo; i++) {
          const dia = (agora.diaSemana + i) % 7;
          const lista = daEsp.filter((m) => m.dias.has(dia));
          if (lista.length > 0) {
            const iso = somarDiasIso(agora.iso, i);
            const [aa, mm, dd] = iso.split("-");
            proximo = { rotulo: `${DIAS[dia]} ${dd}/${mm}/${aa}`, lista };
          }
        }
        partes.push(
          proximo
            ? `${esp}: NÃO há atendimento ${rotuloDia || "no dia pedido"}. Diga isso claramente e ofereça o próximo dia com ${esp}: ${proximo.rotulo} —\n${proximo.lista
                .slice(0, 5)
                .map((m) => m.texto)
                .join("\n")}`
            : `${esp}: sem dias de atendimento cadastrados. Informe isso e oriente a falar com a recepção.`,
        );
      }
    }
    blocoFoco = `FOCO DA PERGUNTA — RESPONDA SOMENTE SOBRE ISTO:\n${partes.join("\n\n")}\n\nNÃO liste profissionais de outras especialidades. Máximo 5 profissionais por resposta, com horários.`;
  } else if (procsPedidos.length > 0) {
    blocoFoco = `FOCO DA PERGUNTA: o paciente citou o(s) procedimento(s): ${procsPedidos.join(", ")}. Responda apenas sobre eles (valor e preparo), sem listar a tabela inteira.`;
  }

  /* ---------- Confirmação de identidade (uma vez por conversa) ---------- */
  const respondeuConfirmando =
    CONFIRMACOES.test(mensagemPaciente) ||
    (pacienteInfo?.nome
      ? textoNorm.includes(normalizar(String(pacienteInfo.nome).split(" ")[0] ?? ""))
      : false);
  let identidadeConfirmada = estadoId.confirmada;
  if (!identidadeConfirmada && estadoId.perguntadaEm && respondeuConfirmando) {
    identidadeConfirmada = true;
    await salvarEstadoIdentidade(estadoId, { identidade_confirmada: true });
  }

  const primeiroNome = pacienteInfo?.nome ? String(pacienteInfo.nome).split(" ")[0] : null;
  const blocoIdentidade = identidadeConfirmada
    ? `IDENTIDADE: já confirmada nesta conversa${primeiroNome ? ` (${primeiroNome})` : ""}. NUNCA volte a perguntar quem é a pessoa; trate-a pelo primeiro nome.`
    : estadoId.perguntadaEm
      ? `IDENTIDADE: você JÁ perguntou a identidade nesta conversa e não houve confirmação clara. NÃO pergunte de novo — siga o atendimento normalmente. Só pergunte mais uma vez (a última) se for indispensável para a ação pedida (ex.: confirmar um agendamento existente dessa pessoa).`
      : `IDENTIDADE: ainda não perguntada. Você pode confirmar o nome UMA ÚNICA VEZ nesta conversa, e apenas se for necessário. Nunca abra a resposta com a confirmação: responda primeiro o que foi perguntado e, se ainda precisar, peça a confirmação no fim, em uma linha.`;

  // Encerrar a conversa zera a memória: só entram mensagens posteriores ao
  // encerramento (resolved_at/closed_at) da última conversa deste contato.
  const msgsMemoria = ((histR as any)?.data ?? []).filter((m: any) =>
    estadoId.memoriaDesde ? String(m.created_at ?? "") > String(estadoId.memoriaDesde) : true,
  );

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
  const jaSeApresentou = msgsMemoria.some((m: any) => m.direction === "out");
  const dadosPublicos = [
    `Nome oficial: ${nomeUnidade}`,
    enderecoUnidade ? `Endereço: ${enderecoUnidade}` : null,
    clinicaRow?.telefone ? `Telefone: ${clinicaRow.telefone}` : null,
    clinicaRow?.email ? `E-mail: ${clinicaRow.email}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const blocoClinica = `IDENTIDADE DA CLÍNICA — USE SEMPRE O NOME REAL:
${dadosPublicos}

- Você é a assistente virtual de "${nomeUnidade}". NUNCA fale como "a clínica" de forma genérica quando o nome está aqui, e NUNCA diga representar outra unidade.
- ${
    jaSeApresentou
      ? "Você JÁ se apresentou nesta conversa. NÃO repita a apresentação — vá direto ao ponto."
      : `Esta é a PRIMEIRA mensagem da conversa: comece se apresentando exatamente assim: "Oi! Aqui é a Nina, assistente virtual da ${nomeCurtoUnidade} 😊" e só depois responda o que foi perguntado.`
  }
- Se perguntarem "que clínica é essa?", "onde vocês ficam?", "é a ${nomeCurtoUnidade}?" ou pedirem contato/endereço, responda com o nome oficial e com o endereço/telefone acima (apenas os que existirem). Se algum desses dados não estiver acima, diga que confirma com a recepção — não invente.`;

  // Bloco de contexto do remetente + regras condicionais
  const contextoRemetente = pacienteInfo
    ? pacienteInfo.associado
      ? `IDENTIFICAÇÃO: Este paciente JÁ ESTÁ CADASTRADO como "${pacienteInfo.nome}" e é ASSOCIADO ao convênio "${pacienteInfo.convenio_nome ?? "Cartão Benefícios"}". Trate-o como ASSOCIADO — NÃO ofereça valores de particular. Cite o vínculo com naturalidade ("vi aqui que você é associado(a) do ${pacienteInfo.convenio_nome ?? "nosso convênio"}") e aplique as regras/valores do convênio quando falar de exames/consultas. NÃO peça dados de cadastro; ele já está na base.`
      : `IDENTIFICAÇÃO: Encontrei um cadastro compatível ("${pacienteInfo.nome}"), sem contrato de associado ativo. Confirme o nome com a pessoa antes de continuar e trate como paciente particular. Não peça dados que já constam no cadastro.`
    : baseImportada
      ? `IDENTIFICAÇÃO: Não localizei este contato/CPF/nome na base de ${nomeUnidade}. Trate como paciente novo. NÃO peça dados completos agora — pergunte primeiro se a pessoa deseja agendar/se cadastrar. Só peça dados (nome completo, CPF, nascimento, telefone) quando houver intenção CLARA de agendamento, cadastro ou atualização.`
      : `IDENTIFICAÇÃO: A base de pacientes da unidade "${nomeUnidade}" AINDA NÃO FOI IMPORTADA no sistema. Se a pessoa quiser confirmar cadastro, agendamento ou histórico, responda com educação: "Os dados desta unidade ainda não estão disponíveis no meu sistema — vou te encaminhar para uma atendente humana." NÃO peça CPF, nome completo ou dados cadastrais. Você pode responder normalmente sobre horários de médicos, preços de tabela e informações públicas.`;

  const systemPrompt = `Você é a Nina, assistente virtual da ${nomeUnidade}, respondendo a PACIENTES via WhatsApp. Responda em português do Brasil, de forma curta (no máximo 4 frases), direta, cordial e acolhedora com TODOS.

${blocoClinica}

${blocoDataHoraAgora()}

NUNCA mencione, cite ou inclua o CRM dos médicos nas respostas. Use apenas o nome do médico.

SUA FUNÇÃO COM PACIENTES é EXCLUSIVAMENTE:
- Informar livremente sobre TODOS os médicos da clínica: nome, especialidades, horários e dias de atendimento.
- Informar preços de tabela dos procedimentos/exames e o preparo quando houver.
- Orientar sobre agendamento (encaminhar para a recepção quando precisar confirmar/marcar).
- Ser cordial, simpática e prestativa em qualquer interação.

${contextoRemetente}

${blocoIdentidade}

REGRAS DE CONFIRMAÇÃO DE IDENTIDADE:
- A confirmação de identidade acontece NO MÁXIMO UMA VEZ por conversa. Se já perguntou, não repita.
- Se a pessoa já confirmou (disse "sim", "sou eu" ou o próprio nome), trate-a pelo primeiro nome e nunca mais pergunte.
- NUNCA abra uma resposta com a confirmação quando a pergunta for objetiva: responda primeiro o que foi perguntado; a confirmação, se ainda for necessária, vem depois, em uma linha.

REGRAS DE ESPECIALIDADE / EXAME:
- Quando o paciente citar uma especialidade ou procedimento, responda SOMENTE sobre ela — nunca devolva a lista geral de profissionais.
- Compare nomes sem diferenciar acento, maiúsculas ou singular/plural ("cardio", "cardiologia", "cardiologista" são a mesma coisa).
- Se não houver ninguém dessa especialidade no dia pedido, diga exatamente isso e ofereça o próximo dia com disponibilidade nela.
- Se a especialidade não existir no cadastro, diga que a clínica não atende e ofereça listar as que atende.
- No máximo 5 profissionais por resposta, com horários; se houver mais, diga quantos faltam e ofereça mostrar o restante.

${blocoFoco}

REGRA DE OURO — PEDIDO DE DADOS:
- Só solicite dados pessoais (nome completo, CPF, nascimento, telefone, endereço) quando a pessoa demonstrar intenção clara de agendar, se cadastrar ou atualizar cadastro.
- Nunca peça todos os dados de uma vez em uma conversa informativa.

REGRAS DE PRIVACIDADE — NÃO PODEM SER QUEBRADAS:
1. Trate quem escreve como pessoa externa. NUNCA confirme nem negue se ela ou outra pessoa é paciente da clínica.
2. NUNCA revele dados financeiros internos (caixa, faturamento, repasses, comissões, contas, boletos, inadimplência) — apenas valores de TABELA pública de exames/convênios.
3. NUNCA revele dados de pacientes (nomes, telefones, CPF, e-mail, endereço, prontuário, anamnese, diagnósticos, exames, agendamentos individuais, presença na clínica).
4. NUNCA fale sobre operação interna, equipe, conflitos, decisões administrativas ou qualquer assunto além de horários, preços, especialidades e agendamento.
5. Se perguntarem sobre cobrança, boleto, saldo, "quem está agendado", "o paciente X veio?" ou qualquer outro dado sigiloso, responda com educação que essa informação é sigilosa e peça para aguardar um atendente humano.
6. Você NÃO marca, cancela nem confirma agendamento diretamente (a não ser que uma regra abaixo autorize). Você PODE consultar a agenda real para informar horários disponíveis, e orienta a pessoa a concluir com a recepção.

Se a pergunta fugir do escopo (horários, preços, especialidades, agendamento) ou violar as regras acima, peça gentilmente para a pessoa aguardar um atendente. Não invente dados.

ESPECIALIDADES ATENDIDAS: ${espsCadastradas.join(", ") || "(nenhuma cadastrada)"}

MÉDICOS:
${medicos || "(nenhum)"}

PROCEDIMENTOS:
${procs || "(nenhum)"}`;

  // ---------------------------------------------------------------- agendar
  // Quando a flag está ligada nesta clínica, a Nina deixa de ser somente
  // leitura: ela consulta a agenda REAL e marca, usando o mesmo núcleo de
  // regras da recepção. Fora disso, nada muda (comportamento antigo intacto).
  const { ferramentasAgendaAtivas, blocoPromptAgenda, blocoPromptDisponibilidade } = await import(
    "@/lib/nina/agenda-flag.server"
  );
  const podeAgendar = await ferramentasAgendaAtivas(clinicaId);

  // Aprendizados APROVADOS pela equipe desta clínica, relevantes para a
  // mensagem atual. Nunca substituem dado vivo (preço/horário/agenda).
  const { recuperarAprendizados, blocoPromptAprendizados } = await import(
    "@/lib/nina/aprendizado.server"
  );
  const aprendizados = await recuperarAprendizados(clinicaId, "whatsapp", mensagemPaciente).catch(
    () => [],
  );
  const blocoAprendizado = blocoPromptAprendizados(aprendizados);

  // ------------------------------------------- estado estruturado do fluxo
  // Recarregado da própria conversa. É isto que faz o paciente já
  // identificado continuar identificado na mensagem seguinte.
  const {
    normalizarEstado,
    blocoPromptEstado,
    salvarFluxoEstado,
  } = await import("@/lib/nina/fluxo-estado.server");
  const fluxoEstado = normalizarEstado(estadoId.fluxoEstadoBruto);
  // Fallbacks de reidratação, em ordem de confiança: estado do fluxo →
  // paciente já vinculado à conversa → casamento pelo telefone do remetente.
  let pacienteIdEfetivo =
    fluxoEstado.patient.id ??
    estadoId.pacienteIdConversa ??
    (telefoneNorm && pacienteInfo?.id ? String(pacienteInfo.id) : null);
  let pacienteNomeEfetivo =
    telefoneNorm && pacienteInfo?.nome ? String(pacienteInfo.nome) : null;
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
  if (pacienteIdEfetivo && !fluxoEstado.patient.identified) {
    fluxoEstado.patient = {
      ...fluxoEstado.patient,
      id: pacienteIdEfetivo,
      first_name: pacienteNomeEfetivo ? pacienteNomeEfetivo.split(" ")[0]! : null,
      identified: true,
      validated: true,
    };

  }

  const systemPromptFinal = [
    systemPrompt,
    blocoPromptDisponibilidade(),
    await (async () => {
      const { blocoPromptBaseConhecimento } = await import("@/lib/nina/kb.server");
      return await blocoPromptBaseConhecimento(clinicaId).catch(() => "");
    })(),


    podeAgendar ? blocoPromptAgenda() : "",
    blocoAprendizado,
    blocoPromptEstado(fluxoEstado),
  ]
    .filter(Boolean)
    .join("\n\n");

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
  const {
    FERRAMENTA_HANDOFF,
    ehFerramentaHandoff,
    executarHandoffTool,
  } = await import("@/lib/nina/handoff-tool.server");
  ferramentas = [...(ferramentas ?? []), FERRAMENTA_HANDOFF];
  const ctxHandoff = { clinicaId, conversaId: estadoId.conversaId ?? null };
  const systemPromptComHandoff = `${systemPromptFinal}

ATENDIMENTO HUMANO — REGRA OBRIGATÓRIA:
- Você é o 1º nível. Resolva o que souber, com clareza e sem enrolar.
- Chame a ferramenta "solicitar_atendente_humano" quando: o paciente pedir uma pessoa/atendente/humano; houver reclamação, urgência clínica, cobrança, erro nosso ou conflito; ou você já tiver tentado duas vezes sem resolver.
- Ao chamar, mande um resumo útil do caso. Depois, avise em uma frase que a equipe assume daqui — não continue tentando resolver sozinha e não prometa prazo.`;


  type MsgIA = {
    role: string;
    content: string | null;
    tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
    tool_call_id?: string;
  };
  const mensagens: MsgIA[] = [
    { role: "system", content: systemPromptComHandoff },
    ...(historico as MsgIA[]),
    { role: "user", content: mensagemPaciente },
  ];

  let resposta = "";
  let houveHandoff = false;
  // Só vira `true` quando a ferramenta "agendar" devolve sucesso COM
  // appointment_id verificado no banco — ou quando a conversa JÁ tem um
  // agendamento gravado (senão a Nina não conseguiria nem falar sobre a
  // consulta já marcada nos turnos seguintes).
  let agendamentoConfirmado = Boolean(fluxoEstado.appointment.appointment_id);
  let correcaoFalsoSucessoUsada = false;
  // Frases que afirmam/prometem agendamento. Se aparecerem sem gravação
  // confirmada, a resposta é falso sucesso e não pode ir ao paciente.
  const AFIRMA_AGENDAMENTO =
    /(estou|vou|irei)\s+agend|agendando|agendei|agendada|agendado|marcada|marquei|reserv(ei|ada)|confirmad[oa]\s+(seu|sua)\s+(consulta|agendamento|hor[áa]rio)/i;
  const MAX_RODADAS = podeAgendar ? 6 : 3;
  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        ...(ferramentas ? { tools: ferramentas } : {}),
        messages: mensagens,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Nina WhatsApp AI error", res.status, body);
      throw new Error(`Falha IA (${res.status})`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; tool_calls?: MsgIA["tool_calls"] } }>;
    };
    const msg = json.choices?.[0]?.message;
    const chamadas = msg?.tool_calls ?? [];

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
      resposta = texto;
      break;
    }


    mensagens.push({ role: "assistant", content: msg?.content ?? null, tool_calls: chamadas });
    for (const c of chamadas) {
      const nome = String(c.function?.name ?? "");
      let resultado: unknown;
      try {
        if (ehFerramentaHandoff(nome)) {
          resultado = await executarHandoffTool(ctxHandoff, c.function?.arguments);
          houveHandoff = true;
        } else if (executar && ctxFerramentas) {
          resultado = await executar(ctxFerramentas, nome, c.function?.arguments);
        } else {
          resultado = { ok: false, erro: "FERRAMENTA_INDISPONIVEL" };
        }
      } catch (e) {
        console.error("[Nina] ferramenta falhou", nome, e);
        resultado = { ok: false, erro: "INTERNAL_ERROR", mensagem: "Falha ao consultar o sistema." };
      }
      // Fonte única da verdade sobre "agendou de fato": appointment_id
      // devolvido pela ferramenta depois da verificação no banco.
      if (nome === "agendar") {
        const r = resultado as { ok?: boolean; appointment_id?: string; duplicado?: boolean };
        if (r?.ok && (r.appointment_id || r.duplicado)) agendamentoConfirmado = true;
        console.info("[NINA_APPOINTMENT]", {
          conversation_id: estadoId.conversaId,
          create_appointment_called: true,
          appointment_id: r?.appointment_id ?? null,
          final_result: r?.ok ? "SUCCESS" : "FAILED",
          error_code: r?.ok ? null : (resultado as { erro?: string })?.erro ?? null,
        });
      }
      mensagens.push({
        role: "tool",
        tool_call_id: c.id,
        content: JSON.stringify(resultado).slice(0, 8000),
      });

    }
  }

  // Persiste o estado estruturado: o que as ferramentas descobriram nesta
  // rodada (paciente identificado, horário oferecido, agendamento criado)
  // vale para as próximas mensagens da MESMA conversa.
  await salvarFluxoEstado(supabaseAdmin as never, clinicaId, estadoId.conversaId, fluxoEstado);


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
