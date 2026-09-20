import { normalizarBuscaCatalogo } from "./catalogo-sem-registro";

export const OBJETIVOS_PESQUISA_CATALOGO = [
  "informacoes_gerais",
  "valor",
  "horarios",
  "medicos",
  "agendamento",
  "preparo",
  "condicoes",
] as const;

export const PESQUISA_NAO_INTERPRETADA = "CATALOGO_QUERY_NAO_INTERPRETADA";

/** Valida o formato da pesquisa; a interpretação semântica continua com o modelo. */
export function recusarFraseComoPesquisa(nome: string, args: unknown) {
  const campos =
    nome === "consultar_base_conhecimento" || nome === "buscar_procedimentos"
      ? ["termo"]
      : nome === "buscar_medicos"
        ? ["nome", "especialidade"]
        : [];
  if (!campos.length) return null;
  let parametros: Record<string, unknown>;
  try {
    const parsed: unknown = typeof args === "string" ? JSON.parse(args) : args;
    if (!parsed || typeof parsed !== "object") return null;
    parametros = parsed as Record<string, unknown>;
  } catch {
    return null;
  } // Argumentos malformados seguem a validação do executor.
  const frase = campos.some((campo) => {
    if (typeof parametros[campo] !== "string") return false;
    const termo = normalizarBuscaCatalogo(parametros[campo]).trim();
    // Não extrai palavras nem elimina qualificadores: pede ao modelo que
    // reformule, sem consultar o banco e sem interpretar isso como ausência.
    return (
      /\b(?:bom dia|boa tarde|boa noite|ola|gostaria|queria|quero|preciso|voces|estou|tenho|poderia|por favor|nos proximos dias)\b/.test(
        termo,
      ) || /^(?:qual|quais|quanto|como|quando|tem|ha|pode)\b/.test(termo)
    );
  });
  if (!frase) return null;
  return {
    ok: false as const,
    erro: "VALIDATION_ERROR",
    codigo: PESQUISA_NAO_INTERPRETADA,
    consulta_executada: false,
    mensagem:
      "A consulta não foi executada: o campo de busca contém uma frase conversacional. Analise a mensagem completa e separe o nome da consulta/procedimento dos objetivos (informações gerais, valor, horários, médicos, agendamento, preparo ou condições). Pesquise somente o atendimento com seus qualificadores. Não descarte órgão, infantil/adulto ou com/sem contraste. Isso não é ausência na base e não autoriza encaminhamento; reformule a chamada sem pedir ao paciente para repetir um pedido claro.",
  };
}
