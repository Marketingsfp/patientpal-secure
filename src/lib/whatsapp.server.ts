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

export async function gerarRespostaNina(
  clinicaId: string,
  mensagemPaciente: string,
  telefoneRemetente?: string | null,
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const [medR, dispR, procR, cliR, pacienteInfo] = await Promise.all([
    supabaseAdmin.from("medicos").select("id, nome").eq("clinica_id", clinicaId).eq("ativo", true),
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
    supabaseAdmin.from("clinicas").select("nome, base_importada").eq("id", clinicaId).maybeSingle(),
    identificarPaciente(
      clinicaId,
      mensagemPaciente,
      normalizarTelefoneRemetente(telefoneRemetente ?? null),
    ),
  ]);

  const baseImportada = (cliR.data as any)?.base_importada === true;
  const nomeUnidade = (cliR.data as any)?.nome ?? "esta unidade";

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

  const medicos = (medR.data ?? [])
    .map((m: any) => {
      const disps = (dispR.data ?? []).filter((d: any) => d.medico_id === m.id);
      const temMultiplas = (agendasPorMedico.get(m.id) ?? 0) > 1;

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
        return `- ${m.nome}${horarios ? ` | ${horarios}` : ""}`;
      }

      // Mostra separado por agenda
      const blocos: string[] = [];
      for (const [ag, porDia] of porAgenda.entries()) {
        const nome = agendaNome.get(ag) ?? "Agenda";
        const horarios = formatPorDia(porDia);
        if (horarios) blocos.push(`    • ${nome}: ${horarios}`);
      }
      return `- ${m.nome}${blocos.length ? `\n${blocos.join("\n")}` : ""}`;
    })
    .join("\n");

  const procs = (procR.data ?? [])
    .map(
      (p: any) =>
        `- ${p.nome}${p.grupo ? ` [${p.grupo}]` : ""}: PIX R$ ${Number(p.valor_dinheiro_pix).toFixed(2)} / cartão R$ ${Number(p.valor_cartao).toFixed(2)}${p.preparo ? ` | PREPARO: ${String(p.preparo).replace(/\s+/g, " ").trim()}` : ""}`,
    )
    .join("\n");

  // Bloco de contexto do remetente + regras condicionais
  const contextoRemetente = pacienteInfo
    ? pacienteInfo.associado
      ? `IDENTIFICAÇÃO: Este paciente JÁ ESTÁ CADASTRADO como "${pacienteInfo.nome}" e é ASSOCIADO ao convênio "${pacienteInfo.convenio_nome ?? "Cartão Benefícios"}". Trate-o como ASSOCIADO — NÃO ofereça valores de particular. Cite o vínculo com naturalidade ("vi aqui que você é associado(a) do ${pacienteInfo.convenio_nome ?? "nosso convênio"}") e aplique as regras/valores do convênio quando falar de exames/consultas. NÃO peça dados de cadastro; ele já está na base.`
      : `IDENTIFICAÇÃO: Encontrei um cadastro compatível ("${pacienteInfo.nome}"), sem contrato de associado ativo. Confirme o nome com a pessoa antes de continuar e trate como paciente particular. Não peça dados que já constam no cadastro.`
    : baseImportada
      ? `IDENTIFICAÇÃO: Não localizei este contato/CPF/nome na base de ${nomeUnidade}. Trate como paciente novo. NÃO peça dados completos agora — pergunte primeiro se a pessoa deseja agendar/se cadastrar. Só peça dados (nome completo, CPF, nascimento, telefone) quando houver intenção CLARA de agendamento, cadastro ou atualização.`
      : `IDENTIFICAÇÃO: A base de pacientes da unidade "${nomeUnidade}" AINDA NÃO FOI IMPORTADA no sistema. Se a pessoa quiser confirmar cadastro, agendamento ou histórico, responda com educação: "Os dados desta unidade ainda não estão disponíveis no meu sistema — vou te encaminhar para uma atendente humana." NÃO peça CPF, nome completo ou dados cadastrais. Você pode responder normalmente sobre horários de médicos, preços de tabela e informações públicas.`;

  const systemPrompt = `Você é a Nina, assistente virtual da clínica respondendo a PACIENTES via WhatsApp. Responda em português do Brasil, de forma curta (no máximo 4 frases), direta, cordial e acolhedora com TODOS.

NUNCA mencione, cite ou inclua o CRM dos médicos nas respostas. Use apenas o nome do médico.

SUA FUNÇÃO COM PACIENTES é EXCLUSIVAMENTE:
- Informar livremente sobre TODOS os médicos da clínica: nome, especialidades, horários e dias de atendimento.
- Informar preços de tabela dos procedimentos/exames e o preparo quando houver.
- Orientar sobre agendamento (encaminhar para a recepção quando precisar confirmar/marcar).
- Ser cordial, simpática e prestativa em qualquer interação.

${contextoRemetente}

REGRA DE OURO — PEDIDO DE DADOS:
- Só solicite dados pessoais (nome completo, CPF, nascimento, telefone, endereço) quando a pessoa demonstrar intenção clara de agendar, se cadastrar ou atualizar cadastro.
- Nunca peça todos os dados de uma vez em uma conversa informativa.

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
