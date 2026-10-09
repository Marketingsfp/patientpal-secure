import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { REGRA_ESCOLHA_PROFISSIONAL_NOMINAL } from "../prompt/regras-catalogo";
import { PROMPT_NINA_WHATSAPP_V4 } from "../prompt/behavior-v4";
import { validarTemplateInstrucoes } from "../instrucoes-template";

test("referência mantém o contrato de publicação com escolha apenas de médicos por nome", () => {
  expect(validarTemplateInstrucoes("whatsapp", PROMPT_NINA_WHATSAPP_V4).ok).toBe(true);
  expect(PROMPT_NINA_WHATSAPP_V4).toContain(REGRA_ESCOLHA_PROFISSIONAL_NOMINAL);
});

// Modelo e serviços simulados: comprova o contrato efetivo com publicação
// legada, preservação da fonte e ausência de efeitos extras; não mede adesão do modelo real.
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"])
  for (const [cenario, nome] of [
    ["catalogo_laboratorio", "LABORATÓRIO"],
    ["catalogo_enfermagem", "ENFERMAGEM"],
    ["catalogo_nome_proprio", "DRA. ANA SOUZA"],
  ])
    test(`${ambiente}: ${nome} recebe a regra efetiva preservando o executante`, () => {
      const p = Bun.spawnSync([process.execPath, fixture, ambiente, cenario], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 15000,
      });
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const linha = p.stdout
        .toString()
        .split(/\r?\n/)
        .find((l) => l.startsWith("DIRETA_RESULTADO="))!;
      const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
      expect(r.prompt).not.toContain(REGRA_ESCOLHA_PROFISSIONAL_NOMINAL);
      expect(r.requests).toHaveLength(2);
      for (const request of r.requests) {
        const sistema = request.messages
          .filter((m: any) => m.role === "system")
          .map((m: any) => m.content)
          .join("\n");
        expect(sistema).toContain(REGRA_ESCOLHA_PROFISSIONAL_NOMINAL);
        expect(sistema).toContain("ESCOLHA_PROFISSIONAL_NOMINAL");
      }
      const retorno = r.requests[1].messages.find((m: any) => m.role === "tool");
      expect(JSON.stringify(retorno)).toContain(nome);
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.ferramentas).not.toContain("agendar");
      expect(r.rede).toBe(0);
    });
