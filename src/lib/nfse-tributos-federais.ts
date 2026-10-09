/**
 * PIS/COFINS e IBS/CBS da DPS (NFS-e Nacional, campos da Focus NFe).
 *
 * Antes todo emitente mandava PIS/COFINS com CST 08 (sem incidência) e nada de
 * IBS/CBS. Serve para o Simples, mas a MA (lucro presumido) declara no portal
 * PIS 0,65% e COFINS 3% (CST 01) e IBS/CBS com CST 200, classificação 200029
 * e indicador de operação 030101. Os valores vêm do cadastro do emitente;
 * cadastro vazio mantém o comportamento antigo.
 */

export interface EmitenteTributosFederais {
  optante_simples?: boolean | null;
  pis_cofins_cst?: string | null;
  aliquota_pis?: number | string | null;
  aliquota_cofins?: number | string | null;
  ibs_cbs_cst?: string | null;
  ibs_cbs_classificacao?: string | null;
  ibs_cbs_indicador_operacao?: string | null;
}

const num = (v: number | string | null | undefined) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: string | null | undefined) => (v ?? "").trim();
const centavos = (v: number) => Math.round(v * 100) / 100;

export function pisCofinsDaNota(emitente: EmitenteTributosFederais, valorServico: number) {
  const pis = num(emitente.aliquota_pis);
  const cofins = num(emitente.aliquota_cofins);
  if (emitente.optante_simples || pis == null || cofins == null) {
    return { situacao_tributaria_pis_cofins: "08" };
  }
  return {
    situacao_tributaria_pis_cofins: txt(emitente.pis_cofins_cst) || "01",
    base_calculo_pis_cofins: valorServico,
    aliquota_pis: pis,
    aliquota_cofins: cofins,
    valor_pis: centavos((valorServico * pis) / 100),
    valor_cofins: centavos((valorServico * cofins) / 100),
    // 0 = PIS/COFINS/CSLL não retidos (o paciente não retém nada).
    tipo_retencao_pis_cofins: 0,
  };
}

export function ibsCbsDaNota(emitente: EmitenteTributosFederais, cpfCnpjTomador: string) {
  const cst = txt(emitente.ibs_cbs_cst);
  const classificacao = txt(emitente.ibs_cbs_classificacao);
  if (!cst || !classificacao) return {};
  const indOp = txt(emitente.ibs_cbs_indicador_operacao);
  return {
    finalidade_emissao: 0,
    // Paciente pessoa física é consumidor final; empresa tomadora, não.
    consumidor_final: cpfCnpjTomador.replace(/\D/g, "").length === 14 ? 0 : 1,
    ...(indOp ? { codigo_indicador_operacao: indOp } : {}),
    // indDest é obrigatório no grupo IBSCBS; sem ele a DPS volta com "Element
    // 'valores': This element is not expected". 0 = o destinatário é o tomador.
    indicador_destinatario: 0,
    ibs_cbs_situacao_tributaria: cst,
    ibs_cbs_classificacao_tributaria: classificacao,
  };
}
