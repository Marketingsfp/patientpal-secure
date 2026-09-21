import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import { normalizarBuscaCatalogo, termosItemCatalogo } from "./catalogo-sem-registro";

/** Corrige apenas a separação já explícita de consulta e nome do profissional.
 * A referência serve à nova leitura, nunca prova que o médico existe. */
export function prepararPesquisaMedicoDaSessao(
  ferramenta: string, args: string | undefined, anterior: ConhecimentoSessao | null,
): string | undefined {
  if (!["consultar_base_conhecimento", "buscar_medicos"].includes(ferramenta) || !args) return args;
  try {
    const p = JSON.parse(args);
    if (!p || typeof p !== "object" || Array.isArray(p)) return args;
    const medico = ferramenta === "buscar_medicos" ? p.nome : p.medico;
    if (typeof medico !== "string" || !medico.trim()) return args;
    const campo = ferramenta === "buscar_medicos" ? "especialidade" : "termo";
    const termo = typeof p[campo] === "string" ? p[campo] : "";
    if (anterior?.consulta.tipo_atendimento !== "consulta" || !anterior.referencias.length ||
      p.nova_solicitacao === true || p.tipo_atendimento === "exame_procedimento") return args;
    if (!termosItemCatalogo(termo).length || normalizarBuscaCatalogo(termo) === normalizarBuscaCatalogo(medico)) {
      return JSON.stringify({ ...p, [campo]: anterior.esclarecimento?.atendimento ?? anterior.consulta.termo,
        ...(ferramenta === "consultar_base_conhecimento" ? { tipo_atendimento: "consulta" } : {}) });
    }
  } catch { /* Argumentos inválidos continuam para a validação existente. */ }
  return args;
}
