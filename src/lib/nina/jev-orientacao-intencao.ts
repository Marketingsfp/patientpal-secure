/** Converte os sinais do turno em orientação de resposta, nunca em permissão de ferramenta. */
import type { IntencaoNina } from "./atendimento-fase1";
import { CORRECOES_JEV, PEDIDOS_JEV, type ObservacaoIntencaoJev } from "./jev-observacao-intencao";
import type { InstrucaoAdicionalTurno } from "./prompt/precedencia-turno";
import { REGRA_IDENTIFICACAO_UNIFICADA } from "./identificacao-catalogo";

const MAPA_PEDIDO: Record<keyof typeof PEDIDOS_JEV, IntencaoNina> = {
  preco: "valor",
  pagamento: "valor",
  profissionais: "medico",
  preparo: "preparo",
  documentos: "documentos",
  localizacao: "endereco",
  funcionamento: "horario",
  horario_habitual: "medico",
  disponibilidade: "disponibilidade",
  agendamento: "agendamento",
  cancelamento: "cancelamento",
  remarcacao: "remarcacao",
};

export type OrientacaoIntencaoJev = {
  versao: "intencoes-ativas-v1";
  modo: "orientacao";
  pedidos: string[];
  intencoes: IntencaoNina[];
  instrucoes: string[];
};

export function orientarIntencaoJev(
  observacao: ObservacaoIntencaoJev | null | undefined,
  atuais: readonly IntencaoNina[],
): OrientacaoIntencaoJev | null {
  if (!observacao) return null;
  const respostas = observacao.respostas;
  const pedidos = (Object.keys(PEDIDOS_JEV) as Array<keyof typeof PEDIDOS_JEV>).filter((id) => {
    const p = respostas[`obs_pedido_${id}`]?.noul;
    return typeof p === "number" && Number.isFinite(p) && p >= 0.8 && p <= 1;
  });
  const escolha = (id: string) => {
    const r = respostas[id];
    return r &&
      typeof r.confidence === "number" &&
      Number.isFinite(r.confidence) &&
      r.confidence >= 0.8 &&
      r.confidence <= 1
      ? r.choice
      : undefined;
  };
  const aceite = escolha("obs_autorizacao");
  const correcao = escolha("obs_correcao");
  const corrigindo = correcao && correcao !== "nenhuma" && Object.hasOwn(CORRECOES_JEV, correcao);
  const instrucoes: string[] = [];
  if (pedidos.length)
    instrucoes.push(
      `Pedidos identificados neste turno: ${pedidos.map((id) => PEDIDOS_JEV[id][0]).join("; ")}. Responda a cada pedido na mesma resposta, quando houver fonte oficial, sem abandonar os demais ao escolher uma intenção principal. Se faltar uma informação, diga qual falta e peça apenas o esclarecimento necessário.`,
    );
  if (pedidos.includes("profissionais"))
    instrucoes.push(
      "Se o paciente só pergunta se a clínica tem o atendimento (\"vocês têm psicólogo?\"), confirme que tem e, havendo dois ou mais médicos com nomes próprios, siga ESCOLHA_ANTES_DOS_DETALHES: pergunte se prefere o primeiro horário disponível ou escolher entre os profissionais, sem listar nomes, escalas nem preços. Apresente a lista somente quando ele pedir quais são, quem atende ou escolher ver os profissionais.",
    );
  if (pedidos.includes("horario_habitual"))
    instrucoes.push(
      "Informe dias e horários habituais somente conforme a base publicada. Escala habitual não comprova vaga. Quando o paciente pedir apenas informações gerais, responda com a base e ofereça verificar a disponibilidade do profissional escolhido; não consulte vagas só por mencionar a escala.",
    );
  if (pedidos.includes("disponibilidade") || aceite === "consultar_agenda")
    instrucoes.push(
      "Há pedido/aceite de consulta de disponibilidade. Com profissional e demais informações necessários definidos, use as ferramentas de agenda permitidas pelo fluxo. Antes disso, esclareça a seleção necessária. Só apresente vagas retornadas pelo sistema. Aceitar consultar NÃO autoriza gravar agendamento.",
    );
  if (aceite === "confirmar_resumo" && !corrigindo)
    instrucoes.push(
      "O paciente parece aceitar o resumo proposto. Prossiga pela verificação de confirmação já existente, apenas para o mesmo profissional, paciente, data e horário do resumo apresentado. O sinal do JEV não substitui identificação, revalidação da vaga, confirmação exigida nem sucesso da ferramenta; só anuncie reserva depois da confirmação do sistema.",
    );
  if (aceite === "condicional" || aceite === "recusou")
    instrucoes.push(
      "O paciente condicionou ou recusou a proposta. Não trate esta mensagem como aceite integral do resumo anterior. Esclareça ou ajuste a proposta ao pedido atual e solicite nova confirmação quando necessária. Recusar uma opção não cancela um agendamento existente.",
    );
  if (aceite === "ambigua")
    instrucoes.push(
      "O alcance do aceite está ambíguo. Pergunte se o paciente quer apenas consultar opções ou confirmar a proposta; não presuma confirmação de reserva.",
    );
  if (corrigindo)
    instrucoes.push(
      `O JEV identificou: ${CORRECOES_JEV[correcao as keyof typeof CORRECOES_JEV]}. Leia na mensagem atual o que foi substituído e o que passou a ser solicitado. Não use a seleção anterior como confirmação do novo pedido. Refaça as consultas oficiais necessárias à informação corrigida antes de oferecer ou confirmar opções. Se o novo valor não estiver claro, pergunte. Não altere identidade, cadastro nem reserva existente apenas por esta classificação; utilize os fluxos e validações próprios.`,
    );
  if (!instrucoes.length) return null;
  instrucoes.push(REGRA_IDENTIFICACAO_UNIFICADA);
  instrucoes.push(
    "Estas interpretações ajudam a entender o pedido. Não são fatos do catálogo, prova de vaga nem autorização operacional. Em conflito com a mensagem explícita do paciente, esclareça; preserve as restrições de segurança e todas as verificações das ferramentas. Respeite pedido_medico_do_turno: aceite textual não comprova recebimento de foto nem dispensa a exigência publicada.",
  );
  return {
    versao: "intencoes-ativas-v1",
    modo: "orientacao",
    pedidos: pedidos.map((id) => PEDIDOS_JEV[id][0]),
    intencoes: [...new Set([...atuais, ...pedidos.map((id) => MAPA_PEDIDO[id])])],
    instrucoes,
  };
}

/** É anexada ao contrato que de fato compõe o system prompt da Nina. */
export function instrucaoJevDoTurno(
  orientacao: OrientacaoIntencaoJev | null,
): InstrucaoAdicionalTurno[] {
  return orientacao
    ? [
        {
          codigo: "JEV_LEITURA_AMPLIADA_ATIVA",
          origem: "src/lib/nina/jev-orientacao-intencao.ts",
          motivo:
            "Orientar múltiplos pedidos, escala versus vagas, alcance do aceite e correção do pedido.",
          texto: orientacao.instrucoes.join("\n"),
        },
      ]
    : [];
}

export function orientacaoDaDecisaoJev(respostas: unknown): OrientacaoIntencaoJev | null {
  if (!respostas || typeof respostas !== "object") return null;
  const o = (respostas as Record<string, unknown>)._orientacao_intencao as
    | Partial<OrientacaoIntencaoJev>
    | undefined;
  if (
    !o ||
    o.versao !== "intencoes-ativas-v1" ||
    o.modo !== "orientacao" ||
    !Array.isArray(o.instrucoes) ||
    !o.instrucoes.every((s) => typeof s === "string") ||
    !Array.isArray(o.pedidos) ||
    !o.pedidos.every((s) => typeof s === "string") ||
    !Array.isArray(o.intencoes)
  )
    return null;
  return o as OrientacaoIntencaoJev;
}
