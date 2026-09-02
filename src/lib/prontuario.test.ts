import { describe, expect, it } from "bun:test";
import { erroCodigoProntuario, prontuarioExibicao } from "./prontuario";

// O número que vale é o que a recepção digita e confere no campo "Número de
// prontuário" do cadastro — `codigo_prontuario`. O código herdado da
// importação de junho/2026 só aparece quando o campo principal está vazio.
//
// A regra foi definida pelo dono em 02/09/2026 conferindo três cadastros
// contra o papel, e os números abaixo são os reais desses três pacientes.
// Estes testes existem porque a ordem já foi a inversa: até 02/09 o histórico
// ganhava, e a guia saía com o número errado.

describe("prontuarioExibicao", () => {
  it("usa o número de prontuário do cadastro, não o herdado", () => {
    // GILBERTO ALEXANDRINO DA SILVA: aparecia como 378132.
    expect(
      prontuarioExibicao({ codigo_prontuario: "2430133", codigo_prontuario_anterior: "378132" }),
    ).toBe("2430133");
  });

  it("vale também quando o cadastro tem pasta física", () => {
    // VANILDA DOS SANTOS VENTURA: a guia saía com 194897, que é o
    // `codigo_prontuario` de OUTRA paciente.
    expect(
      prontuarioExibicao({
        codigo_prontuario: "1348",
        codigo_prontuario_anterior: "194897",
        numero_pasta: "1348",
      }),
    ).toBe("1348");
  });

  it("cai na pasta quando o número de prontuário está vazio", () => {
    expect(
      prontuarioExibicao({
        codigo_prontuario: "",
        codigo_prontuario_anterior: "84297",
        numero_pasta: "1644",
      }),
    ).toBe("1644");
  });

  it("só usa o herdado quando não há prontuário nem pasta", () => {
    expect(
      prontuarioExibicao({
        codigo_prontuario: null,
        codigo_prontuario_anterior: "130072",
        numero_pasta: null,
      }),
    ).toBe("130072");
  });

  it("trata campo só com espaços como vazio", () => {
    expect(
      prontuarioExibicao({ codigo_prontuario: "   ", codigo_prontuario_anterior: "01234" }),
    ).toBe("01234");
  });

  it("remove espaços em volta do número exibido", () => {
    expect(prontuarioExibicao({ codigo_prontuario: " 2430133 " })).toBe("2430133");
  });

  it("devolve null quando não há nenhum número", () => {
    expect(prontuarioExibicao({ codigo_prontuario: null, codigo_prontuario_anterior: null })).toBe(
      null,
    );
    expect(prontuarioExibicao({ codigo_prontuario: "", codigo_prontuario_anterior: "" })).toBe(
      null,
    );
  });

  it("aceita paciente ainda não carregado", () => {
    expect(prontuarioExibicao(null)).toBe(null);
    expect(prontuarioExibicao(undefined)).toBe(null);
  });

  it("não muda nada para tela que não carrega a coluna da pasta", () => {
    expect(
      prontuarioExibicao({ codigo_prontuario: "2435051", codigo_prontuario_anterior: "01234" }),
    ).toBe("2435051");
  });
});

// Em 19/08/2026 alguém digitou 24378101 no cadastro de um paciente — o
// prontuário 2437810 de outra paciente com um dígito a mais. Como o número
// automático é calculado a partir do maior número da clínica, os 415 cadastros
// seguintes nasceram na faixa dos 8 dígitos, fora da régua do sistema antigo.
// Estes testes travam a recusa na origem, para o erro de digitação não voltar a
// arrastar a numeração inteira.

describe("erroCodigoProntuario", () => {
  it("aceita número dentro da régua de 7 dígitos", () => {
    expect(erroCodigoProntuario("2656813")).toBeNull();
  });

  it("recusa número com 8 dígitos", () => {
    expect(erroCodigoProntuario("24378101")).toContain("7 dígitos");
  });

  it("aceita campo vazio, que faz o banco gerar o número", () => {
    expect(erroCodigoProntuario("")).toBeNull();
    expect(erroCodigoProntuario(null)).toBeNull();
    expect(erroCodigoProntuario(undefined)).toBeNull();
  });

  it("não mexe em código antigo com letra, que continua válido", () => {
    expect(erroCodigoProntuario("AB12345678")).toBeNull();
  });

  it("ignora espaços em volta antes de contar os dígitos", () => {
    expect(erroCodigoProntuario("  2656813  ")).toBeNull();
  });
});
