import type { RegistroConhecimento, ResultadoConhecimento } from "./knowledge-contract";
import { itensDoPedidoLido } from "./multiplos-atendimentos";

export const REGRA_FOTO_PEDIDO_MEDICO = "PEDIDO MÉDICO: para consultas, exames e procedimentos identificados na base de conhecimento, siga pedido_medico_do_turno. O campo estruturado obrigatório exige solicitar a foto legível do pedido. Não informado não significa obrigatório; dispensado não exige foto. Primeiro esclareça a identificação quando houver dúvida. Quando a ação for solicitar_foto, responda as informações confirmadas sem outra pergunta final: o sistema acrescentará a solicitação da foto. Se ja_solicitado, não repita; se foto_recebida, não peça novamente a mesma foto. Foto recebida não significa pedido clinicamente válido ou aprovado; não interprete laudos, diagnósticos ou medicamentos. O Jev não pode dispensar essa exigência nem considerar 'sim' ou 'já enviei' como prova de recebimento. Esse campo não cria, por si só, bloqueio de consulta à agenda ou de agendamento.";

const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const espacos = (s: string) => s.replace(/\s+/g, " ").trim();
export type SolicitacaoPedidoMedico = { id: string; nome: string; acao: "solicitar_foto" | "ja_solicitado" | "foto_recebida"; pergunta: string };
type Mensagem = { conversa_id?: string | null; direction?: string; body?: string | null; transcricao?: string | null; tipo?: string | null; created_at?: string; status?: string | null; is_teste?: boolean | null };
type Contexto = { conversaId: string | null; inicioSessao: string | null; teste: boolean; mensagens: Mensagem[] };

export function avaliarPedidoMedico(resultado: Partial<ResultadoConhecimento>, ctx: Contexto): SolicitacaoPedidoMedico[] {
  if (resultado.fonte_consulta !== "base_conhecimento" || resultado.knowledge_status !== "found" || !resultado.found || resultado.esclarecimento) return [];
  const registros = resultado.records ?? [];
  const obrigatorio = (r: RegistroConhecimento) => (r.extras?.estrutura as { pedido_medico?: unknown } | undefined)?.pedido_medico === "obrigatorio";
  // Antes da escolha entre médicos/itens, uma exigência particular não vale para todos.
  if (!registros.length || registros.some(r => !obrigatorio(r)) || new Set(registros.map(r => normal(r.procedimento ?? ""))).size !== 1) return [];
  const inicio = Date.parse(ctx.inicioSessao ?? "");
  const historico = ctx.mensagens.filter(m => ctx.conversaId && m.conversa_id === ctx.conversaId &&
    Number.isFinite(inicio) && Date.parse(m.created_at ?? "") >= inicio && (ctx.teste ? m.is_teste === true : m.is_teste !== true) &&
    !["failed", "pending", "queued", "sending"].includes(m.status ?? ""));
  const r = registros[0]!;
  if (!r.id || !r.procedimento?.trim()) return [];
  const nome = r.procedimento.trim();
  const pergunta = `Para ${nome}, é necessário pedido médico. Pode enviar uma foto legível do pedido médico por aqui?`;
  const aliases = (r.extras?.estrutura as { aliases?: unknown } | undefined)?.aliases;
  const nomes = [nome, nome.replace(/^Consulta\s*[—–-]\s*/i, ""), ...(Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === "string") : [])].map(normal);
  const fotoRecebida = historico.some(m => {
    if (m.direction !== "in" || m.tipo !== "image") return false;
    // Só a transcrição gerada pela leitura da imagem, nunca uma alegação textual.
    return itensDoPedidoLido(m.transcricao ?? "").some(item => nomes.includes(normal(item)));
  });
  const jaSolicitado = historico.some(m => m.direction === "out" && ["sent", "delivered", "read"].includes(m.status ?? "") && espacos(m.body ?? "").includes(espacos(pergunta)));
  return [{ id: r.id, nome, pergunta, acao: fotoRecebida ? "foto_recebida" : jaSolicitado ? "ja_solicitado" : "solicitar_foto" }];
}

export function acrescentarSolicitacaoPedido(texto: string, solicitacoes: SolicitacaoPedidoMedico[]): string {
  const perguntas = [...new Set(solicitacoes.filter(s => s.acao === "solicitar_foto").map(s => s.pergunta))]
    .filter(p => !espacos(texto).includes(espacos(p)));
  return perguntas.length ? [texto.trim(), ...perguntas].filter(Boolean).join("\n\n") : texto;
}

/** Reavalia o mesmo item e descarta a seleção anterior quando a pesquisa muda de solicitação. */
export function atualizarSolicitacoesPedido(anteriores: SolicitacaoPedidoMedico[], resultado: Partial<ResultadoConhecimento>, ctx: Contexto, novaSolicitacao = false): SolicitacaoPedidoMedico[] {
  const ids = new Set((resultado.records ?? []).map(r => r.id));
  const manter = novaSolicitacao ? [] : anteriores.filter(p => !ids.has(p.id));
  return [...manter, ...avaliarPedidoMedico(resultado, ctx)];
}
