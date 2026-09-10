/**
 * FASE 6 — CONFIGURAÇÃO EFETIVA DE CONFIANÇA (camada pura).
 *
 * Versão do ALGORITMO (`VERSAO_POLITICA`/`VERSAO_MOTOR`) é uma coisa; versão
 * da CONFIGURAÇÃO da clínica é outra. Aqui materializamos a segunda: os
 * parâmetros completos realmente vigentes, quais propostas humanas foram
 * aplicadas, desde quando, e uma identidade estável (`configId`) que muda
 * sempre que qualquer parâmetro muda.
 *
 * REGRAS DURAS
 *  - Nada aqui lê banco, rede ou modelo.
 *  - Um ajuste inválido é DESCARTADO individualmente e registrado; ele não
 *    derruba os ajustes válidos anteriores nem "zera" a configuração.
 *  - Tipos que exigem mudança de código (NOVO_BLOQUEADOR, REVISAR_VALIDADOR)
 *    nunca entram em vigor por esta via: ficam como implementação pendente.
 */
import { hashDoTexto } from "./hash";
import { mesclarPolitica, type AjustePolitica } from "./calibracao";
import {
  POLITICA_PADRAO,
  VERSAO_MOTOR,
  VERSAO_POLITICA,
  type PoliticaConfianca,
} from "./policy";

/** Tipos de proposta que esta via consegue colocar em vigor de verdade. */
export const TIPOS_APLICAVEIS_EM_RUNTIME = ["AJUSTAR_PESO", "AJUSTAR_LIMITE"] as const;

export function exigeImplementacaoDeCodigo(tipo: string): boolean {
  return !(TIPOS_APLICAVEIS_EM_RUNTIME as readonly string[]).includes(tipo);
}

export type PropostaParaConfiguracao = {
  id: string;
  tipo: string;
  alvo: string;
  valor: unknown;
  aplicadoEm: string | null;
  aplicadoPor: string | null;
};

export type PropostaAplicada = {
  id: string;
  tipo: string;
  alvo: string;
  valor: number;
  aplicadoEm: string | null;
};

export type PropostaDescartada = {
  id: string;
  tipo: string;
  alvo: string;
  motivo: string;
};

/**
 * De onde veio a configuração que o runtime está usando AGORA.
 *  - `padrao`: a clínica não tem ajuste aplicado;
 *  - `clinica`: ajustes humanos aplicados e válidos;
 *  - `cache_vencido`: a leitura falhou e mantivemos a última configuração
 *    conhecida (declaradamente degradado, com prazo);
 *  - `fallback_padrao`: a leitura falhou e não há configuração conhecida.
 */
export type OrigemConfiguracao = "padrao" | "clinica" | "cache_vencido" | "fallback_padrao";

export type ConfiguracaoEfetiva = {
  /** Identidade estável dos parâmetros. Muda se qualquer parâmetro mudar. */
  configId: string;
  /** Versão do contrato de política (algoritmo), não da configuração. */
  versaoPolitica: string;
  versaoMotor: string;
  parametros: PoliticaConfianca;
  propostasAplicadas: PropostaAplicada[];
  /** Ajustes recusados na validação — a configuração válida foi preservada. */
  propostasDescartadas: PropostaDescartada[];
  /** Aprovadas, porém dependem de mudança de código para valer. */
  propostasComImplementacaoPendente: PropostaDescartada[];
  /** Desde quando esta combinação vale (aplicação humana mais recente). */
  vigenteDesde: string | null;
  origem: OrigemConfiguracao;
  /** Estamos operando fora da configuração real da clínica? */
  degradada: boolean;
  motivoDegradacao: string | null;
  lidoEm: string;
};

function estavel(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(estavel).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${estavel(o[k])}`)
    .join(",")}}`;
}

/** Identidade dos parâmetros efetivos (não inclui data nem quem aplicou). */
export function hashConfiguracao(parametros: PoliticaConfianca): string {
  return `cfg:${VERSAO_POLITICA}:${hashDoTexto(estavel(parametros)) ?? "0"}`;
}

/**
 * Materializa a configuração efetiva a partir das propostas APLICADAS por
 * pessoas. Cada ajuste é validado isoladamente contra a última configuração
 * válida: o que não passa é descartado com motivo, o resto continua valendo.
 */
export function montarConfiguracao(
  propostas: PropostaParaConfiguracao[],
  opcoes?: { base?: PoliticaConfianca; origemFalha?: OrigemConfiguracao; motivoFalha?: string },
): ConfiguracaoEfetiva {
  const base = opcoes?.base ?? POLITICA_PADRAO;
  let atual = base;
  const aplicadas: PropostaAplicada[] = [];
  const descartadas: PropostaDescartada[] = [];
  const pendentesDeCodigo: PropostaDescartada[] = [];
  let vigenteDesde: string | null = null;

  for (const p of propostas) {
    if (!p.aplicadoPor) {
      descartadas.push({ id: p.id, tipo: p.tipo, alvo: p.alvo, motivo: "sem_responsavel_humano" });
      continue;
    }
    if (exigeImplementacaoDeCodigo(p.tipo)) {
      pendentesDeCodigo.push({
        id: p.id,
        tipo: p.tipo,
        alvo: p.alvo,
        motivo: "exige_implementacao_de_codigo",
      });
      continue;
    }
    const valor = Number(p.valor);
    if (!Number.isFinite(valor)) {
      descartadas.push({ id: p.id, tipo: p.tipo, alvo: p.alvo, motivo: "valor_invalido" });
      continue;
    }
    const ajuste: AjustePolitica = { alvo: p.alvo, valor };
    try {
      atual = mesclarPolitica(atual, [ajuste]);
      aplicadas.push({ id: p.id, tipo: p.tipo, alvo: p.alvo, valor, aplicadoEm: p.aplicadoEm });
      if (p.aplicadoEm && (!vigenteDesde || p.aplicadoEm > vigenteDesde)) vigenteDesde = p.aplicadoEm;
    } catch (e) {
      descartadas.push({
        id: p.id,
        tipo: p.tipo,
        alvo: p.alvo,
        motivo: e instanceof Error ? e.message : "ajuste_recusado",
      });
    }
  }

  const origem: OrigemConfiguracao =
    opcoes?.origemFalha ?? (aplicadas.length > 0 ? "clinica" : "padrao");
  const degradada = origem === "cache_vencido" || origem === "fallback_padrao";

  return {
    configId: hashConfiguracao(atual),
    versaoPolitica: VERSAO_POLITICA,
    versaoMotor: VERSAO_MOTOR,
    parametros: atual,
    propostasAplicadas: aplicadas,
    propostasDescartadas: descartadas,
    propostasComImplementacaoPendente: pendentesDeCodigo,
    vigenteDesde,
    origem,
    degradada,
    motivoDegradacao: degradada ? (opcoes?.motivoFalha ?? "leitura_indisponivel") : null,
    lidoEm: new Date().toISOString(),
  };
}

/** Configuração padrão materializada (sem clínica, sem ajuste). */
export function configuracaoPadrao(): ConfiguracaoEfetiva {
  return montarConfiguracao([]);
}

/**
 * Valida um ajuste ANTES de marcar "Em vigor", considerando os ajustes já
 * aplicados. Devolve a configuração resultante ou o motivo da recusa.
 */
export function validarAjusteNaConfiguracao(
  configuracaoAtual: ConfiguracaoEfetiva,
  candidato: PropostaParaConfiguracao,
): { ok: true; configId: string } | { ok: false; motivo: string } {
  if (exigeImplementacaoDeCodigo(candidato.tipo)) {
    return { ok: false, motivo: "exige_implementacao_de_codigo" };
  }
  const valor = Number(candidato.valor);
  if (!Number.isFinite(valor)) return { ok: false, motivo: "valor_invalido" };
  try {
    const nova = mesclarPolitica(configuracaoAtual.parametros, [{ alvo: candidato.alvo, valor }]);
    return { ok: true, configId: hashConfiguracao(nova) };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "ajuste_recusado" };
  }
}
