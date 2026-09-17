import { describe, expect, test } from "bun:test";
import type { ResultadoDistribuicaoFila } from "@/lib/atendimento/distribuicao-contrato";
import {
  avisoPresencaConfirmada,
  mensagemDistribuicaoFila,
  textoCargaAtendente,
  validarLimiteAtendente,
} from "./distribuicao-fila-ui";

const resultado = (extra: Partial<ResultadoDistribuicaoFila> = {}): ResultadoDistribuicaoFila => ({
  status: "concluida",
  distribuidas: 0,
  pendentes: 0,
  motivo: null,
  ...extra,
});

describe("resultado da distribuição no controle de presença", () => {
  test("separa a carga ativa do limite de reservas em Pausa", () => {
    expect(textoCargaAtendente(22, 10, 10)).toBe("12 conversa(s) ativa(s), sem limite. 10/10 em Não atribuídas.");
    expect(textoCargaAtendente(22, null, 10)).toBe("12 conversa(s) ativa(s), sem limite. 10 em Não atribuídas.");
  });
  test("Online com capacidade atingida informa carga, limite e fila pendente", () => {
    const aviso = avisoPresencaConfirmada(
      "ONLINE",
      resultado({
        status: "bloqueada",
        pendentes: 2,
        motivo: "capacidade_lotada",
        meu: { carga_atual: 5, capacidade: 5, elegivel: false, motivo: "capacidade_lotada" },
      }),
    );
    expect(aviso.tom).toBe("aviso");
    expect(aviso.texto).toContain("Online. 5/5 conversas ativas.");
    expect(aviso.texto).toContain("Capacidade atingida.");
    expect(aviso.texto).toContain("2 conversa(s) aguardando distribuição.");
    expect(aviso.texto.match(/Capacidade atingida/g)).toHaveLength(1);
  });

  test("sem limite não inventa capacidade cinco nem impede carga maior", () => {
    expect(textoCargaAtendente(12, null)).toBe("12 conversa(s) ativa(s), sem limite.");
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

describe("limite configurável de conversas", () => {
  test("sem limite envia null mesmo com número antigo no campo", () => {
    expect(validarLimiteAtendente("sem_limite", "5")).toEqual({ ok: true, capacidade: null });
  });
  test("limites positivos até 1000 são aceitos", () => {
    expect(validarLimiteAtendente("limitado", " 1 ")).toEqual({ ok: true, capacidade: 1 });
    expect(validarLimiteAtendente("limitado", "1000")).toEqual({ ok: true, capacidade: 1000 });
  });
  test.each(["", "0", "-1", "1.5", "1e2", "Infinity", "1001", "cinco"])(
    "limite inválido %s não é enviado",
    (valor) => expect(validarLimiteAtendente("limitado", valor).ok).toBe(false),
  );
});
