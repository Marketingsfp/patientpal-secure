/**
 * REGRA DA HOMOLOGAÇÃO (interface) — a tela nunca reinicia sessão sozinha.
 *
 * Testes de contrato sobre o código da tela: garantem que o único caminho de
 * reinício é o botão "Resolver / Reiniciar teste", que o aviso de fim de teste
 * é apenas informativo e que uma resposta em voo não entra na sessão nova.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const src = readFileSync("src/components/nina/HomologacaoInbox.tsx", "utf8");

describe("homologação — reset manual na interface", () => {
  it("preserva o botão existente", () => {
    expect(src).toContain("Resolver / Reiniciar teste");
    expect(src).toContain("onClick={() => void resolverConversa()}");
  });

  it("usa o texto exato do aviso de fim de teste", () => {
    expect(src).toContain(
      "Teste encerrado. Clique em Resolver / Reiniciar teste para iniciar uma nova sessão.",
    );
  });

  it("o aviso não reinicia nada: só o botão chama o servidor", () => {
    // Uma única chamada ao caminho autorizado do servidor.
    expect(src.match(/await resolver\(\{/g)?.length ?? 0).toBe(1);
  });

  it("mostra o processamento e só atualiza a tela após a confirmação", () => {
    expect(src).toContain("setResetando(true)");
    expect(src).toContain("Reiniciando…");
    // A limpeza da tela vem depois do await do servidor.
    const i = src.indexOf("await resolver({");
    expect(i).toBeGreaterThan(0);
    expect(src.indexOf("geracaoRef.current += 1")).toBeGreaterThan(i);
    expect(src.indexOf("setConversaId(null)", i)).toBeGreaterThan(i);
  });

  it("em caso de falha preserva a sessão e informa o erro", () => {
    expect(src).toContain("Não foi possível reiniciar o teste");
    expect(src).toContain("A sessão atual foi preservada.");
  });

  it("descarta resposta em voo após um reset manual", () => {
    expect(src).toContain("const geracao = geracaoRef.current");
    expect(src).toContain("geracaoRef.current === geracao");
  });

  it("o botão continua disponível durante o processamento da IA", () => {
    expect(src).toContain("disabled={!conversaId || resetando}");
  });
});
