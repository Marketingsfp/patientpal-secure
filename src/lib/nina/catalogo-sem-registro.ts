import type { ResultadoBroker } from "./tool-broker";

export const MOTIVO_SEM_REGISTRO = "CATALOGO_SEM_REGISTRO: atendimento solicitado não encontrado na base publicada";
export const REGRA_SEM_REGISTRO_PROMPT = `INSTRUÇÃO FAT-04 — ATENDIMENTO NÃO ENCONTRADO NA BASE DE CONHECIMENTOS
Tipo: ESSENCIAL.
Aplica-se: consulta, especialidade, exame ou procedimento solicitado não encontrado após busca na base publicada.
Conduta:
- Consulte a base publicada para cada consulta, especialidade, exame ou procedimento solicitado, incluindo nomes escritos de outra forma e pedidos com mais de um item. Um resultado sobre outro atendimento não comprova o item pedido.
- Se a busca não encontrar o atendimento solicitado, chame obrigatoriamente solicitar_atendente_humano e encaminhe a conversa. Esta regra substitui qualquer orientação anterior para afirmar que a clínica não atende a especialidade ou sugerir outro serviço nesse caso.
- Ausência na base não comprova que a clínica não oferece o serviço. Não diga que não temos, não realizamos ou não oferecemos; não invente informações nem prossiga com agendamento automático. Avise de forma acolhedora que a equipe dará continuidade e só confirme a transferência após sucesso da ferramenta.
- Pedido sem identificação do atendimento exige uma pergunta breve para identificá-lo; vários resultados possíveis exigem esclarecer qual é o solicitado. Falha na consulta não comprova ausência. Essas situações não devem ser confundidas com um item pesquisado e não encontrado.
- A regra vale para atendimento real e homologação. No ambiente de teste, use o mecanismo de encaminhamento simulado disponibilizado pelo sistema e comunique a simulação conforme AMB-01, sem enviar mensagens ao WhatsApp nem atribuir a uma atendente real.
Resultado esperado: continuidade humana obrigatória quando o item solicitado não for encontrado na base, sem negar a oferta do serviço nem substituir por outro atendimento.`;

export function normalizarBuscaCatalogo(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Termos de conversa não podem fazer uma consulta inexistente casar apenas
// com a palavra "consulta" de outro serviço. Mantém qualificadores do item.
const GENERICOS = new Set(("gostaria quero queria preciso saber poderia pode podem voces voce favor gentileza " +
  "bom boa dia tarde noite ola por uma umas uns para pra com que qual quais quanto custa custam preco precos valor valores " +
  "informacao informacoes sobre como funciona funcionam funcionamento consulta consultas exame exames procedimento procedimentos medico medica medicos medicas " +
  "dr dra doutor doutora profissional profissionais especialista especialistas especialidade especialidades unidade unidades " +
  "marcar marca agendar fazer realiza realizam fazem tem temos atende atendem atendimento atendimento horario horarios " +
  "preparo preparos dias hoje amanha segunda terca quarta quinta sexta sabado domingo feira").split(/\s+/));

export function termosItemCatalogo(query: string): string[] {
  return normalizarBuscaCatalogo(query).split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !GENERICOS.has(t) && !/^\d+$/.test(t));
}

/** A leitura preventiva também recebe nomes/CPF/endereço: não são pedidos de serviço. */
export function pedidoDeItemCatalogo(query: string): boolean {
  const q = normalizarBuscaCatalogo(query);
  if (!termosItemCatalogo(query).length) return false;
  return /\b(?:consultas?|exames?|procedimentos?|especialidades?|especialistas?|medicos?|medicas?|doutor(?:a)?|dr|dra|preparos?|agendar|marcar|marca)\b/.test(q)
    || /\b[a-z]+(?:ologista|ologia|grafia|scopia|metria|grama)\b/.test(q);
}

/** Regra operacional por ausência confirmada; não calcula nota de confiança. */
export function encaminhamentoSemRegistro(r: ResultadoBroker, args: unknown, automatica = false) {
  if (!["consultar_base_conhecimento", "buscar_medicos", "buscar_procedimentos", "listar_especialidades"].includes(r.ferramenta)) return null;
  const d = r.dados as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  if (d.esclarecimento) return null;
  const ausente = r.success && !r.erro && d.knowledge_status === "not_found" && d.found === false &&
    Array.isArray(d.records) && d.records.length === 0;
  const ausenciaTipada = ["DOCTOR_NOT_FOUND", "PROCEDURE_NOT_FOUND"].includes(r.erro ?? "") &&
    d.fonte === "catalogo_publicado" && d.encaminhar_para_humano === true;
  if (!ausente && !ausenciaTipada) return null;
  let parametros: Record<string, unknown> = {};
  try {
    const p = typeof args === "string" ? JSON.parse(args) : args;
    if (p && typeof p === "object" && !Array.isArray(p)) parametros = p;
  } catch { /* Só o retorno oficial comprova a ausência. */ }
  const termo = String(parametros.termo ?? parametros.especialidade ?? parametros.nome ?? "").slice(0, 200);
  // Uma consulta solicitada pelo modelo já identificou a intenção. A busca
  // preventiva não pode transferir só porque o paciente informou seus dados.
  if (automatica && !pedidoDeItemCatalogo(termo)) return null;
  return {
    motivo: MOTIVO_SEM_REGISTRO,
    resumo: `O atendimento solicitado não foi encontrado na base publicada. Busca: ${termo || "catálogo de especialidades"}. A equipe deve conferir e continuar a conversa; a ausência no catálogo não comprova que a clínica não oferece o serviço.`,
    urgencia: "normal" as const,
  };
}

export function respostaSemRegistro(confirmado: boolean, teste = false): string {
  if (teste) return confirmado
    ? "Nesta simulação, registrei que este atendimento deve continuar com a equipe humana. Nenhuma transferência para uma atendente real foi realizada."
    : "Não consegui registrar o encaminhamento desta simulação. Nenhuma transferência real foi realizada.";
  return confirmado
    ? "Vou contar com nossa equipe para te ajudar com esse atendimento. Encaminhei sua conversa para um atendente, que continuará por aqui."
    : "Preciso do apoio da nossa equipe para te ajudar com esse atendimento. Não consegui transferir sua conversa neste momento; por favor, entre em contato com a recepção.";
}
