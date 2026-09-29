import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { FERRAMENTAS_DE_VAGAS, semFerramentasDeVaga } from "../consulta-agenda";

// Pedido de 29/09/2026: a Nina só informa os horários habituais e encaminha à
// recepção. Flag nina_agenda_ativa = false remove agendar, cadastro E consulta de vaga.

describe("semFerramentasDeVaga", () => {
  const lista = [
    "consultar_base_conhecimento", "buscar_medicos", "consultar_disponibilidade", "verificar_horario",
    "proxima_vaga", "consultar_primeiro_disponivel", "dados_da_clinica",
  ].map((name) => ({ type: "function", function: { name } }));

  test("remove só as 4 ferramentas de vaga livre", () => {
    const nomes = semFerramentasDeVaga(lista).map((f) => f.function.name);
    expect(nomes).toEqual(["consultar_base_conhecimento", "buscar_medicos", "dados_da_clinica"]);
    for (const n of FERRAMENTAS_DE_VAGAS) expect(nomes).not.toContain(n);
  });

  test("aceita formato sem function e não altera a lista original", () => {
    const original = [{ name: "proxima_vaga" }, { name: "buscar_medicos" }];
    expect(semFerramentasDeVaga(original)).toEqual([{ name: "buscar_medicos" }]);
    expect(original).toHaveLength(2);
  });
});

const codigo = `
const { executarFerramentaPaciente } = await import("@/lib/nina/paciente-tools.server");
const { estadoVazio } = await import("@/lib/nina/fluxo-estado-normalizar");
const nome = await Bun.stdin.text();
const r = await executarFerramentaPaciente({
  clinicaId: "clinica-simulada", telefone: null, pacienteId: null, pacienteNome: null,
  conversaId: "conversa-simulada", origem: "homologacao", teste: true, podeAgendar: false, estado: estadoVazio(),
}, nome.trim(), {});
console.log("RESULTADO=" + JSON.stringify(r));
`;

async function executar(ferramenta: string): Promise<Record<string, unknown>> {
  const p = Bun.spawn([process.execPath, "--eval", codigo], {
    cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
    stdin: "pipe", stdout: "pipe", stderr: "pipe",
  });
  p.stdin.write(ferramenta);
  await p.stdin.end();
  const [saida, erro] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  expect(await p.exited, erro).toBe(0);
  return JSON.parse(saida.split(/\r?\n/).find((l) => l.startsWith("RESULTADO="))!.slice("RESULTADO=".length));
}

describe("defesa na execução com a flag desligada", () => {
  test.each([...FERRAMENTAS_DE_VAGAS, "agendar", "selecionar_horario", "identificar_paciente"])(
    "%s é negada e orienta encaminhar à recepção", async (nome) => {
      const r = await executar(nome);
      expect(r["ok"]).toBe(false);
      expect(r["erro"]).toBe("PERMISSION_DENIED");
    });

  test("a mensagem das ferramentas de vaga manda encaminhar à recepção", async () => {
    const r = await executar("proxima_vaga");
    expect(String(r["mensagem"] ?? r["message"] ?? JSON.stringify(r))).toContain("solicitar_atendente_humano");
  });
});
