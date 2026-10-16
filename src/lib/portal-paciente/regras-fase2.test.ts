import { describe, expect, it } from "bun:test";
import {
  LINK_VALIDADE_MIN,
  contarNovos,
  expiraLink,
  linkValido,
  situacaoPagamento,
  somenteDoPaciente,
  tipoLiberavel,
  urlNfsePermitida,
} from "./regras-fase2";

const agora = new Date("2026-10-16T12:00:00Z");
const A = { clinica_id: "c1", paciente_id: "pA" };

describe("isolamento", () => {
  const linhas = [
    { id: "1", clinica_id: "c1", paciente_id: "pA", liberado_paciente_em: "2026-10-01T00:00:00Z" },
    { id: "2", clinica_id: "c1", paciente_id: "pB", liberado_paciente_em: "2026-10-01T00:00:00Z" },
    { id: "3", clinica_id: "c2", paciente_id: "pA", liberado_paciente_em: "2026-10-01T00:00:00Z" },
    { id: "4", clinica_id: "c1", paciente_id: "pA", liberado_paciente_em: null },
  ];
  it("paciente A não vê documento de B nem de outra clínica", () => {
    expect(somenteDoPaciente(linhas, A, true).map((l) => l.id)).toEqual(["1"]);
  });
  it("documento não liberado nunca aparece", () => {
    expect(somenteDoPaciente(linhas, A, true).some((l) => l.id === "4")).toBe(false);
  });
  it("retirar liberação esconde na hora", () => {
    const retirado = linhas.map((l) => (l.id === "1" ? { ...l, liberado_paciente_em: null } : l));
    expect(somenteDoPaciente(retirado, A, true)).toEqual([]);
  });
  it("pagamentos (sem liberação) também só do próprio paciente", () => {
    expect(somenteDoPaciente(linhas, A, false).map((l) => l.id)).toEqual(["1", "4"]);
  });
});

describe("link temporário", () => {
  it("vale 5 minutos e depois expira", () => {
    expect(LINK_VALIDADE_MIN).toBe(5);
    const exp = expiraLink(agora);
    expect(linkValido(exp, new Date(agora.getTime() + 4 * 60_000))).toBe(true);
    expect(linkValido(exp, new Date(agora.getTime() + 5 * 60_000))).toBe(false);
  });
});

describe("tipos e notas", () => {
  it("contrato nunca vai para o portal", () => {
    expect(tipoLiberavel("contrato")).toBe(false);
    expect(tipoLiberavel("receita")).toBe(true);
  });
  it("só baixa nota do emissor", () => {
    expect(urlNfsePermitida("https://api.focusnfe.com.br/arquivos/x.xml")).toBe(true);
    expect(urlNfsePermitida("https://focusnfe.s3.sa-east-1.amazonaws.com/a.pdf")).toBe(true);
    expect(urlNfsePermitida("https://evil.com/a.pdf")).toBe(false);
    expect(urlNfsePermitida("http://api.focusnfe.com.br/a.pdf")).toBe(false);
  });
  it("conta documentos novos desde o último acesso", () => {
    const l = ["2026-10-01T00:00:00Z", "2026-10-10T00:00:00Z", null];
    expect(contarNovos(l, "2026-10-05T00:00:00Z")).toBe(1);
    expect(contarNovos(l, null)).toBe(2);
  });
  it("situação do pagamento", () => {
    expect(situacaoPagamento("confirmado")).toBe("pago");
    expect(situacaoPagamento("pendente")).toBe("em_aberto");
    expect(situacaoPagamento("cancelado")).toBe("cancelado");
  });
});
