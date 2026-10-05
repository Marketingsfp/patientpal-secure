import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import { apresentarPerguntaEsclarecimento } from "./esclarecimento-apresentacao";

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
    registrar(
      args: unknown,
      atual: ConhecimentoSessao | null,
      origem: ConhecimentoSessao | null,
      confirmado: boolean,
    ) {
      const k = chave(consulta(parametrosPesquisa(args)));
      pesquisas.add(k);
      if (origem) pendentes.delete(chave(origem.consulta));
      if (atual?.esclarecimento) pendentes.set(k, atual);
      else {
        pendentes.delete(k);
        if (confirmado) confirmadas.add(k);
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
  const faltantes = lista
    .map((p) => perguntas([p]))
    .filter((p) => !normal(texto).includes(normal(p)));
  return [!texto && apresentacao ? apresentacao : "", texto, ...faltantes]
    .filter(Boolean)
    .join("\n\n");
}
