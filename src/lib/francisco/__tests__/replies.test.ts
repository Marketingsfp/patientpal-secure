import { describe, it, expect } from "bun:test";
import { processarRespostaFrancisco, registrarEntregaFrancisco } from "../replies.server";
import { recusaDiretaFrancisco } from "../intencao";

type Linha = Record<string, unknown>;
class Consulta {
  filtros: Array<(r: Linha) => boolean> = [];
  alteracao?: Linha;
  contar = false;
  constructor(public linhas: Linha[]) {}
  select(_campos?: string, opcoes?: { head?: boolean }) {
    this.contar = !!opcoes?.head;
    return this;
  }
  eq(k: string, v: unknown) {
    this.filtros.push((r) => r[k] === v);
    return this;
  }
  neq(k: string, v: unknown) {
    this.filtros.push((r) => r[k] !== v);
    return this;
  }
  in(k: string, v: unknown[]) {
    this.filtros.push((r) => v.includes(r[k]));
    return this;
  }
  gte(k: string, v: string) {
    this.filtros.push((r) => String(r[k]) >= v);
    return this;
  }
  gt(k: string, v: string) {
    this.filtros.push((r) => String(r[k]) > v);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  update(v: Linha) {
    this.alteracao = v;
    return this;
  }
  insert(v: Linha) {
    if (this.linhas.some((r) => r.id === v.id))
      return Promise.resolve({ error: { code: "23505" } });
    this.linhas.push(v);
    return Promise.resolve({ error: null });
  }
  executar(single = false) {
    const rows = this.linhas.filter((r) => this.filtros.every((f) => f(r)));
    if (this.alteracao) rows.forEach((r) => Object.assign(r, this.alteracao));
    return {
      data: single ? (rows[0] ?? null) : rows,
      error: null,
      count: this.contar ? rows.length : undefined,
    };
  }
  maybeSingle() {
    return Promise.resolve(this.executar(true));
  }
  then(resolve: (v: ReturnType<Consulta["executar"]>) => unknown) {
    return Promise.resolve(resolve(this.executar()));
  }
}
function ambiente() {
  const envios: Linha[] = [
    {
      id: "envio",
      clinica_id: "clinica",
      telefone: "5521999998888",
      status: "enviado",
      wa_message_id: "wamid.francisco",
      entrega: "sent",
      created_at: new Date(Date.now() - 3600000).toISOString(),
      configuracao: {
        departamento: "Recepção",
        systemPrompt: "Prompt do Francisco",
        temperatura: 1,
      },
      texto: "Deseja ajuda com o orçamento?",
      orcamento_id: "orcamento",
    },
  ];
  const mensagens: Linha[] = [];
  const eventos: Linha[] = [];
  const rpcs: Array<{ nome: string; args: Linha }> = [],
    handoffs: Linha[] = [];
  let falhar = false;
  let classificacoes = 0,
    reaberturas = 0;
  const db = {
    from: (t: string) =>
      new Consulta(
        t === "francisco_envios" ? envios : t === "francisco_eventos" ? eventos : mensagens,
      ),
    rpc: async (nome: string, args: Linha) => {
      rpcs.push({ nome, args });
      return { error: null };
    },
  };
  const atendimento = async () => ({
    reabrirConversaPorMensagemPaciente: async () => {
      reaberturas++;
      return [];
    },
    estadoConversaPorTelefone: async () => ({ id: "conversa" }),
    encaminharParaHumano: async (p: Linha) => {
      handoffs.push(p);
      return { ok: !falhar };
    },
  });
  const deps = {
    db,
    atendimento,
    classificar: async (texto: string) => {
      classificacoes++;
      return { intencao: recusaDiretaFrancisco(texto) ? "recusa" : "interesse", origem: "regra" };
    },
  } as unknown as NonNullable<Parameters<typeof processarRespostaFrancisco>[1]>;
  return {
    envios,
    mensagens,
    rpcs,
    handoffs,
    deps,
    eventos,
    contagens: () => ({ classificacoes, reaberturas }),
    setFalha: () => {
      falhar = true;
    },
  };
}
const entrada = {
  clinicaId: "clinica",
  from: "5521999998888",
  mensagemId: "mensagem",
  waMessageId: "wamid.entrada",
  texto: "Gostaria de pagar com a equipe",
  contextoId: "wamid.francisco",
};
describe("respostas e recibos do Francisco", () => {
  it("resposta interrompe sequência e segue ao humano, sem aviso da Nina", async () => {
    const a = ambiente();
    expect(await processarRespostaFrancisco(entrada, a.deps)).toEqual({ destino: "humano" });
    expect(a.rpcs[0]).toMatchObject({
      nome: "francisco_registrar_resposta",
      args: { p_saida: false, p_clinica: "clinica" },
    });
    expect(a.handoffs[0]).toMatchObject({
      avisarPaciente: false,
      solicitadoPor: "SISTEMA",
      departamentoNome: "Recepção",
      conversaId: "conversa",
    });
  });
  it("saída é registrada mesmo quando Meta omite o nono dígito", async () => {
    const a = ambiente();
    expect(
      await processarRespostaFrancisco({ ...entrada, from: "552199998888", texto: "SAIR" }, a.deps),
    ).toEqual({ destino: "encerrado" });
    expect(a.rpcs[0]!.args.p_saida).toBe(true);
    expect(a.handoffs).toHaveLength(0);
    expect(a.contagens().reaberturas).toBe(0);
  });
  it.each(["Não", "Não quero pagar", "Não tenho interesse", "Não, obrigado"])(
    "recusa encerra sem abrir atendimento: %s",
    async (texto) => {
      const a = ambiente();
      expect(await processarRespostaFrancisco({ ...entrada, texto }, a.deps)).toEqual({
        destino: "encerrado",
      });
      expect(a.rpcs[0]!.args.p_saida).toBe(true);
      expect(a.handoffs).toHaveLength(0);
      expect(a.contagens().reaberturas).toBe(0);
    },
  );
  it("interpretação sem segurança segue ao humano sem resposta automática", async () => {
    const a = ambiente();
    a.deps.classificar = async () => ({ intencao: "duvida", origem: "fallback" });
    expect(await processarRespostaFrancisco(entrada, a.deps)).toEqual({ destino: "humano" });
    expect(a.rpcs[0]!.args.p_saida).toBe(false);
    expect(a.handoffs[0]!.avisarPaciente).toBe(false);
  });
  it("pausa antes da IA e registra recusa interpretada antes de encerrar", async () => {
    const a = ambiente();
    a.deps.classificar = async () => {
      expect(a.rpcs).toHaveLength(1);
      expect(a.rpcs[0]!.args.p_saida).toBe(false);
      return { intencao: "recusa", origem: "gemini" };
    };
    expect(
      await processarRespostaFrancisco(
        { ...entrada, texto: "Vou deixar esse orçamento para lá." },
        a.deps,
      ),
    ).toEqual({ destino: "encerrado" });
    expect(a.rpcs).toHaveLength(2);
    expect(a.rpcs[1]!.args.p_saida).toBe(true);
    expect(a.handoffs).toHaveLength(0);
  });
  it("retry reutiliza a decisão registrada mesmo se o classificador mudar", async () => {
    const a = ambiente();
    const negativa = { ...entrada, texto: "Não quero pagar" };
    await processarRespostaFrancisco(negativa, a.deps);
    a.deps.classificar = async () => {
      throw new Error("Não deve reclassificar");
    };
    expect(await processarRespostaFrancisco(negativa, a.deps)).toEqual({ destino: "encerrado" });
    expect(a.eventos).toHaveLength(1);
    expect(a.contagens()).toEqual({ classificacoes: 1, reaberturas: 0 });
  });
  it("recebimentos concorrentes usam a mesma decisão mesmo com interpretações diferentes", async () => {
    const a = ambiente();
    let chamada = 0;
    a.deps.classificar = async () => ({
      intencao: ++chamada === 1 ? "recusa" : "interesse",
      origem: "gemini",
    });
    const p = { ...entrada, texto: "Vou deixar esse orçamento para lá." };
    const resultados = await Promise.all([
      processarRespostaFrancisco(p, a.deps),
      processarRespostaFrancisco(p, a.deps),
    ]);
    expect(resultados).toEqual([{ destino: "encerrado" }, { destino: "encerrado" }]);
    expect(a.eventos).toHaveLength(1);
    expect(a.handoffs).toHaveLength(0);
  });
  it("não captura citação de outro agente, outra clínica ou outro telefone", async () => {
    const a = ambiente();
    expect(
      await processarRespostaFrancisco({ ...entrada, contextoId: "wamid.outro" }, a.deps),
    ).toBe(false);
    expect(await processarRespostaFrancisco({ ...entrada, clinicaId: "outra" }, a.deps)).toBe(
      false,
    );
    expect(await processarRespostaFrancisco({ ...entrada, from: "5521988887777" }, a.deps)).toBe(
      false,
    );
    expect(a.handoffs).toHaveLength(0);
  });
  it("sem citação, outro envio posterior preserva o atendimento atual", async () => {
    const a = ambiente();
    a.mensagens.push({
      clinica_id: "clinica",
      direction: "out",
      to_number: entrada.from,
      created_at: new Date().toISOString(),
      wa_message_id: "wamid.humano",
    });
    expect(await processarRespostaFrancisco({ ...entrada, contextoId: undefined }, a.deps)).toBe(
      false,
    );
    expect(a.rpcs).toHaveLength(0);
  });
  it("falha de encaminhamento não é anunciada como sucesso", async () => {
    const a = ambiente();
    a.setFalha();
    await expect(processarRespostaFrancisco(entrada, a.deps)).rejects.toThrow("encaminhar");
    expect(a.rpcs).toHaveLength(1);
  });
  it("recibos atrasados não regridem leitura e respeitam clínica", async () => {
    const a = ambiente();
    const db = a.deps.db;
    await registrarEntregaFrancisco("clinica", [{ id: "wamid.francisco", status: "read" }], db);
    await registrarEntregaFrancisco(
      "clinica",
      [
        { id: "wamid.francisco", status: "delivered" },
        { id: "wamid.francisco", status: "failed" },
      ],
      db,
    );
    expect(a.envios[0]!.entrega).toBe("read");
    a.envios[0]!.entrega = "sent";
    await registrarEntregaFrancisco("outra", [{ id: "wamid.francisco", status: "read" }], db);
    expect(a.envios[0]!.entrega).toBe("sent");
  });
});
