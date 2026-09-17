/**
 * FASE 1 do novo fluxo de atendimento da Nina — saudação, tom e leitura da
 * intenção.
 *
 * Este módulo é PURO (sem banco, sem rede) para poder ser testado. Ele só
 * produz TEXTO DE PROMPT e uma leitura de intenção; não decide agendamento,
 * não pede dados do paciente e não altera Base de Conhecimentos, regras ou
 * ferramentas.
 */
import { agoraNaClinica, FUSO_PADRAO } from "@/lib/nina-agora";
import { normalizar, pareceCitarEspecialidade } from "@/lib/nina-especialidade";

export type IntencaoNina =
  | "consulta"
  | "exame"
  | "procedimento"
  | "valor"
  | "medico"
  | "endereco"
  | "horario"
  | "documentos"
  | "preparo"
  | "disponibilidade"
  | "agendamento"
  | "cancelamento"
  | "remarcacao"
  | "falar_humano"
  | "financeiro"
  | "administrativo";

const PADROES: Array<{ intencao: IntencaoNina; termos: RegExp }> = [
  { intencao: "cancelamento", termos: /\b(cancelar|cancelamento|desmarcar|nao vou poder ir)\b/ },
  { intencao: "remarcacao", termos: /\b(remarcar|remarcacao|reagendar|mudar (o )?(dia|horario)|trocar (o )?(dia|horario)|adiar)\b/ },
  { intencao: "agendamento", termos: /\b(agendar|marcar|agendamento|quero marcar|posso marcar|marcacao)\b/ },
  { intencao: "disponibilidade", termos: /\b(tem vaga|vagas?|disponibilidade|disponivel|tem horario|encaixe|consegue (hoje|amanha|sabado))\b/ },
  { intencao: "valor", termos: /\b(valor|valores|preco|precos|quanto custa|quanto e|quanto fica|custa|tabela|formas? de pagamento)\b|\b(?:aceitam?|posso pagar|pode pagar|pagar)\s+(?:(?:no|em|por|via|com)\s+)?(?:pix|dinheiro|cartao|boleto|cheque)\b|^(?:e\s+)?(?:no|em|por|via)\s+(?:pix|dinheiro|cartao|boleto|cheque)\s*\??$/ },
  { intencao: "preparo", termos: /\b(preparo|jejum|precisa de jejum|como me preparo|posso comer)\b/ },
  { intencao: "documentos", termos: /\b(documento|documentos|rg|carteirinha|pedido medico|encaminhamento|o que levar|preciso levar)\b/ },
  { intencao: "endereco", termos: /\b(endereco|onde fica|localizacao|como chego|rua|bairro|mapa|referencia)\b/ },
  { intencao: "horario", termos: /\b(horario de funcionamento|que horas abre|que horas fecha|abre|fecha|atende ate|funciona)\b/ },
  { intencao: "medico", termos: /\b(medicos?|medicas?|doutor|doutora|dr|dra|profissiona(?:l|is)|quem atende|especialistas?)\b|[a-z]+ologista/ },
  { intencao: "exame", termos: /\b(exame|exames|ultrassom|ultrassonografia|raio ?x|rx|laboratorio|sangue|eletro|tomografia|resultado)\b/ },
  { intencao: "consulta", termos: /\b(consulta|consultar|avaliacao|retorno)\b/ },
  { intencao: "procedimento", termos: /\b(procedimento|cirurgia|curativo|aplicacao|injecao|vacina)\b/ },
  { intencao: "financeiro", termos: /\b(boleto|pagamento|pagar|mensalidade|fatura|segunda via|nota fiscal|nfse|reembolso|convenio (cobre|cobra))\b/ },
  { intencao: "falar_humano", termos: /\b(atendente|humano|pessoa de verdade|falar com alguem|recepcao|nao entendi nada|quero falar com)\b/ },
  { intencao: "administrativo", termos: /\b(convenio|plano de saude|cadastro|contrato|associado|trabalhar|curriculo|reclamacao)\b/ },
];

/** Lê as intenções presentes na mensagem. Pode retornar mais de uma. */
export function detectarIntencoes(mensagem: string): IntencaoNina[] {
  const texto = normalizar(mensagem ?? "");
  if (!texto.trim()) return [];
  const achadas: IntencaoNina[] = [];
  for (const { intencao, termos } of PADROES) {
    if (termos.test(texto) && !achadas.includes(intencao)) achadas.push(intencao);
  }
  if (pareceCitarEspecialidade(texto) && !achadas.includes("medico")) achadas.push("medico");
  return achadas;
}

/**
 * Perguntar valor, médico ou especialidade NÃO é intenção de agendar. Só
 * consideramos agendamento quando a pessoa pede explicitamente marcar/vaga.
 */
export function querAgendar(intencoes: IntencaoNina[]): boolean {
  return intencoes.some(
    (i) => i === "agendamento" || i === "disponibilidade" || i === "remarcacao" || i === "cancelamento",
  );
}

/**
 * Pedido de visão geral dos profissionais/especialidade, sem vaga ou médico
 * específico. A lista de opções do catálogo é uma resposta possível aqui;
 * isso não confirma nenhuma disponibilidade na agenda.
 */
export function perguntaGeralSobreAtendimento(mensagem: string): boolean {
  const texto = normalizar(mensagem ?? "");
  if (querAgendar(detectarIntencoes(texto))) return false;
  // Datas, uma hora exata e um profissional nomeado delimitam outro pedido.
  if (/\b(hoje|amanha|proxim[oa]|nesta|neste|essa semana|esta semana|semana que vem|dia \d{1,2}|as \d{1,2}|dr|dra|doutor|doutora)\b|\d{1,2}[:/]\d{2}/.test(texto)) return false;
  const assunto = pareceCitarEspecialidade(texto) !== null || /\b(medicos?|medicas?|profissiona(?:l|is)|especialistas?|especialidades?)\b/.test(texto);
  if (!assunto) return false;
  // "cardiologia" ou "cardiologista?" isolados continuam sendo só o assunto.
  return /\b(tem|possuem?|oferecem?|atendem?|quais|quem|informacoes|quero saber|gostaria de saber|me fale|me informe|pode informar)\b/.test(texto);
}

/** Mensagem sem intenção legível (ou só um nome solto de especialidade). */
export function intencaoAmbigua(mensagem: string, intencoes: IntencaoNina[]): boolean {
  const texto = normalizar(mensagem ?? "").trim();
  if (!texto) return true;
  if (intencoes.length === 0) return true;
  if (perguntaGeralSobreAtendimento(texto)) return false;
  // "cardiologia", "ultrassom" — só o assunto, sem dizer o que quer saber.
  const soAssunto = intencoes.every((i) => i === "consulta" || i === "exame" || i === "procedimento" || i === "medico");
  return soAssunto && texto.split(/\s+/).length <= 3;
}

/** "Bom dia" / "Boa tarde" / "Boa noite" conforme o horário da clínica. */
export function saudacaoPorHorario(fuso: string = FUSO_PADRAO, now: Date = new Date()): string {
  return agoraNaClinica(fuso, now).saudacao_do_periodo;
}

/**
 * FASE 6 — o antigo `blocoPromptFase1` foi REMOVIDO.
 *
 * Ele montava comportamento conversacional (tom de voz, apresentação, leitura
 * de intenção, regras de clarificação) e o concatenava ao prompt. Desde a
 * FASE 3 o comportamento vem exclusivamente do Behavior Prompt publicado em
 * Arquitetura → Instruções da Nina. Este módulo mantém apenas as funções
 * determinísticas de detecção usadas por estado, métricas e validações.
 */
