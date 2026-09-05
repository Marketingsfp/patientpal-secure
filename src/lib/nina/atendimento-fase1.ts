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
import { normalizar } from "@/lib/nina-especialidade";

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
  { intencao: "valor", termos: /\b(valor|valores|preco|precos|quanto custa|quanto e|quanto fica|custa|tabela)\b/ },
  { intencao: "preparo", termos: /\b(preparo|jejum|precisa de jejum|como me preparo|posso comer)\b/ },
  { intencao: "documentos", termos: /\b(documento|documentos|rg|carteirinha|pedido medico|encaminhamento|o que levar|preciso levar)\b/ },
  { intencao: "endereco", termos: /\b(endereco|onde fica|localizacao|como chego|rua|bairro|mapa|referencia)\b/ },
  { intencao: "horario", termos: /\b(horario de funcionamento|que horas abre|que horas fecha|abre|fecha|atende ate|funciona)\b/ },
  { intencao: "medico", termos: /\b(medico|medica|doutor|doutora|dr|dra|profissional|quem atende|quais medicos|especialista)\b|[a-z]+ologista/ },
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

/** Mensagem sem intenção legível (ou só um nome solto de especialidade). */
export function intencaoAmbigua(mensagem: string, intencoes: IntencaoNina[]): boolean {
  const texto = normalizar(mensagem ?? "").trim();
  if (!texto) return true;
  if (intencoes.length === 0) return true;
  // "cardiologia", "ultrassom" — só o assunto, sem dizer o que quer saber.
  const soAssunto = intencoes.every((i) => i === "consulta" || i === "exame" || i === "procedimento" || i === "medico");
  return soAssunto && texto.split(/\s+/).length <= 3;
}

/** "Bom dia" / "Boa tarde" / "Boa noite" conforme o horário da clínica. */
export function saudacaoPorHorario(fuso: string = FUSO_PADRAO, now: Date = new Date()): string {
  const hora = Number(agoraNaClinica(fuso, now).hora.slice(0, 2));
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export type EntradaFase1 = {
  nomeCurtoUnidade: string;
  jaSeApresentou: boolean;
  mensagem: string;
  fuso?: string;
  now?: Date;
};

/**
 * Bloco de prompt da Fase 1. Substitui a antiga instrução de apresentação
 * fixa e acrescenta tom + leitura de intenção.
 */
export function blocoPromptFase1(entrada: EntradaFase1): string {
  const { nomeCurtoUnidade, jaSeApresentou, mensagem } = entrada;
  const saudacao = saudacaoPorHorario(entrada.fuso ?? FUSO_PADRAO, entrada.now ?? new Date());
  const intencoes = detectarIntencoes(mensagem);
  const ambigua = intencaoAmbigua(mensagem, intencoes);
  const agendar = querAgendar(intencoes);

  const abertura = jaSeApresentou
    ? "APRESENTAÇÃO: você JÁ se apresentou nesta conversa. NÃO repita a apresentação nem a saudação inicial — responda direto, de forma acolhedora."
    : `APRESENTAÇÃO (primeira mensagem desta conversa): comece exatamente com "Olá, ${saudacao.toLowerCase()}! 😊 Sou a Nina, assistente virtual da ${nomeCurtoUnidade}." e, na sequência, responda o que foi perguntado. Se a pessoa não perguntou nada ainda, termine com "Como posso te ajudar hoje?".`;

  const leitura =
    intencoes.length > 0
      ? `LEITURA DA INTENÇÃO (apoio, não é ordem): a mensagem parece tratar de ${intencoes.join(", ")}.${
          intencoes.length > 1 ? " São MAIS DE UMA solicitação: responda TODAS na mesma mensagem, na ordem em que apareceram." : ""
        }`
      : "LEITURA DA INTENÇÃO: não foi possível identificar a intenção com clareza.";

  const clarificacao = ambigua
    ? "AMBIGUIDADE: a intenção não está clara. Faça UMA pergunta curta de clarificação (ex.: \"Você gostaria de saber o valor da consulta ou já quer verificar disponibilidade para agendamento?\") em vez de supor."
    : "A intenção está clara: siga direto com a resposta, sem perguntar o óbvio.";

  const agendamento = agendar
    ? "A pessoa pediu explicitamente para marcar, remarcar, cancelar ou ver vaga: pode seguir com o fluxo de agendamento normalmente."
    : "ATENÇÃO: perguntar preço, médico, especialidade, endereço ou preparo NÃO é pedido de agendamento. Responda apenas o que foi perguntado, NÃO peça nome, CPF, nascimento ou telefone e NÃO comece coleta de dados. No máximo, ofereça ajuda para agendar em uma frase curta, sem insistir.";

  return `TOM DE VOZ DA NINA:
- Educada, gentil, acolhedora, profissional, objetiva e natural — pouco robótica.
- Respostas curtas (2 a 4 frases). Sem repetir o que a pessoa disse, sem formalidade exagerada, sem encher de emojis (no máximo 1) e sem pressionar para agendar.

${abertura}

${leitura}
${clarificacao}
${agendamento}

MUDANÇA DE ASSUNTO: se a pessoa mudar de tema (valor → endereço → agendamento), acompanhe a mudança. Não fique presa à primeira intenção da conversa.`;
}
