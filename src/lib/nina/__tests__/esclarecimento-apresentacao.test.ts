import { describe, expect, it } from "bun:test";
import { apresentarPerguntaEsclarecimento } from "../esclarecimento-apresentacao";

describe("pergunta de identificação entregue ao paciente (bateria 02/10, testes 04 e 05)", () => {
  it("profissional: frase de conversa, nomes em lista e sem MAIÚSCULAS", () => {
    const texto = apresentarPerguntaEsclarecimento(
      "Não consegui identificar com segurança qual médico você escolheu. Pode informar novamente qual deseja?\nANDERSON LUIS ELOY AMARAL — NEUROLOGIA\nCARLOS EDUARDO GONCALVES MONTEIRO — NEUROLOGIA, PSIQUIATRIA",
      { tipo: "profissional" },
    );
    expect(texto).not.toContain("você escolheu");
    expect(texto).toContain("• Anderson Luis Eloy Amaral — Neurologia");
    expect(texto).toContain("• Carlos Eduardo Goncalves Monteiro — Neurologia, Psiquiatria");
  });

  it("exame: mantém os nomes publicados como estão, um por linha", () => {
    const texto = apresentarPerguntaEsclarecimento("Qual exame ou procedimento você deseja?\nRX TORAX PA\nRX COLUNA LOMBAR", { tipo: "procedimento" });
    expect(texto).toBe("Encontrei mais de uma opção no cadastro para esse pedido. Qual destas você deseja?\n\n• RX TORAX PA\n• RX COLUNA LOMBAR");
  });

  it("segunda pergunta: o cabeçalho com dois-pontos não vira opção", () => {
    const texto = apresentarPerguntaEsclarecimento(
      "Para identificar o profissional, pode confirmar o nome completo, a especialidade ou a unidade?\nAs opções encontradas são:\nDRA ANA — PEDIATRIA",
      { tipo: "profissional" },
    );
    expect(texto).toContain("As opções encontradas são:\n\n• Dra Ana — Pediatria");
  });

  it("primeira resposta da sessão leva a apresentação", () => {
    const texto = apresentarPerguntaEsclarecimento("Qual exame ou procedimento você deseja?\nA\nB", {
      apresentacao: "Olá! Me chamo Maria, atendente virtual da Policlínica Menino Jesus.",
    });
    expect(texto.startsWith("Olá! Me chamo Maria")).toBe(true);
  });

  it("pergunta sem opções fica igual", () => {
    expect(apresentarPerguntaEsclarecimento("Pode informar por extenso o nome do atendimento?")).toBe(
      "Pode informar por extenso o nome do atendimento?",
    );
  });
});
