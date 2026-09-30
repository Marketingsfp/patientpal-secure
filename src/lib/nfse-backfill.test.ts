import { describe, expect, test } from "bun:test";
import { resultadoBackfill } from "./nfse-backfill";

const xml = (aliq: string, iss: string, serv = "363.00") =>
  `<NFSe><infNFSe><DPS><infDPS><valores><vServPrest><vServ>${serv}</vServ></vServPrest></valores></infDPS></DPS><valores><pAliqAplic>${aliq}</pAliqAplic><vISSQN>${iss}</vISSQN></valores></infNFSe></NFSe>`;
const gravado = { aliquota_iss: 0.02, valor_iss: 7.26, valor_servicos: 363 };

describe("backfill ISS pelo XML", () => {
  test("corrige com o XML e guarda o anterior e a divergência", () => {
    const r = resultadoBackfill(xml("3.00", "10.89"), gravado, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.aliquota_iss).toBe(0.03);
    expect(r.valor_iss).toBe(10.89);
    expect(r.conferencia).toMatchObject({ anterior: { aliquota: 0.02, iss: 7.26 }, divergencia_aliquota: { gravada: 0.02, autorizada: 0.03 }, divergencia_servicos: null });
  });
  test("XML sem campos vira falha", () => {
    const r = resultadoBackfill("<NFSe/>", gravado, null);
    expect(r.ok ? null : r.falha).toBe("xml_sem_campos");
  });
  test("alíquota acima de 5% não grava", () => {
    const r = resultadoBackfill(xml("8.00", "29.04"), gravado, null);
    expect(r.ok ? null : r.falha).toBe("aliquota_fora_faixa");
  });
  test("ISS que não bate com alíquota × serviços não grava", () => {
    const r = resultadoBackfill(xml("3.00", "11.50"), gravado, null);
    expect(r.ok ? null : r.falha).toBe("iss_nao_bate");
  });
  test("registra valor dos serviços divergente", () => {
    const r = resultadoBackfill(xml("3.00", "12.00", "400.00"), gravado, null);
    expect(r.ok && r.conferencia.divergencia_servicos).toEqual({ gravado: 363, xml: 400 });
  });
  test("download falhou", () => {
    const r = resultadoBackfill(null, gravado, "xml_nao_baixou");
    expect(r.ok ? null : r.falha).toBe("xml_nao_baixou");
  });
});
