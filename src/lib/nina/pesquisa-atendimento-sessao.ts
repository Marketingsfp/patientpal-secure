import { normalizarBuscaCatalogo } from "./catalogo-sem-registro";
import { conhecimentoDaMesmaSessao, consultaDoNovoTurno } from "./confidence/conhecimento-sessao";
import { prepararPesquisaMedicoDaSessao } from "./pesquisa-medico-sessao";

/** A correção usa o pedido real ou uma referência da mesma sessão, nunca sinônimos globais. */
export function prepararPesquisaAtendimentoDaSessao(
  ferramenta: string,
  args: string | undefined,
  contexto: {
    clinicaId: string;
    sessionId: string | null;
    conhecimento: unknown;
    mensagem: string;
    historico: ReadonlyArray<{ role: string; content: string | null }>;
  },
): string | undefined {
  const anterior = conhecimentoDaMesmaSessao(contexto.conhecimento, contexto.clinicaId, contexto.sessionId);
  const preparado = prepararPesquisaMedicoDaSessao(ferramenta, args, anterior, contexto);
  const campo = ferramenta === "consultar_base_conhecimento" ? "termo"
    : ["buscar_medicos", "proxima_vaga", "consultar_primeiro_disponivel", "consultar_disponibilidade", "verificar_horario"].includes(ferramenta)
      ? "especialidade" : null;
  if (!campo || !preparado) return preparado;
  try {
    const p = JSON.parse(preparado);
    if (!p || typeof p !== "object" || Array.isArray(p) || p.tipo_atendimento === "exame_procedimento") return preparado;
    const termo = normalizarBuscaCatalogo(typeof p[campo] === "string" ? p[campo] : "").trim();
    const canonico = /^(?:consulta(?: de| com)? )?clinico geral$/.test(termo);
    // Não elimina qualificadores ou transforma uma frase inteira em especialidade.
    const trocado = /^(?:consulta(?: de| com)? )?clinica (?:medica|geral)$/.test(termo);
    if (!canonico && !trocado) return preparado;
    const mensagem = normalizarBuscaCatalogo(contexto.mensagem);
    const negado = /\b(?:nao|nem|sem)\b[^.!?;\n]{0,60}\bclinico geral\b/.test(mensagem);
    const explicito = /\bclinico geral\b/.test(mensagem) && !negado;
    const nome = normalizarBuscaCatalogo(String(p.nome ?? p.medico ?? "")).trim();
    // Só uma resposta de continuidade (eventualmente com o nome escolhido)
    // pode herdar o atendimento; outra especialidade/unidade não pode.
    const semNome = nome.length >= 3 && mensagem.includes(nome)
      ? mensagem.replace(nome, " ").replace(/\b(?:dr|dra|doutor|doutora)\.?\s*/g, " ") : mensagem;
    const continuidade = consultaDoNovoTurno({ mensagem: semNome, anterior })?.continuidade === true;
    const herdado = !negado && p.nova_solicitacao !== true &&
      anterior?.consulta.tipo_atendimento === "consulta" && anterior.referencias.length > 0 &&
      /^(?:consulta(?: de| com)? )?clinico geral$/.test(normalizarBuscaCatalogo(anterior.consulta.termo)) && continuidade;
    if (!canonico && !explicito && !herdado) return preparado;
    return JSON.stringify({ ...p, [campo]: "Clínico Geral" });
  } catch {
    return preparado; // A validação de argumentos continua sendo do executor.
  }
}
