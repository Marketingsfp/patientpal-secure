/**
 * FASE 6 — configuração versionada e interface honesta.
 *
 * O que estes testes provam:
 *  - mudar HIGH de 90 para 98 gera OUTRA identidade de configuração;
 *  - versão do algoritmo não se confunde com versão da configuração;
 *  - ajuste inválido é descartado sozinho, preservando a última válida;
 *  - proposta que exige código nunca entra em vigor;
 *  - o selo nunca apresenta avaliação de AÇÃO como confiança do texto.
 */
import { describe, expect, test } from "bun:test";
import {
  configuracaoPadrao,
  hashConfiguracao,
  montarConfiguracao,
  validarAjusteNaConfiguracao,
  exigeImplementacaoDeCodigo,
} from "./configuracao";
import { POLITICA_PADRAO, VERSAO_POLITICA } from "./policy";
import { rotuloConfianca, ehAltaConfiancaComErro } from "@/lib/nina/confianca-badge";
import type { ConfiancaDaMensagem } from "@/lib/nina/confianca.functions";

const humano = "user-1";

function proposta(over: Partial<Parameters<typeof montarConfiguracao>[0][number]> = {}) {
  return {
    id: "p1",
    tipo: "AJUSTAR_LIMITE",
    alvo: "limites.HIGH",
    valor: 98,
    aplicadoEm: "2026-09-10T12:00:00.000Z",
    aplicadoPor: humano,
    ...over,
  };
}

describe("identidade da configuração", () => {
  test("HIGH de 90 para 98 gera nova identidade", () => {
    const antes = configuracaoPadrao();
    const depois = montarConfiguracao([proposta()]);
    expect(antes.parametros.limites.HIGH).toBe(90);
    expect(depois.parametros.limites.HIGH).toBe(98);
    expect(depois.configId).not.toBe(antes.configId);
    expect(depois.vigenteDesde).toBe("2026-09-10T12:00:00.000Z");
  });

  test("versão do algoritmo é diferente da versão da configuração", () => {
    const cfg = montarConfiguracao([proposta()]);
    expect(cfg.versaoPolitica).toBe(VERSAO_POLITICA);
    expect(cfg.configId).not.toBe(VERSAO_POLITICA);
    expect(cfg.configId).not.toBe(hashConfiguracao(POLITICA_PADRAO));
  });

  test("mesma configuração produz a mesma identidade", () => {
    expect(montarConfiguracao([proposta()]).configId).toBe(
      montarConfiguracao([proposta()]).configId,
    );
  });
});

describe("validação dos ajustes", () => {
  test("ajuste inválido é descartado sem derrubar os válidos", () => {
    const cfg = montarConfiguracao([
      proposta(),
      proposta({ id: "p2", alvo: "limites.MEDIUM", valor: 999 }),
    ]);
    expect(cfg.parametros.limites.HIGH).toBe(98);
    expect(cfg.parametros.limites.MEDIUM).toBe(POLITICA_PADRAO.limites.MEDIUM);
    expect(cfg.propostasAplicadas).toHaveLength(1);
    expect(cfg.propostasDescartadas[0]?.id).toBe("p2");
  });

  test("ajuste sem responsável humano não vale", () => {
    const cfg = montarConfiguracao([proposta({ aplicadoPor: null })]);
    expect(cfg.parametros.limites.HIGH).toBe(90);
    expect(cfg.propostasDescartadas[0]?.motivo).toBe("sem_responsavel_humano");
  });

  test("proposta que exige código fica como implementação pendente", () => {
    expect(exigeImplementacaoDeCodigo("NOVO_BLOQUEADOR")).toBe(true);
    expect(exigeImplementacaoDeCodigo("REVISAR_VALIDADOR")).toBe(true);
    expect(exigeImplementacaoDeCodigo("AJUSTAR_PESO")).toBe(false);
    const cfg = montarConfiguracao([
      proposta({ tipo: "NOVO_BLOQUEADOR", alvo: "categoria.preco", valor: 0 }),
    ]);
    expect(cfg.propostasAplicadas).toHaveLength(0);
    expect(cfg.propostasComImplementacaoPendente[0]?.motivo).toBe(
      "exige_implementacao_de_codigo",
    );
    expect(cfg.configId).toBe(configuracaoPadrao().configId);
  });

  test("combinação inválida é recusada antes de entrar em vigor", () => {
    const atual = montarConfiguracao([proposta({ alvo: "limites.HIGH", valor: 80 })]);
    const r = validarAjusteNaConfiguracao(atual, proposta({ alvo: "limites.MEDIUM", valor: 85 }));
    expect(r.ok).toBe(false);
  });

  test("bloqueador absoluto não pode ser mexido por esta via", () => {
    const r = validarAjusteNaConfiguracao(
      configuracaoPadrao(),
      proposta({ alvo: "bloqueadoresAbsolutos.CONFLITO_DE_FONTE", valor: 0 }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("falha de leitura declarada", () => {
  test("fallback nunca se apresenta como política da clínica", () => {
    const cfg = montarConfiguracao([], {
      origemFalha: "fallback_padrao",
      motivoFalha: "leitura_falhou",
    });
    expect(cfg.origem).toBe("fallback_padrao");
    expect(cfg.degradada).toBe(true);
    expect(cfg.motivoDegradacao).toBe("leitura_falhou");
  });
});

describe("selo da mensagem", () => {
  const base: ConfiancaDaMensagem = {
    execucao_id: "e1",
    score: 96,
    nivel: "HIGH",
    resultado: "ALLOW",
    bloqueadores: [],
    registrado_em: "2026-09-10T12:00:00.000Z",
    policy_version: "v5",
    erro_reportado: { id: "x", status: "aberto", categoria: null, created_at: "" },
    alta_confianca_com_erro: true,
    avaliacao: "answer_confidence",
    config_id: "cfg:v5:abc",
  };

  test("com avaliação da resposta, mostra o índice", () => {
    expect(rotuloConfianca(base).avaliada).toBe(true);
    expect(rotuloConfianca(base).texto).toContain("96");
  });

  test("só com segurança de ação, a mensagem fica não avaliada", () => {
    const so = { ...base, avaliacao: "action_safety" as const };
    expect(rotuloConfianca(so).avaliada).toBe(false);
    expect(rotuloConfianca(so).texto).toBe("Resposta não avaliada");
    expect(rotuloConfianca(so).score).toBeNull();
    expect(ehAltaConfiancaComErro(so)).toBe(false);
  });
});
