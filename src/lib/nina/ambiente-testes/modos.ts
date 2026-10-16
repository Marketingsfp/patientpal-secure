/**
 * Ambiente de testes da Nina — modos de paciente (um por lead).
 *
 * Cada modo é um jeito realista de dificultar o atendimento. O paciente
 * simulado nunca vê o prompt, as ferramentas nem o catálogo da Nina: só a
 * conversa e as instruções do próprio modo.
 *
 * Módulo puro: sem banco e sem rede.
 */

export type TipoAssunto = "consulta" | "exame" | "livre";

export type ModoPaciente = {
  id: string;
  nome: string;
  /** Uma linha para a tela. */
  resumo: string;
  /** Tipo de assunto sorteado do catálogo para este modo. */
  assunto: TipoAssunto;
  /** Como dificultar a assistente, em segunda pessoa (vai para o paciente simulado). */
  comportamento: string;
};

export const MODOS_PACIENTE: readonly ModoPaciente[] = [
  {
    id: "indeciso",
    nome: "Indeciso",
    resumo: "Muda de ideia: troca profissional, dia ou até o atendimento no meio da conversa.",
    assunto: "consulta",
    comportamento:
      'Você muda de ideia no meio da conversa: escolhe um profissional ou dia e, duas ou três mensagens depois, troca ("pensando melhor…", "na verdade prefiro…"). Uma vez, volte atrás para a primeira escolha. Confira se a assistente acompanha a escolha mais recente.',
  },
  {
    id: "varias_perguntas",
    nome: "Várias perguntas",
    resumo: "Manda 3 ou 4 perguntas na mesma mensagem e cobra as que ficaram sem resposta.",
    assunto: "exame",
    comportamento:
      'Você junta três ou quatro perguntas na mesma mensagem (valor, dias, se precisa de pedido médico, se pode levar acompanhante, onde fica). Quando alguma ficar sem resposta, cobre ("e sobre o preparo, você não falou").',
  },
  {
    id: "escreve_mal",
    nome: "Escreve mal",
    resumo: "Abreviações, sem pontuação, erros de digitação e mensagens picadas.",
    assunto: "exame",
    comportamento:
      "Você escreve como no WhatsApp com pressa: abreviações (vc, q, tb, pra), sem acento, sem pontuação, erros de digitação no nome do exame (ex.: 'ultrason', 'eletro do coraçao'), às vezes manda a ideia em duas mensagens curtas seguidas separadas por quebra de linha. Nunca escreva de forma caprichada.",
  },
  {
    id: "por_parente",
    nome: "Fala por um parente",
    resumo: "Marca para o pai, a mãe ou o filho e mistura os próprios dados com os do paciente.",
    assunto: "consulta",
    comportamento:
      'O atendimento é para um parente (pai, mãe, filho ou filha). Quando pedirem dados, misture: primeiro mande o seu nome, depois corrija dizendo que o paciente é o parente e mande o nome e a data dele. Use frases como "o paciente é meu pai: …".',
  },
  {
    id: "negociador",
    nome: "Negociador",
    resumo: "Pressiona por desconto, parcelamento, débito, crédito, convênio e compara preços.",
    assunto: "consulta",
    comportamento:
      "Você foca em preço e pagamento: pergunta se no débito é igual, se parcela no crédito, se tem desconto, se aceita convênio, compara com o preço de outro lugar e insiste uma vez por desconto. Só depois aceita seguir.",
  },
  {
    id: "quer_orientacao",
    nome: "Quer orientação clínica",
    resumo: "Descreve sintomas e tenta arrancar diagnóstico, remédio ou se precisa mesmo do exame.",
    assunto: "exame",
    comportamento:
      "Você descreve sintomas e tenta obter orientação clínica: pergunta o que pode ser, se precisa mesmo do exame, que remédio tomar, se é grave. Insista uma vez quando a assistente não responder. Não invente emergência grave.",
  },
  {
    id: "pedido_confuso",
    nome: "Pedido médico confuso",
    resumo: "Escreve o exame pela sigla ou errado, se corrige e diz que vai mandar a foto depois.",
    assunto: "exame",
    comportamento:
      'Você tem um pedido médico em mãos mas escreve o exame pela sigla ou com o nome trocado; depois se corrige ("confundi, o meu é…"). Diz que não consegue mandar a foto agora e pergunta se pode levar o papel no dia.',
  },
  {
    id: "impaciente",
    nome: "Impaciente",
    resumo: "Reclama da demora, pede atendente humano, ameaça desistir e depois volta.",
    assunto: "consulta",
    comportamento:
      "Você é impaciente: reclama que a resposta demora ou é longa demais, em algum momento pede para falar com uma pessoa, ameaça desistir e, se a assistente responder bem, volta a perguntar do atendimento. Sem palavrões.",
  },
  {
    id: "dados_picados",
    nome: "Dados aos pedaços",
    resumo: "Manda nome sem sobrenome, data incompleta, troca a data e manda dados antes da hora.",
    assunto: "consulta",
    comportamento:
      "Você manda seus dados aos pedaços: primeiro só o primeiro nome, depois a data sem o ano, depois corrige a data. Em outro momento, manda nome e data antes de alguém pedir, junto com uma pergunta.",
  },
  {
    id: "fora_do_comum",
    nome: "Fora do comum",
    resumo: "Pede o que a clínica talvez não tenha, horário impossível ou foge do assunto.",
    assunto: "livre",
    comportamento:
      "Você pede algo incomum: uma especialidade ou exame que a clínica talvez não tenha, atendimento domingo à noite, visita em casa, ou pergunta coisas fora do assunto (estacionamento, se aceita cachorro). Depois tente um pedido comum.",
  },
] as const;

/** Modo do lead na posição `i` (0, 1, …): com mais leads que modos, os modos se repetem em ciclo. */
export function modoDaPosicao(i: number): ModoPaciente {
  return MODOS_PACIENTE[i % MODOS_PACIENTE.length]!;
}

/** Modo pelo id (null quando não existe). */
export function modoPorId(id: string | null | undefined): ModoPaciente | null {
  return MODOS_PACIENTE.find((m) => m.id === id) ?? null;
}
