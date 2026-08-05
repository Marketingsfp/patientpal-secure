// Cálculo puro de repasse ao médico a partir das regras cadastradas
// (convênio por procedimento, convênio por categoria, cartão consulta,
// fallback pelo padrão do médico). Mesma lógica usada na tela de
// Atendimentos do Financeiro — extraída aqui para ser reutilizada na
// segunda via de comprovantes de repasse.

export interface RepasseMedico {
  id: string;
  tipo_repasse?: string | null;
  percentual_repasse_padrao?: number | null;
  valor_repasse_padrao?: number | null;
  aceita_cartao_beneficios?: boolean | null;
  cb_tipo_repasse?: string | null;
  cb_valor_repasse?: number | null;
  cb_percentual_repasse?: number | null;
}

export interface RepasseConvenio {
  medico_id: string;
  nome: string;
  tipo_repasse: string | null;
  percentual: number | null;
  valor: number | null;
}

export interface RepasseCtx {
  medicos: RepasseMedico[];
  convenios: RepasseConvenio[];
  /** Mapa key(normalizada) -> tipo do procedimento */
  procTipos: Map<string, string>;
}

export const normRepasse = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const procVariants = (nome: string): string[] => {
  const base = normRepasse(nome);
  const out = new Set<string>([base]);
  let cur = base;
  for (let i = 0; i < 3; i++) {
    const m = cur.match(/^(.*)\s*\([^()]*\)\s*$/);
    if (!m) break;
    cur = m[1].trim();
    if (cur) out.add(cur);
  }
  const semParens = base
    .replace(/\s*\([^()]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (semParens) out.add(semParens);
  return Array.from(out).filter(Boolean);
};

export const isCartaoConsultaDesc = (desc: string | null | undefined): boolean => {
  if (!desc) return false;
  const d = desc.toUpperCase();
  if (d.includes("ADESAO") || d.includes("ADESÃO")) return false;
  return (
    d.includes("CARTAO CONSULTA") ||
    d.includes("CARTÃO CONSULTA") ||
    d.includes("CONSULTA CARTAO") ||
    d.includes("CONSULTA CARTÃO")
  );
};

export function calcRepasseFull(
  ctx: RepasseCtx,
  medicoId: string | null,
  totalPago: number,
  procNome: string | null,
  descricao?: string | null,
): { total: number; repasse: number } {
  const { medicos, convenios, procTipos } = ctx;
  if (!medicoId) return { total: totalPago, repasse: 0 };
  const med = medicos.find((m) => m.id === medicoId);

  if (isCartaoConsultaDesc(descricao) && med?.aceita_cartao_beneficios) {
    if (med.cb_tipo_repasse === "valor" && med.cb_valor_repasse != null) {
      return { total: totalPago, repasse: Number(med.cb_valor_repasse) };
    }
    if (med.cb_tipo_repasse === "percentual" && med.cb_percentual_repasse != null) {
      return {
        total: totalPago,
        repasse: +((totalPago * Number(med.cb_percentual_repasse)) / 100).toFixed(2),
      };
    }
  }

  if (procNome) {
    const variants = procVariants(procNome);
    let c: RepasseConvenio | undefined;
    for (const alvo of variants) {
      c = convenios.find((cv) => cv.medico_id === medicoId && normRepasse(cv.nome) === alvo);
      if (c) break;
    }
    if (!c) {
      let tipo: string | undefined;
      for (const alvo of variants) {
        tipo = procTipos.get(alvo);
        if (tipo) break;
      }
      if (tipo) {
        const sentinel = `__CAT__:${String(tipo).toUpperCase()}`;
        c = convenios.find((cv) => cv.medico_id === medicoId && cv.nome === sentinel);
      }
    }
    if (c) {
      const base = totalPago;
      if (c.tipo_repasse === "valor" && c.valor != null) {
        return { total: Math.max(base, Number(c.valor)), repasse: Number(c.valor) };
      }
      if (c.tipo_repasse === "percentual" && c.percentual != null) {
        return { total: base, repasse: +((base * Number(c.percentual)) / 100).toFixed(2) };
      }
      if (med) {
        if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
          return { total: base, repasse: Math.min(Number(med.valor_repasse_padrao), base) };
        }
        return {
          total: base,
          repasse: +((base * Number(med.percentual_repasse_padrao ?? 0)) / 100).toFixed(2),
        };
      }
      return { total: base, repasse: 0 };
    }
  }

  if (!totalPago) {
    if (med?.cb_tipo_repasse === "valor" && med.cb_valor_repasse != null) {
      return { total: 0, repasse: Number(med.cb_valor_repasse) };
    }
    if (med?.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
      return { total: 0, repasse: Number(med.valor_repasse_padrao) };
    }
    return { total: 0, repasse: 0 };
  }

  if (med) {
    if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
      return { total: totalPago, repasse: Math.min(Number(med.valor_repasse_padrao), totalPago) };
    }
    return {
      total: totalPago,
      repasse: +((totalPago * Number(med.percentual_repasse_padrao ?? 0)) / 100).toFixed(2),
    };
  }
  return { total: totalPago, repasse: 0 };
}