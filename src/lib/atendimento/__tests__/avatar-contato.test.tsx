import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AvatarContato } from "@/components/nina/AvatarContato";
import { iniciaisDoNome } from "@/lib/atendimento/rotulo-conversa";

describe("iniciais do contato", () => {
  it("primeira letra do primeiro e do último nome, em maiúsculas", () => {
    expect(iniciaisDoNome("Quédima Silva")).toBe("QS");
    expect(iniciaisDoNome("maria de fátima souza")).toBe("MS");
    expect(iniciaisDoNome("Álvaro")).toBe("Á");
  });

  it("ignora emojis e símbolos no começo e sem nome devolve null", () => {
    expect(iniciaisDoNome("🌸 Ana Paula")).toBe("AP");
    expect(iniciaisDoNome("  ")).toBeNull();
    expect(iniciaisDoNome(null)).toBeNull();
    expect(iniciaisDoNome("😀")).toBeNull();
  });
});

describe("avatar do contato", () => {
  it("sem foto mostra as iniciais", () => {
    const html = renderToStaticMarkup(<AvatarContato nome="Quédima Silva" />);
    expect(html).toContain("QS");
  });

  it("sem nome mostra um ícone, não letras", () => {
    const html = renderToStaticMarkup(<AvatarContato nome={null} />);
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/>[A-Z]{1,2}</);
  });
});

describe("painel Contato da caixa de entrada", () => {
  const fonte = readFileSync("src/components/nina/AtendimentoExtraTabs.tsx", "utf8");

  it("não tem mais o botão Revisar vínculo nem as notas internas", () => {
    expect(fonte).not.toContain("Revisar vínculo");
    expect(fonte).not.toContain("RevisarVinculoDialog");
    expect(fonte).not.toContain("Notas internas");
    expect(fonte).not.toContain("listarNotas");
    expect(fonte).not.toContain("criarNota");
  });

  it("o telefone mostrado é o do WhatsApp, sem cair no do cadastro", () => {
    expect(fonte).not.toContain("contatoAtual.paciente?.telefone");
    expect(fonte).not.toContain("contatoAtual.paciente.telefone");
    expect(fonte).toContain("<AvatarContato");
  });
});
