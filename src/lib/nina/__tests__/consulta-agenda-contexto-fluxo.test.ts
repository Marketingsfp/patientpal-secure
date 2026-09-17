import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { cenariosContextuais } from "./fixtures/consulta-contextual-cenarios";
import { FERRAMENTAS_DE_VAGAS } from "../consulta-agenda";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));

describe("geração real: ferramentas disponíveis e continuidade contextual (modelo/banco simulados)", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    for (const [cenario, entrada] of Object.entries(cenariosContextuais)) {
      test(`${ambiente}: ${cenario}`, () => {
        const p = Bun.spawnSync([process.execPath, fixture, ambiente, cenario], {
          cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
          stdout: "pipe", stderr: "pipe", timeout: 15_000,
        });
        const output = p.stdout.toString();
        expect(p.exitCode, output + p.stderr.toString()).toBe(0);
        const linha = output.split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
        expect(linha).toBeDefined();
        const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
        expect(r.requests).toHaveLength(entrada.ferramenta ? 2 : 1);
        for (const req of r.requests) {
          const ferramentas = req.tools.map((t: any) => t.function.name);
          for (const nome of FERRAMENTAS_DE_VAGAS) expect(ferramentas).toContain(nome);
          expect(ferramentas).not.toContain("agendar"); // flag de escrita continua separada
          const contexto = JSON.stringify(req.messages);
          expect(contexto).not.toContain('interesse_confirmado');
          expect(contexto).toContain('modelo_com_historico_da_sessao');
          expect(contexto).toContain('pergunta pendente e resposta atual');
          expect(contexto).not.toContain('RESPOSTA_FALHOU');
          expect(contexto).not.toContain('OUTRA_SESSAO');
          expect(contexto).not.toContain('OUTRO_AMBIENTE');
          expect(contexto).not.toContain('OUTRA_CONVERSA');
        }
        const historico = r.requests[0].messages.filter((m: any) => ["assistant", "user"].includes(m.role));
        const textos = historico.map((m: any) => m.content);
        expect(textos).toContain("Gostaria de marcar oftalmologista"); // além das dez últimas
        expect(textos).toContain("com o joao helio");
        expect(textos).toContain(entrada.oferta);
        expect(textos.filter((texto: string) => texto === entrada.pergunta)).toHaveLength(
          entrada.pergunta === "com o joao helio" ? 2 : 1); // repetições legítimas preservadas
        const executadas = r.ferramentas.filter((nome: string) => FERRAMENTAS_DE_VAGAS.has(nome));
        expect(executadas).toEqual(entrada.ferramenta ? [entrada.ferramenta] : []);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.ferramentas).not.toContain("agendar");
        expect(r.motorChamado).toBe(0);
        expect(r.rede).toBe(0);
      });
    }
  }
});
