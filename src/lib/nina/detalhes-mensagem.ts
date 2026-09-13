/** Apresentação somente de fatos registrados; não decide nem altera atendimento. */
import type { LeituraDetalhesMensagem } from "./detalhes-mensagem-contrato";
import { hashDoTexto } from "./confidence/hash";
import { representacaoDaMensagem, selecionarAvaliacaoDaSaida } from "./confidence/identidade-saida";

export type RegistroDetalhes = Record<string, unknown>;
export type PacoteDetalhesMensagem = {
  clinicaId: string;
  mensagem: RegistroDetalhes | null;
  execucao: RegistroDetalhes | null;
  entradas: RegistroDetalhes[];
  etapas: RegistroDetalhes[];
  eventos: RegistroDetalhes[];
  decisoes: RegistroDetalhes[];
  vinculos: RegistroDetalhes[];
  avisos: RegistroDetalhes[];
  alertas?: string[];
};

export function objetoDetalhes(v: unknown): RegistroDetalhes {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as RegistroDetalhes) : {};
}
export function textoDetalhes(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}
const s = textoDetalhes;
const o = objetoDetalhes;
const n = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const lista = (v: unknown): RegistroDetalhes[] => (Array.isArray(v) ? v.map(o) : []);
const instante = (v: unknown): number => {
  const t = Date.parse(s(v) ?? "");
  return Number.isFinite(t) ? t : 0;
};
const MOTIVOS: Record<string, string> = {
  INTENCAO_AMBIGUA: "O motor não identificou com segurança qual atendimento foi solicitado.",
  ENTIDADE_AMBIGUA: "O motor encontrou mais de um profissional ou procedimento possível.",
  AFIRMACAO_SEM_EVIDENCIA: "Parte das informações foi considerada sem comprovação suficiente.",
  UNGROUNDED_CLAIM: "O motor bloqueou uma afirmação por falta de comprovação.",
  SEM_AFIRMACAO_RECONHECIDA_EM_ACAO_OFICIAL:
    "O motor não reconheceu informação verificável para a ação solicitada.",
  RESTRICAO_PUBLICADA_DESCUMPRIDA: "O motor registrou descumprimento de uma instrução publicada.",
};
function motivosLegiveis(d: RegistroDetalhes): string[] {
  const codigos = Array.isArray(d.reason_codes) ? d.reason_codes : [];
  const motivos = Array.isArray(d.motivos) ? d.motivos : [];
  return [
    ...new Set(
      [...codigos, ...motivos]
        .filter((v): v is string => typeof v === "string")
        .map((v) => {
          const codigo = v.match(/^[A-Z_]+/)?.[0] ?? "";
          if (MOTIVOS[codigo]) return MOTIVOS[codigo];
          if (v.startsWith("limitação de cobertura") || v.startsWith("dimensões sem evidência"))
            return "Algumas partes da avaliação não tinham evidência suficiente.";
          return "Outros motivos estão disponíveis em Ver registros técnicos.";
        })
        .filter((v): v is string => v != null),
    ),
  ];
}

const NOMES_PASSOS: Record<string, string> = {
  "message.inbound": "Processamento da mensagem",
  "instructions.published": "Instruções publicadas carregadas",
  "tool.knowledge.lookup": "Consulta à base de conhecimento",
  "context.load": "Contexto do atendimento carregado",
  "prompt.compose": "Instruções enviadas ao modelo",
  "llm.generate": "Resposta do modelo",
  "confidence.decision": "Verificação de segurança da ação",
  "answer.verify": "Verificação da resposta",
  "answer.review": "Revisão de confiança",
  "answer.low_confidence_handoff": "Tratamento da baixa confiança",
  "response.validate": "Finalização do gerador",
  "message.outbound": "Retorno do gerador",
  "turn.delivery": "Registro da entrega",
};

function descreverConclusao(
  node: unknown,
  meta: RegistroDetalhes,
  mensagemId: string | null,
): string {
  switch (node) {
    case "instructions.published":
      return meta.versao != null
        ? `Versão ${String(meta.versao)} das instruções carregada.`
        : "Instruções publicadas carregadas.";
    case "tool.knowledge.lookup":
      return meta.base_ativa === true
        ? "A base de conhecimento publicada estava disponível para consulta."
        : "Consulta ao estado da base concluída.";
    case "context.load":
      return n(meta.mensagens_contexto) != null
        ? `${n(meta.mensagens_contexto)} mensagens reunidas como contexto.`
        : "Contexto do atendimento preparado.";
    case "prompt.compose":
      return n(meta.ferramentas) != null
        ? `${n(meta.ferramentas)} ferramentas disponibilizadas ao modelo. Isso não significa que todas foram usadas.`
        : "Instruções e contexto preparados para a chamada ao modelo.";
    case "llm.generate":
      return n(meta.ferramentas_pedidas) != null && Number(meta.ferramentas_pedidas) > 0
        ? `O modelo solicitou a execução de ${Number(meta.ferramentas_pedidas)} ferramentas.`
        : "Chamada ao modelo concluída.";
    case "tool.execute":
      return "Execução da ferramenta concluída.";
    case "confidence.decision":
    case "answer.verify":
      return n(meta.score) != null
        ? `O motor registrou nota ${n(meta.score)}/100 nesta etapa. Veja acima a qual avaliação ela pertence.`
        : "Verificação do motor de confiança registrada.";
    case "answer.review":
      return meta.aprovada === false
        ? "O texto avaliado não foi aprovado na revisão de confiança."
        : meta.aprovada === true
          ? "O texto avaliado foi aprovado na revisão de confiança."
          : "Resultado da revisão registrado, sem confirmação de aprovação.";
    case "answer.low_confidence_handoff":
      return meta.candidato_descartado === true && meta.aviso_mensagem_id === mensagemId
        ? "O aviso já estava registrado pelo módulo de encaminhamento; o texto candidato foi descartado."
        : "Tratamento da baixa confiança registrado neste turno.";
    case "turn.delivery":
      return meta.estado === "persistida"
        ? "A mensagem foi gravada na conversa. Esse registro não comprova entrega pelo WhatsApp."
        : `Estado da entrega registrado: ${s(meta.estado) ?? "não informado"}.`;
    case "message.outbound":
      return meta.tamanho === 0
        ? "O gerador encerrou sem produzir outro texto. Este evento não é um envio ao paciente."
        : n(meta.tamanho) != null && Number(meta.tamanho) > 0
          ? "O gerador devolveu um texto para o fluxo de envio."
          : "Retorno do gerador registrado.";
    case "message.inbound":
      return "Processamento da entrada encerrado.";
    case "response.validate":
      return meta.alterada_apos_modelo === true
        ? "A finalização registrou uma alteração após a resposta do modelo."
        : "Finalização do texto concluída.";
    default:
      return "Conclusão registrada.";
  }
}

/** Eventos started/completed são fatos históricos da mesma chamada, não dois trabalhos. */
export function consolidarPassosDetalhes(
  eventos: RegistroDetalhes[],
  mensagemId: string | null,
): LeituraDetalhesMensagem["passos"] {
  const grupos = new Map<string, RegistroDetalhes[]>();
  for (const [i, e] of eventos.entries()) {
    if (e.node_id === "turn.summary") continue;
    const meta = o(e.metadata);
    if (
      e.node_id === "turn.delivery" &&
      mensagemId &&
      (meta.outgoing_message_id ?? e.message_id) !== mensagemId
    )
      continue;
    const inicio = s(e.started_at);
    const chave = JSON.stringify([
      e.trace_id ?? null,
      e.node_id,
      e.cycle_id ?? null,
      inicio ? instante(inicio) : `ausente-${i}`,
      meta.ferramenta ?? null,
    ]);
    grupos.set(chave, [...(grupos.get(chave) ?? []), e]);
  }
  return [...grupos.entries()]
    .map(([id, grupo]) => {
      const finais = grupo.filter((e) => e.event_type !== "started");
      const inicios = grupo.filter((e) => e.event_type === "started");
      const ambiguo = finais.length > 1 || inicios.length > 1;
      const e = finais[0] ?? inicios[0]!;
      const meta = o(e.metadata);
      const estado: LeituraDetalhesMensagem["passos"][number]["estado"] = ambiguo
        ? "nao_confirmado"
        : e.event_type === "failed" || e.status === "error"
          ? "falhou"
          : e.event_type === "skipped" || e.event_type === "cancelled"
            ? "ignorado"
            : e.event_type === "completed" && e.status === "ok"
              ? "concluido"
              : "nao_confirmado";
      const descricao = ambiguo
        ? "Há registros repetidos sem identificação suficiente para unir esta etapa."
        : !finais.length
          ? "Início registrado; o encerramento desta chamada não foi identificado."
          : e.event_type === "retry"
            ? "Nova tentativa registrada."
            : estado === "falhou"
              ? (s(meta.erro) ?? "Falha registrada nesta etapa.")
              : estado === "concluido"
                ? descreverConclusao(e.node_id, meta, mensagemId)
                : "Estado registrado sem confirmação de conclusão.";
      return {
        id,
        titulo:
          e.node_id === "tool.execute"
            ? `Ferramenta: ${s(meta.ferramenta) ?? "nome não registrado"}`
            : (NOMES_PASSOS[String(e.node_id)] ?? String(e.node_id ?? "Etapa sem nome")),
        descricao,
        estado,
        em: s(e.finished_at) ?? s(e.started_at),
        duracaoMs: n(e.duration_ms),
      };
    })
    .sort((a, b) => instante(a.em) - instante(b.em));
}

export function montarLeituraDetalhesMensagem(p: PacoteDetalhesMensagem): LeituraDetalhesMensagem {
  const alertas = [...(p.alertas ?? [])];
  const mensagem = p.mensagem;
  if (mensagem && mensagem.clinica_id !== p.clinicaId)
    throw new Error("Mensagem fora da clínica selecionada.");
  const mensagemId = s(mensagem?.id);
  const conversaId = s(mensagem?.conversa_id) ?? s(p.execucao?.conversation_id);
  const execucaoId = s(p.execucao?.id) ?? s(mensagem?.execucao_id);
  const resumos = p.eventos.filter((e) => e.node_id === "turn.summary");
  const resumo = resumos.length === 1 ? o(resumos[0]?.metadata) : {};
  if (resumos.length > 1)
    alertas.push("Há mais de um resumo; nenhum foi escolhido como resumo definitivo.");
  const doEscopo = (r: RegistroDetalhes) =>
    r.clinica_id === p.clinicaId &&
    (!conversaId ||
      !(r.conversa_id ?? r.conversation_id) ||
      (r.conversa_id ?? r.conversation_id) === conversaId);
  const avisos = p.avisos.filter((a) => doEscopo(a) && a.mensagem_id === mensagemId && mensagemId);
  const aviso = avisos.length === 1 ? avisos[0] : null;
  if (avisos.length > 1)
    alertas.push(
      "Mais de um aviso está ligado à mensagem; o protocolo não foi escolhido automaticamente.",
    );
  const vinculos = p.vinculos.filter(
    (v) => doEscopo(v) && v.outgoing_message_id === mensagemId && mensagemId,
  );
  const vinculo = [...vinculos].sort((a, b) => instante(b.created_at) - instante(a.created_at))[0];
  const avisoRegistrado = lista(resumo.avisos_operacionais).find(
    (a) => a.mensagemId === mensagemId && mensagemId,
  );
  const operacional = Boolean(aviso || avisoRegistrado);
  const ambiente =
    mensagem?.is_teste === true || mensagem?.canal === "test-console"
      ? "homologacao"
      : mensagem?.is_teste === false
        ? "producao"
        : resumo.ambiente === "homologacao" || resumo.ambiente === "producao"
          ? resumo.ambiente
          : "nao_registrado";
  const identidade = representacaoDaMensagem({
    tipo: s(mensagem?.tipo),
    texto: s(mensagem?.body),
    transcricao: s(mensagem?.transcricao),
  });
  const hashEntregue = identidade.conteudo == null ? null : hashDoTexto(identidade.conteudo);
  const representacaoVinculo = s(vinculo?.representacao) ?? "texto_completo";
  const vinculoEntrega =
    hashEntregue &&
    vinculo?.texto_hash === hashEntregue &&
    (identidade.representacao === "audio"
      ? ["audio_integral", "audio_resumo"].includes(representacaoVinculo)
      : representacaoVinculo === identidade.representacao)
      ? vinculo
      : null;
  const decisoes = p.decisoes.filter(
    (d) =>
      doEscopo(d) &&
      ((execucaoId && d.execucao_id === execucaoId) ||
        (mensagemId && d.outgoing_message_id === mensagemId) ||
        vinculos.some((v) => v.decisao_id === d.id)),
  );
  const candidatas = decisoes
    .filter((d) => d.avaliacao === "answer_confidence")
    .map((d) => ({
      clinicaId: s(d.clinica_id),
      conversaId: s(d.conversation_id),
      execucaoId: s(d.execucao_id),
      outgoingMessageId:
        s(d.outgoing_message_id) ??
        (vinculos.some((v) => v.decisao_id === d.id) ? mensagemId : null),
      representacao: s(d.representacao),
      textoHash: s(d.texto_final_hash),
      linha: d,
    }));
  const escolha = selecionarAvaliacaoDaSaida(candidatas, {
    clinicaId: p.clinicaId,
    conversaId,
    execucaoId,
    outgoingMessageId: mensagemId,
    representacao: identidade.representacao,
    textoHash: hashEntregue,
  });
  const finalId =
    mensagemId && !operacional && escolha.suficiente && escolha.conteudoConferido
      ? s(escolha.avaliacao?.linha.id)
      : null;
  const bloqueios = lista(resumo.bloqueios);
  const avaliacoes = decisoes.map((d, i) => {
    const final = Boolean(finalId && d.id === finalId);
    const bloqueada = bloqueios.some(
      (b) =>
        (b.decisaoId && b.decisaoId === d.id) ||
        (b.avaliacao === d.avaliacao &&
          b.textoAvaliadoHash &&
          b.textoAvaliadoHash === d.texto_final_hash),
    );
    return {
      id: s(d.id) ?? `avaliacao-${i}`,
      titulo:
        d.avaliacao === "action_safety"
          ? "Segurança da ação"
          : final
            ? "Confiança desta mensagem"
            : bloqueada
              ? "Confiança do texto bloqueado"
              : "Avaliação de outro texto do turno",
      nota: n(d.score),
      nivel: s(d.nivel),
      explicacao:
        d.avaliacao === "action_safety"
          ? "Esta nota avalia a segurança da ação, não o texto entregue."
          : final
            ? "O conteúdo desta mensagem confere com o conteúdo avaliado."
            : bloqueada
              ? "Esta avaliação motivou o bloqueio de outro texto. A nota não pertence ao aviso entregue."
              : "Não há vínculo de conteúdo comprovado entre esta nota e a mensagem selecionada.",
      motivos: motivosLegiveis(d),
    };
  });
  const originais = p.etapas
    .filter((e) => {
      const codigo = o(e.codigo);
      return (
        e.tipo === "resposta_original" &&
        codigo.funcao === "ninaAIGateway" &&
        typeof o(e.dados).texto === "string" &&
        Boolean(String(o(e.dados).texto).trim())
      );
    })
    .sort((a, b) => instante(a.em) - instante(b.em));
  const respostaOriginal = s(o(originais.at(-1)?.dados).texto);
  if (originais.length > 1)
    alertas.push(
      "Há mais de uma resposta textual do modelo neste turno. O painel mostra a última registrada no gateway; as anteriores permanecem nas evidências.",
    );
  if (!mensagem)
    alertas.push(
      "Mensagem não selecionada ou não localizada; nenhum texto interno foi apresentado como mensagem entregue.",
    );
  if (!p.execucao) alertas.push("Execução da Nina não vinculada a esta mensagem.");
  if (!respostaOriginal && p.execucao)
    alertas.push("Texto original do modelo não encontrado na captura do gateway.");
  if (hashEntregue && vinculo?.texto_hash && vinculo.texto_hash !== hashEntregue)
    alertas.push(
      "O hash do vínculo de entrega diverge da mensagem persistida; o conteúdo exibido vem da mensagem.",
    );
  if (operacional)
    alertas.push(
      "Aviso operacional do sistema: as notas dos textos bloqueados não se aplicam a esta mensagem.",
    );
  const interno = [...p.etapas].reverse().find((e) => e.tipo === "mensagem_final");
  if (interno && o(interno.dados).texto === "" && mensagem)
    alertas.push(
      "O retorno interno vazio encerrou o gerador. O texto registrado na conversa é o exibido acima.",
    );
  const status = s(mensagem?.status);
  const entrega: NonNullable<LeituraDetalhesMensagem["mensagem"]>["entrega"] =
    status === "failed"
      ? "falhou"
      : ambiente === "homologacao"
        ? "registrada"
        : status === "delivered" || status === "read"
          ? "confirmada"
          : vinculoEntrega?.estado === "falhou"
            ? "falhou"
            : vinculoEntrega?.estado === "confirmada"
              ? "confirmada"
              : vinculoEntrega?.estado === "enviada" || status === "sent"
                ? "enviada"
                : mensagem
                  ? "registrada"
                  : "nao_confirmada";
  const respostaBloqueada =
    bloqueios.length > 0 ||
    p.eventos.some(
      (e) =>
        e.node_id === "answer.low_confidence_handoff" &&
        o(e.metadata).candidato_descartado === true,
    );
  const bloqueioDescrito = respostaBloqueada ? "O motor bloqueou uma resposta candidata. " : "";
  const resultado = !mensagem
    ? "Não há mensagem selecionada para conferir a entrega."
    : entrega === "falhou"
      ? "Falha registrada na entrega desta mensagem."
      : operacional && ambiente === "homologacao"
        ? `${bloqueioDescrito}O sistema registrou um aviso de encaminhamento na homologação. Esse registro não comprova transferência real.`
        : operacional
          ? "Aviso operacional registrado na conversa."
          : "Mensagem localizada no histórico da conversa.";
  const passos = consolidarPassosDetalhes(p.eventos, mensagemId);
  const horarios = passos.map((passo) => passo.em).filter((em): em is string => em != null);
  if (new Set(horarios.map(instante)).size < horarios.length)
    alertas.push(
      "Algumas etapas têm o mesmo horário registrado; a ordem exata entre elas não foi comprovada.",
    );
  return {
    resultado,
    ambiente,
    mensagem: mensagemId
      ? {
          id: mensagemId,
          texto: typeof mensagem?.body === "string" ? mensagem.body : (identidade.conteudo ?? ""),
          registradaEm: s(mensagem?.created_at),
          canal: s(mensagem?.canal),
          entrega,
          origem: operacional
            ? "Aviso do sistema"
            : finalId
              ? "Resposta avaliada da Nina"
              : "Origem não comprovada pelo vínculo de conteúdo",
        }
      : null,
    entradas: p.entradas
      .filter((e) => doEscopo(e) && e.direction === "in")
      .map((e) => s(e.body) ?? s(e.transcricao))
      .filter((v): v is string => v != null),
    respostaOriginal,
    protocolo: s(aviso?.protocolo) ?? s(avisoRegistrado?.protocolo),
    modelo: s(p.execucao?.model),
    versaoPrompt: n(p.execucao?.prompt_versao) ?? s(p.execucao?.prompt_versao),
    rodadas: n(resumo.rodadas),
    duracaoMs: n(resumos.length === 1 ? resumos[0]?.duration_ms : null),
    avaliacoes,
    passos,
    alertas: [...new Set(alertas)],
  };
}
