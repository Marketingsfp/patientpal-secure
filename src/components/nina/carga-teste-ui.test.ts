import { describe, expect, it } from "bun:test";
import { normalizarConfig } from "@/lib/nina/carga";
import { planoMensagensIA, type PlanoCarga } from "@/lib/nina/carga-planejamento";
import {
  alterarPedidoCarga,
  aguardarCargaLocal,
  cargaAtiva,
  conduzirCargaLocal,
  conduzirCargaParalelaLocal,
  criarControleLocalCarga,
  novoRascunhoCarga,
  planoDaClinicaAtual,
  revisarPlanoCarga,
  type CargaPersistida,
  type ProgressoCarga,
  type RascunhoCarga,
} from "./carga-teste-ui";

describe("disparo paralelo no navegador", () => {
  it("abre requisições juntas e o trabalhador livre continua sem barreira", async () => {
    const respostas: ((r: ProgressoCarga) => void)[] = [];
    let chamadas = 0;
    const execucao = conduzirCargaParalelaLocal(
      {
        vigente: () => true,
        ler: async () => carga("executando"),
        preparar: async () => {
          throw new Error("não prepara durante envio");
        },
        executar: () => {
          chamadas++;
          return new Promise((r) => respostas.push(r));
        },
        progresso: () => {},
      },
      3,
    );
    expect(chamadas).toBe(3);
    respostas[1]!({ status: "executando" });
    await new Promise((r) => setTimeout(r, 0));
    expect(chamadas).toBe(4);
    respostas[3]!({ status: "concluido" });
    respostas[0]!({ status: "concluido" });
    respostas[2]!({ status: "concluido" });
    expect(await execucao).toBe("concluido");
  });

  it("cancelar interrompe novos disparos, mas aguarda as respostas em voo", async () => {
    let vigente = true;
    const respostas: ((r: ProgressoCarga) => void)[] = [];
    const p = conduzirCargaParalelaLocal(
      {
        vigente: () => vigente,
        ler: async () => carga("executando"),
        preparar: async () => ({ status: "executando" }),
        executar: () => new Promise((r) => respostas.push(r)),
        progresso: () => {},
      },
      2,
    );
    vigente = false;
    respostas.forEach((r) => r({ status: "executando" }));
    expect(await p).toBe("interrompido");
    expect(respostas).toHaveLength(2);
  });
});

function plano(): PlanoCarga {
  return {
    versao: 1,
    modelo: "anthropic/claude-opus-5-5",
    pedido: "Testar cardiologia e pagamento",
    resumo: "Conversas com continuidade e pagamento.",
    config: normalizarConfig({
      leadsAtivos: 3,
      totalMensagens: 50,
      distribuicao: [
        { cenario: "cardio", peso: 1 },
        { cenario: "pagamento", peso: 3 },
      ],
    }),
    cenarios: [
      {
        id: "cardio",
        titulo: "Cardiologia",
        objetivo: "Conferir atendimento",
        mensagens: ["Oi", "Vocês têm cardiologista?"],
        verificacoes: ["Conferir a base publicada"],
      },
      {
        id: "pagamento",
        titulo: "Pagamento",
        objetivo: "Conferir formas",
        mensagens: ["Aceitam PIX?", "E cartão?", "Qual o valor?"],
        verificacoes: ["Não inventar formas"],
      },
    ],
    alertas: [],
  };
}
function rascunho(): RascunhoCarga {
  const p = plano();
  return {
    ...novoRascunhoCarga(),
    plano: p,
    pedido: p.pedido,
    config: p.config,
    pedidoPlanejado: p.pedido,
    clinicaPlano: "clinica-a",
    planoValido: true,
  };
}
function carga(
  status: string,
  controle: Partial<NonNullable<CargaPersistida["controle"]>> = {},
): CargaPersistida {
  const ativo = ["preparando", "executando"].includes(status);
  return {
    id: "teste-1",
    nome: "Teste simulado",
    status,
    enviadas: 0,
    total_planejado: 8,
    controle: { ativo, ocupado: false, podeRetomar: ativo, ...controle },
  };
}
function pendente<T>() {
  let resolver!: (v: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolver };
}

describe("revisão do plano de carga sem geração ou disparo", () => {
  it("invalida a mudança do pedido preservando as edições, mesmo ao voltar ao pedido anterior", () => {
    const inicial = rascunho();
    inicial.plano!.cenarios[0]!.mensagens.push("Mensagem editada pelo operador");
    expect(planoDaClinicaAtual(inicial, "clinica-a")).toBe(true);
    const mudado = alterarPedidoCarga(inicial, "Outro pedido");
    expect(mudado.plano).toBe(inicial.plano);
    expect(planoDaClinicaAtual(mudado, "clinica-a")).toBe(false);
    expect(planoDaClinicaAtual(alterarPedidoCarga(mudado, inicial.pedido), "clinica-a")).toBe(
      false,
    );
  });

  it("um plano só é utilizável na clínica e no pedido da geração revisada", () => {
    expect(planoDaClinicaAtual(rascunho(), "clinica-b")).toBe(false);
    expect(planoDaClinicaAtual({ ...rascunho(), pedidoPlanejado: "outro" }, "clinica-a")).toBe(
      false,
    );
    expect(planoDaClinicaAtual({ ...rascunho(), planoValido: false }, "clinica-a")).toBe(false);
  });

  it("limpa somente a cópia de prévia: Enter final não apaga a edição nem cria mensagem vazia", () => {
    const original = plano();
    original.cenarios[0]!.mensagens = ["  Oi ", "", " Vocês têm cardiologista? ", ""];
    original.cenarios[0]!.verificacoes = [" Conferir a fonte ", ""];
    const antes = structuredClone(original);
    const revisto = revisarPlanoCarga(original, original.config);
    expect(revisto.cenarios[0]!.mensagens).toEqual(["Oi", "Vocês têm cardiologista?"]);
    expect(revisto.cenarios[0]!.verificacoes).toEqual(["Conferir a fonte"]);
    expect(original).toEqual(antes);
    expect(planoMensagensIA(revisto).every((m) => m.texto.trim().length > 0)).toBe(true);
    expect(revisto.config.totalMensagens).toBe(planoMensagensIA(revisto).length);
  });

  it("edição do título mantém pesos por ID e os roteiros completos em cada réplica", () => {
    const p = plano();
    p.cenarios[1]!.titulo = "Formas de pagamento revisadas";
    p.cenarios[1]!.mensagens.push("Pode confirmar a forma escolhida?");
    const revisto = revisarPlanoCarga(p, p.config);
    expect(revisto.config.distribuicao).toEqual(p.config.distribuicao);
    const fila = planoMensagensIA(revisto);
    expect(revisto.config.totalMensagens).toBe(10);
    for (const slot of [1, 2]) {
      expect(fila.filter((m) => m.slot === slot).map((m) => m.texto)).toEqual(
        p.cenarios[1]!.mensagens,
      );
    }
    expect(fila.filter((m) => m.slot === 2).map((m) => m.ordemNoCenario)).toEqual([0, 1, 2, 3]);
  });

  it("remover um cenário também remove sua distribuição; um novo ID recebe peso próprio", () => {
    const p = plano();
    p.cenarios.shift();
    p.cenarios.push({ ...p.cenarios[0]!, id: "novo", titulo: "Novo cenário" });
    const revisto = revisarPlanoCarga(p, p.config);
    expect(revisto.config.distribuicao).toEqual([
      { cenario: "pagamento", peso: 3 },
      { cenario: "novo", peso: 1 },
    ]);
    expect(planoMensagensIA(revisto).some((m) => m.cenarioId === "cardio")).toBe(false);
  });

  it("mensagens ou verificações totalmente vazias impedem a revisão", () => {
    const p = plano();
    p.cenarios[0]!.mensagens = ["", "  "];
    expect(() => revisarPlanoCarga(p, p.config)).toThrow();
    p.cenarios[0]!.mensagens = ["Oi"];
    p.cenarios[0]!.verificacoes = [""];
    expect(() => revisarPlanoCarga(p, p.config)).toThrow();
  });
});

describe("continuidade local usa estados persistidos e chamadas simuladas, sem IA real", () => {
  for (const status of ["preparando", "executando"])
    it(`carga autônoma ${status} não depende de disparos ou esperas da página`, async () => {
      let escritas = 0;
      const executar = async () => {
        escritas++;
        return { status: "executando" };
      };
      expect(
        await conduzirCargaLocal({
          vigente: () => true,
          ler: async () => carga(status, { servidor: true, paralela: true }),
          preparar: executar,
          executar,
          progresso: () => {},
          aguardar: async () => {
            escritas++;
          },
        }),
      ).toBe("servidor");
      expect(escritas).toBe(0);
    });
  it("prepara antes de executar e só conclui após confirmação persistida", async () => {
    const estados = [carga("preparando"), carga("executando"), carga("concluido")];
    const chamadas: string[] = [];
    const status = await conduzirCargaLocal({
      vigente: () => true,
      ler: async () => estados.shift()!,
      preparar: async () => {
        chamadas.push("preparar");
        return { status: "executando", pronto: true };
      },
      executar: async () => {
        chamadas.push("executar");
        return { status: "concluido" };
      },
      progresso: () => {},
    });
    expect(chamadas).toEqual(["preparar", "executar"]);
    expect(status).toBe("concluido");
  });

  it.each(["preparando", "executando", "parado", "erro"])(
    "não disputa chamada ocupada mesmo com status %s",
    async (status) => {
      const atual = carga(status, { ocupado: true, podeRetomar: false });
      expect(cargaAtiva(atual)).toBe(true);
      let disparos = 0;
      const executar = async () => {
        disparos++;
        return { status };
      };
      expect(
        await conduzirCargaLocal({
          vigente: () => true,
          ler: async () => atual,
          preparar: executar,
          executar,
          progresso: () => {},
        }),
      ).toBe("ocupado");
      expect(disparos).toBe(0);
    },
  );

  it("troca de clínica durante a preparação impede a próxima chamada", async () => {
    const controle = criarControleLocalCarga();
    const vigente = controle.iniciar();
    const preparo = pendente<ProgressoCarga>();
    const iniciou = pendente<void>();
    let execucoes = 0;
    const ciclo = conduzirCargaLocal({
      vigente,
      ler: async () => carga("preparando"),
      preparar: () => {
        iniciou.resolver();
        return preparo.promise;
      },
      executar: async () => {
        execucoes++;
        return { status: "concluido" };
      },
      progresso: () => {},
    });
    await iniciou.promise;
    controle.interromper();
    preparo.resolver({ status: "executando", pronto: true });
    expect(await ciclo).toBe("interrompido");
    expect(execucoes).toBe(0);
  });

  it("encerrar durante um lote não dispara outro lote após a resposta atrasada", async () => {
    const controle = criarControleLocalCarga();
    const vigente = controle.iniciar();
    const lote = pendente<ProgressoCarga>();
    const iniciou = pendente<void>();
    let execucoes = 0;
    const ciclo = conduzirCargaLocal({
      vigente,
      ler: async () => carga("executando"),
      preparar: async () => {
        throw new Error("Não deve preparar");
      },
      executar: () => {
        execucoes++;
        iniciou.resolver();
        return lote.promise;
      },
      progresso: () => {},
    });
    await iniciou.promise;
    controle.interromper();
    lote.resolver({ status: "executando" });
    expect(await ciclo).toBe("interrompido");
    expect(execucoes).toBe(1);
  });

  it("aguarda o ritmo persistido e reconsulta o estado antes do próximo lote", async () => {
    const estados = [
      carga("executando", { aguardarMs: 5000 }),
      carga("executando"),
      carga("concluido"),
    ];
    const ordem: string[] = [];
    const status = await conduzirCargaLocal({
      vigente: () => true,
      ler: async () => {
        ordem.push("ler");
        return estados.shift()!;
      },
      preparar: async () => {
        throw new Error("Não deve preparar");
      },
      executar: async () => {
        ordem.push("executar");
        return { status: "concluido" };
      },
      aguardar: async (ms) => {
        ordem.push(`esperar:${ms}`);
      },
      progresso: () => {},
    });
    expect(status).toBe("concluido");
    expect(ordem).toEqual(["ler", "esperar:5000", "ler", "executar", "ler"]);
  });

  it("cancelar durante a espera impede consultas e disparos seguintes", async () => {
    const controle = criarControleLocalCarga();
    let chamadas = 0;
    const status = await conduzirCargaLocal({
      vigente: controle.iniciar(),
      ler: async () => carga("executando", { aguardarMs: 5000 }),
      preparar: async () => {
        throw new Error("Não deve preparar");
      },
      executar: async () => {
        chamadas++;
        return { status: "concluido" };
      },
      aguardar: async () => {
        controle.interromper();
      },
      progresso: () => {},
    });
    expect(status).toBe("interrompido");
    expect(chamadas).toBe(0);
    await aguardarCargaLocal(60000, () => false);
  });

  it("falha da preparação preserva o motivo e a UI não envia mensagens nem reinicia por conta própria", async () => {
    const motivo = "Lead 8: falha ao confirmar a preparação da sessão.";
    const estados = [carga("preparando"), carga("erro", { erro: motivo })];
    const progressos: ProgressoCarga[] = [];
    let execucoes = 0;
    const status = await conduzirCargaLocal({
      vigente: () => true,
      ler: async () => estados.shift()!,
      preparar: async () => ({ status: "erro", erro: motivo, prontos: 2, total: 3 }),
      executar: async () => {
        execucoes++;
        return { status: "executando" };
      },
      progresso: (r) => progressos.push(r),
    });
    expect(status).toBe("erro");
    expect(progressos[0]?.erro).toBe(motivo);
    expect(execucoes).toBe(0);
  });

  it("erro de rede é propagado para recarregar o estado, sem simular conclusão", async () => {
    await expect(
      conduzirCargaLocal({
        vigente: () => true,
        ler: async () => carga("executando"),
        preparar: async () => {
          throw new Error("Não deve preparar");
        },
        executar: async () => {
          throw new Error("Conexão perdida");
        },
        progresso: () => {},
      }),
    ).rejects.toThrow("Conexão perdida");
  });
});
