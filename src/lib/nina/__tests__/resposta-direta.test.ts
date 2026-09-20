import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
describe("Nina sem motor — geração real com dependências externas simuladas", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    it(`${ambiente}: interpreta, consulta a base e responde sem avaliador adicional`, () => {
      const p = Bun.spawnSync([process.execPath, fixture, ambiente], {
        cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
        stdout: "pipe", stderr: "pipe", timeout: 15_000,
      });
      const output = p.stdout.toString();
      expect(p.exitCode, output + p.stderr.toString()).toBe(0);
      const linha = output.split(/\r?\n/).find((l) => l.startsWith("DIRETA_RESULTADO="));
      expect(linha).toBeDefined();
      const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
      expect(r.resposta).toBe(r.respostaModelo);
      expect(r.requests).toHaveLength(2);
      expect(r.ordem).toEqual(["modelo", "consultar_base_conhecimento", "modelo"]);
      expect(JSON.stringify(r.requests)).toContain(r.prompt);
      expect(JSON.stringify(r.requests)).toContain("95,00");
      expect(JSON.stringify(r.requests)).toContain("Sem jejum");
      // Mesma geração de produção/homologação recebe o relógio do servidor.
      const textoRequest = JSON.stringify(r.requests);
      expect(textoRequest).toContain("saudacao_do_periodo");
      expect(textoRequest).toContain("datas_referencia");
      expect(textoRequest).toContain("America/Sao_Paulo");
      expect(r.ferramentas).toEqual(["consultar_base_conhecimento"]);
      expect(r.motorChamado).toBe(0);
      expect(r.rede).toBe(0);
      expect(r.temNota).toBe(false);
      expect(r.gravacoes.some((g: any) => g.tabela === "nina_prompt_snapshots")).toBe(true);
      expect(r.gravacoes.some((g: any) => g.tabela === "nina_confianca_decisoes")).toBe(false);
      expect(r.gravacoes.find((g: any) => g.tabela === "nina_confianca_vinculos")?.valor).toMatchObject({
        decisao_id: null, outgoing_message_id: "saida-direta", estado: "persistida",
        texto_hash: "hash-direto", execucao_id: "execucao-direta",
      });
    });
  }
});
