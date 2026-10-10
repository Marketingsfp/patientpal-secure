import type { RegistroConhecimento, ResultadoConhecimento } from "./knowledge-contract";
import { itensDoPedidoLido } from "./multiplos-atendimentos";
import { modalidadeEstruturada, type AtendimentoPublicado } from "./catalogo-estrutura";
import { interpretarModalidade } from "./modalidade-atendimento";

export { REGRA_FOTO_PEDIDO_MEDICO } from "./prompt/pedido-medico";

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const espacos = (s: string) => s.replace(/\s+/g, " ").trim();
export type SolicitacaoPedidoMedico = {
  id: string;
  nome: string;
  acao: "solicitar_foto" | "ja_solicitado" | "foto_recebida";
  pergunta: string;
  bloqueia_agenda: boolean;
};
type Mensagem = {
  conversa_id?: string | null;
  direction?: string;
  body?: string | null;
  transcricao?: string | null;
  tipo?: string | null;
  created_at?: string;
  status?: string | null;
  is_teste?: boolean | null;
};
export type ContextoPedidoMedico = {
  conversaId: string | null;
  inicioSessao: string | null;
  teste: boolean;
  mensagens: Mensagem[];
  bloquearAgenda?: boolean;
};

export function avaliarPedidoMedico(
  resultado: Partial<ResultadoConhecimento>,
  ctx: ContextoPedidoMedico,
): SolicitacaoPedidoMedico[] {
  if (
    resultado.fonte_consulta !== "base_conhecimento" ||
    resultado.knowledge_status !== "found" ||
    !resultado.found ||
    resultado.esclarecimento
  )
    return [];
  const registros = resultado.records ?? [];
  const obrigatorio = (r: RegistroConhecimento) =>
    (r.extras?.estrutura as { pedido_medico?: unknown } | undefined)?.pedido_medico ===
    "obrigatorio";
  // Antes da escolha entre médicos/itens, uma exigência particular não vale para todos.
  if (
    !registros.length ||
    registros.some((r) => !obrigatorio(r)) ||
    new Set(registros.map((r) => normal(r.procedimento ?? ""))).size !== 1
  )
    return [];
  const inicio = Date.parse(ctx.inicioSessao ?? "");
  const historico = ctx.mensagens.filter(
    (m) =>
      ctx.conversaId &&
      m.conversa_id === ctx.conversaId &&
      Number.isFinite(inicio) &&
      Date.parse(m.created_at ?? "") >= inicio &&
      (ctx.teste ? m.is_teste === true : m.is_teste !== true) &&
      !["failed", "pending", "queued", "sending"].includes(m.status ?? ""),
  );
  const r = registros[0]!;
  if (!r.id || !r.procedimento?.trim()) return [];
  const nome = r.procedimento.trim();
  const pergunta = `Para ${nome}, é necessário pedido médico. Pode enviar uma foto legível do pedido médico por aqui?`;
  const aliases = (r.extras?.estrutura as { aliases?: unknown } | undefined)?.aliases;
  const nomes = [
    nome,
    nome.replace(/^Consulta\s*[—–-]\s*/i, ""),
    ...(Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === "string") : []),
  ].map(normal);
  const fotoRecebida = historico.some((m) => {
    if (m.direction !== "in" || m.tipo !== "image") return false;
    // Só a transcrição gerada pela leitura da imagem, nunca uma alegação textual.
    return itensDoPedidoLido(m.transcricao ?? "").some((item) => nomes.includes(normal(item)));
  });
  const jaSolicitado = historico.some(
    (m) =>
      m.direction === "out" &&
      ["sent", "delivered", "read"].includes(m.status ?? "") &&
      espacos(m.body ?? "").includes(espacos(pergunta)),
  );
  const publicados = r.extras?.atendimentos_publicados;
  const modalidade =
    Array.isArray(publicados) && publicados.length
      ? modalidadeEstruturada(null, null, "", null, publicados as AtendimentoPublicado[])
      : interpretarModalidade(String(r.extras?.modalidade_atendimento ?? ""));
  return [
    {
      id: r.id,
      nome,
      pergunta,
      acao: fotoRecebida ? "foto_recebida" : jaSolicitado ? "ja_solicitado" : "solicitar_foto",
      bloqueia_agenda:
        ctx.bloquearAgenda === true &&
        !fotoRecebida &&
        r.tipo === "servico" &&
        (modalidade === "hora_marcada" || modalidade === "chegada_com_pre_agendamento"),
    },
  ];
}

export function acrescentarSolicitacaoPedido(
  texto: string,
  solicitacoes: SolicitacaoPedidoMedico[],
): string {
  const perguntas = [
    ...new Set(solicitacoes.filter((s) => s.acao === "solicitar_foto").map((s) => s.pergunta)),
  ].filter((p) => !espacos(texto).includes(espacos(p)));
  return perguntas.length ? [texto.trim(), ...perguntas].filter(Boolean).join("\n\n") : texto;
}

/** Reavalia o mesmo item e descarta a seleção anterior quando a pesquisa muda de solicitação. */
export function atualizarSolicitacoesPedido(
  anteriores: SolicitacaoPedidoMedico[],
  resultado: Partial<ResultadoConhecimento>,
  ctx: ContextoPedidoMedico,
  novaSolicitacao = false,
): SolicitacaoPedidoMedico[] {
  const ids = new Set((resultado.records ?? []).map((r) => r.id));
  const manter = novaSolicitacao ? [] : anteriores.filter((p) => !ids.has(p.id));
  return [...manter, ...avaliarPedidoMedico(resultado, ctx)];
}
