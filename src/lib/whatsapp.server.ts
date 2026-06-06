import { supabaseAdmin } from "@/integrations/supabase/client.server";

const META_VERSION = "v22.0";

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
  if (!res.ok) throw new Error((json as any)?.error?.error_user_msg ?? (json as any)?.error?.message ?? `HTTP ${res.status}`);
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

export async function metaSendText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
): Promise<{ wa_message_id: string | null }> {
  const res = await fetch(
    `https://graph.facebook.com/${META_VERSION}/${phoneNumberId}/messages`,
    {
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
    },
  );
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
    throw new Error(`WhatsApp: ${msg}`);
  }
  const wa_message_id = (json as any)?.messages?.[0]?.id ?? null;
  return { wa_message_id };
}

/**
 * Decide se estamos DENTRO do horário de atendimento humano.
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
export async function gerarRespostaNina(clinicaId: string, mensagemPaciente: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const [medR, dispR, procR] = await Promise.all([
    supabaseAdmin
      .from("medicos")
      .select("id, nome")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true),
    supabaseAdmin
      .from("medico_disponibilidades")
      .select("medico_id, dia_semana, hora_inicio, hora_fim, observacoes")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true),
    supabaseAdmin
      .from("procedimentos")
      .select("nome, grupo, valor_dinheiro_pix, valor_cartao, preparo")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true),
  ]);

  const medicos = (medR.data ?? [])
    .map((m: any) => {
      const horarios = (dispR.data ?? [])
        .filter((d: any) => d.medico_id === m.id)
        .map((d: any) => `${DIAS[d.dia_semana] ?? "?"} ${d.hora_inicio?.slice(0, 5)}-${d.hora_fim?.slice(0, 5)}`)
        .join(", ");
      return `- ${m.nome}${horarios ? ` | ${horarios}` : ""}`;
    })
    .join("\n");

  const procs = (procR.data ?? [])
    .map(
      (p: any) =>
        `- ${p.nome}${p.grupo ? ` [${p.grupo}]` : ""}: PIX R$ ${Number(p.valor_dinheiro_pix).toFixed(2)} / cartão R$ ${Number(p.valor_cartao).toFixed(2)}${p.preparo ? ` | PREPARO: ${String(p.preparo).replace(/\s+/g, " ").trim()}` : ""}`,
    )
    .join("\n");

  const systemPrompt = `Você é a Nina, assistente virtual da clínica respondendo a PACIENTES via WhatsApp. Responda em português do Brasil, de forma curta (no máximo 4 frases), direta, cordial e acolhedora com TODOS.

NUNCA mencione, cite ou inclua o CRM dos médicos nas respostas. Use apenas o nome do médico.

SUA FUNÇÃO COM PACIENTES é EXCLUSIVAMENTE:
- Informar livremente sobre TODOS os médicos da clínica: nome, especialidades, horários e dias de atendimento.
- Informar preços de tabela dos procedimentos/exames e o preparo quando houver.
- Orientar sobre agendamento (encaminhar para a recepção quando precisar confirmar/marcar).
- Ser cordial, simpática e prestativa em qualquer interação.

REGRAS DE PRIVACIDADE — NÃO PODEM SER QUEBRADAS:
1. Trate quem escreve como pessoa externa. NUNCA confirme nem negue se ela ou outra pessoa é paciente da clínica.
2. NUNCA revele dados financeiros internos (caixa, faturamento, repasses, comissões, contas, boletos, inadimplência) — apenas valores de TABELA pública de exames/convênios.
3. NUNCA revele dados de pacientes (nomes, telefones, CPF, e-mail, endereço, prontuário, anamnese, diagnósticos, exames, agendamentos individuais, presença na clínica).
4. NUNCA fale sobre operação interna, equipe, conflitos, decisões administrativas ou qualquer assunto além de horários, preços, especialidades e agendamento.
5. Se perguntarem sobre cobrança, boleto, saldo, "quem está agendado", "o paciente X veio?" ou qualquer outro dado sigiloso, responda com educação que essa informação é sigilosa e peça para aguardar um atendente humano.
6. Você é SOMENTE LEITURA — não agenda, não cancela, não confirma nada diretamente. Oriente a pessoa a aguardar a recepção para concluir o agendamento.

Se a pergunta fugir do escopo (horários, preços, especialidades, agendamento) ou violar as regras acima, peça gentilmente para a pessoa aguardar um atendente. Não invente dados.

MÉDICOS:
${medicos || "(nenhum)"}

PROCEDIMENTOS:
${procs || "(nenhum)"}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: mensagemPaciente },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Nina WhatsApp AI error", res.status, body);
    throw new Error(`Falha IA (${res.status})`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}