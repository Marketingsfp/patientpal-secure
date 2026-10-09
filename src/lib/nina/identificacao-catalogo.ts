import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import type { ResultadoConhecimento } from "./knowledge-contract";
import { ehRespostaAfirmativaCurta, normalizarRespostaInformal } from "./resposta-afirmativa";
import { apresentarPerguntaEsclarecimento } from "./esclarecimento-apresentacao";

export const REGRA_IDENTIFICACAO_UNIFICADA =
  "IDENTIFICACAO-01 — Consulta, exame, procedimento e profissional seguem o mesmo fluxo. Quando houver dúvida, apresente o candidato publicado como hipótese e pergunte se é esse ou peça outra escrita. Ao apresentar uma hipótese única de exame ou procedimento, faça a pergunta de identificação uma única vez e termine com: Se não for esse o exame ou procedimento que você procura, pode escrever o nome novamente, como aparece no pedido médico. Não repita a confirmação no início e no fim nem convide a escolher agenda enquanto a identificação estiver pendente. Esse fechamento permite corrigir o nome; não confirma equivalência nem autoriza informar preço de hipótese. Vários candidatos exigem escolher entre eles; não escolha o primeiro. Sem candidato, peça o nome novamente, sem inventar uma hipótese. 'Isso' ou 'sim' confirma somente uma opção única da última pergunta efetivamente entregue; não confirma agenda. 'Os dois', 'ambos' ou 'todos' podem confirmar pedidos independentes apresentados, cada um com uma única hipótese. Separe essa confirmação das dúvidas adicionais da mesma mensagem. Reconsulte cada registro e encerre somente a pendência correspondente; não repita perguntas já resolvidas. Listas de alternativas para um mesmo pedido continuam exigindo escolha. 'Não, é outro' pede o novo nome, sem presumir escolha. Reconsulte o catálogo após confirmação/correção. Se o paciente reescrever e a identificação continuar inconclusiva, encaminhe para a equipe, sem outra rodada de tentativas. Mudança explícita de assunto inicia um pedido independente; corrigir a grafia não zera a tentativa. Reconsultas de ferramentas no mesmo turno não contam como respostas do paciente. O Jev sugere candidatos publicados, não confirma a escolha nem dispensa a confirmação. Falha técnica não é falha de entendimento. Pedido explícito de atendente e urgência mantêm o encaminhamento imediato. Perguntas independentes da mesma mensagem devem ser pesquisadas separadamente. Uma identificação incerta impede afirmar fatos somente sobre aquele item: responda às outras perguntas com as consultas confirmadas e peça esclarecimento apenas do item duvidoso. Não encerre a leitura das demais perguntas ao encontrar uma dúvida. Ao reformular uma busca do mesmo pedido no turno, informe reformula_de com o termo anterior; preserve o pedido original e seus qualificadores. Reformulações não são perguntas independentes nem confirmam equivalência clínica. Se o paciente escolheu um exame e a reconsulta identificou esse registro, preserve o título escolhido nas pesquisas seguintes do mesmo pedido, inclusive quando faltar preço ou executante. Não reabra opções descartadas (como a pediátrica após a escolha do exame para adulto). Não invente atualização do sistema para justificar campos vazios. Só anuncie encaminhamento quando a ferramenta confirmar sua execução; uma ação bloqueada não foi realizada. Use apenas pendencias_atuais do último retorno, fazendo uma única pergunta específica por pedido ainda incerto antes de informar preço. Não repita buscas apenas para obter como confirmado um candidato ainda pendente. Esta regra substitui limites antigos divergentes de identificação; não muda perguntas de cadastro, data, horário ou confirmação de reserva.";

type Contexto = {
  mensagem: string;
  historico: ReadonlyArray<{ role: string; content: string | null }>;
};
const comparar = (t: string) =>
  normalizarRespostaInformal(t).replace(/[•*?]/g, "").replace(/\s+/g, " ").trim();

export function mudouSolicitacaoExplicitamente(mensagem: string): boolean {
  return /\b(?:mudando de assunto|outro assunto|esquece|esqueca|deixa (?:isso|esse|essa) (?:pra|para) la|agora (?:eu )?(?:quero|preciso)|em vez (?:disso|desse|dessa))\b/.test(
    normalizarRespostaInformal(mensagem),
  );
}

export function recusaIdentificacaoSemNome(mensagem: string): boolean {
  return /^(?:nao|nao (?:e )?(?:esse|essa|isso)|(?:nao )?(?:e )?outr[oa]|nao (?:e )?outr[oa]|nenhum(?: desses| destes| deles)?|nenhuma(?: dessas| destas| delas)?)$/.test(
    normalizarRespostaInformal(mensagem),
  );
}

export function perguntaIdentificacaoEntregue(
  anterior: ConhecimentoSessao | null,
  contexto: Contexto,
): boolean {
  const p = anterior?.esclarecimento;
  const ultima = contexto.historico.at(-1);
  if (!p?.pergunta || ultima?.role !== "assistant") return false;
  const mensagem = comparar(ultima.content ?? "");
  return [
    p.pergunta,
    apresentarPerguntaEsclarecimento(p.pergunta, {
      tipo: p.tipo,
      tipoAtendimento: anterior?.consulta.tipo_atendimento,
    }),
  ].some((texto) => mensagem.endsWith(comparar(texto)));
}

export function confirmarItemDaPergunta(anterior: ConhecimentoSessao | null, contexto: Contexto) {
  const p = anterior?.esclarecimento;
  if (
    !p ||
    p.tipo === "profissional" ||
    p.opcoes.length !== 1 ||
    /\b(?:nao|nem)\b/.test(normalizarRespostaInformal(p.pergunta)) ||
    !ehRespostaAfirmativaCurta(contexto.mensagem) ||
    !perguntaIdentificacaoEntregue(anterior, contexto)
  )
    return null;
  const opcao = p.opcoes[0]!;
  return anterior!.referencias.some((r) => r.registro === opcao.id) ? opcao : null;
}

/** Recusa sem outro nome e aceite de uma lista não são uma reformulação que falhou. */
export function perguntaParaCompletarIdentificacao(
  anterior: ConhecimentoSessao | null,
  contexto: Contexto,
): string | null {
  if (
    !anterior?.esclarecimento ||
    (anterior.esclarecimentoTentativas ?? 1) >= 2 ||
    !perguntaIdentificacaoEntregue(anterior, contexto)
  )
    return null;
  if (recusaIdentificacaoSemNome(contexto.mensagem))
    return anterior.esclarecimento.tipo === "profissional"
      ? "Tudo bem. Pode escrever novamente o nome do profissional que você procura?"
      : "Tudo bem. Pode escrever novamente o nome da consulta, do exame ou do procedimento que você procura?";
  if (ehRespostaAfirmativaCurta(contexto.mensagem) && anterior.esclarecimento.opcoes.length !== 1)
    return "Ainda preciso identificar qual atendimento ou profissional você deseja. Pode escrever o nome?";
  return null;
}

export function perguntaCandidatoCatalogo(
  opcoes: NonNullable<ResultadoConhecimento["esclarecimento"]>["opcoes"],
  profissional = false,
): string {
  const nomes = [
    ...new Set(opcoes.map((o) => [o.nome, o.especialidade, o.unidade].filter(Boolean).join(" — "))),
  ];
  if (nomes.length === 1)
    return `Você quis dizer ${nomes[0]}? Pode confirmar ou escrever o nome novamente.`;
  return `Qual ${profissional ? "profissional" : "atendimento"} você quis dizer? Pode escolher uma opção ou escrever o nome novamente.\n${nomes.join("\n")}`;
}

/** Uma sugestão do Jev passa pela mesma confirmação de uma aproximação da busca. */
export function sugerirResultadoJev(resultado: ResultadoConhecimento): ResultadoConhecimento {
  if (!resultado.found || resultado.knowledge_status !== "found" || resultado.esclarecimento)
    return resultado;
  const consulta = resultado.tipo_atendimento === "consulta";
  const opcoes = resultado.records
    .filter((r) => r.id && r.procedimento)
    .map((r) => ({
      id: r.id!,
      nome: consulta ? r.procedimento!.replace(/^Consulta\s*[—–-]\s*/i, "") : r.procedimento!,
    }))
    .filter((o, i, todos) => todos.findIndex((a) => a.nome === o.nome) === i);
  if (!opcoes.length) return resultado;
  const pergunta = perguntaCandidatoCatalogo(opcoes);
  return {
    ...resultado,
    procedure: null,
    price: null,
    esclarecimento: { tipo: "procedimento", opcoes, pergunta },
    instrucao: `Sugestão do Jev, ainda não confirmada pelo paciente. ${pergunta} Aguarde a resposta e reconsulte antes de informar fatos ou consultar agenda.`,
  };
}
