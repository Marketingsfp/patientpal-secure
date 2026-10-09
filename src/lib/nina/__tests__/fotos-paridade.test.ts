import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { PEDIR_NOVA_FOTO, FALHA_TECNICA_FOTO, CONFIRMAR_MARCACAO_FOTO } from "../fotos";
function executar(arquivo: string, args: string[], prefixo: string) {
  const p = Bun.spawnSync(
    [process.execPath, fileURLToPath(new URL(`./fixtures/${arquivo}`, import.meta.url)), ...args],
    { stdout: "pipe", stderr: "pipe", timeout: 15000 },
  );
  expect(p.exitCode, p.stderr.toString()).toBe(0);
  const linha = p.stdout
    .toString()
    .split(/\r?\n/)
    .find((l) => l.startsWith(prefixo));
  expect(linha, p.stdout.toString()).toBeDefined();
  return JSON.parse(linha!.slice(prefixo.length));
}
for (const caso of [
  "legivel",
  "ilegivel",
  "invalida",
  "indisponivel",
  "timeout",
  "truncada",
  "recusa",
  "sem_texto",
  "sem_motivo",
])
  it(`leitura visual: ${caso}`, () => {
    const r = executar("fotos-leitura.fixture.ts", [caso], "FOTO=");
    expect(r.resultado.tipo).toBe(
      caso === "legivel" ? "pedido_medico" : caso === "ilegivel" ? "ilegivel" : "falha_tecnica",
    );
    expect(r.requisicao.url).toBe("https://ai.gateway.lovable.dev/v1/messages");
    expect(r.requisicao.model).toBe("anthropic/claude-opus-5-5");
    expect(r.requisicao.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "AQID" },
    });
    expect(r.requisicao.messages[0].role).toBe("user");
    expect(r.requisicao.stream).toBe(false);
    expect(r.requisicao.thinking).toEqual({ type: "adaptive" });
    expect(r.requisicao.max_tokens).toBeGreaterThanOrEqual(16000);
    expect(r.requisicao.temTimeout).toBe(true);
    expect(r.auditoria).toHaveLength(1);
    expect(r.auditoria[0].finalidade).toBe("leitura_imagem");
    expect(r.auditoria[0].modelo).toBe("anthropic/claude-opus-5-5");
    if (!["indisponivel", "timeout"].includes(caso)) {
      expect(r.auditoria[0].consumoEntrada).toBe(123);
      expect(r.auditoria[0].consumoSaida).toBe(45);
    }
    expect(JSON.stringify(r.auditoria)).not.toContain("AQID");
    expect(r.auditoria[0].estado).toBe(
      ["indisponivel", "timeout"].includes(caso) ? "falhou" : "concluido",
    );
  });
it("sem credencial não chama o provedor nem julga a foto", () => {
  const r = executar("fotos-leitura.fixture.ts", ["sem_chave"], "FOTO=");
  expect(r.resultado).toEqual({ tipo: "falha_tecnica", motivo: "configuracao" });
  expect(r.requisicao).toBeUndefined();
  expect(r.auditoria).toHaveLength(0);
});
for (const caso of ["um_marcado", "varios_marcados", "marcacao_incerta"])
  it(`contrato do leitor para seleção: ${caso}`, () => {
    const r = executar("fotos-leitura.fixture.ts", [caso], "FOTO=");
    expect(r.resultado).toEqual(
      caso === "marcacao_incerta"
        ? { tipo: "marcacao_incerta" }
        : {
            tipo: "pedido_medico",
            itens:
              caso === "um_marcado"
                ? ["Doppler de Carótidas e Vértebrais"]
                : ["Doppler de Carótidas e Vértebrais", "ECG"],
          },
    );
    const prompt = r.requisicao.system;
    expect(prompt).toContain("Opções com quadrinhos vazios NÃO são exames solicitados");
    expect(prompt).toContain('tipo "marcacao_incerta"');
    expect(prompt).toContain("não precisa de quadrinhos");
    expect(r.auditoria).toHaveLength(1);
  });
for (const ambiente of ["producao", "homologacao"]) {
  it(`${ambiente}: marcação incerta pede os exames sem nova foto, transferência ou chamada de conversa`, () => {
    const r = executar(
      "resposta-direta.fixture.ts",
      [ambiente, "foto_marcacao_incerta"],
      "DIRETA_RESULTADO=",
    );
    expect(r.resposta.replace(/\s+/g, " ")).toContain(CONFIRMAR_MARCACAO_FOTO);
    expect(r.resposta).toContain("Me chamo Aurora");
    expect(r.resposta).not.toContain("mais nítida");
    expect(r.encaminhamentos).toHaveLength(0);
    expect(r.requests).toHaveLength(0);
  });
  it(`${ambiente}: um exame marcado segue; dois realmente marcados preservam encaminhamento`, () => {
    const unico = executar(
      "resposta-direta.fixture.ts",
      [ambiente, "foto_doppler_marcado"],
      "DIRETA_RESULTADO=",
    );
    expect(unico.requests.length).toBeGreaterThan(0);
    expect(unico.encaminhamentos).toHaveLength(0);
    expect(unico.requests[0].messages.at(-1).content).toBe(
      "Enviei a foto de um pedido médico com: Doppler de Carótidas e Vértebrais.",
    );
    const varios = executar(
      "resposta-direta.fixture.ts",
      [ambiente, "foto_varios_marcados"],
      "DIRETA_RESULTADO=",
    );
    expect(varios.requests).toHaveLength(0);
    expect(varios.encaminhamentos).toHaveLength(1);
    expect(varios.encaminhamentos[0].motivo).toContain("MULTIPLOS_ATENDIMENTOS");
    expect(varios.encaminhamentos[0].motivo).toContain(
      "2 exames (Doppler de Carótidas e Vértebrais; M.A.P.A. 24h)",
    );
  });
  for (const cenario of ["foto_apresentacao_entregue", "foto_apresentacao_falhou", "foto_tecnica"])
    it(`${ambiente}: ${cenario}`, () => {
      const r = executar("resposta-direta.fixture.ts", [ambiente, cenario], "DIRETA_RESULTADO=");
      expect(r.resposta.replace(/\s+/g, " ")).toContain(
        (cenario === "foto_tecnica" ? FALHA_TECNICA_FOTO : PEDIR_NOVA_FOTO).replace(/\s+/g, " "),
      );
      expect(r.resposta.includes("Me chamo Aurora")).toBe(cenario !== "foto_apresentacao_entregue");
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.requests).toHaveLength(0);
    });
  it(`${ambiente}: foto legível segue ao modelo e não aciona limite de leitura`, () => {
    const r = executar(
      "resposta-direta.fixture.ts",
      [ambiente, "foto_resolvida"],
      "DIRETA_RESULTADO=",
    );
    expect(r.requests.length).toBeGreaterThan(0);
    expect(r.encaminhamentos.some((h: { motivo: string }) => h.motivo.startsWith("FOTO_"))).toBe(
      false,
    );
  });
  for (const cenario of [
    "foto_primeira",
    "foto_segunda",
    "foto_pedido_pendente",
    "foto_falha_handoff",
    "foto_obsoleto",
    "foto_sessao_nova",
  ])
    it(`${ambiente}: núcleo real controla ${cenario} antes do modelo`, () => {
      const r = executar("resposta-direta.fixture.ts", [ambiente, cenario], "DIRETA_RESULTADO=");
      expect(r.rede).toBe(0);
      expect(r.requests).toHaveLength(0);
      if (["foto_primeira", "foto_pedido_pendente", "foto_sessao_nova"].includes(cenario)) {
        expect(r.resposta).toContain(PEDIR_NOVA_FOTO);
        expect(r.resposta).toContain("atendente virtual");
        expect(r.resposta).toContain("Me chamo Aurora");
        expect(r.resposta).toContain("Policlínica Vale Verde");
        expect(r.encaminhamentos).toHaveLength(0);
      } else if (cenario === "foto_obsoleto") {
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.resposta).toBe("");
        expect(r.resultado.estado).toBe("descartar");
      } else {
        expect(r.encaminhamentos).toHaveLength(1);
        expect(r.encaminhamentos[0].motivo).toBe("FOTO_NAO_LIDA_APOS_NOVA_TENTATIVA");
        expect(r.resultado.acoesConcluidas[0].confirmada).toBe(cenario !== "foto_falha_handoff");
        if (cenario === "foto_falha_handoff") expect(r.resposta).toContain("Não consegui concluir");
      }
    });
}
it("foto continua disponível à atendente sem enviar a imagem à IA quando a conversa é humana", () => {
  const r = executar("webhook-agrupamento.fixture.ts", ["foto-humano"], "WEBHOOK_RESULTADO=");
  expect(r.leiturasFoto).toBe(0);
  expect(r.entradas).toHaveLength(1);
  expect(r.entradas[0].media_url).toBeTruthy();
  expect(r.saidas).toHaveLength(0);
});
for (const cenario of ["foto-legivel", "foto-ilegivel"])
  it(`${cenario}: webhook e upload guardam a foto e a mesma leitura, sem repetir no retry`, () => {
    const real = executar("webhook-agrupamento.fixture.ts", [cenario], "WEBHOOK_RESULTADO=");
    const teste = executar("teste-console-mj53.fixture.ts", [cenario], "MJ53_RESULTADO=");
    for (const r of [real, teste]) {
      expect(r.leiturasFoto).toBe(1);
      expect(r.entradas).toHaveLength(1);
      expect(r.entradas[0].media_url).toBeTruthy();
      expect(r.entradas[0].tipo).toBe("image");
      expect(r.entradas[0].raw.nina_leitura_imagem.tipo).toBe(
        cenario === "foto-legivel" ? "pedido_medico" : "ilegivel",
      );
      expect(r.entradasGerador[0].texto).toBe(r.entradas[0].transcricao);
      expect(r.saidas).toHaveLength(1);
    }
    expect(real.entradas[0].raw.nina_leitura_imagem).toEqual(
      teste.entradas[0].raw.nina_leitura_imagem,
    );
  });
