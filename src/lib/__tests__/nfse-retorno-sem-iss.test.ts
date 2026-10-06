import { describe, expect, it } from "bun:test";
import { montarCamposAutorizados } from "@/lib/nfse-retorno";

const body = { numero: "11016", numero_rps: "9001", serie_rps: "1" };
const xmlSemIss = `<NFSe><infNFSe><nNFSe>11016</nNFSe><DPS><infDPS><serie>1</serie><nDPS>9001</nDPS></infDPS></DPS></infNFSe></NFSe>`;
const xmlSoAliq = `<NFSe><infNFSe><nNFSe>11016</nNFSe><valores><pAliqAplic>2.00</pAliqAplic></valores></infNFSe></NFSe>`;
const xmlComIss = `<NFSe><infNFSe><nNFSe>7702</nNFSe><valores><pAliqAplic>3.00</pAliqAplic><vISSQN>10.89</vISSQN></valores></infNFSe></NFSe>`;

describe("NFS-e autorizada sem ISS destacado", () => {
  it("XML sem ISS: valor_iss 0, listado em faltando, sem_iss_destacado", () => {
    const { campos, conferencia } = montarCamposAutorizados(body, xmlSemIss, 0.02);
    expect(campos.valor_iss).toBe(0);
    expect(campos.aliquota_iss).toBeNull();
    expect(conferencia.faltando).toContain("valor_iss");
    expect(conferencia.sem_iss_destacado).toBe(true);
    expect(conferencia.divergencia_aliquota).toBeNull();
  });
  it("XML com ISS: valores do XML, sem marca", () => {
    const { campos, conferencia } = montarCamposAutorizados(body, xmlComIss, 0.03);
    expect(campos.valor_iss).toBe(10.89);
    expect(campos.aliquota_iss).toBe(0.03);
    expect(conferencia.faltando).not.toContain("valor_iss");
    expect(conferencia.sem_iss_destacado).toBeUndefined();
  });
  it("XML sem vISSQN mas com alíquota: valor 0, alíquota do XML, marca presente", () => {
    const { campos, conferencia } = montarCamposAutorizados(body, xmlSoAliq, 0.03);
    expect(campos.valor_iss).toBe(0);
    expect(campos.aliquota_iss).toBe(0.02);
    expect(conferencia.sem_iss_destacado).toBe(true);
    expect(conferencia.divergencia_aliquota).toEqual({ cadastro_emitente: 0.03, autorizada: 0.02 });
  });
});
