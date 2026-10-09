import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"])
  for (const caso of ["", "_clinica_os", "_parcial", "_falha", "_nova_sessao", "_obsoleto"]) {
    test(`${ambiente}/confirmação plural${caso}: reconsulta e composição no núcleo real com serviços simulados`, () => {
      const proc = Bun.spawnSync(
        [process.execPath, fixture, ambiente, "catalogo_confirmacao_plural" + caso],
        {
          cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
          stdout: "pipe",
          stderr: "pipe",
          timeout: 15000,
        },
      );
      expect(proc.exitCode, proc.stderr.toString()).toBe(0);
      const linha = proc.stdout
        .toString()
        .split(/\r?\n/)
        .find((l) => l.startsWith("DIRETA_RESULTADO="))!;
      const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
      expect(r.rede).toBe(0);
      expect(r.encaminhamentos).toEqual([]);
      expect(r.ferramentas.every((f: string) => f === "consultar_cadastro")).toBe(true);
      const termos = r.argumentosFerramentas.map((f: any) => f.args.termo);
      if (["_nova_sessao", "_obsoleto"].includes(caso)) {
        expect(termos).toEqual([]);
      } else {
        expect(termos).toEqual(
          caso === "_parcial"
            ? ["RM DE JOELHO (CADA LADO)"]
            : ["RX TORAX AP/PERFIL", "RM DE JOELHO (CADA LADO)"],
        );
        expect(r.resposta).toContain("preparo");
        expect(r.resposta).not.toContain("Você se refere a RM");
        if (["_parcial", "_falha"].includes(caso))
          expect(r.resposta).toContain("Você se refere a RX");
        else expect(r.resposta).not.toContain("Você se refere");
        const reconsultas = r.etapas.filter(
          (e: any) => e.titulo === "Identificação confirmada e reconsultada",
        );
        expect(reconsultas).toHaveLength(termos.length);
        expect(reconsultas.every((e: any) => e.dados.permite_reservar === false)).toBe(true);
        expect(reconsultas.at(-1).dados.pendencias_restantes).toHaveLength(
          ["_parcial", "_falha"].includes(caso) ? 1 : 0,
        );
      }
    });
  }
