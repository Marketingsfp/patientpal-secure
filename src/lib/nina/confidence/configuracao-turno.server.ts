/**
 * FASE 6 — a configuração de confiança é lida UMA VEZ POR TURNO.
 *
 * Se alguém publicar um ajuste no meio da geração da resposta, ele vale no
 * PRÓXIMO turno elegível: o turno em andamento continua até o fim com a mesma
 * configuração, e é essa configuração histórica que fica registrada.
 *
 * O escopo é o registro do turno (AsyncLocalStorage). Sem registro de turno
 * (chamadas avulsas), a leitura cai no cache normal do módulo.
 */
import { registroTurnoAtual } from "@/lib/nina/rastreio/turno.server";
import { configuracaoEfetiva } from "./politica-override.server";
import { etapaConfianca, modoDaEtapa } from "./etapas-flag.server";
import type { ConfiguracaoEfetiva } from "./configuracao";
import type { EtapaAtivacao } from "./etapas";
import type { ModoConfianca } from "./shadow";

export type ConfiguracaoDoTurno = {
  configuracao: ConfiguracaoEfetiva;
  etapa: EtapaAtivacao;
  modo: ModoConfianca;
};

const porTurno = new WeakMap<object, Promise<ConfiguracaoDoTurno>>();

async function carregar(clinicaId: string): Promise<ConfiguracaoDoTurno> {
  const [configuracao, etapa] = await Promise.all([
    configuracaoEfetiva(clinicaId),
    etapaConfianca(clinicaId),
  ]);
  return { configuracao, etapa, modo: modoDaEtapa(etapa) };
}

/** Configuração + etapa vigentes NESTE turno (carregadas uma única vez). */
export function configuracaoDoTurno(clinicaId: string): Promise<ConfiguracaoDoTurno> {
  const registro = registroTurnoAtual() as unknown as object | null;
  if (!registro) return carregar(clinicaId);
  const existente = porTurno.get(registro);
  if (existente) return existente;
  const promessa = carregar(clinicaId);
  porTurno.set(registro, promessa);
  return promessa;
}
