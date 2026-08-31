import { describe, expect, it } from "bun:test";
import { conferirEscolhaDeEmitente, destinoFiscalPorDescricao } from "./nfse-roteamento-emitente";

const CASA = "31.919.483/0003-18";
const MA = "57786061000143";

describe("destinoFiscalPorDescricao", () => {
  it("manda consulta para a CASA DE SAUDE", () => {
    expect(destinoFiscalPorDescricao("CONSULTA (ORTOPEDIA)")?.cnpj).toBe("31919483000318");
  });

  it("manda exame para a MA IMAGENS", () => {
    for (const d of ["ECOCARDIOGRAMA", "ELETROCARDIOGRAMA (ECG)", "RX TORAX AP/PERFIL (RAIO-X)"]) {
      expect(destinoFiscalPorDescricao(d)?.cnpj).toBe("57786061000143");
    }
  });

  it("não opina quando a descrição não é consulta nem exame", () => {
    for (const d of ["LAUDO MEDICO", "02 INFILTRACOES", "RISCO CIRURGICO", ""]) {
      expect(destinoFiscalPorDescricao(d)).toBeNull();
    }
  });

  it("dá precedência a exame quando a descrição cita os dois", () => {
    // Nota agrupada: hoje a nota inteira vai para a MA. Fixado em teste porque
    // é o ponto a revisar caso a clínica passe a agrupar consulta com exame.
    expect(destinoFiscalPorDescricao("CONSULTA + ELETROCARDIOGRAMA")?.tipo).toBe("exame");
  });
});

describe("conferirEscolhaDeEmitente", () => {
  it("aceita a escolha quando ela já é a empresa correta, com ou sem máscara", () => {
    expect(conferirEscolhaDeEmitente("CONSULTA", CASA)).toBeNull();
    expect(conferirEscolhaDeEmitente("CONSULTA", "31919483000318")).toBeNull();
    expect(conferirEscolhaDeEmitente("ECOCARDIOGRAMA", MA)).toBeNull();
  });

  it("acusa o desvio quando a escolha contraria a regra", () => {
    // É este o caso relatado pela recepção: escolhe CASA DE SAUDE, digita um
    // exame, e a nota sai pela MA.
    const desvio = conferirEscolhaDeEmitente("ECOCARDIOGRAMA", CASA);
    expect(desvio?.nome).toBe("MA IMAGENS");
    expect(conferirEscolhaDeEmitente("CONSULTA", MA)?.nome).toBe("CASA DE SAUDE E MATERNIDADE");
  });

  it("respeita a escolha quando a descrição não aciona a regra", () => {
    expect(conferirEscolhaDeEmitente("LAUDO MEDICO", CASA)).toBeNull();
    expect(conferirEscolhaDeEmitente("LAUDO MEDICO", MA)).toBeNull();
  });
});
