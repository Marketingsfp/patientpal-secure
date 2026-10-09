import { ehSaudacaoPura } from "./confidence/turno-tipo";
import { conhecimentoDaMesmaSessao } from "./confidence/conhecimento-sessao";
import { apresentarPerguntaEsclarecimento } from "./esclarecimento-apresentacao";
import { autorDaMensagem, type MensagemHistoricoJev } from "./jev-contexto";

export type ProvaEsclarecimento = { mensagemId: string; entradaAnteriorId: string };
type Mensagem = MensagemHistoricoJev & {
  status?: string | null;
  enviada_por?: string | null;
  is_teste?: boolean | null;
};
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Prova de entrega entre entradas distintas, na mesma conversa, ciclo e ambiente.
 * Histórico incompleto ou pergunta livre sem evidência suficiente não autoriza handoff. */
export function esclarecerFoiEntregue(
  mensagens: readonly Mensagem[],
  ctx: {
    clinicaId: string;
    conversaId: string | null;
    sessionId: string | null;
    desde: string | null;
    teste: boolean;
    entradasAtuais: readonly string[];
    entradasAnteriores: readonly string[];
    conhecimento: unknown;
  },
): ProvaEsclarecimento | null {
  const desde = Date.parse(ctx.desde ?? "");
  if (
    !ctx.conversaId ||
    !ctx.sessionId ||
    !Number.isFinite(desde) ||
    !ctx.entradasAtuais.length ||
    !ctx.entradasAnteriores.length ||
    ctx.entradasAtuais.some((id) => ctx.entradasAnteriores.includes(id))
  )
    return null;
  const linhas = mensagens.filter(
    (m) =>
      m.id &&
      m.conversa_id === ctx.conversaId &&
      m.is_teste === ctx.teste &&
      Number.isFinite(Date.parse(m.created_at ?? "")) &&
      Date.parse(m.created_at!) >= desde,
  );
  const atuais = linhas.filter(
    (m) => ctx.entradasAtuais.includes(m.id!) && autorDaMensagem(m.direction) === "paciente",
  );
  if (atuais.length !== new Set(ctx.entradasAtuais).size) return null;
  const inicioAtual = Math.min(...atuais.map((m) => Date.parse(m.created_at!)));
  const antes = linhas
    .filter((m) => Date.parse(m.created_at!) < inicioAtual)
    .sort((a, b) => Date.parse(a.created_at!) - Date.parse(b.created_at!));
  const entrada = antes.filter((m) => autorDaMensagem(m.direction) === "paciente").at(-1);
  if (
    !entrada ||
    !ctx.entradasAnteriores.includes(entrada.id!) ||
    ehSaudacaoPura(entrada.transcricao ?? entrada.body ?? "")
  )
    return null;
  const ultima = antes
    .filter(
      (m) =>
        autorDaMensagem(m.direction) === "atendente" &&
        ["sent", "delivered", "read"].includes(m.status ?? ""),
    )
    .at(-1);
  if (
    !ultima ||
    ultima.enviada_por !== "nina" ||
    Date.parse(ultima.created_at!) <= Date.parse(entrada.created_at!)
  )
    return null;
  const texto = normal(ultima.transcricao ?? ultima.body ?? "");
  const conhecimento = conhecimentoDaMesmaSessao(ctx.conhecimento, ctx.clinicaId, ctx.sessionId);
  const pendentes = conhecimento?.pendenciasIdentificacao?.length
    ? conhecimento.pendenciasIdentificacao
    : conhecimento
      ? [conhecimento]
      : [];
  const perguntaCatalogo = pendentes.some(
    (p) =>
      p.esclarecimento &&
      [
        p.esclarecimento.pergunta,
        apresentarPerguntaEsclarecimento(p.esclarecimento.pergunta, {
          tipo: p.esclarecimento.tipo,
          tipoAtendimento: p.consulta.tipo_atendimento,
        }),
      ].some((pergunta) => pergunta.trim().length > 10 && texto.includes(normal(pergunta))),
  );
  // Convites explícitos para reformular o pedido. Coleta de cadastro/agenda não serve.
  const perguntaLivre =
    /(?:pode|poderia|consegue) (?:me )?(?:explicar (?:melhor|de outra forma)|repetir (?:o pedido|o nome|o que)|(?:escrever|informar|dizer) (?:novamente )?(?:o nome (?:do exame|da consulta|do procedimento)|qual exame|qual procedimento))[^?]*\?/.test(
      texto,
    );
  return perguntaCatalogo || perguntaLivre
    ? { mensagemId: ultima.id!, entradaAnteriorId: entrada.id! }
    : null;
}
