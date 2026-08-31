import { describe, expect, it } from "bun:test";
import { conferirEscolhaDeEmitente, destinoFiscalPorDescricao } from "./nfse-roteamento-emitente";

const CASA = "31.919.483/0003-18";
const MA = "57786061000143";

describe("destinoFiscalPorDescricao", () => {
  it("sugere a CASA DE SAUDE para consulta", () => {
    expect(destinoFiscalPorDescricao("CONSULTA (ORTOPEDIA)")?.cnpj).toBe("31919483000318");
  });

  it("sugere a MA IMAGENS para exame", () => {
    for (const d of ["ECOCARDIOGRAMA", "ELETROCARDIOGRAMA (ECG)", "RX TORAX AP/PERFIL (RAIO-X)"]) {
      expect(destinoFiscalPorDescricao(d)?.cnpj).toBe("57786061000143");
    }
  });

  it("não sugere nada quando a descrição não é consulta nem exame", () => {
    for (const d of ["LAUDO MEDICO", "02 INFILTRACOES", "RISCO CIRURGICO", ""]) {
      expect(destinoFiscalPorDescricao(d)).toBeNull();
    }
  });

  it("trata como exame a descrição que cita os dois", () => {
    // Nota agrupada. Como isto só alimenta um aviso, errar aqui produz uma
    // sugestão inadequada, nunca uma nota no CNPJ errado.
    expect(destinoFiscalPorDescricao("CONSULTA + ELETROCARDIOGRAMA")?.tipo).toBe("exame");
  });
});

describe("conferirEscolhaDeEmitente", () => {
  it("não avisa quando a escolha bate com a orientação, com ou sem máscara no CNPJ", () => {
    expect(conferirEscolhaDeEmitente("CONSULTA", CASA)).toBeNull();
    expect(conferirEscolhaDeEmitente("CONSULTA", "31919483000318")).toBeNull();
    expect(conferirEscolhaDeEmitente("ECOCARDIOGRAMA", MA)).toBeNull();
  });

  it("avisa quando a escolha contraria a orientação", () => {
    // A nota SAI pela empresa escolhida mesmo assim: isto aqui só alimenta o
    // aviso na tela e o registro em observacoes.
    expect(conferirEscolhaDeEmitente("ECOCARDIOGRAMA", CASA)?.nome).toBe("MA IMAGENS");
    expect(conferirEscolhaDeEmitente("CONSULTA", MA)?.nome).toBe("CASA DE SAUDE E MATERNIDADE");
  });

  it("não avisa quando a descrição não sugere empresa nenhuma", () => {
    expect(conferirEscolhaDeEmitente("LAUDO MEDICO", CASA)).toBeNull();
    expect(conferirEscolhaDeEmitente("LAUDO MEDICO", MA)).toBeNull();
  });
});
