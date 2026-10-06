import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import { apresentarPerguntaEsclarecimento } from "./esclarecimento-apresentacao";
import { ehRespostaAfirmativaCurta, normalizarRespostaInformal } from "./resposta-afirmativa";

export type ConfirmacaoIdentificacao = {
  anterior: ConhecimentoSessao;
  opcao: { id: string; nome: string };
};
const normal = (s: string) => normalizarRespostaInformal(s).replace(/[•*?]/g, "").replace(/\s+/g, " ").trim();

/** Separa apenas uma afirmação completa seguida de informação/pergunta adicional.
 * Não altera o reconhecedor de aceite de agenda e não aceita condições/correções. */
function trechoConfirmacao(mensagem: string): string | null {
  const partes = mensagem.trim().split(/([.!?\n]+|\s+(?:e|ah)\s+(?=(?:precisa|tem|tenho|qual|quanto|como|pode|posso)\b))/i);
  const inicio = partes[0]?.trim() ?? "";
  if (!inicio || partes[1]?.includes("?")) return null;
  const resto = normal(partes.slice(2).join(" "));
  if (resto && (!/^(?:e |ah )?(?:precisa|tem|tenho|qual|quanto|como|pode|posso|gostaria de saber|queria saber)\b/.test(resto) ||
    /\b(?:nao e|nao sao|nao confirmo|na verdade|troca|troque|outro exame|em vez|somente se|so se)\b/.test(resto))) return null;
  return normal(inicio);
}

/** Confirma referências apresentadas, nunca fatos antigos nem uma reserva. */
export function confirmarIdentificacoes(anterior: ConhecimentoSessao | null,
  contexto: { mensagem: string; historico: ReadonlyArray<{ role: string; content: string | null }> }): ConfirmacaoIdentificacao[] {
  if (!anterior) return [];
  const ultima = contexto.historico.at(-1);
  if (ultima?.role !== "assistant") return [];
  const texto = normal(ultima.content ?? ""), trecho = trechoConfirmacao(contexto.mensagem);
  if (!trecho) return [];
  const pendentes = anterior.pendenciasIdentificacao?.length ? anterior.pendenciasIdentificacao : [anterior];
  // O ordinal é a ordem apresentada ao paciente, não a ordem interna de um Map.
  const entregues = pendentes.map(p => {
    const e = p.esclarecimento;
    if (!e || p.clinicaId !== anterior.clinicaId || p.sessionId !== anterior.sessionId) return null;
    const formas = [e.pergunta, apresentarPerguntaEsclarecimento(e.pergunta,
      { tipo: e.tipo, tipoAtendimento: p.consulta.tipo_atendimento })].map(normal);
    const posicoes = formas.filter(Boolean).map(f => texto.indexOf(f)).filter(i => i >= 0);
    return posicoes.length ? { p, posicao: Math.min(...posicoes), formas } : null;
  }).filter((p): p is NonNullable<typeof p> => p !== null).sort((a, b) => a.posicao - b.posicao);
  // Um grupo parcialmente entregue não autoriza confirmar os itens ocultos.
  if (entregues.length !== pendentes.length) return [];
  const todos = /^(?:(?:sim|isso|confirmo|sao esses|sao esses mesmos) )?(?:os (?:2|dois)|ambos|todos)(?: mesmo| mesmos)?$/.test(trecho);
  let escolhidos = entregues;
  if (todos) {
    if (entregues.length < 2 || (/\b(?:2|dois|ambos)\b/.test(trecho) && entregues.length !== 2)) return [];
  } else if (entregues.length === 1 && ehRespostaAfirmativaCurta(trecho)) {
    if (!entregues[0]!.formas.some(f => texto.endsWith(f))) return [];
  } else {
    const ordinal = /^(?:(?:sim|isso|confirmo) )?(?:so |somente |apenas )?o (primeiro|segundo)$/.exec(trecho);
    if (ordinal) escolhidos = entregues.slice(ordinal[1] === "primeiro" ? 0 : 1, ordinal[1] === "primeiro" ? 1 : 2);
    else escolhidos = entregues.filter(({ p }) => {
      const nome = normal(p.esclarecimento?.opcoes[0]?.nome ?? "");
      return nome && [`confirmo ${nome}`, `sim ${nome}`, `isso ${nome}`, `so ${nome}`, `somente ${nome}`,
        `so o ${nome}`, `somente o ${nome}`, `${nome} sim`].includes(trecho);
    });
    if (escolhidos.length !== 1) return [];
  }
  const validas = escolhidos.flatMap(({ p }) => {
    const e = p.esclarecimento!;
    const opcao = e.opcoes[0];
    return e.tipo !== "profissional" && e.opcoes.length === 1 && opcao &&
      !/\b(?:nao|nem)\b/.test(normal(e.pergunta)) && p.referencias.some(r => r.registro === opcao.id)
      ? [{ anterior: p, opcao }] : [];
  });
  return validas.length === escolhidos.length ? validas : [];
}
