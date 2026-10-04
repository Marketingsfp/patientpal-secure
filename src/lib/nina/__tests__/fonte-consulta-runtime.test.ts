import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"]) {
  for (const fonte of ["base", "os"]) for (const sessao of ["nova", "retomada"]) {
    it(`${ambiente}/${sessao}: núcleo entrega ao modelo somente fatos da fonte ${fonte}`, () => {
      const p = Bun.spawnSync([process.execPath, fixture, ambiente, `fonte_${fonte}_${sessao}`], {
        cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15000,
      });
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
      expect(linha).toBeDefined();
      const r = JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
      const entrada = JSON.stringify(r.requests);
      const primeiraEntrada = JSON.stringify(r.requests[0]);
      expect(primeiraEntrada).toContain("dicionario_da_mensagem");
      if (fonte === "base") {
        expect(primeiraEntrada).toContain("variacoes_encontradas");
        expect(primeiraEntrada).toContain("traçado do coração");
        expect(primeiraEntrada).toContain("CONSULTAR_DICIONARIO_PUBLICADO");
        expect(r.etapas.some((e: any) => e.titulo === "Dicionário publicado consultado antes da interpretação")).toBe(true);
      } else {
        expect(primeiraEntrada).toContain("nao_aplicavel");
        expect(primeiraEntrada).not.toContain("variacoes_encontradas");
        expect(primeiraEntrada).not.toContain("CONSULTAR_DICIONARIO_PUBLICADO");
      }
      expect(entrada).toContain(fonte === "base" ? "157,00" : "93,00");
      expect(entrada).not.toContain(fonte === "base" ? "93,00" : "157,00");
      expect(entrada).not.toContain("PROFISSIONAL_DESATUALIZADO");
      expect(entrada).not.toContain("INFORMAR_PIX_ANTECIPADO");
      expect(entrada).not.toContain("Pix tem sempre o mesmo valor do cartão");
      expect(entrada).not.toContain("pagamento somente antecipado, pelo WhatsApp");
      expect(entrada).not.toContain("ANTECEDENCIA_CHEGADA_30_MINUTOS");
      expect(r.resultados[0].dados.fonte_consulta).toBe(fonte === "base" ? "base_conhecimento" : "clinica_os");
      expect(r.etapas.some((e: any) => e.dados?.fonte_consulta === (fonte === "base" ? "base_conhecimento" : "clinica_os"))).toBe(true);
      expect(r.rede).toBe(0);
    });
  }
}
