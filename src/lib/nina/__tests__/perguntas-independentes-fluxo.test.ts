import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("perguntas independentes no núcleo compartilhado (serviços simulados)", () => {
  for (const ambiente of ["producao", "homologacao"])
    for (const caso of ["normal", "invertida", "sequencial", "repetida", "duas_duvidas", "retomada", "obsoleto", "reserva", "reserva_primeiro", "reserva_repetida", "transferencia_ficticia"])
      it(ambiente + ": " + caso, () => {
        const p = Bun.spawnSync(
          [process.execPath, fixture, ambiente, "catalogo_multiplas_" + caso],
          { stdout: "pipe", stderr: "pipe", timeout: 15000 },
        );
        expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
        const linha = p.stdout
          .toString()
          .split(/\r?\n/)
          .find((l) => l.startsWith("DIRETA_RESULTADO="))!;
        const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
        expect(r.rede).toBe(0);
        expect(r.encaminhamentos).toHaveLength(0);
        if (caso.startsWith("reserva")) {
          expect(r.ferramentas.filter((n: string) => n === "agendar")).toHaveLength(1);
          expect(r.estadoPerguntas.appointment.confirmation.vaga.catalogo_id).toBe("usg");
          expect(r.estadoPerguntas.appointment.confirmation.aceita).toBe(true);
        } else expect(r.ferramentas).not.toContain("agendar");
        if (caso === "transferencia_ficticia") {
          expect(r.resposta).not.toContain("Vou encaminhar");
          expect(r.resposta).not.toContain("instabilidade técnica");
          expect(r.resposta).toContain("ainda não foi realizado");
          const alteracao = r.etapas.find((e: any) => e.tipo === "alteracao_posterior");
          expect(alteracao.dados.antes).toContain("Vou encaminhar");
          expect(alteracao.dados.depois).not.toContain("Vou encaminhar");
        }
        if (caso === "obsoleto") {
          expect(r.resposta).toBe("");
          return;
        }
        const salvo = r.gravacoes.filter((g: any) => g.tabela === "atend_conversas" && g.valor.nina_fluxo_estado).at(-1)?.valor.nina_fluxo_estado;
        // Contato é capturado mesmo antes de o paciente escolher um horário.
        expect(salvo?.whatsapp_remetente).toBe("55000100999");
        expect(r.estadoPerguntas.whatsapp_remetente).toBe("55000100999");
        expect(salvo?.knowledge_context?.consulta.termo).toBe("Urologia");
        expect(r.resposta).toContain("Sobre Urologia");
        if (caso === "duas_duvidas") {
          expect(r.resposta).toContain("Sobre Psiquiatria");
          expect(r.resposta).not.toContain("às segundas");
          expect(r.estadoPerguntas.knowledge_context.pendenciasIdentificacao).toHaveLength(2);
          expect(r.estadoPerguntas.knowledge_context.esclarecimento.opcoes).toHaveLength(0);
        } else {
          expect(r.resposta).toContain("Dr. Antonio atende Psiquiatria");
          expect(r.estadoPerguntas.knowledge_context.consulta.termo).toBe("Urologia");
        }
        expect(r.resposta).not.toContain("999");
        expect(r.estadoPerguntas.knowledge_context.esclarecimentoTentativas).toBe(1);
        expect(
          JSON.stringify(r.requests.at(-1).messages.filter((m: any) => m.role === "tool")),
        ).not.toContain("999");
        const chamadas = r.requests[0].messages;
        expect(JSON.stringify(chamadas)).toContain("Perguntas independentes");
        expect(JSON.stringify(chamadas)).toContain("PEDIDOS PARALELOS");
        expect(JSON.stringify(chamadas)).toContain("telefone de contato usa por padrão o número do remetente");
      });
});
