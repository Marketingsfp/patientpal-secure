import { describe, expect, it } from "bun:test";
import {
  agruparTurnoPersistido,
  estadoAutorizaTurno,
  ErroAgrupamentoNina,
  type DependenciasAgrupamento,
  type EntradaAgrupamento,
  type ReservaTurno,
} from "../agrupamento-turno";
import { persistirEntradaNina } from "../entrada-persistida.server";

const entrada: EntradaAgrupamento = {
  clinicaId: "clinica",
  telefone: "5511999991111",
  conversaId: "conversa",
  mensagemId: "m1",
  textoAtual: "Oi",
};
const reserva: ReservaTurno = { chave: "clinica:5511999991111", token: "token" };
describe("estado atual comprovado após adquirir a trava", () => {
  const conversa = {
    id: "conversa",
    status: "open",
    owner_type: "AI",
    ai_enabled: true,
    atribuida_user_id: null,
  };
  it("mesmo com owner AI, uma pessoa atribuída impede o turno", () => {
    expect(
      estadoAutorizaTurno(entrada, {
        conversa: { ...conversa, atribuida_user_id: "atendente" },
        ninaDesativada: false,
      }),
    ).toBe(false);
  });
  it("todos os status resolvidos são recusados enquanto a chamada esperava", () => {
    for (const status of ["closed", "finished", "resolved", "resolvida", "fechada", "encerrada"])
      expect(
        estadoAutorizaTurno(entrada, { conversa: { ...conversa, status }, ninaDesativada: false }),
      ).toBe(false);
  });
  it("fila, humano ou flag de desativação impedem modelo", () => {
    for (const owner_type of ["NONE", "HUMAN"])
      expect(
        estadoAutorizaTurno(entrada, {
          conversa: { ...conversa, owner_type },
          ninaDesativada: false,
        }),
      ).toBe(false);
    expect(estadoAutorizaTurno(entrada, { conversa, ninaDesativada: true })).toBe(false);
  });
  it("homologação exige a mesma conversa, ciclo e telefone da sessão lida novamente", () => {
    const teste = { ...entrada, sessaoTeste: { leadId: "lead", cicloId: "ciclo" } };
    const lead = { conversa_id: "conversa", ciclo_id: "ciclo", telefone_sessao: entrada.telefone };
    expect(estadoAutorizaTurno(teste, { conversa, ninaDesativada: false, lead })).toBe(true);
    for (const alterado of [
      { ...lead, ciclo_id: "novo" },
      { ...lead, conversa_id: "nova" },
      { ...lead, telefone_sessao: "outro" },
      null,
    ])
      expect(estadoAutorizaTurno(teste, { conversa, ninaDesativada: false, lead: alterado })).toBe(
        false,
      );
    expect(estadoAutorizaTurno(entrada, { conversa, ninaDesativada: false })).toBe(true);
  });
});
function dependencias(patch: Partial<DependenciasAgrupamento> = {}) {
  const chamadas: string[] = [];
  const d: DependenciasAgrupamento = {
    registrar: async () => ({ batchId: "batch", revision: 7, primeiraMs: 0 }),
    adquirir: async () => {
      chamadas.push("adquirir");
      return reserva;
    },
    lerRevisao: async () => 7,
    reivindicar: async () => {
      chamadas.push("claim");
      return ["m1"];
    },
    validarConversa: async () => {
      chamadas.push("validar");
      return true;
    },
    lerMensagens: async () => [{ id: "m1", texto: "Oi" }],
    iniciar: async () => {
      chamadas.push("iniciar");
      return true;
    },
    concluir: async () => {
      chamadas.push("concluir");
    },
    liberar: async () => {
      chamadas.push("liberar");
    },
    esperar: async () => {},
    agora: () => 3000,
    ...patch,
  };
  return { d, chamadas };
}

describe("núcleo persistente compartilhado por WhatsApp e homologação", () => {
  for (const ambiente of ["whatsapp", "homologacao"] as const) {
    it(`${ambiente}: três chamadas concorrentes consomem um único lote, com ordem física preservada`, async () => {
      // Banco/transportes simulados; a orquestração chamada é a usada pelos dois adaptadores reais.
      let status = "COLLECTING",
        ocupado = false,
        inicios = 0,
        geracoes = 0;
      let persistencias = 0,
        enviosMeta = 0;
      const liberadas: (() => void)[] = [];
      const { d } = dependencias({
        adquirir: async () => {
          while (ocupado) await new Promise<void>((resolve) => liberadas.push(resolve));
          ocupado = true;
          return reserva;
        },
        reivindicar: async () => {
          if (status !== "COLLECTING") return null;
          status = "PROCESSING";
          return ["m1", "m2", "m3"];
        },
        // A consulta pode devolver outra ordem; a ordem oficial vem do claim.
        lerMensagens: async () => [
          { id: "m3", texto: "Bom dia" },
          { id: "m1", texto: "Oi" },
          { id: "m2", texto: "Oi" },
        ],
        iniciar: async () => {
          inicios++;
          return true;
        },
        liberar: async () => {
          ocupado = false;
          liberadas.shift()?.();
        },
      });
      const processar = async (mensagemId: string) => {
        const turno = await agruparTurnoPersistido(
          {
            ...entrada,
            mensagemId,
            ...(ambiente === "homologacao"
              ? { sessaoTeste: { leadId: "lead", cicloId: "ciclo" } }
              : {}),
          },
          d,
        );
        if (!turno) return;
        try {
          expect(turno.batchId).toBe("batch");
          expect(turno.mensagens).toEqual(["m1", "m2", "m3"]);
          expect(turno.texto).toBe(
            "MENSAGENS RECENTES DO PACIENTE NESTE TURNO:\n1. Oi\n2. Oi\n3. Bom dia",
          );
          geracoes++;
          persistencias++;
          if (ambiente === "whatsapp") enviosMeta++;
          status = "PROCESSED";
        } finally {
          await d.liberar(turno.lock);
        }
      };
      await Promise.all([processar("m1"), processar("m2"), processar("m3")]);
      await processar("m1");
      expect({ inicios, geracoes, persistencias, enviosMeta, ocupado }).toEqual({
        inicios: 1,
        geracoes: 1,
        persistencias: 1,
        enviosMeta: ambiente === "whatsapp" ? 1 : 0,
        ocupado: false,
      });
    });
  }
  it("falha do registrar conserva entrada e nunca usa os IDs do fallback", async () => {
    const { d, chamadas } = dependencias({
      registrar: async () => {
        throw new ErroAgrupamentoNina("RPC indisponível");
      },
    });
    await expect(
      agruparTurnoPersistido({ ...entrada, mensagensFallback: ["m1", "m2", "m3"] }, d),
    ).rejects.toThrow("RPC indisponível");
    expect(chamadas).toEqual([]);
  });
  it("sem entrada persistida, não adquire nem chama modelo", async () => {
    const { d, chamadas } = dependencias();
    await expect(agruparTurnoPersistido({ ...entrada, mensagemId: null }, d)).rejects.toThrow(
      "persistida",
    );
    expect(chamadas).toEqual([]);
  });
  for (const motivo of [
    "atendente assumiu",
    "conversa encerrada",
    "sessão de homologação reiniciada",
    "Nina desativada",
  ]) {
    it(`${motivo} durante espera: revalida após a trava e conclui sem gerar`, async () => {
      const { d, chamadas } = dependencias({
        validarConversa: async () => {
          chamadas.push("validar");
          return false;
        },
      });
      expect(await agruparTurnoPersistido(entrada, d)).toBeNull();
      expect(chamadas).toEqual(["adquirir", "claim", "validar", "concluir", "liberar"]);
    });
  }
  it("mensagem nova altera revisão durante montagem: não carimba o lote antigo com a revisão nova", async () => {
    let revisao = 7;
    const { d, chamadas } = dependencias({ lerRevisao: async () => revisao++ });
    await expect(agruparTurnoPersistido(entrada, d)).rejects.toThrow("reagrupar");
    expect(chamadas).not.toContain("iniciar");
    expect(chamadas.at(-1)).toBe("liberar");
  });
  it("leitura parcial dos IDs não vira resposta para uma parte silenciosa do lote", async () => {
    const { d, chamadas } = dependencias({ reivindicar: async () => ["m1", "m2"] });
    await expect(agruparTurnoPersistido(entrada, d)).rejects.toThrow("comprovar todas");
    expect(chamadas).not.toContain("iniciar");
    expect(chamadas.at(-1)).toBe("liberar");
  });
  it("perda da reserva antes do início não autoriza fallback nem replay", async () => {
    const { d, chamadas } = dependencias({ iniciar: async () => false });
    try {
      await agruparTurnoPersistido(entrada, d);
      throw new Error("deveria recusar");
    } catch (e) {
      expect(e).toBeInstanceOf(ErroAgrupamentoNina);
      expect((e as ErroAgrupamentoNina).podeRepetirEntrada).toBe(false);
    }
    expect(chamadas.at(-1)).toBe("liberar");
  });
  it("conversa ocupada deixa erro recuperável, sem modelo e sem liberar trava alheia", async () => {
    const { d, chamadas } = dependencias({ adquirir: async () => null });
    await expect(agruparTurnoPersistido(entrada, d)).rejects.toThrow("ocupada");
    expect(chamadas).toEqual([]);
  });
  it("falha pre-start libera a reserva, e tentativa seguinte pode assumir o mesmo lote", async () => {
    let falhar = true;
    const { d, chamadas } = dependencias({
      lerMensagens: async () => {
        if (falhar) {
          falhar = false;
          throw new ErroAgrupamentoNina("leitura temporariamente indisponível");
        }
        return [{ id: "m1", texto: "Oi" }];
      },
    });
    await expect(agruparTurnoPersistido(entrada, d)).rejects.toThrow("temporariamente");
    expect(chamadas.at(-1)).toBe("liberar");
    const turno = await agruparTurnoPersistido(entrada, d);
    expect(turno?.mensagens).toEqual(["m1"]);
    expect(chamadas.filter((c) => c === "iniciar")).toHaveLength(1);
    await d.liberar(turno!.lock);
  });
});

function bancoEntrada() {
  const linhas: Record<string, any>[] = [];
  let falharInsert = false;
  return {
    linhas,
    falhar: () => {
      falharInsert = true;
    },
    admin: {
      from: () => {
        let insert: Record<string, any> | undefined;
        const filtros: Record<string, any> = {};
        const q = {
          insert: (dados: Record<string, any>) => {
            insert = dados;
            return q;
          },
          select: () => q,
          eq: (chave: string, valor: any) => {
            filtros[chave] = valor;
            return q;
          },
          maybeSingle: async () => {
            if (insert) {
              if (falharInsert)
                return { data: null, error: { code: "08006", message: "connection lost" } };
              if (linhas.some((m) => m.wa_message_id === insert!.wa_message_id))
                return { data: null, error: { code: "23505", message: "duplicate key" } };
              const linha = { ...insert, id: `m${linhas.length + 1}`, execucao_id: null };
              linhas.push(linha);
              return { data: linha, error: null };
            }
            return {
              data:
                linhas.find((m) => Object.entries(filtros).every(([k, v]) => m[k] === v)) ?? null,
              error: null,
            };
          },
        };
        return q;
      },
    },
  };
}
const fisica = {
  clinica_id: "clinica",
  wa_message_id: "wa-1",
  direction: "in",
  from_number: "5511999991111",
  conversa_id: "conversa",
  body: "Oi",
  tipo: "text",
};
describe("persistência idempotente comum aos adaptadores", () => {
  it("duas inserções concorrentes recuperam o mesmo ID sem duplicar a entrada", async () => {
    const db = bancoEntrada();
    const [a, b] = await Promise.all([
      persistirEntradaNina(db.admin, fisica),
      persistirEntradaNina(db.admin, { ...fisica, body: "payload diferente" }),
    ]);
    expect(db.linhas).toHaveLength(1);
    expect(a.mensagem.id).toBe(b.mensagem.id);
    expect(b.mensagem.body).toBe("Oi");
    expect(b.repetida).toBe(true);
    expect(b.consumida).toBe(false);
  });
  it("mídia rastreada sem lote não repete seu retorno automático em redelivery concorrente", async () => {
    const db = bancoEntrada();
    const midia = { ...fisica, tipo: "image", body: "[image]", nina_status: "received" };
    const [a, b] = await Promise.all([
      persistirEntradaNina(db.admin, midia),
      persistirEntradaNina(db.admin, midia),
    ]);
    expect(a.consumida).toBe(false);
    expect(b.consumida).toBe(true);
    expect(db.linhas).toHaveLength(1);
  });
  it("retry depois de execução iniciada é consumido, sem reexecutar para procurar saída", async () => {
    const db = bancoEntrada();
    await persistirEntradaNina(db.admin, fisica);
    db.linhas[0]!.execucao_id = "execucao";
    expect((await persistirEntradaNina(db.admin, fisica)).consumida).toBe(true);
  });
  it("falha no insert não é tratada como entrada persistida", async () => {
    const db = bancoEntrada();
    db.falhar();
    await expect(persistirEntradaNina(db.admin, fisica)).rejects.toThrow("Entrada não persistida");
    expect(db.linhas).toHaveLength(0);
  });
  it("uma chave anterior não é aproveitada para nova sessão ou outra clínica", async () => {
    const db = bancoEntrada();
    await persistirEntradaNina(db.admin, fisica);
    await expect(
      persistirEntradaNina(db.admin, { ...fisica, conversa_id: "outra" }),
    ).rejects.toThrow("outra sessão");
    await expect(
      persistirEntradaNina(db.admin, { ...fisica, clinica_id: "outra" }),
    ).rejects.toThrow("conferir a duplicidade");
    expect(db.linhas).toHaveLength(1);
  });
});
