import { describe, expect, test } from "bun:test";
import {
  fingerprintFontesNina,
  fonteDoRuntimeNina,
} from "../../../../scripts/nina-runtime-fingerprint";

describe("fingerprint dos fontes do atendimento Nina", () => {
  test("mesmo conteúdo em checkouts diferentes mantém identidade, inclusive CRLF e ordem", () => {
    const a = { caminho: "src/lib/nina/engine.ts", conteudo: "const x = 1;\n" };
    const b = { caminho: "src/lib/whatsapp.server.ts", conteudo: "export {};\n" };
    expect(fingerprintFontesNina([a, b])).toBe(
      fingerprintFontesNina([
        { ...b, caminho: "src\\lib\\whatsapp.server.ts", conteudo: "export {};\r\n" },
        a,
      ]),
    );
  });

  test("alteração, adição ou remoção de fonte muda identidade mesmo sem mudar versão manual", () => {
    const a = { caminho: "src/lib/nina/engine.ts", conteudo: "ALLOW" };
    const b = { caminho: "src/lib/nina/guard.ts", conteudo: "UNKNOWN" };
    const original = fingerprintFontesNina([a]);
    expect(original).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fingerprintFontesNina([{ ...a, conteudo: "HANDOFF" }])).not.toBe(original);
    expect(fingerprintFontesNina([a, b])).not.toBe(original);
    expect(fingerprintFontesNina([])).not.toBe(original);
  });

  test("inclui núcleo, ambos os adaptadores e dependências de build, sem segredos ou testes", () => {
    for (const p of [
      "src/lib/nina/confidence/obrigacoes.ts",
      "src/lib/nina/teste-console.server.ts",
      "src/lib/whatsapp.server.ts",
      "src/routes/api/public/whatsapp.$clinicaId.ts",
      "src/lib/atendimento/handoff.server.ts",
      "src/integrations/supabase/client.server.ts",
      "package.json",
      "bun.lock",
      "vite.config.ts",
    ])
      expect(fonteDoRuntimeNina(p)).toBe(true);
    for (const p of [
      ".env",
      ".dev.vars",
      "docs/nina/exemplo.md",
      "src/lib/nina/engine.test.ts",
      "src/lib/nina/__tests__/fixtures/exemplo.ts",
      "src/lib/nina/confidence/fixtures/prompt-publicado-v19.ts",
      "src/components/nina/NinaMessage.tsx",
      "src/lib/financeiro.functions.ts",
    ])
      expect(fonteDoRuntimeNina(p)).toBe(false);
  });
});
