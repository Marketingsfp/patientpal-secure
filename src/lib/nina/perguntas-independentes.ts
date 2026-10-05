import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import { apresentarPerguntaEsclarecimento } from "./esclarecimento-apresentacao";
import type { ResultadoBroker } from "./tool-broker";
import type { ResultadoConhecimento } from "./knowledge-contract";
import { sugerirResultadoJev } from "./identificacao-catalogo";

const normal = (v: unknown) =>
  typeof v === "string"
    ? v
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    : "";
export function parametrosPesquisa(args: unknown): Record<string, unknown> {
  try {
    const p = typeof args === "string" ? JSON.parse(args) : args;
    return p && typeof p === "object" && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}
const consulta = (p: Record<string, unknown>) => ({
  termo: String(p.termo ?? p.especialidade ?? p.nome ?? ""),
  medico: String(p.medico ?? p.nome ?? ""),
});
const chave = (q: { termo: string; medico?: string }) => normal(q.termo) + "|" + normal(q.medico);
export const PESQUISAS_INDEPENDENTES = new Set([
  "consultar_cadastro",
  "buscar_medicos",
  "buscar_procedimentos",
  "listar_especialidades",
]);

/** Uma dúvida pertence à pergunta pesquisada, não ao conjunto da mensagem. */
export function criarPerguntasDoTurno(anterior: ConhecimentoSessao | null, mensagem = "") {
  const anteriores = anterior?.pendenciasIdentificacao?.length
    ? anterior.pendenciasIdentificacao
    : anterior
      ? [anterior]
      : [];
  const pendentes = new Map(
    anteriores.filter((p) => p.esclarecimento).map((p) => [chave(p.consulta), p]),
  );
  const pesquisas = new Set<string>();
  const confirmadas = new Set<string>();
  const identificadas = new Map<string, ConhecimentoSessao>();
  // Apenas pesquisas deste turno. Nunca contam como nova resposta do paciente.
  const aliases = new Map<string, string>();
  const consultas = new Map<string, ReturnType<typeof consulta>>();
  function grupo(p: Record<string, unknown>) {
    const q = consulta(p), k = chave(q);
    if (p.nova_solicitacao !== true && typeof p.reformula_de === "string") {
      const candidatos = [...consultas.entries()].filter(([, a]) =>
        normal(a.termo) === normal(p.reformula_de) && normal(a.medico) === normal(q.medico));
      const raizes = [...new Set(candidatos.map(([id]) => aliases.get(id) ?? id))];
      if (raizes.length === 1) return raizes[0]!;
    }
    return aliases.get(k) ?? k;
  }
  function referencia(args: unknown) {
    const p = parametrosPesquisa(args),
      q = consulta(p);
    const correcaoExplicita = pesquisas.size === 0 && anteriores.length === 1 &&
      /^nao[,\s]+(?:e |quis dizer )/.test(normal(mensagem));
    if (p.nova_solicitacao === true && !correcaoExplicita) return null;
    const exata = anteriores.find((a) => chave(a.consulta) === chave(q));
    if (exata) return exata;
    const mesmoAtendimento = anteriores.filter((a) => normal(a.consulta.termo) === normal(q.termo));
    if (mesmoAtendimento.length === 1) return mesmoAtendimento[0]!;
    if (anteriores.length !== 1 || pesquisas.size > 0) return null;
    const a = anteriores[0]!;
    // Outro par especialidade/profissional não é a resposta à dúvida anterior.
    if (
      q.medico &&
      a.consulta.medico &&
      normal(q.medico) !== normal(a.consulta.medico) &&
      normal(q.termo) !== normal(a.consulta.termo)
    )
      return null;
    return a;
  }
  return {
    referencia,
    prepararContinuidade(ferramenta: string, args: string | undefined): string | undefined {
      if (!["consultar_cadastro", "buscar_procedimentos"].includes(ferramenta)) return args;
      const p = parametrosPesquisa(args);
      if (p.nova_solicitacao === true) return args;
      const k = grupo(p), identificada = identificadas.get(k);
      if (!identificada || (p.tipo_atendimento && p.tipo_atendimento !== identificada.consulta.tipo_atendimento)) return args;
      // Só um registro identificado neste turno. Nunca unir exames por semelhança
      // nem reutilizar preço/preparo: a ferramenta relê o catálogo normalmente.
      if (identificada.referencias.length !== 1) return args;
      const nome = identificada.referencias[0]?.procedimento;
      if (!nome) return args;
      const id = chave(consulta(p));
      aliases.set(id, k);
      consultas.set(id, consulta(p));
      const preparado = { ...p, termo: nome,
        ...(identificada.consulta.tipo_atendimento ? { tipo_atendimento: identificada.consulta.tipo_atendimento } : {}) };
      aliases.set(chave(consulta(preparado)), k);
      return JSON.stringify(preparado);
    },
    reconciliar(args: unknown, resultado: ResultadoBroker): ResultadoBroker {
      if (!resultado.success || resultado.erro || !["searchKnowledgeBase", "listCatalog"].includes(resultado.capacidade ?? "")) return resultado;
      const p = parametrosPesquisa(args), k = grupo(p);
      const anteriorDoTurno = [...aliases.values()].includes(k) ? pendentes.get(k) : null;
      if (!anteriorDoTurno?.esclarecimento) return resultado;
      const dados = resultado.dados as ResultadoConhecimento | null;
      if (!dados || dados.knowledge_status === "conflict") return resultado;
      if (dados.esclarecimento && chave(consulta(p)) === k) return resultado;
      // Encontrar o título reformulado não comprova os qualificadores do pedido original.
      const hipotese = dados.esclarecimento || !Array.isArray(dados.records) ? dados : sugerirResultadoJev(dados);
      const esclarecimento = hipotese.esclarecimento ?? anteriorDoTurno.esclarecimento;
      const nomes = [...new Map(esclarecimento.opcoes.map(o =>
        [normal(o.nome).replace(/[^a-z0-9]/g, ""), o.nome])).values()];
      const pedido = anteriorDoTurno.consulta.termo;
      const referencia = anteriorDoTurno.consulta.tipo_atendimento === "exame_procedimento" ? "pedido médico" : "atendimento solicitado";
      const pergunta = nomes.length
        ? `Para o pedido “${pedido}”, pode conferir qual nome corresponde ao ${referencia}?\n${nomes.join("\n")}`
        : `Para o pedido “${pedido}”, pode conferir e escrever o nome completo do ${referencia}?`;
      return { ...resultado, dados: { ...hipotese, procedure: null, price: null,
        esclarecimento: { ...esclarecimento, pergunta },
        instrucao: "Reformulação do mesmo pedido, ainda sem correspondência confirmada. Esta pergunta substitui as anteriores deste pedido. Não informe preço nem presuma equivalência clínica." } };
    },
    registrar(
      args: unknown,
      atual: ConhecimentoSessao | null,
      origem: ConhecimentoSessao | null,
      confirmado: boolean,
    ) {
      const p = parametrosPesquisa(args), q = consulta(p), id = chave(q), k = grupo(p);
      const anteriorDoTurno = pendentes.get(k);
      aliases.set(id, k);
      consultas.set(id, q);
      pesquisas.add(id);
      if (origem) pendentes.delete(chave(origem.consulta));
      if (atual?.esclarecimento) {
        confirmadas.delete(k);
        identificadas.delete(k);
        pendentes.set(k, anteriorDoTurno ? { ...atual, consulta: anteriorDoTurno.consulta } : atual);
      }
      else {
        pendentes.delete(k);
        if (confirmado) confirmadas.add(k);
        if (confirmado && atual) identificadas.set(k, atual);
        else identificadas.delete(k);
      }
    },
    get pendentes() {
      return [...pendentes.values()];
    },
    get temConfirmadas() {
      return confirmadas.size > 0;
    },
    estado(atual: ConhecimentoSessao | null): ConhecimentoSessao | null {
      const lista = [...pendentes.values()];
      if (!lista.length) return atual;
      if (lista.length === 1) return { ...lista[0]!, pendenciasIdentificacao: undefined };
      // Um "sim" sem identificar a pergunta não confirma múltiplos candidatos.
      return {
        ...lista[0]!,
        pendenciasIdentificacao: lista.map((p) => ({ ...p, pendenciasIdentificacao: undefined })),
        esclarecimento: { tipo: "procedimento", opcoes: [], pergunta: perguntas(lista) },
      };
    },
  };
}
export function perguntas(lista: readonly ConhecimentoSessao[]): string {
  return lista
    .map((p) =>
      apresentarPerguntaEsclarecimento(p.esclarecimento!.pergunta, {
        tipo: p.esclarecimento!.tipo,
        tipoAtendimento: p.consulta.tipo_atendimento,
      }),
    )
    .join("\n\n");
}
export function comporRespostaParcial(
  textoConfirmado: string,
  lista: readonly ConhecimentoSessao[],
  apresentacao?: string | null,
): string {
  const texto = textoConfirmado.trim();
  const faltantes = [...new Set(lista.map((p) => perguntas([p])))]
    .filter((p) => !normal(texto).includes(normal(p)));
  return [!texto && apresentacao ? apresentacao : "", texto, ...faltantes]
    .filter(Boolean)
    .join("\n\n");
}
