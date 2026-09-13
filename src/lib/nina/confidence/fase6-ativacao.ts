/**
 * FASE 6 — QUAL MOTOR DECIDE, EM QUAL MODO, COM QUAL VERSÃO.
 *
 * Um turno tem UM motor ativo. Este módulo responde, sem ambiguidade:
 *  - qual implementação fornece a classificação final do turno;
 *  - se ela pode executar operações com efeito real ou fica só registrada;
 *  - qual versão de prompt/configuração valeu do início ao fim do turno;
 *  - como reverter e reconciliar fila/avisos em andamento na troca de versão.
 *
 * Regras:
 * - o motor novo só assume decisões quando contrato, cálculo, gate, envio e
 *   auditoria estão completos;
 * - em observação, o motor novo é calculado e registrado, mas quem executa é
 *   o motor em vigor;
 * - publicação durante o turno não mistura versões: o turno termina na versão
 *   com que começou;
 * - reversão preserva histórico; nada de apagar atendimento real.
 *
 * Módulo puro: sem banco, sem rede, sem modelo.
 */
import type { RegistroEncaminhamento } from "./saida-final";

export const VERSAO_ATIVACAO = "ativacao-6";

export type MotorId = "legado" | "novo";

export type ModoOperacao = "aplicacao" | "observacao";

/** Componentes que precisam estar completos para o motor novo decidir. */
export type Prontidao = {
  contrato: boolean;
  calculo: boolean;
  gate: boolean;
  envio: boolean;
  auditoria: boolean;
};

export const COMPONENTES_OBRIGATORIOS: Array<keyof Prontidao> = [
  "contrato",
  "calculo",
  "gate",
  "envio",
  "auditoria",
];

export function componentesFaltantes(p: Prontidao): Array<keyof Prontidao> {
  return COMPONENTES_OBRIGATORIOS.filter((c) => p[c] !== true);
}

export type EntradaAtivacao = {
  /** Motor que a configuração pede para este turno. */
  motorConfigurado: MotorId;
  modo: ModoOperacao;
  ambiente: "producao" | "homologacao";
  prontidao: Prontidao;
  /** Versão do prompt lida no início do turno. */
  versaoPromptDoTurno: string;
  /** Versão publicada agora (pode ter mudado durante o turno). */
  versaoPromptVigenteAgora?: string | null;
  configIdDoTurno?: string | null;
  configIdVigenteAgora?: string | null;
  /** Etapa legada A/B/C/D, quando ainda houver. Nunca decide efeitos. */
  etapaLegada?: string | null;
};

export type ResolucaoAtivacao = {
  versao: string;
  /** Único motor que fornece a classificação final do turno. */
  motorAtivo: MotorId;
  /** O motor novo foi calculado apenas para registro? */
  motorNovoSomenteRegistrado: boolean;
  /** A decisão do motor ativo pode executar operações reais? */
  executaEfeitos: boolean;
  modo: ModoOperacao;
  faltantes: Array<keyof Prontidao>;
  /** Houve publicação/reconfiguração durante o turno? */
  publicacaoDuranteOTurno: boolean;
  /** O turno permanece na versão com que começou. */
  versaoUsadaNoTurno: string;
  configIdUsadoNoTurno: string | null;
  /** A etapa legada não pode decidir efeito nenhum. */
  etapaLegadaIgnorada: string | null;
  motivo: string;
};

export function resolverMotorAtivo(e: EntradaAtivacao): ResolucaoAtivacao {
  const faltantes = componentesFaltantes(e.prontidao);
  const completo = faltantes.length === 0;
  const querNovo = e.motorConfigurado === "novo";

  const publicacaoDuranteOTurno =
    (e.versaoPromptVigenteAgora != null &&
      e.versaoPromptVigenteAgora !== e.versaoPromptDoTurno) ||
    (e.configIdVigenteAgora != null &&
      e.configIdDoTurno != null &&
      e.configIdVigenteAgora !== e.configIdDoTurno);

  let motorAtivo: MotorId = "legado";
  let somenteRegistrado = false;
  let motivo: string;

  if (!querNovo) {
    motivo = "configuração do turno mantém o motor em vigor";
  } else if (!completo) {
    motivo = `motor novo incompleto (${faltantes.join(", ")}): decisão continua com o motor em vigor`;
    somenteRegistrado = true;
  } else if (e.modo === "observacao") {
    motivo = "motor novo em observação: resultado registrado, sem executar operações";
    somenteRegistrado = true;
  } else {
    motorAtivo = "novo";
    motivo = "motor novo completo e em aplicação: fornece a classificação final do turno";
  }

  const executaEfeitos = e.modo === "aplicacao" && (motorAtivo === "legado" || completo);

  return {
    versao: VERSAO_ATIVACAO,
    motorAtivo,
    motorNovoSomenteRegistrado: somenteRegistrado,
    executaEfeitos,
    modo: e.modo,
    faltantes,
    publicacaoDuranteOTurno,
    versaoUsadaNoTurno: e.versaoPromptDoTurno,
    configIdUsadoNoTurno: e.configIdDoTurno ?? null,
    etapaLegadaIgnorada: e.etapaLegada ?? null,
    motivo,
  };
}

/**
 * Um LOW final do motor ativo sempre bloqueia e encaminha; o encaminhamento
 * com efeito real acontece SOMENTE em produção e em modo de aplicação.
 */
export function lowSegueFluxoReal(r: ResolucaoAtivacao, ambiente: string): boolean {
  return r.executaEfeitos && r.modo === "aplicacao" && ambiente === "producao";
}

// ------------------------------------------------- reversão e reconciliação

export type PlanoReversao = {
  versao: string;
  de: { motor: MotorId; versaoPrompt: string; configId: string | null };
  para: { motor: MotorId; versaoPrompt: string; configId: string | null };
  /** Registro auditável: nada é apagado. */
  preservaHistorico: true;
  /** Atendimentos reais nunca são desfeitos por troca de versão. */
  desfazAtendimentos: false;
  motivo: string;
  registradoEm: string;
};

export function planoDeReversao(e: {
  de: PlanoReversao["de"];
  para: PlanoReversao["para"];
  motivo: string;
  registradoEm?: string;
}): PlanoReversao {
  return {
    versao: VERSAO_ATIVACAO,
    de: e.de,
    para: e.para,
    preservaHistorico: true,
    desfazAtendimentos: false,
    motivo: e.motivo,
    registradoEm: e.registradoEm ?? new Date().toISOString(),
  };
}

export type Reconciliacao = {
  /** Já concluídos: não repetir fila nem aviso. */
  concluidos: string[];
  /** Pendentes: retomar pela MESMA chave, sem criar nova entrada. */
  retomar: string[];
  /** Falhados: exigem nova tentativa explícita, também pela mesma chave. */
  falhados: string[];
  /** Avisos ainda não enviados de encaminhamentos já confirmados. */
  avisosPendentes: string[];
  duplicadasEvitadas: number;
};

/**
 * Reconcilia operações em andamento na troca de versão. A chave idempotente
 * (conversa|turno|motivo) é a única identidade — trocar de motor não pode
 * gerar segunda entrada em fila nem segundo aviso.
 */
export function reconciliarEncaminhamentos(
  registros: RegistroEncaminhamento[],
): Reconciliacao {
  const vistos = new Set<string>();
  const r: Reconciliacao = {
    concluidos: [],
    retomar: [],
    falhados: [],
    avisosPendentes: [],
    duplicadasEvitadas: 0,
  };

  for (const reg of registros) {
    if (vistos.has(reg.chave)) {
      r.duplicadasEvitadas += 1;
      continue;
    }
    vistos.add(reg.chave);

    const naFila = reg.etapa === "fila_confirmada" || reg.etapa === "atribuido";
    if (naFila && reg.aviso === "enviado") r.concluidos.push(reg.chave);
    else if (naFila) r.avisosPendentes.push(reg.chave);
    else if (reg.etapa === "falhou") r.falhados.push(reg.chave);
    else r.retomar.push(reg.chave);
  }

  return r;
}
