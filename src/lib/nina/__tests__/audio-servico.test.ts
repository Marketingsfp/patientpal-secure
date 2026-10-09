import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
for (const caso of ["recebido", "pedido", "texto", "desativado", "longa", "falha", "json"])
  it(`voz e persistência: ${caso}`, () => {
    const p = Bun.spawnSync(
      [
        process.execPath,
        fileURLToPath(new URL("./fixtures/audio-servico.fixture.ts", import.meta.url)),
        caso,
      ],
      { stdout: "pipe", stderr: "pipe", timeout: 15000 },
    );
    expect(p.exitCode, p.stderr.toString()).toBe(0);
    const r = JSON.parse(
      p.stdout
        .toString()
        .split(/\r?\n/)
        .find((l) => l.startsWith("AUDIO="))!
        .slice(6),
    );
    expect(r.auditoria).toHaveLength(r.chamadas.length);
    expect(
      r.auditoria.every(
        (c: any) => c.finalidade === "sintese_voz" && c.modelo === "openai/gpt-4o-mini-tts",
      ),
    ).toBe(true);
    if (["texto", "desativado"].includes(caso)) {
      expect(r.audio).toBeNull();
      expect(r.chamadas).toHaveLength(0);
    } else if (["falha", "json"].includes(caso)) {
      expect(r.audio).toBeNull();
      expect(r.chamadas).toHaveLength(2);
      expect(r.arquivos).toHaveLength(0);
    } else {
      expect(r.chamadas).toHaveLength(1);
      expect(r.audio.texto).toBe(r.chamadas[0].input);
      expect(r.audio.longa).toBe(caso === "longa");
      expect(r.arquivos[0].bucket).toBe("whatsapp-midia");
      expect(r.arquivos[0].caminho).toStartWith("clinica/");
      expect(r.vinculos[0].valor.media_url).toBe(r.arquivos[0].caminho);
      expect(r.avaliacao.decisaoId).toBeNull();
    }
  });
