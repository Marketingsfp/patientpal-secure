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
  if (!perguntas.length) return texto;
  // A frase do sistema já diz que o pedido é necessário e pede a foto: o pedido
  // escrito pela IA com outras palavras sai, para não cobrar duas vezes
  // (homologação 14/10/2026, ciclos 1174–1199).
  const semPedidoDaIa = removerPedidoDeFoto(texto);
  return [semPedidoDaIa.trim() || texto.trim(), ...perguntas].filter(Boolean).join("\n\n");
}

/** Marca temporária do ponto de "Dra." e afins, que não termina a frase. */
const PONTO_ABREVIACAO = String.fromCharCode(30);

/**
 * Tira as frases que pedem a foto do pedido médico ou só repetem que ele é
 * obrigatório/necessário. Frases com outra informação (valores, horários,
 * profissionais) ficam.
 */
export function removerPedidoDeFoto(texto: string): string {
  const pedeFoto = /\b(?:foto|imagem)\b.*\bpedido\b|\bpedido\b.*\b(?:foto|imagem)\b/;
  const soExigencia =
    /^(?:para (?:realizar|a realizacao|fazer)?\s*(?:d[eao]s?\s+)?[a-z0-9 /()-]{0,60},?\s*)?(?:e |o |a )?(?:apresentacao (?:do|de) )?pedido medico (?:e |sera )?(?:obrigatori[oa]|necessari[oa])(?: para [a-z0-9 /()-]{0,60})?$|^(?:para [a-z0-9 /()-]{0,60},?\s*)?e (?:obrigatori[oa]|necessari[oa]) (?:apresentar )?(?:o )?pedido medico(?: para [a-z0-9 /()-]{0,60})?$|^requisito:?$/;
  const linhas = texto
    .replace(/\b(?:dra?|sra?|profa?)\./gi, (m) => m.slice(0, -1) + PONTO_ABREVIACAO)
    .split("\n")
    .map((linha) => {
      const frases = linha.match(/[^.!?]+[.!?]*/g) ?? [];
      const restantes = frases.filter((f) => {
        const t = normal(f.split(PONTO_ABREVIACAO).join("."));
        return t && !pedeFoto.test(t) && !soExigencia.test(t);
      });
      if (!restantes.length && linha.trim()) return null;
      return restantes.join("").trim();
    })
    .filter((l): l is string => l !== null);
  return linhas
    .join("\n")
    .split(PONTO_ABREVIACAO)
    .join(".")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

/**
 * Regra da clínica (15/10/2026): o pedido médico pode mudar valores e condições
 * do exame ou procedimento, então precisa chegar no atendimento. A Nina pede a
 * foto duas vezes; sem a foto depois do segundo pedido, a conversa vai direto
 * para a equipe (qualquer que seja o motivo: não tem, depois, original…).
 */
export const MOTIVO_PEDIDO_NAO_ENVIADO = "PEDIDO_MEDICO_NAO_ENVIADO";

export type PedidoMedicoPendente = { nome: string; vezes: number; pergunta: string };

/**
 * Decisão da clínica (15/10/2026, "foto primeiro"): enquanto a foto do pedido
 * estiver pendente (pedida neste turno, já pedida uma vez ou exigida pelo item
 * consultado), a transferência espera e nome e data não são pedidos. Depois do
 * segundo pedido sem foto, quem decide é PEDIDO_MEDICO_NAO_ENVIADO.
 */
export function fotoPendenteNoTurno(
  pendente: PedidoMedicoPendente | null,
  solicitacoes: readonly SolicitacaoPedidoMedico[],
): boolean {
  if (pendente && pendente.vezes >= 2) return false;
  return (
    Boolean(pendente) ||
    solicitacoes.some((s) => s.acao === "solicitar_foto" || s.acao === "ja_solicitado")
  );
}

export const INSTRUCAO_FOTO_ANTES_DOS_DADOS =
  "A foto do pedido médico ainda não chegou e vem antes de qualquer encaminhamento. Responda somente as dúvidas do paciente com o que o cadastro traz (débito e crédito à vista têm o valor de Pix/cartão). Não peça nome nem data de nascimento, não diga que vai encaminhar ou transferir e não peça a foto: o sistema pede a foto do pedido médico logo depois da sua resposta.";

const SOLICITACAO_DO_SISTEMA =
  /Para (.+?), é necessário pedido médico\.\s+Pode enviar uma foto legível do pedido médico por aqui\?/;

/**
 * Foto do pedido pedida pelo sistema nesta sessão e ainda não recebida (nenhuma
 * imagem do paciente depois do último pedido). `vezes` conta os pedidos feitos.
 */
export function pedidoMedicoPendente(
  mensagens: readonly Mensagem[],
  ctx: { conversaId: string | null; inicioSessao: string | null; teste: boolean },
): PedidoMedicoPendente | null {
  const inicio = Date.parse(ctx.inicioSessao ?? "");
  const lista = mensagens
    .filter(
      (m) =>
        ctx.conversaId &&
        m.conversa_id === ctx.conversaId &&
        (!Number.isFinite(inicio) || Date.parse(m.created_at ?? "") >= inicio) &&
        (ctx.teste ? m.is_teste === true : m.is_teste !== true),
    )
    .sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""));
  let ultimo: { nome: string; pergunta: string; pos: number } | null = null;
  let vezes = 0;
  lista.forEach((m, pos) => {
    if (m.direction === "in") return;
    const achado = SOLICITACAO_DO_SISTEMA.exec(m.body ?? "");
    if (!achado) return;
    vezes += 1;
    const nome = achado[1]!.trim();
    ultimo = {
      nome,
      pergunta: `Para ${nome}, é necessário pedido médico. Pode enviar uma foto legível do pedido médico por aqui?`,
      pos,
    };
  });
  if (!ultimo) return null;
  const { nome, pergunta, pos } = ultimo as { nome: string; pergunta: string; pos: number };
  const imagemDepois = lista
    .slice(pos + 1)
    .some((m) => m.direction === "in" && (m.tipo === "image" || m.tipo === "document"));
  return imagemDepois ? null : { nome, vezes, pergunta };
}
