import { describe, expect, test } from "bun:test";
import type { ResultadoDistribuicaoFila } from "@/lib/atendimento/distribuicao-contrato";
import {
  avisoPresencaConfirmada,
  mensagemDistribuicaoFila,
  textoCargaAtendente,
} from "./distribuicao-fila-ui";

const resultado = (extra: Partial<ResultadoDistribuicaoFila> = {}): ResultadoDistribuicaoFila => ({
  status: "concluida",
  distribuidas: 0,
  pendentes: 0,
  motivo: null,
  ...extra,
});

describe("resultado da distribuição no controle de presença", () => {
  test("Online não tem limite: a carga é só informativa", () => {
    expect(textoCargaAtendente(22)).toBe("22 conversa(s) ativa(s), sem limite.");
  });
  test("Pausa para saída aparece com o próprio nome e sem receber conversas", () => {
    const aviso = avisoPresencaConfirmada(
      "PAUSA_SAIDA",
      resultado({
        pendentes: 2,
        status: "bloqueada",
        motivo: "sem_atendentes_elegiveis",
        meu: { carga_atual: 3, capacidade: null, elegivel: false, motivo: "escolha_manual_pausa_saida" },
      }),
    );
    expect(aviso.texto).toContain("Em pausa para saída.");
    expect(aviso.texto).toContain("Você está em pausa para saída e não recebe novas conversas.");
  });

  test("sem limite não inventa capacidade cinco nem impede carga maior", () => {
    expect(textoCargaAtendente(12)).toBe("12 conversa(s) ativa(s), sem limite.");
    const aviso = mensagemDistribuicaoFila(
      resultado({
        distribuidas: 2,
        meu: { carga_atual: 12, capacidade: null, elegivel: true, motivo: null },
      }),
    );
    expect(aviso.tom).toBe("sucesso");
    expect(aviso.texto).toContain("2 conversa(s) distribuída(s) à equipe.");
    expect(aviso.texto).not.toContain("12/5");
  });

  test("erro de distribuição preserva confirmação da presença e não afirma fila vazia", () => {
    const aviso = avisoPresencaConfirmada("ONLINE", resultado({ status: "erro" }));
    expect(aviso.tom).toBe("erro");
    expect(aviso.texto).toStartWith("Presença salva: online.");
    expect(aviso.texto).toContain("Não foi possível concluir a distribuição");
    expect(aviso.texto).not.toContain("Nenhuma conversa");
  });

  test("distribuição pendente não é apresentada como concluída", () => {
    const aviso = mensagemDistribuicaoFila(resultado({ status: "pendente", pendentes: 3 }));
    expect(aviso.tom).toBe("aviso");
    expect(aviso.texto).toContain("ainda está pendente");
  });

  test("motivo desconhecido não vira falta de atendentes nem erro técnico exposto", () => {
    const aviso = mensagemDistribuicaoFila(
      resultado({
        status: "bloqueada",
        pendentes: 1,
        motivo: "SQL: private_table failed",
      }),
    );
    expect(aviso.texto).not.toContain("SQL:");
    expect(aviso.texto).not.toContain("Nenhum atendente");
    expect(aviso.texto).toContain("indisponível");
  });

  test("consulta sem meu não fabrica carga nem limite", () => {
    const aviso = mensagemDistribuicaoFila(resultado({ meu: null }));
    expect(aviso.texto).toBe("Nenhuma conversa aguardando distribuição.");
  });
});
