import { describe, expect, test } from "bun:test";
import { montarCamposAutorizados } from "./nfse-retorno";

const CH = "33051582257786061000143000000000770226095204786964";
const xml = `<NFSe><infNFSe Id="NFS${CH}"><nNFSe>7702</nNFSe><valores><vLiq>363.00</vLiq></valores>
<DPS><infDPS Id="DPS1"><serie>1</serie><nDPS>7358</nDPS><valores><vServPrest><vServ>363.00</vServ></vServPrest></valores></infDPS></DPS>
<valores><pAliqAplic>3.00</pAliqAplic><vISSQN>10.89</vISSQN></valores></infNFSe></NFSe>`;
const body = { numero: "7702", numero_rps: "7358", serie_rps: "1", codigo_verificacao: CH };

describe("retorno autorizado NFS-e", () => {
  test("grava alíquota e ISS autorizados e registra divergência com o cadastro", () => {
    const { campos, conferencia } = montarCamposAutorizados(body, xml, 0.02);
    expect(campos).toMatchObject({
      numero: "7702",
      rps_numero: 7358,
      rps_serie: "1",
      aliquota_iss: 0.03,
      valor_iss: 10.89,
      chave_acesso: CH,
    });
    expect(conferencia.divergencia_aliquota).toEqual({ cadastro_emitente: 0.02, autorizada: 0.03 });
  });
  test("sem XML: alíquota e ISS ficam nulos, nunca o calculado", () => {
    const { campos, conferencia } = montarCamposAutorizados(body, null, 0.02);
    expect(campos.aliquota_iss).toBeNull();
    expect("valor_iss" in campos).toBe(false);
    expect(conferencia.faltando).toEqual(
      expect.arrayContaining(["aliquota_iss", "valor_iss", "serie"]),
    );
    expect(conferencia.divergencia_aliquota).toBeNull();
  });
});
