import { describe, expect, test } from "bun:test";
import {
  arquivoPermitido,
  arquivosPermitidos,
  extrairTrecho,
  linguagemDoArquivo,
  ocultarSensiveis,
} from "../codigo";
import { NODES_ARQUITETURA } from "../manifesto";

describe("liberação de arquivos", () => {
  test("só libera arquivos citados no manifesto", () => {
    const permitidos = arquivosPermitidos();
    expect(permitidos.size).toBeGreaterThan(0);
    for (const node of NODES_ARQUITETURA) {
      if (node.arquivo) expect(arquivoPermitido(node.arquivo)).toBe(true);
    }
  });

  test("bloqueia arquivos fora do manifesto e travessia de caminho", () => {
    expect(arquivoPermitido(".env")).toBe(false);
    expect(arquivoPermitido("../../etc/passwd")).toBe(false);
    expect(arquivoPermitido("src/integrations/supabase/client.server.ts")).toBe(false);
  });
});

describe("ocultação de conteúdo sensível", () => {
  const casos = [
    'const key = "sb_secret_abc123";',
    "const token = process.env['SUPABASE_SERVICE_ROLE_KEY'];",
    'headers: { Authorization: `Bearer ${jwt}` }',
    'const senha = "12345";',
    "const apiKey = import.meta.env.VITE_ALGO;",
    'const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc";',
    'document.cookie = "sessao=1";',
  ];

  for (const linha of casos) {
    test(`oculta: ${linha.slice(0, 30)}`, () => {
      const { linhas, ocultou } = ocultarSensiveis([linha]);
      expect(ocultou).toBe(true);
      expect(linhas[0]).toContain("conteúdo sensível oculto");
      expect(linhas[0]).not.toContain("sb_secret");
      expect(linhas[0]).not.toContain("eyJ");
    });
  }

  test("mantém código comum intacto", () => {
    const { linhas, ocultou } = ocultarSensiveis(["const total = itens.length;"]);
    expect(ocultou).toBe(false);
    expect(linhas[0]).toBe("const total = itens.length;");
  });
});

describe("extração de trecho", () => {
  const fonte = [
    "// cabeçalho",
    "import x from 'y';",
    "",
    "export async function lookupAvailability(dados: unknown) {",
    "  const secretKey = 'abc';",
    "  return dados;",
    "}",
  ].join("\n");

  test("recorta em volta da função e oculta segredo", () => {
    const trecho = extrairTrecho("src/lib/exemplo.ts", fonte, "lookupAvailability()");
    expect(trecho.funcao).toBe("lookupAvailability");
    expect(trecho.linguagem).toBe("typescript");
    expect(trecho.trecho).toContain("lookupAvailability");
    expect(trecho.trecho).not.toContain("'abc'");
    expect(trecho.ocultouSensivel).toBe(true);
    expect(trecho.linhaInicial).toBeGreaterThanOrEqual(1);
  });

  test("sem função conhecida devolve o começo do arquivo", () => {
    const trecho = extrairTrecho("src/lib/exemplo.tsx", fonte, "naoExiste");
    expect(trecho.linhaInicial).toBe(1);
    expect(trecho.linguagem).toBe("tsx");
  });

  test("nunca devolve o arquivo inteiro de fontes longas", () => {
    const longo = Array.from({ length: 500 }, (_, i) => `linha ${i}`).join("\n");
    const trecho = extrairTrecho("src/lib/exemplo.ts", longo, undefined);
    expect(trecho.trecho.split("\n").length).toBeLessThanOrEqual(46);
  });

  test("linguagem por extensão", () => {
    expect(linguagemDoArquivo("a.sql")).toBe("sql");
    expect(linguagemDoArquivo("a.md")).toBe("texto");
  });
});
