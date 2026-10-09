import { describe, expect, it } from "bun:test";
import { falhaDeConsultaFocus, segundosPedidosPelaFocus } from "@/lib/nfse.functions";

describe("falha de consulta na Focus", () => {
  it("limite_excedido sem status é falha de consulta", () => {
    const b = {
      codigo: "limite_excedido",
      mensagem:
        "Número máximo de requisições por minuto (100) excedido. Tente novamente em 2 segundos",
    };
    expect(falhaDeConsultaFocus(b)?.codigo).toBe("limite_excedido");
    expect(segundosPedidosPelaFocus(b.mensagem)).toBe(2);
  });
  it("resposta com status não é falha", () => {
    expect(falhaDeConsultaFocus({ status: "autorizado", codigo: "x" })).toBeNull();
    expect(falhaDeConsultaFocus({ status: "processando_autorizacao" })).toBeNull();
    expect(falhaDeConsultaFocus({})).toBeNull();
  });
  it("sem número na mensagem usa 2 s", () => {
    expect(segundosPedidosPelaFocus(null)).toBe(2);
  });
});
