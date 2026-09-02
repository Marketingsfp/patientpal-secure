/**
 * Regras de leitura de uma aferição do Hiperdia: pressão, glicemia e IMC.
 *
 * Nada aqui é diagnóstico. Uma aferição isolada não classifica o paciente e a
 * conduta é sempre do profissional — as faixas servem para a tela destacar o
 * que precisa de atenção e para barrar erro grosseiro de digitação.
 *
 * A ESCALA É SEMPRE mmHg
 * ----------------------
 * A tabela `hiperdia_registros` guarda a pressão em números inteiros, e o
 * resto do sistema (triagem de enfermagem, impressão da guia) lê mmHg. Por
 * isso o módulo padroniza mmHg: 120/80, não 12/8.
 *
 * Foi daí que veio o erro relatado. A regra antiga testava, em ordem, as
 * faixas altas (>= 180, >= 140, >= 130) e, sem nenhuma delas bater, caía em
 * `sis < 90 || dia < 60` e escrevia "Baixa". Uma pressão digitada em cmHg —
 * "12/9", que é 120/90 mmHg, ou seja hipertensão estágio 1 — não bate em
 * nenhuma faixa alta e era mostrada ao profissional como pressão baixa: o
 * oposto exato do quadro do paciente.
 *
 * A correção é testar a escala ANTES de classificar. Valor fora da faixa
 * fisiológica não recebe rótulo clínico nenhum; recebe aviso de conferência, e
 * o formulário não deixa mais gravar nessa escala.
 *
 * Referências das faixas
 * ----------------------
 * Pressão: Diretrizes Brasileiras de Hipertensão Arterial (SBC), medida
 * casual em consultório, adulto. Glicemia: Diretriz SBD 2025, a mesma tabela
 * que a tela mostra no rodapé (`criterios-sbd-2025.tsx`). IMC: OMS/ABESO.
 */

/** Gravidade do achado, do mais tranquilo ao mais grave. */
export type Tom = "normal" | "atencao" | "alto" | "critico" | "invalido";

export interface Classificacao {
  label: string;
  tom: Tom;
}

/**
 * Faixas aceitas na digitação. As da pressão espelham os CHECK da tabela
 * (migration 20260816090300_hiperdia_hardening.sql). As da glicemia são mais
 * estreitas de propósito: o banco aceita até 1000 para não rejeitar histórico
 * importado, mas nenhuma glicemia capilar de rotina passa de 600 mg/dL, e
 * deixar 900 entrar sem aviso é o que transforma erro de digitação em fato
 * clínico gravado.
 */
export const FAIXA_PA = { sisMin: 40, sisMax: 300, diaMin: 20, diaMax: 200 } as const;
export const FAIXA_GLICEMIA = { min: 20, max: 600 } as const;
export const FAIXA_PESO = { min: 0.5, max: 500 } as const;

/** "" vira null; aceita vírgula decimal. */
export function numero(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "")
    .trim()
    .replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** A pressão está na escala de cmHg (12/9 em vez de 120/90)? */
export function pareceCmHg(sis: number | null, dia: number | null): boolean {
  if (sis === null || dia === null) return false;
  return sis >= 4 && sis <= 30 && dia >= 2 && dia <= 20;
}

/** "120/90 mmHg" — a unidade nunca é omitida na tela. */
export function formatarPA(sis: number | null, dia: number | null): string {
  if (sis === null || dia === null) return "—";
  return `${sis}/${dia} mmHg`;
}

/**
 * Classificação da pressão arterial em mmHg.
 *
 * A checagem de escala vem primeiro: sem ela, valor em cmHg vira "Baixa".
 */
export function classificarPressao(sis: number | null, dia: number | null): Classificacao | null {
  if (sis === null || dia === null) return null;

  const foraDaFaixa =
    sis < FAIXA_PA.sisMin ||
    sis > FAIXA_PA.sisMax ||
    dia < FAIXA_PA.diaMin ||
    dia > FAIXA_PA.diaMax ||
    dia >= sis;
  if (foraDaFaixa) {
    return {
      label: pareceCmHg(sis, dia)
        ? `Confira: parece cmHg (${sis * 10}/${dia * 10} mmHg?)`
        : "Fora da escala — confira em mmHg",
      tom: "invalido",
    };
  }

  if (sis >= 180 || dia >= 110) return { label: "Hipertensão estágio 3", tom: "critico" };
  if (sis >= 160 || dia >= 100) return { label: "Hipertensão estágio 2", tom: "alto" };
  if (sis >= 140 || dia >= 90) return { label: "Hipertensão estágio 1", tom: "alto" };
  if (sis >= 130 || dia >= 85) return { label: "Pré-hipertensão", tom: "atencao" };
  if (sis < 90 || dia < 60) return { label: "Pressão baixa", tom: "atencao" };
  return { label: "Normal", tom: "normal" };
}

/** Glicemia de jejum (mg/dL) — Diretriz SBD 2025. */
export function classificarGlicemiaJejum(v: number | null): Classificacao | null {
  if (v === null) return null;
  if (v < FAIXA_GLICEMIA.min || v > FAIXA_GLICEMIA.max)
    return { label: "Valor implausível — confira", tom: "invalido" };
  if (v < 70) return { label: "Hipoglicemia", tom: "critico" };
  if (v < 100) return { label: "Normal", tom: "normal" };
  if (v <= 125) return { label: "Pré-diabetes", tom: "atencao" };
  if (v < 250) return { label: "Alterada (diabetes)", tom: "alto" };
  return { label: "Crítica", tom: "critico" };
}

/**
 * Glicemia pós-prandial / 2 horas (mg/dL) — Diretriz SBD 2025.
 * Os cortes são outros: 140 já é alteração aqui, e não em jejum.
 */
export function classificarGlicemiaPos(v: number | null): Classificacao | null {
  if (v === null) return null;
  if (v < FAIXA_GLICEMIA.min || v > FAIXA_GLICEMIA.max)
    return { label: "Valor implausível — confira", tom: "invalido" };
  if (v < 70) return { label: "Hipoglicemia", tom: "critico" };
  if (v < 140) return { label: "Normal", tom: "normal" };
  if (v < 200) return { label: "Pré-diabetes", tom: "atencao" };
  if (v < 300) return { label: "Alterada (diabetes)", tom: "alto" };
  return { label: "Crítica", tom: "critico" };
}

/** Classes de cor por tom, no padrão de badge já usado na triagem. */
export const CLASSE_BADGE: Record<Tom, string> = {
  normal: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  atencao: "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium",
  alto: "bg-orange-500/15 text-orange-700 dark:text-orange-300 font-semibold",
  critico: "bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold",
  invalido: "bg-slate-500/15 text-slate-700 dark:text-slate-300 font-medium",
};

export interface AfericaoDigitada {
  data_registro: string;
  pressao_sistolica: string;
  pressao_diastolica: string;
  glicemia_jejum: string;
  glicemia_pos_prandial: string;
  peso: string;
  observacoes: string;
}

/**
 * `erro` impede a gravação; `confirmar` deixa gravar depois de o profissional
 * confirmar. A separação é a diferença entre valor impossível de digitação
 * (900 mg/dL) e valor raro porém real (450 mg/dL numa descompensação).
 */
export interface Veredito {
  erro: string | null;
  confirmar: string | null;
}

export function validarAfericao(f: AfericaoDigitada): Veredito {
  const sis = numero(f.pressao_sistolica);
  const dia = numero(f.pressao_diastolica);
  const jej = numero(f.glicemia_jejum);
  const pos = numero(f.glicemia_pos_prandial);
  const peso = numero(f.peso);
  const erro = (msg: string): Veredito => ({ erro: msg, confirmar: null });

  if (!f.data_registro || Number.isNaN(new Date(f.data_registro).getTime()))
    return erro("Informe a data e a hora da aferição.");
  if (new Date(f.data_registro).getTime() > Date.now())
    return erro("A data da aferição não pode estar no futuro.");

  if (sis === null && dia === null && jej === null && pos === null && peso === null)
    return erro("Informe pelo menos uma medição: pressão, glicemia ou peso.");

  if ((sis === null) !== (dia === null))
    return erro("Informe a pressão completa (sistólica e diastólica) ou deixe as duas em branco.");

  if (sis !== null && dia !== null) {
    if (pareceCmHg(sis, dia))
      return erro(
        `Pressão em cmHg. Este módulo usa mmHg: digite ${sis * 10}/${dia * 10} em vez de ${sis}/${dia}.`,
      );
    if (sis < FAIXA_PA.sisMin || sis > FAIXA_PA.sisMax)
      return erro(
        `Pressão sistólica fora da faixa aceita (${FAIXA_PA.sisMin} a ${FAIXA_PA.sisMax} mmHg).`,
      );
    if (dia < FAIXA_PA.diaMin || dia > FAIXA_PA.diaMax)
      return erro(
        `Pressão diastólica fora da faixa aceita (${FAIXA_PA.diaMin} a ${FAIXA_PA.diaMax} mmHg).`,
      );
    if (dia >= sis)
      return erro(
        "A diastólica (mínima) tem que ser menor que a sistólica (máxima). Confira se os dois campos não foram trocados.",
      );
  }

  const glicemias = [
    ["Glicemia de jejum", jej],
    ["Glicemia pós-prandial", pos],
  ] as const;
  for (const [rotulo, v] of glicemias) {
    if (v !== null && (v < FAIXA_GLICEMIA.min || v > FAIXA_GLICEMIA.max))
      return erro(
        `${rotulo}: ${v} mg/dL está fora da faixa aceita (${FAIXA_GLICEMIA.min} a ${FAIXA_GLICEMIA.max} mg/dL). Confira o valor digitado.`,
      );
  }

  if (peso !== null && (peso < FAIXA_PESO.min || peso > FAIXA_PESO.max))
    return erro(`Peso fora da faixa aceita (${FAIXA_PESO.min} a ${FAIXA_PESO.max} kg).`);

  if (f.observacoes.length > 2000) return erro("Observações: máximo de 2000 caracteres.");

  // Passou nas travas: sobra o aviso de "tem certeza?" para valor extremo mas
  // possível. É pedido uma vez; confirmando, grava.
  const avisos: string[] = [];
  if (sis !== null && dia !== null && (sis >= 180 || dia >= 110))
    avisos.push(`pressão ${sis}/${dia} mmHg (nível de crise hipertensiva)`);
  if (jej !== null && (jej >= 400 || jej < 50)) avisos.push(`glicemia de jejum ${jej} mg/dL`);
  if (pos !== null && (pos >= 450 || pos < 50)) avisos.push(`glicemia pós-prandial ${pos} mg/dL`);

  return {
    erro: null,
    confirmar: avisos.length
      ? `Confirme os valores: ${avisos.join(" e ")}. Está correto o que foi digitado?`
      : null,
  };
}
