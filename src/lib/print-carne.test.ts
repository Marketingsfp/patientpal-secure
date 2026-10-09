import { describe, expect, it } from "bun:test";
import {
  dadosClinicaSfp,
  folhasDeFichas,
  isSaoFranciscoDePaula,
  layoutCarne,
  parcelasCarneSaoFrancisco,
} from "./print-carne";

const parcela = (numero_parcela: number, status = "pendente") => ({
  numero_parcela,
  vencimento: "2026-10-10",
  valor: 50,
  status,
  pago_em: status === "pago" ? "2026-09-10" : null,
});

describe("carnê da São Francisco de Paula", () => {
  it("reconhece a unidade pelo nome, com ou sem acento", () => {
    expect(isSaoFranciscoDePaula("POLICLINICA SAO FRANCISCO DE PAULA")).toBe(true);
    expect(isSaoFranciscoDePaula("Policlínica São Francisco de Paula")).toBe(true);
    expect(isSaoFranciscoDePaula("POLICLINICA MENINO JESUS")).toBe(false);
    expect(isSaoFranciscoDePaula(null)).toBe(false);
  });

  it("imprime a 1ª parcela mesmo já paga na emissão", () => {
    const itens = parcelasCarneSaoFrancisco([
      parcela(0, "pago"),
      parcela(1, "pago"),
      ...Array.from({ length: 11 }, (_, i) => parcela(i + 2)),
    ]);
    expect(itens.map((p) => p.rotulo)).toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}/12`));
  });

  it("mantém N pelo maior número quando uma parcela foi cancelada", () => {
    const itens = parcelasCarneSaoFrancisco([parcela(1, "cancelado"), parcela(2), parcela(3)]);
    expect(itens.map((p) => p.rotulo)).toEqual(["2/3", "3/3"]);
  });

  it("taxas em aberto vêm antes das mensalidades; taxas pagas não saem", () => {
    const itens = parcelasCarneSaoFrancisco([parcela(-1), parcela(0, "pago"), parcela(1)]);
    expect(itens.map((p) => p.rotulo)).toEqual(["Inclusão", "1/1"]);
  });
});

describe("layout e dados do carnê", () => {
  it("SFP sai em A4; as outras clínicas continuam na bobina 80mm", () => {
    expect(layoutCarne("POLICLINICA SAO FRANCISCO DE PAULA")).toBe("a4");
    expect(layoutCarne("POLICLINICA MENINO JESUS")).toBe("bobina-80mm");
  });

  it("3 fichas por folha", () => {
    expect(folhasDeFichas([1, 2, 3, 4, 5, 6, 7]).map((f) => f.length)).toEqual([3, 3, 1]);
  });

  it("campo vazio no cadastro cai na reserva; logo do branding tem prioridade", () => {
    const vazio = dadosClinicaSfp({ nome: " ", telefone: null, endereco: "" });
    expect(vazio.nome).toBe("Policlínica São Francisco de Paula");
    expect(vazio.whatsapp).toBe("(21) 96736-5396");
    expect(vazio.logo).toBe("/cartao-beneficios/logo-policardmed.png");
    const cheio = dadosClinicaSfp({
      nome: "SFP Cadastro",
      telefone: "(21) 1111-2222",
      endereco: "Rua A, 1",
      cidade: "Meriti",
      estado: "RJ",
      branding: { logo_url: "https://x/logo.png" },
    });
    expect(cheio.nome).toBe("SFP Cadastro");
    expect(cheio.endereco).toBe("Rua A, 1, Meriti RJ");
    expect(cheio.logo).toBe("https://x/logo.png");
  });
});
