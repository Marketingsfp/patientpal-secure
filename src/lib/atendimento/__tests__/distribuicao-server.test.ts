import { describe, expect, it } from "bun:test";
import {
  consultarEstadoDistribuicao,
  executarDistribuicaoFila,
  salvarPresencaComDistribuicao,
} from "../distribuicao.server";
import {
  capacidadeAtendenteSchema,
  type ResultadoDistribuicaoFila,
} from "../distribuicao-contrato";

const concluida: ResultadoDistribuicaoFila = {
  status: "concluida",
  distribuidas: 2,
  pendentes: 0,
  motivo: null,
  meu: { carga_atual: 7, capacidade: null, elegivel: true, motivo: null },
};

const confirmacao = (distribuicao = concluida) => ({
  ok: true,
  conflito: false,
  estado: "ONLINE",
  versao: 3,
  em: "2026-09-14T22:00:00Z",
  distribuidas: distribuicao.distribuidas,
  distribuicao,
});

function cliente(data: unknown, error: { message: string } | null = null) {
  const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
  return {
    chamadas,
    async rpc(nome: string, args: Record<string, unknown>) {
      chamadas.push({ nome, args });
      return { data, error };
    },
  };
}

describe("contrato de presença e distribuição do Zap OS", () => {
  it("confirma uma única operação atômica e preserva o total atribuído", async () => {
    const db = cliente(confirmacao());
    const resultado = await salvarPresencaComDistribuicao(db, {
      clinicaId: "clinica",
      estado: "ONLINE",
      versao: 2,
    });
    expect(db.chamadas).toEqual([
      {
        nome: "atend_definir_presenca_manual",
        args: { _clinica_id: "clinica", _estado: "ONLINE", _versao: 2 },
      },
    ]);
    expect(resultado.ok && resultado.distribuidas).toBe(2);
    expect(resultado.ok && resultado.distribuicao.meu?.capacidade).toBeNull();
  });

  it("não anuncia presença confirmada quando outra aba venceu a versão", async () => {
    const resultado = await salvarPresencaComDistribuicao(
      cliente({ ok: false, conflito: true, versao: 4 }),
      { clinicaId: "clinica", estado: "ONLINE", versao: 2 },
    );
    expect(resultado).toEqual({ ok: false, conflito: true, versao: 4 });
  });

  it("presença salva com distribuição falha mantém a falha visível no retorno", async () => {
    const db = cliente(
      confirmacao({
        ...concluida,
        status: "erro",
        distribuidas: 0,
        pendentes: 2,
        motivo: "falha_distribuicao",
      }),
    );
    const resultado = await salvarPresencaComDistribuicao(db, { clinicaId: "c", estado: "ONLINE" });
    expect(resultado.ok).toBe(true);
    expect(resultado.ok && resultado.distribuicao.status).toBe("erro");
    expect(resultado.ok && resultado.distribuicao.pendentes).toBe(2);
  });

  it("rejeita confirmação incompleta em vez de converter em sucesso com zero", async () => {
    await expect(
      salvarPresencaComDistribuicao(cliente({ ok: true }), {
        clinicaId: "c",
        estado: "ONLINE",
      }),
    ).rejects.toThrow("Não foi possível confirmar a presença");
  });

  it("propaga erro da gravação para a tela não confirmar ONLINE", async () => {
    await expect(
      salvarPresencaComDistribuicao(cliente(null, { message: "Sem acesso" }), {
        clinicaId: "c",
        estado: "ONLINE",
      }),
    ).rejects.toThrow("Sem acesso");
  });

  it("consulta de capacidade usa apenas a função de diagnóstico", async () => {
    const db = cliente({ ...concluida, distribuidas: 0 });
    await consultarEstadoDistribuicao(db, "clinica");
    expect(db.chamadas).toEqual([
      {
        nome: "atend_diagnostico_distribuicao",
        args: { _clinica_id: "clinica" },
      },
    ]);
  });

  it("pedido de distribuição preserva status pendente para permitir recuperação", async () => {
    const db = cliente({
      ...concluida,
      status: "pendente",
      pendentes: 3,
      motivo: "limite_da_rodada",
    });
    expect((await executarDistribuicaoFila(db, "c")).status).toBe("pendente");
    expect(db.chamadas[0].nome).toBe("atend_distribuir_fila_status");
  });

  it("configuração permite sem limite e recusa zero, negativos e valores fracionários", () => {
    expect(capacidadeAtendenteSchema.parse(null)).toBeNull();
    expect(capacidadeAtendenteSchema.parse(5)).toBe(5);
    for (const invalido of [0, -1, 1.5, 1001, "5", undefined]) {
      expect(capacidadeAtendenteSchema.safeParse(invalido).success).toBe(false);
    }
  });
});
