/**
 * Jev — Fase 3: quando a busca normal do catálogo não encontra nada, o Jev
 * escolhe a especialidade/serviço PUBLICADO que o paciente quis dizer, ou
 * "nenhuma". Puro (sem rede), testável. Produção e homologação (flag
 * nina_jev_fase3).
 *
 * 25/09/2026: as opções seguem o mesmo recorte da busca normal — consulta
 * procura só nas especialidades dos profissionais; exame/procedimento só nos
 * serviços; sem tipo definido, nos dois. O Jev recebe também a mensagem do
 * paciente e o tipo de atendimento.
 */
import type { PerguntaJev, RespostaJev } from "./jev";
import type { TipoAtendimentoCatalogo } from "./catalogo-pesquisa";

export const CONFIANCA_MINIMA_ESPECIALIDADE = 0.8;
export const NENHUMA = "nenhuma";
const LIMITE_OPCOES = 400;

const chaveNome = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

/** Nomes publicados do tipo pedido, sem repetir (ignora acento e caixa). */
export function opcoesCatalogo(
  servicos: { nome?: unknown }[],
  profissionais: { especialidades?: unknown }[],
  tipo: TipoAtendimentoCatalogo | null | undefined = "nao_identificado",
): string[] {
  const nomes = new Map<string, string>();
  const add = (n: unknown) => {
    const t = String(n ?? "").trim();
    if (t && !nomes.has(chaveNome(t))) nomes.set(chaveNome(t), t);
  };
  if (tipo !== "exame_procedimento")
    for (const p of profissionais)
      if (Array.isArray(p.especialidades)) for (const e of p.especialidades) add((e as { nome?: unknown })?.nome ?? e);
  if (tipo !== "consulta") for (const s of servicos) add(s.nome);
  return [...nomes.values()].slice(0, LIMITE_OPCOES);
}

/** Estado enviado ao Jev: tudo o que a pergunta cita existe aqui. */
export function estadoEspecialidade(
  pedido: string,
  mensagemAtual: string | null | undefined,
  tipo: TipoAtendimentoCatalogo | null | undefined,
) {
  return {
    pedido,
    mensagem_atual: mensagemAtual?.trim() || pedido,
    tipo_atendimento: tipo ?? "nao_identificado",
  };
}

export function perguntaEspecialidade(opcoes: string[]): Record<string, PerguntaJev> {
  const criteria: Record<string, unknown> = {};
  for (const o of opcoes) criteria[o] = `O paciente procura "${o}".`;
  criteria[NENHUMA] = "Nenhuma opção da lista corresponde ao que o paciente procura.";
  return {
    especialidade: {
      type: "choice",
      instructions:
        "Qual especialidade, exame ou serviço publicado da clínica corresponde ao que o paciente procura em `pedido`? Use `mensagem_atual` (o que o paciente escreveu) e `tipo_atendimento` (consulta ou exame/procedimento) como contexto. Leigos usam nomes populares (ex.: dentista = odontologia, médico do pulmão = pneumologia). Se nada da lista corresponder, responda nenhuma.",
      criteria,
    },
  };
}

/** Nome escolhido, ou null (nenhuma, confiança baixa, fora da lista). */
export function especialidadeAplicavel(r: RespostaJev | undefined, opcoes: string[]): string | null {
  if (!r?.choice || r.choice === NENHUMA) return null;
  if (typeof r.confidence !== "number" || r.confidence < CONFIANCA_MINIMA_ESPECIALIDADE) return null;
  return opcoes.includes(r.choice) ? r.choice : null;
}
