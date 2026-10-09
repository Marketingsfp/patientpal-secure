import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { arquivosPermitidos } from "../codigo";
import { codigoFontesArquitetura } from "../../../../../scripts/nina-arquitetura-fontes";

test("o pacote contém exatamente as fontes permitidas, com imports lazy", () => {
  const codigo = codigoFontesArquitetura();
  const imports = [...codigo.matchAll(/import\("\/([^"?]+)\?raw"\)/g)].map((m) => m[1]!);
  const permitidos = [...arquivosPermitidos()].filter((p) => /^src\/.*\.tsx?$/.test(p)).sort();
  expect(imports).toEqual(permitidos);
  for (const arquivo of imports) expect(existsSync(arquivo)).toBe(true);
  expect(codigo).not.toContain("import.meta.glob");
  expect(codigo).not.toContain("integrations/supabase/types.ts");
  expect(codigo).not.toContain(".test.ts");
  expect(codigo).not.toContain("__tests__");
  expect(codigo).toContain("() => import(");
});
