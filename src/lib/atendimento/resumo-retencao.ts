import { normalizarResumo, type ResumoHandoff } from "./handoff-resumo";
import { ajustarResumoPorDesfecho, type DesfechoConversa } from "./resumo-desfecho";
import { acaoConcluida, acoesSolicitadas } from "./resumo-atividades";

export const RETENCAO_RESUMO_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResumoRetido {
  id: string;
  versao: number;
  handoff_em: string;
  atendimento_inicio: string;
  status: "gerando" | "ok" | "erro";
  payload: ResumoHandoff | null;
  erro: string | null;
  situacao: string;
  desfecho: string | null;
  updated_at: string;
}

export interface AtendimentoAnterior {
  id: string;
  data: string;
  expira_em: string;
  acoes: string[];
}

export interface PainelResumo {
  atual: ResumoRetido | null;
  anteriores: AtendimentoAnterior[];
}

export function resumoNoPrazo(data: string, agora = Date.now()): boolean {
  const instante = Date.parse(data);
  return Number.isFinite(instante) && instante <= agora && instante + RETENCAO_RESUMO_MS > agora;
}

/** Histórico nunca alimenta os campos operacionais do último atendimento. */
export function montarPainelResumo(
  linhas: ResumoRetido[],
  inicioAtual: string,
  encerrada: boolean,
  agora = Date.now(),
): PainelResumo {
  const recentes = linhas
    .filter((r) => resumoNoPrazo(r.handoff_em, agora))
    .sort((a, b) => Date.parse(b.handoff_em) - Date.parse(a.handoff_em) || b.versao - a.versao);
  const inicio = Date.parse(inicioAtual);
  let atual =
    recentes.find((r) => r.situacao === "active" && Date.parse(r.atendimento_inicio) === inicio) ??
    null;
  if (atual?.payload) {
    const payload = normalizarResumo(atual.payload, {
      protocolo: atual.payload.protocolo,
      agendamentoReal: atual.payload.agendamento_confirmado,
      motivoHandoff: atual.payload.motivo_handoff,
      ultimaPergunta: atual.payload.ultima_pergunta,
      etapaInterrompida: atual.payload.etapa_interrompida,
    });
    atual = {
      ...atual,
      payload: ajustarResumoPorDesfecho(
        payload,
        encerrada ? "conversa_resolvida" : ((atual.desfecho ?? "outro") as DesfechoConversa),
      ),
    };
  }
  const ciclos = new Set<number>();
  const anteriores: AtendimentoAnterior[] = [];
  for (const r of recentes) {
    const ciclo = Date.parse(r.atendimento_inicio);
    if (
      !Number.isFinite(ciclo) ||
      ciclo >= inicio ||
      ciclos.has(ciclo) ||
      r.status !== "ok" ||
      !r.payload
    )
      continue;
    ciclos.add(ciclo);
    // Um encerramento posterior não pode apagar um agendamento concluído antes.
    // Cada ação preserva a data e o vencimento da versão que a registrou.
    const concluidos = recentes
      .filter((v) => Date.parse(v.atendimento_inicio) === ciclo && v.status === "ok" && v.payload)
      .reverse()
      .flatMap((v) => {
        const acao = acaoConcluida(v.payload!, v.desfecho);
        return acao ? [{ linha: v, resumo: v.payload!, desfecho: v.desfecho, acao }] : [];
      });
    const incluir = (fonte: ResumoRetido, acoes: string[]) => {
      if (!acoes.length) return;
      const existente = anteriores.find((a) => a.id === fonte.id);
      if (existente) existente.acoes.push(...acoes);
      else
        anteriores.push({
          id: fonte.id,
          data: fonte.handoff_em,
          expira_em: new Date(Date.parse(fonte.handoff_em) + RETENCAO_RESUMO_MS).toISOString(),
          acoes,
        });
    };
    incluir(r, acoesSolicitadas(r.payload, concluidos));
    const vistas = new Set<string>();
    for (const c of concluidos) {
      if (vistas.has(c.acao)) continue;
      vistas.add(c.acao);
      incluir(c.linha, [c.acao]);
    }
  }
  anteriores.sort((a, b) => Date.parse(b.data) - Date.parse(a.data));
  return { atual, anteriores };
}

/** A tela expira o cache mesmo sem receber um evento Realtime. */
export function filtrarPainelNoPrazo(
  painel: PainelResumo | null,
  agora = Date.now(),
): PainelResumo | null {
  if (!painel) return null;
  const atual = painel.atual && resumoNoPrazo(painel.atual.handoff_em, agora) ? painel.atual : null;
  const anteriores = painel.anteriores.filter((r) => Date.parse(r.expira_em) > agora);
  return atual || anteriores.length ? { atual, anteriores } : null;
}

export function limiteTranscricaoResumo(inicioAtendimento: string, agora = Date.now()): string {
  return new Date(
    Math.max(Date.parse(inicioAtendimento), agora - RETENCAO_RESUMO_MS),
  ).toISOString();
}
