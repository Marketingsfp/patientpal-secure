import type { PerguntaJev, RespostaJev } from "./jev";
import { autorDaMensagem, type MensagemHistoricoJev } from "./jev-contexto";

const PERGUNTA_NOME =
  "Qual consulta, exame ou procedimento você deseja? Se souber o nome do profissional, pode informar também.";
/** Paciente descreveu sintomas sem dizer qual atendimento quer (regra do usuário). */
export const PEDIR_NOME_ATENDIMENTO = `Não posso sugerir consultas, exames ou procedimentos com base nos sintomas.\n\n${PERGUNTA_NOME}`;
/** Pedido sem nome e sem sintoma ("quero uma consulta"): não falar de sintomas (07/10/2026). */
export const PEDIR_NOME_ATENDIMENTO_NEUTRO = `Para eu buscar certinho, me diga: ${PERGUNTA_NOME.charAt(0).toLowerCase()}${PERGUNTA_NOME.slice(1)}`;

const SINTOMA =
  /\b(?:dor(?:es)?|d[oó]i|doendo|duendo|sinto|sentindo|febre|tosse|falta de ar|cansa[cç]o|inchad[oa]|incha[cç]o|sangr\w*|coceira|co[cç]ando|mancha|tontura|tonto|enjo[oô]|v[oô]mito|vomitando|diarr[eé]ia|machuc\w*|ardendo|queima[cç][aã]o|caro[cç]o|ferida|press[aã]o alta|gripe|gripad[oa]|resfriad[oa])\b/i;

/** Só fala de sintomas quando o paciente citou algum. */
export function textoPedirNomeAtendimento(mensagem: string | null | undefined): string {
  return SINTOMA.test(mensagem ?? "") ? PEDIR_NOME_ATENDIMENTO : PEDIR_NOME_ATENDIMENTO_NEUTRO;
}
export const MOTIVO_NOME_NAO_INFORMADO =
  "ATENDIMENTO_NAO_INFORMADO: paciente não informou a consulta, exame, procedimento ou profissional desejado após receber a pergunta; a Nina não pode fazer uma indicação clínica.";
export const REGRA_SEM_INDICACAO = `ESCOPO-02 — Não recomende nem escolha consulta, especialidade, profissional, exame ou procedimento a partir de sintomas, queixas, idade ou diagnóstico. Nem mesmo Clínico Geral como alternativa. Nome popular de especialidade NÃO é sintoma: 'médico/consulta do coração' é Cardiologia, 'médico de vista/olho' Oftalmologia, 'de criança' Pediatria, 'de mulher' Ginecologia, 'de osso' Ortopedia, 'de pele' Dermatologia, 'do pulmão' Pneumologia, 'de ouvido/nariz/garganta' Otorrinolaringologia, 'de estômago' Gastroenterologia, 'de próstata/urina' Urologia, 'de idoso' Geriatria, 'de dente'/dentista Odontologia; pesquise essa especialidade normalmente. Se o paciente pedir atendimento sem informar qual, chame solicitar_nome_atendimento antes de pesquisar catálogo, apresentar médicos/valores ou consultar agenda. A ferramenta pede o nome e, após uma pergunta efetivamente enviada, encaminha a nova resposta sem nome para a equipe. Não trate silêncio, saudação, agradecimento ou mudança para assunto administrativo como segunda tentativa. Um nome, sigla ou erro de escrita informado pelo paciente pode ser pesquisado e esclarecido, sem criar indicação clínica. Preserve pedidos independentes já nomeados; consulte-os primeiro e inclua suas respostas confirmadas no texto junto da chamada solicitar_nome_atendimento, esclarecendo somente a parte sem nome. Referências curtas só retomam atendimento escolhido pelo paciente ou lido de seu pedido médico; uma indicação antiga da própria IA não comprova essa escolha. Pedido explícito de atendente e possível urgência mantêm prioridade. Ao reconhecer possível emergência, não sugira consulta eletiva nem espere o nome para orientar atendimento de urgência e acionar a equipe.`;

export const FERRAMENTA_NOME_ATENDIMENTO = {
  type: "function" as const,
  function: {
    name: "solicitar_nome_atendimento",
    description:
      "O paciente quer atendimento mas não informou qual consulta, exame, procedimento ou profissional (só descreveu sintomas ou pediu 'uma consulta'). Não escolher por sintomas. Nome popular de especialidade (médico do coração, de vista, de criança, de mulher, de osso, de pele) já é o nome informado: não use esta ferramenta, pesquise a especialidade. Solicita o nome; se a pergunta já foi enviada e a nova resposta ainda não informa o nome, encaminha. Não usar para saudação, agradecimento, dúvida administrativa ou erro de escrita de um nome informado.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
};

export function perguntaNomeAtendimento(): Record<string, PerguntaJev> {
  return {
    nome_atendimento: {
      type: "choice",
      instructions:
        "Na mensagem atual há pedido de atendimento sem nome da consulta, especialidade, exame, procedimento ou médico? Use o histórico só para retomar um nome escolhido pelo paciente ou lido de seu pedido. Não deduza especialidade por sintomas e não valide indicação antiga feita apenas pela IA. Após pergunta sobre o nome, 'não sei', sintomas ou 'qualquer um' continuam sem nome. Não confunda isso com baixa compreensão da mensagem.",
      criteria: {
        sem_nome:
          "Quer atendimento/orientação sobre qual médico ou exame procurar, mas não informa o nome (ex.: dor nas costas, qual médico eu passo?; quero uma consulta; não sei, você escolhe). Nenhum outro pedido nomeado independente nesta mensagem.",
        informado:
          "Paciente informou nome, especialidade, sigla ou escrita aproximada, ou retoma atendimento que ele próprio escolheu. Ex.: quero ortopedista, tem usan?, Dr. João, quanto custa esse exame já identificado. Nome popular de especialidade também é nome informado: médico/consulta do coração, médico de vista, de criança, de mulher, de osso, de pele, do pulmão, de ouvido, dentista. Não exige que o nome exista no catálogo.",
        outro:
          "Saudação, agradecimento, despedida, endereço, horário geral, cadastro ou outro assunto sem pedido de escolha clínica. Também mensagens com pedidos independentes mistos: responder os nomeados e esclarecer os demais.",
      },
    },
  };
}

export function semNomePeloJev(r: RespostaJev | undefined): boolean {
  return r?.choice === "sem_nome" && typeof r.confidence === "number" && r.confidence >= 0.8;
}

type Mensagem = MensagemHistoricoJev & {
  enviada_por?: string | null;
  status?: string | null;
  is_teste?: boolean | null;
};
/** Só a pergunta realmente enviada na mesma sessão autoriza a segunda etapa. */
export function perguntaNomeEntregue(
  mensagens: readonly Mensagem[],
  ctx: {
    conversaId: string | null;
    inicioSessao: string | null;
    teste: boolean;
    entradas: readonly string[];
  },
): string | null {
  const inicio = Date.parse(ctx.inicioSessao ?? "");
  if (!ctx.conversaId || !Number.isFinite(inicio) || !ctx.entradas.length) return null;
  const linhas = mensagens.filter(
    (m) =>
      m.id &&
      m.conversa_id === ctx.conversaId &&
      (ctx.teste ? m.is_teste === true : m.is_teste !== true) &&
      Date.parse(m.created_at ?? "") >= inicio,
  );
  const atuais = linhas.filter(
    (m) => ctx.entradas.includes(m.id!) && autorDaMensagem(m.direction) === "paciente",
  );
  if (atuais.length !== new Set(ctx.entradas).size) return null;
  const limite = Math.min(...atuais.map((m) => Date.parse(m.created_at!)));
  const anteriores = linhas
    .filter((m) => Date.parse(m.created_at!) < limite)
    .sort((a, b) => Date.parse(a.created_at!) - Date.parse(b.created_at!));
  const pergunta = anteriores
    .filter(
      (m) =>
        autorDaMensagem(m.direction) === "atendente" &&
        ["sent", "delivered", "read"].includes(m.status ?? ""),
    )
    .at(-1);
  if (!pergunta || pergunta.enviada_por !== "nina") return null;
  const texto = pergunta.transcricao || pergunta.body || "";
  // Substring permite apresentação e respostas independentes na mesma mensagem.
  if (!texto.includes(PERGUNTA_NOME)) return null;
  // Entradas do mesmo lote/reprocessamento não são a resposta à pergunta.
  return pergunta.id!;
}
