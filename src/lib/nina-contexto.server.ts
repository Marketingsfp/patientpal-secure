/**
 * Contexto da clínica usado pela Nina (IA interna).
 *
 * Fica separado dos server functions para poder ser usado também pela rota de
 * streaming (`/api/nina-fala`). Guarda o texto pronto em memória por alguns
 * segundos: montar o contexto exige ~8 consultas ao banco, e repetir isso a
 * cada pergunta atrasava o início da fala da Nina.
 */

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Validade do contexto em cache (ms). */
const TTL = 60_000;
const cache = new Map<string, { texto: string; em: number }>();

export async function assertMembership(supabase: any, userId: string, clinicaId: string) {
  const { data, error } = await supabase
    .from("clinica_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("clinica_id", clinicaId)
    .eq("ativo", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem acesso a esta clínica");
}

function montarContextoTexto(ctx: {
  medicos: Array<{
    nome: string;
    especialidades?: string[];
    horarios: Array<{ dia: string; inicio: string; fim: string; obs: string | null }>;
  }>;
  procedimentos: Array<{
    nome: string;
    valor_dinheiro_pix: number;
    valor_cartao: number;
    grupo: string | null;
    preparo?: string | null;
  }>;
  especialidades?: string[];
  convenios?: Array<{
    nome: string;
    modalidade: string;
    valor_mensal: number;
    max_dependentes: number;
    descricao: string | null;
  }>;
  clinica?: {
    nome: string;
    endereco: string | null;
    cidade: string | null;
    estado: string | null;
    telefone: string | null;
    email: string | null;
  } | null;
  agendaResumo?: Array<{ medico: string; total: number; livres: number; ocupados: number }>;
}) {
  const meds = ctx.medicos
    .map((m) => {
      const horarios =
        m.horarios.length > 0
          ? m.horarios.map((h) => `${h.dia} ${h.inicio}-${h.fim}`).join("; ")
          : "(sem horários cadastrados)";
      const esps = (m.especialidades ?? []).filter(Boolean).join(", ");
      return `- ${m.nome}${esps ? ` (${esps})` : ""}: ${horarios}`;
    })
    .join("\n");

  const procs = ctx.procedimentos
    .map(
      (p) =>
        `- ${p.nome}${p.grupo ? ` [${p.grupo}]` : ""}: dinheiro/PIX R$ ${Number(p.valor_dinheiro_pix).toFixed(2)} / cartão R$ ${Number(p.valor_cartao).toFixed(2)}${p.preparo ? ` | PREPARO: ${p.preparo.replace(/\s+/g, " ").trim()}` : ""}`,
    )
    .join("\n");

  const espText = (ctx.especialidades ?? []).join(", ") || "(nenhuma)";
  const convText =
    (ctx.convenios ?? [])
      .map(
        (c) =>
          `- ${c.nome} [${c.modalidade}] — mensalidade base R$ ${Number(c.valor_mensal).toFixed(2)} / até ${c.max_dependentes} dependentes${c.descricao ? ` | ${c.descricao.replace(/\s+/g, " ").trim().slice(0, 240)}` : ""}`,
      )
      .join("\n") || "(nenhum)";
  const clinicaText = ctx.clinica
    ? `Nome: ${ctx.clinica.nome}\nEndereço: ${[ctx.clinica.endereco, ctx.clinica.cidade, ctx.clinica.estado].filter(Boolean).join(", ") || "(não informado)"}\nTelefone: ${ctx.clinica.telefone || "(não informado)"}\nE-mail: ${ctx.clinica.email || "(não informado)"}`
    : "(não informado)";
  const agendaText =
    (ctx.agendaResumo ?? [])
      .map(
        (a) => `- ${a.medico}: ${a.ocupados} ocupado(s), ${a.livres} livre(s) (total ${a.total})`,
      )
      .join("\n") || "(sem dados do dia)";

  return [
    `CLÍNICA:\n${clinicaText}`,
    `ESPECIALIDADES ATENDIDAS:\n${espText}`,
    `MÉDICOS E HORÁRIOS:\n${meds || "(nenhum)"}`,
    `PROCEDIMENTOS E VALORES:\n${procs || "(nenhum)"}`,
    `CONVÊNIOS / CARTÃO BENEFÍCIO:\n${convText}`,
    `AGENDA DE HOJE (resumo anonimizado, sem nomes de pacientes):\n${agendaText}`,
  ].join("\n\n");
}

/** Contexto textual da clínica, com cache curto em memória. */
export async function contextoClinicaTexto(
  supabase: any,
  clinicaId: string,
  janela: { inicio: string; fimExclusivo: string },
): Promise<string> {
  const emCache = cache.get(clinicaId);
  if (emCache && Date.now() - emCache.em < TTL) return emCache.texto;

  const carregarProcedimentos = async () => {
    const pageSize = 1000;
    const rows: any[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabase
        .from("procedimentos")
        .select("nome, grupo, valor_dinheiro_pix, valor_cartao, preparo")
        .eq("clinica_id", clinicaId)
        .eq("ativo", true)
        .order("nome")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      rows.push(...(page ?? []));
      if (!page || page.length < pageSize) break;
    }
    return rows;
  };

  const [medR, dispR, procedimentosRows, espR, planR, cliR, agR, meR] = await Promise.all([
    supabase
      .from("medicos")
      .select("id, nome, crm, crm_uf")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true),
    supabase
      .from("medico_disponibilidades")
      .select("medico_id, dia_semana, hora_inicio, hora_fim, observacoes")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true),
    carregarProcedimentos(),
    supabase.from("especialidades").select("id, nome").eq("ativo", true),
    supabase
      .from("cb_convenios")
      .select("nome, modalidade, valor_mensal, max_dependentes, descricao")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true),
    supabase
      .from("clinicas")
      .select("nome, endereco, cidade, estado, telefone, email")
      .eq("id", clinicaId)
      .maybeSingle(),
    supabase
      .from("agendamentos")
      .select("medico_id, status")
      .eq("clinica_id", clinicaId)
      .gte("inicio", janela.inicio)
      .lt("inicio", janela.fimExclusivo),
    supabase.from("medico_especialidades").select("medico_id, especialidade_id"),
  ]);

  const espMap = new Map<string, string>();
  for (const e of espR.data ?? []) espMap.set(e.id, e.nome);

  const medEsp = new Map<string, string[]>();
  for (const r of meR.data ?? []) {
    const nome = espMap.get(r.especialidade_id);
    if (!nome) continue;
    const arr = medEsp.get(r.medico_id) ?? [];
    arr.push(nome);
    medEsp.set(r.medico_id, arr);
  }

  const medicos = (medR.data ?? []).map((m: any) => ({
    nome: m.nome,
    especialidades: medEsp.get(m.id) ?? [],
    horarios: (dispR.data ?? [])
      .filter((d: any) => d.medico_id === m.id)
      .map((d: any) => ({
        dia: DIAS[d.dia_semana] ?? "?",
        inicio: d.hora_inicio?.slice(0, 5),
        fim: d.hora_fim?.slice(0, 5),
        obs: d.observacoes,
      })),
  }));

  const nomeMedico = new Map<string, string>();
  for (const m of medR.data ?? []) nomeMedico.set(m.id, m.nome);
  const agendaAgg = new Map<string, { total: number; livres: number; ocupados: number }>();
  for (const a of agR.data ?? []) {
    const nome = a.medico_id ? (nomeMedico.get(a.medico_id) ?? "Sem médico") : "Sem médico";
    const cur = agendaAgg.get(nome) ?? { total: 0, livres: 0, ocupados: 0 };
    cur.total += 1;
    if (a.status === "cancelado" || a.status === "faltou") cur.livres += 1;
    else cur.ocupados += 1;
    agendaAgg.set(nome, cur);
  }
  const agendaResumo = Array.from(agendaAgg.entries()).map(([medico, v]) => ({ medico, ...v }));

  const texto = montarContextoTexto({
    medicos,
    procedimentos: procedimentosRows as any,
    especialidades: (espR.data ?? []).map((e: any) => e.nome),
    convenios: (planR.data ?? []) as any,
    clinica: (cliR.data ?? null) as any,
    agendaResumo,
  });
  cache.set(clinicaId, { texto, em: Date.now() });
  return texto;
}

/** Instruções da Nina + base de dados da clínica. */
export function systemPromptNina(contextoTexto: string, modoVoz?: boolean) {
  const base = `Você é a Nina, assistente virtual interna da clínica, falando com a EQUIPE autenticada (gestão/recepção/médicos). Responda SEMPRE em português do Brasil, de forma curta, direta e amigável.

CONTEXTO DE USO:
- Este canal é o painel interno do sistema. Quem pergunta é um colaborador autenticado da clínica.
- Você TEM acesso aos dados operacionais da clínica (médicos, especialidades, horários, procedimentos, valores, convênios, agenda do dia) e pode responder livremente sobre eles para a equipe.
- Quando solicitado, pode informar resumos da agenda, valores de procedimentos, horários de médicos, convênios e dados gerais da clínica.

FERRAMENTAS (LIBERDADE TOTAL DENTRO DAS PERMISSÕES DO USUÁRIO):
- Você pode CONSULTAR qualquer tabela do sistema com "consultar_dados" e "contar_registros" (pacientes, agendamentos, orçamentos, financeiro, caixa, estoque, contratos, prontuários, RH...).
- Você pode EXECUTAR ações: "criar_agendamento", "reagendar_agendamento", "alterar_status_agendamento", "criar_registro" e "atualizar_registro".
- Toda ferramenta roda com as permissões do próprio colaborador logado; se der erro de permissão, explique com clareza em vez de tentar outro caminho.
- A base abaixo é um resumo já carregado; para qualquer número, nome ou detalhe que não esteja nela, USE as ferramentas em vez de supor.

REGRAS:
1. Antes de qualquer ação que grave, altere ou cancele algo, CONFIRME com o colaborador em uma frase o que você vai fazer — só execute depois do "sim". Se a mensagem já for uma ordem explícita e completa ("cancele o agendamento X"), execute direto e relate.
2. Nunca invente dados: consulte. Ao relatar uma ação feita, informe o que mudou (id, paciente, horário).
3. Quando o exame tiver PREPARO cadastrado, SEMPRE inclua o preparo na resposta.
4. Este canal é INTERNO. NÃO repasse este conteúdo bruto para pacientes — para pacientes, a Nina do WhatsApp tem regras próprias mais restritas.
5. ENTENDIMENTO DA FALA: a mensagem pode vir de reconhecimento de voz e conter palavras trocadas ("nine" = Nina, "sabadim" = sabadinho, "rex" = RX, "pics" = PIX, nomes de médicos e pacientes escritos errado). Interprete pelo som e pelo contexto da clínica, e ao buscar nomes use correspondência parcial (ilike/parte do nome) em vez de nome exato. Se a intenção ficar ambígua, pergunte apenas o dado que falta, em uma frase curta — nunca invente.



=== BASE DE DADOS DA CLÍNICA ===
${contextoTexto}
=== FIM DA BASE ===`;

  const voz = modoVoz
    ? `\n\n=== MODO CONVERSA POR VOZ ===\nA resposta será lida em voz alta. Comece a responder imediatamente pela informação principal, em no máximo 2 frases curtas, em texto corrido, sem listas, sem tabelas, sem markdown e sem repetir a pergunta.`
    : "";
  return base + voz;
}
