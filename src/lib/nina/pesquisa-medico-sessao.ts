import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import { normalizarBuscaCatalogo, termosItemCatalogo } from "./catalogo-sem-registro";
import { ehRespostaAfirmativaCurta, normalizarRespostaInformal } from "./resposta-afirmativa";

type ContextoResposta = {
  mensagem: string;
  historico: ReadonlyArray<{ role: string; content: string | null }>;
};

/** A opção salva é somente referência. O ID ainda será revalidado na publicação. */
export function confirmarProfissionalDaPergunta(
  anterior: ConhecimentoSessao | null,
  contexto?: ContextoResposta,
) {
  const pendente = anterior?.esclarecimento;
  if (
    !contexto ||
    !anterior ||
    pendente?.tipo !== "profissional" ||
    pendente.opcoes.length !== 1 ||
    /\b(?:nao|nem)\b/.test(normalizarRespostaInformal(pendente.pergunta)) ||
    !ehRespostaAfirmativaCurta(contexto.mensagem)
  )
    return null;
  const ultima = contexto.historico.at(-1);
  const comparar = (t: string) =>
    normalizarBuscaCatalogo(t).replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (
    ultima?.role !== "assistant" ||
    !pendente.pergunta.trim() ||
    !comparar(ultima.content ?? "").endsWith(comparar(pendente.pergunta))
  )
    return null;
  const opcao = pendente.opcoes[0]!;
  if (!anterior.referencias.some((r) => r.registro === opcao.id)) return null;
  return {
    registro: opcao.id,
    nome: opcao.nome,
    termo: pendente.atendimento ?? anterior.consulta.termo,
    pergunta: pendente.pergunta,
  };
}

/** Corrige apenas a separação já explícita de consulta e nome do profissional.
 * A referência serve à nova leitura, nunca prova que o médico existe. */
export function prepararPesquisaMedicoDaSessao(
  ferramenta: string,
  args: string | undefined,
  anterior: ConhecimentoSessao | null,
  contexto?: ContextoResposta,
): string | undefined {
  if (!["consultar_base_conhecimento", "buscar_medicos"].includes(ferramenta) || !args) return args;
  try {
    const p = JSON.parse(args);
    if (!p || typeof p !== "object" || Array.isArray(p)) return args;
    const confirmada = confirmarProfissionalDaPergunta(anterior, contexto);
    if (confirmada)
      return JSON.stringify({
        ...p,
        ...(ferramenta === "buscar_medicos"
          ? { especialidade: confirmada.termo, nome: confirmada.registro }
          : {
              termo: confirmada.termo,
              medico: confirmada.registro,
              tipo_atendimento: "consulta",
              nova_solicitacao: false,
            }),
      });
    const medico = ferramenta === "buscar_medicos" ? p.nome : p.medico;
    if (typeof medico !== "string" || !medico.trim()) return args;
    const campo = ferramenta === "buscar_medicos" ? "especialidade" : "termo";
    const termo = typeof p[campo] === "string" ? p[campo] : "";
    if (
      anterior?.consulta.tipo_atendimento !== "consulta" ||
      !anterior.referencias.length ||
      p.nova_solicitacao === true ||
      p.tipo_atendimento === "exame_procedimento"
    )
      return args;
    if (
      !termosItemCatalogo(termo).length ||
      normalizarBuscaCatalogo(termo) === normalizarBuscaCatalogo(medico)
    ) {
      return JSON.stringify({
        ...p,
        [campo]: anterior.esclarecimento?.atendimento ?? anterior.consulta.termo,
        ...(ferramenta === "consultar_base_conhecimento" ? { tipo_atendimento: "consulta" } : {}),
      });
    }
  } catch {
    /* Argumentos inválidos continuam para a validação existente. */
  }
  return args;
}
