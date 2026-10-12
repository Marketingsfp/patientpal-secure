/**
 * Conversão em lote para atendimentos estruturados (Fase 3, 12/10/2026).
 *
 * Para cada item: já convertido, pronto para converter (com avisos) ou
 * precisa de revisão (bloqueios que perderiam dado, rascunho em revisão ou
 * resultado que não passa na validação). Itens publicados continuam
 * publicados e passam a ser lidos no formato novo; a cópia do formato antigo
 * fica guardada no próprio item para desfazer.
 *
 * Módulo puro: a leitura e a gravação ficam nas funções de servidor.
 */
import {
  profissionalSchema,
  servicoSchema,
  valorResumo,
  type ProfissionalCatalogo,
  type ServicoCatalogo,
} from "./catalogo";
import { converterParaEstruturado, copiaFormatoAntigo } from "./catalogo-atendimentos";
import {
  atendimentosDaEstrutura,
  formatarPrecoCatalogo,
  textoHorariosCatalogo,
} from "./catalogo-estrutura";
import { MODALIDADES_ATENDIMENTO } from "./modalidade-atendimento";

export type TipoConversao = "servico" | "profissional";
export const LIMITE_PAGINA_CONVERSAO = 500;
export const LIMITE_LOTE_CONVERSAO = 50;

export type ItemConversao = {
  tipo: TipoConversao;
  id: string;
  nome: string;
  status: string;
  /** updated_at lido na prévia; a gravação só acontece se não mudou. */
  versao: string;
  acao: "converter" | "revisar" | "convertido";
  motivo: string | null;
  avisos: string[];
  bloqueios: string[];
  /** Resumo legível de cada atendimento, para conferir item a item. */
  atendimentos: Array<{ nome: string; linhas: string[] }>;
};

type Registro = Record<string, unknown> & {
  id: string;
  nome: string;
  status: string;
  updated_at: string;
};

export function planejarConversao(
  tipo: TipoConversao,
  registro: Registro,
  agoraISO = new Date().toISOString(),
): { item: ItemConversao; dados?: ServicoCatalogo | ProfissionalCatalogo } {
  const item: ItemConversao = {
    tipo,
    id: registro.id,
    nome: registro.nome,
    status: registro.status,
    versao: registro.updated_at,
    acao: "converter",
    motivo: null,
    avisos: [],
    bloqueios: [],
    atendimentos: [],
  };
  if (atendimentosDaEstrutura(registro.estrutura)) return { item: { ...item, acao: "convertido" } };
  if (registro.rascunho != null)
    return {
      item: {
        ...item,
        acao: "revisar",
        motivo: "Tem alterações em revisão: publique ou descarte o rascunho antes de converter.",
      },
    };
  const conv = converterParaEstruturado(
    tipo,
    registro as Parameters<typeof converterParaEstruturado>[1],
  );
  item.bloqueios = conv.bloqueios;
  item.avisos = conv.pendencias.filter((p) => !conv.bloqueios.includes(p));
  item.atendimentos = conv.atendimentos.map((a) => ({
    nome: a.nome,
    linhas: [
      `Modalidade: ${a.modalidade ? MODALIDADES_ATENDIMENTO[a.modalidade] : "não informada"}`,
      ...a.precos.map(
        (p) =>
          `${p.forma}: ${formatarPrecoCatalogo(p.valor) ?? "valor não informado"}${p.condicao ? ` (${p.condicao})` : ""}`,
      ),
      ...(a.executantes.length
        ? a.executantes.map(
            (e) => `${e.nome}: ${textoHorariosCatalogo(e.horarios) ?? "sem horários"}`,
          )
        : [`Horários: ${textoHorariosCatalogo(a.horarios) ?? "não informados"}`]),
    ],
  }));
  if (conv.bloqueios.length)
    return { item: { ...item, acao: "revisar", motivo: "Há dados que não puderam ser lidos." } };
  const texto = tipo === "servico" ? "descricao_publica" : "observacao_publica";
  const entrada = {
    ...registro,
    [texto]: conv.descricao,
    estrutura: {
      ...((registro.estrutura as object | null) ?? {}),
      atendimentos: conv.atendimentos,
      formato_antigo: copiaFormatoAntigo(tipo, registro, agoraISO),
    },
  };
  const r = (tipo === "servico" ? servicoSchema : profissionalSchema).safeParse(entrada);
  if (!r.success)
    return {
      item: {
        ...item,
        acao: "revisar",
        motivo: `O resultado não passou na validação: ${r.error.issues.map((i) => i.message).join(" ")}`,
      },
    };
  const dados = r.data;
  if ("valor" in dados) dados.valor = valorResumo(dados);
  return { item, dados };
}
