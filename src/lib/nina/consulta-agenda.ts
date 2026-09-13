/** Autorização da consulta de vagas. Só usa mensagens entregues e estado do servidor. */
export type ContextoConsultaAgenda = {
  mensagemAtual: string;
  historico: Array<{ role: string; content: string | null }>;
  medicoEscolhido?: { id: string | null; nome: string | null } | null;
  /** Existe oferta de vaga retornada pela agenda nesta sessão, não mera escala. */
  disponibilidadeJaConsultada?: boolean;
};

export const FERRAMENTAS_DE_VAGAS = new Set([
  "consultar_disponibilidade",
  "verificar_horario",
  "proxima_vaga",
]);

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\*/g, "")
    .replace(/\b(dra?|doutor|doutora)\./g, "$1")
    .trim();
const ASSUNTO_AGENDA =
  /\b(vagas?|disponibilidade|disponiveis|disponivel|agenda|horarios? livres?)\b/;
const ASSUNTO_VAGAS = /\b(vagas?|disponibilidade|disponiveis|disponivel|horarios? livres?)\b/;
const PEDIDO_AGENDA =
  /\b(quero|queria|gostaria|preciso|pode|podem|poderia|posso|vamos)\b[^.!?\n]{0,35}\b(agendar|marcar|remarcar|ver|verificar|consultar|buscar|checar|olhar)\b/;
const RECUSA =
  /\b(nao|nem)\s+(quero|preciso|desejo|pode|consulte|verifique|busque|agende|marque)\b|\b(so|somente|apenas)\s+(quero\s+)?(informacoes gerais|os horarios de atendimento|a escala)\b|\b(agora nao|ainda nao|nao obrigado|nao obrigada|deixa pra depois)\b/;
const ACEITE =
  /^(sim|s|isso|ok|okay|claro|pode|pode sim|pode ser|quero|quero sim|por favor|pode verificar|pode consultar|pode olhar|pode ver)(\b|[!.,])/;
const COMPLEMENTO =
  /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|manha|tarde|noite|amanha|hoje|proxima|proximo|qualquer|prefiro|com o|com a|doutor|doutora|dr|dra)\b|\d{1,2}[:/]\d{2}/;
const OUTRA_PERGUNTA =
  /\b(valor|valores|preco|precos|custa|endereco|documentos?|preparo|jejum|convenio|pagamento|escala|horarios? habituais?|horarios? de atendimento)\b/;

function continuaBuscaDeVagas(ctx: ContextoConsultaAgenda, atual: string): boolean {
  return (
    ctx.disponibilidadeJaConsultada === true &&
    !!ctx.medicoEscolhido?.id &&
    /^(?:e\s+)?(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|de manha|a tarde|de tarde|a noite|mais cedo|mais tarde|na proxima semana|\d{1,2}\/\d{1,2})(?:-feira)?[?!.,\s]*$/.test(
      atual,
    )
  );
}

function pedidoDireto(atual: string): boolean {
  if (PEDIDO_AGENDA.test(atual) && /\b(agendar|marcar|remarcar)\b/.test(atual)) return true;
  if (/^(agendar|marcar|remarcar|agende|marque)\b/.test(atual)) return true;
  if (
    ASSUNTO_VAGAS.test(atual) &&
    /\b(tem|ha|existem?|quais|qual|quando|quero|queria|gostaria|preciso|veja|verifique|consulte|busque|cheque|olhe)\b/.test(
      atual,
    )
  )
    return true;
  return (
    ASSUNTO_AGENDA.test(atual) &&
    (PEDIDO_AGENDA.test(atual) || /\b(veja|verifique|consulte|busque|cheque|olhe)\b/.test(atual))
  );
}

function respostaDeEscolha(atual: string): boolean {
  return (
    !atual.includes("?") &&
    !OUTRA_PERGUNTA.test(atual) &&
    !/\b(atendem?|funciona|como|onde|quanto|quais?|que dias?|que horarios?)\b/.test(atual) &&
    !/\b(nao|sei|talvez|depois|obrigad[oa]|entendi|tchau|ola|oi)\b/.test(atual) &&
    atual.split(/\s+/).length <= 8
  );
}

/** "Sim, mas qual o preço?" não é um aceite para iniciar outra consulta. */
function aceiteSemNovaEscolha(atual: string): boolean {
  if (
    !ACEITE.test(atual) ||
    OUTRA_PERGUNTA.test(atual) ||
    /\b(nao|nem|sei|talvez|depois|obrigad[oa]|entendi|tchau)\b/.test(atual)
  )
    return false;
  // O aceite pode vir acompanhado de uma preferência longa de data/período.
  // Removemos só esse vocabulário; nome novo, recusa ou outro assunto sobra
  // no texto e exige que a escolha seja tratada separadamente.
  const resto = atual.replace(
    /\b(sim|s|isso|ok|okay|claro|pode|ser|quero|por|favor|verificar|consultar|olhar|ver|vamos|a|o|as|os|de|da|do|no|na|nas|nos|para|pra|em|pela|pelo|segunda|terca|quarta|quinta|sexta|sabado|domingo|manha|tarde|noite|amanha|hoje|proxima|proximo|qualquer|dia|feira|se|tiver|houver|algum|alguma|horario|horarios|livre|livres|disponivel|disponiveis|parte|periodo|preferencia|preferencialmente|possivel|mais|cedo|e)\b/g,
    "",
  );
  return !/[a-z]/.test(resto);
}

function ultimaResposta(ctx: ContextoConsultaAgenda): string {
  return normalizar(ctx.historico.filter((m) => m.role === "assistant").at(-1)?.content ?? "");
}

/** Só a pergunta final é oferta; um médico na lista informativa não é uma seleção. */
function perguntaFinal(texto: string): string {
  const fim = texto.lastIndexOf("?");
  if (fim < 0 || /[a-z0-9]/.test(texto.slice(fim + 1))) return "";
  const perguntas = texto.slice(0, fim + 1).match(/[^.!?\n]+\?/g) ?? [];
  return perguntas.at(-1) ?? "";
}

function ofertaAgenda(ctx: ContextoConsultaAgenda): string {
  const p = perguntaFinal(ultimaResposta(ctx));
  return ASSUNTO_AGENDA.test(p) &&
    /\b(ver|verific|consult|checar|olhar|buscar|prefere|qual|quer|gostaria|posso|podemos)/.test(p)
    ? p
    : "";
}

/** Interesse em consultar é diferente de confirmação para gravar um agendamento. */
export function interesseEmConsultarAgenda(ctx?: ContextoConsultaAgenda | null): boolean {
  if (!ctx) return false;
  const atual = normalizar(ctx.mensagemAtual);
  if (!atual || RECUSA.test(atual) || /^(nao|n)(\b|[!.])/.test(atual)) return false;
  if (pedidoDireto(atual)) return true;
  if (continuaBuscaDeVagas(ctx, atual)) return true;
  if (ofertaAgenda(ctx) && (respostaDeEscolha(atual) || aceiteSemNovaEscolha(atual))) return true;
  // Escolha do médico/data após pedido explícito de vagas, dentro da mesma troca.
  const anterior = ctx.historico.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const pergunta = perguntaFinal(ultimaResposta(ctx));
  return (
    pedidoDireto(normalizar(anterior)) &&
    !RECUSA.test(normalizar(anterior)) &&
    /\b(qual|que|prefere|medico|profissional|dia|data|periodo)\b/.test(pergunta) &&
    respostaDeEscolha(atual)
  );
}

function mencionaMedico(nome: string, texto: string): boolean {
  const termos = normalizar(nome)
    .replace(/^(dra?|doutor|doutora)\.?\s+/, "")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["dos", "das"].includes(t));
  if (!termos.length) return false;
  const t = normalizar(texto);
  const citacao = t.match(new RegExp(`\\b${termos[0]}\\b([^.!?\\n]*)`));
  if (!citacao) return false;
  const sobrenomes = (citacao[1] ?? "")
    .split(
      /\b(?:na|no|nas|nos|para|pra|com|por|tem|atende|atendem|possui|amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|e|ou)\b/,
    )[0]!
    .split(/[^a-z]+/)
    .filter((p) => p.length > 2 && !["dos", "das"].includes(p));
  // Sobrenome explícito contraditório não pode cair no atalho de "Dr. Alex".
  if (sobrenomes.length) return sobrenomes.every((p) => termos.includes(p));
  return (
    termos.length === 1 ||
    new RegExp(`\\b(?:dra?|doutor|doutora)\\s+${termos[0]}\\b`).test(t) ||
    t === termos[0] ||
    new RegExp(`^(?:com|prefiro)\\s+(?:(?:o|a)\\s+)?${termos[0]}[!.\\s]*$`).test(t)
  );
}

export type DecisaoConsultaAgenda = {
  permitido: boolean;
  motivo:
    | "INTERESSE_NAO_CONFIRMADO"
    | "MEDICO_NAO_DEFINIDO"
    | "MEDICO_DIVERGENTE"
    | "CONSULTA_SOLICITADA";
};

export function autorizarConsultaAgenda(
  ctx: ContextoConsultaAgenda | null | undefined,
  medico: { id: string; nome: string } | null,
  candidatosOficiais?: ReadonlyArray<{ id: string; nome: string }>,
): DecisaoConsultaAgenda {
  if (candidatosOficiais) {
    const decisao = autorizarConsultaAgenda(ctx, medico);
    if (!decisao.permitido) return decisao;
    const compativeis = candidatosOficiais.filter((c) => autorizarConsultaAgenda(ctx, c).permitido);
    return compativeis.length === 1 && compativeis[0]?.id === medico?.id
      ? decisao
      : { permitido: false, motivo: "MEDICO_NAO_DEFINIDO" };
  }
  if (!interesseEmConsultarAgenda(ctx))
    return { permitido: false, motivo: "INTERESSE_NAO_CONFIRMADO" };
  // O executor precisa resolver o UUID no cadastro oficial ANTES deste passo.
  if (
    !ctx ||
    !medico ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(medico.id) ||
    !medico.nome.trim()
  )
    return { permitido: false, motivo: "MEDICO_NAO_DEFINIDO" };
  const atual = normalizar(ctx.mensagemAtual);
  const oferta = ofertaAgenda(ctx);
  if (continuaBuscaDeVagas(ctx, atual) && ctx.medicoEscolhido?.id === medico.id)
    return { permitido: true, motivo: "CONSULTA_SOLICITADA" };
  if (mencionaMedico(medico.nome, atual)) return { permitido: true, motivo: "CONSULTA_SOLICITADA" };
  const outroMedicoExplicito = /\b(dra?|doutor|doutora)\.?\s+[a-z]+/.test(atual);
  if (
    !outroMedicoExplicito &&
    aceiteSemNovaEscolha(atual) &&
    oferta &&
    (mencionaMedico(medico.nome, oferta) ||
      (ctx.medicoEscolhido?.id === medico.id &&
        /\b(dele|dela|com ele|com ela|desse medico|dessa medica|desse profissional|dessa profissional)\b/.test(
          oferta,
        ) &&
        !/\b(dra?|doutor|doutora)\s+[a-z]+/.test(oferta))) &&
    !/\bou\b/.test(oferta)
  )
    return { permitido: true, motivo: "CONSULTA_SOLICITADA" };
  const anterior = ctx.historico.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const pergunta = perguntaFinal(ultimaResposta(ctx));
  if (
    !outroMedicoExplicito &&
    COMPLEMENTO.test(atual) &&
    respostaDeEscolha(atual) &&
    /\b(dia|data|periodo|horario)\b/.test(pergunta) &&
    pedidoDireto(normalizar(anterior)) &&
    !RECUSA.test(normalizar(anterior)) &&
    mencionaMedico(medico.nome, anterior)
  )
    return { permitido: true, motivo: "CONSULTA_SOLICITADA" };
  const referenciaNomeada = atual.match(/\b(?:com|do|da)\s+(?:(?:o|a)\s+)?([^.!?\n]+)/)?.[1] ?? "";
  const outraReferencia =
    referenciaNomeada &&
    !/^(ele|ela|esse|essa|este|esta|mesmo|mesma)\b/.test(referenciaNomeada) &&
    !mencionaMedico(medico.nome, referenciaNomeada);
  if (
    !outroMedicoExplicito &&
    ctx.medicoEscolhido?.id === medico.id &&
    !outraReferencia &&
    (pedidoDireto(atual) || (COMPLEMENTO.test(atual) && respostaDeEscolha(atual)))
  )
    return { permitido: true, motivo: "CONSULTA_SOLICITADA" };
  return { permitido: false, motivo: "MEDICO_DIVERGENTE" };
}

/** Recusa esperada do fluxo: não equivale a agenda vazia ou a uma consulta com erro. */
export function consultaAgendaPendente(motivo: DecisaoConsultaAgenda["motivo"]) {
  return {
    ok: false as const,
    erro: "ACTION_NOT_AUTHORIZED" as const,
    consulta_realizada: false,
    aguardando_paciente: true,
    motivo,
    mensagem:
      motivo === "INTERESSE_NAO_CONFIRMADO"
        ? "Consulta à agenda não realizada: o paciente ainda não solicitou verificar vagas. Horários habituais são informações do catálogo publicado."
        : "Consulta à agenda não realizada: falta definir com o paciente qual médico terá as vagas consultadas.",
  };
}

export function consultaAgendaAguardandoPaciente(dados: unknown): boolean {
  if (!dados || typeof dados !== "object") return false;
  const d = dados as Record<string, unknown>;
  return d.consulta_realizada === false && d.aguardando_paciente === true;
}
