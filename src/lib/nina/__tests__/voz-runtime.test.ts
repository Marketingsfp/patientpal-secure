import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

for (const caso of ["sucesso", "falha", "sem_acesso"])
  it(`prévia autenticada e isolada: ${caso}`, () => {
    const p = Bun.spawnSync(
      [
        process.execPath,
        fileURLToPath(new URL("./fixtures/voz-previa.fixture.ts", import.meta.url)),
        caso,
      ],
      { stdout: "pipe", stderr: "pipe", timeout: 15000 },
    );
    expect(p.exitCode, p.stderr.toString()).toBe(0);
    const r = JSON.parse(
      p.stdout
        .toString()
        .split(/\r?\n/)
        .find((l) => l.startsWith("PREVIA="))!
        .slice(7),
    );
    if (caso === "sem_acesso") {
      expect(r.erro).toContain("permissão");
      expect(r.chamadas).toHaveLength(0);
      expect(r.gravacoes).toHaveLength(0);
    } else {
      expect(r.chamadas).toHaveLength(1);
      expect(r.chamadas[0]).toMatchObject({ voice: "cedar", speed: 1.2, response_format: "mp3" });
      expect(r.gravacoes).toHaveLength(1);
      expect(r.gravacoes[0].tabela).toBe("audit_log");
      expect(r.gravacoes[0].valor.action).toBe("NINA_VOZ_PREVIA");
      expect(r.gravacoes[0].valor.dados_depois.chamadas).toHaveLength(1);
      if (caso === "falha") expect(r.erro).toContain("Nada foi salvo");
      else expect(r.resultado).toMatchObject({ base64: "SUQzAQ==", mime: "audio/mpeg" });
    }
  });

for (const caso of [
  "personalizada",
  "expansao_fala",
  "prefere_texto",
  "longa_texto",
  "limite_personalizado",
  "falha_leitura",
])
  it(`configuração aplicada no gerador compartilhado: ${caso}`, () => {
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
    if (["prefere_texto", "longa_texto", "falha_leitura"].includes(caso)) {
      expect(r.audio).toBeNull();
      expect(r.chamadas).toHaveLength(0);
      expect(r.arquivos).toHaveLength(0);
    } else if (caso === "personalizada") {
      expect(r.chamadas).toHaveLength(1);
      expect(r.chamadas[0]).toMatchObject({
        voice: "coral",
        speed: 0.85,
        model: "openai/gpt-4o-mini-tts",
      });
      expect(r.chamadas[0].instructions).toContain("acolhedor");
      expect(r.chamadas[0].instructions).toContain("ECG letra por letra");
      expect(r.auditoria).toHaveLength(1);
    } else {
      expect(r.audio.longa).toBe(true);
      expect(r.audio.texto).toContain("detalhes por escrito");
    }
  });
