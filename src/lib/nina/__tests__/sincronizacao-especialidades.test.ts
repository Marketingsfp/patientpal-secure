import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(
  new URL("./fixtures/sincronizacao-especialidades.fixture.ts", import.meta.url),
);
function executar(cenario: string) {
  const p = Bun.spawnSync([process.execPath, fixture, cenario], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15000,
  });
  expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
  const linha = p.stdout
    .toString()
    .split(/\r?\n/)
    .find((l) => l.startsWith("SINCRONIZACAO="));
  expect(linha).toBeDefined();
  return JSON.parse(linha!.slice("SINCRONIZACAO=".length));
}
describe("botão da base: especialidades de Editar médico", () => {
  test("lê o cadastro correto, mostra na prévia e grava todas as especialidades com os horários", () => {
    const r = executar("completo");
    expect(r.erro).toBeNull();
    expect(r.opcoes[0].detalhe).toBe("Cardiologia · Pediatria");
    expect(r.previa.mudancas.find((m: any) => m.campo === "Especialidades")).toMatchObject({
      antes: "1. Nome: Especialidade antiga",
      depois: "1. Nome: Cardiologia\n2. Nome: Pediatria",
    });
    expect(r.escritasAposPrevia).toBe(0);
    expect(r.escritas).toBe(1);
    expect(r.destino.especialidades.map((e: any) => e.nome)).toEqual(["Cardiologia", "Pediatria"]);
    expect(r.destino.horarios).toEqual([
      {
        dia: "Sábado",
        inicio: "08:00",
        fim: "12:00",
        recorrencia: "Toda semana",
        observacao: null,
      },
    ]);
    expect(r.destino.estrutura.aliases).toEqual(["Médico conhecido"]);
    expect(r.destino.nota_interna).toBe("Conferido");
    expect(r.destino.status).toBe("PUBLICADO");
    expect(r.operacional.map((e: any) => e.nome)).toEqual(["Especialidade antiga"]);
    const leituras = r.leituras.filter((l: any) => l.tabela === "medico_especialidades");
    expect(leituras).toHaveLength(3);
    for (const l of leituras)
      expect(l.filtros).toEqual({ "medicos.clinica_id": "11111111-1111-4111-8111-111111111111" });
  });
  test("lista vazia não ressuscita especialidade do campo antigo ou de outro médico", () => {
    const r = executar("vazio");
    expect(r.erro).toBeNull();
    expect(r.destino.especialidades).toEqual([]);
    expect(r.previa.mudancas.some((m: any) => m.campo === "Especialidades")).toBe(true);
    expect(r.escritas).toBe(1);
  });
  test("copia os IDs e nomes de Editar médico mesmo quando o campo legado está vazio", () => {
    const r = executar("legado_vazio");
    expect(r.erro).toBeNull();
    expect(r.destino.especialidades).toEqual([
      { id: "44444444-4444-4444-8444-444444444444", nome: "Cardiologia" },
      { id: "55555555-5555-4555-8555-555555555555", nome: "Pediatria" },
    ]);
    expect(r.operacional).toEqual([]);
    expect(r.escritas).toBe(1);
  });
  test("paginação inclui médico cujo vínculo está depois dos primeiros mil", () => {
    const r = executar("paginacao");
    expect(r.erro).toBeNull();
    expect(r.destino.especialidades.map((e: any) => e.nome)).toEqual(["Cardiologia"]);
    expect(r.leituras.some((l: any) => l.tabela === "medico_especialidades" && l.de === 1000)).toBe(
      true,
    );
  });
  test.each(["mudanca", "erro", "referencia_ausente"])(
    "%s impede gravação parcial ou prévia desatualizada",
    (cenario) => {
      const r = executar(cenario);
      expect(r.escritas).toBe(0);
      expect(r.destino.especialidades.map((e: any) => e.nome)).toEqual(["Especialidade antiga"]);
      expect(r.erro).toMatch(cenario === "mudanca" ? /mudou/ : /especialidade/i);
    },
  );
});
