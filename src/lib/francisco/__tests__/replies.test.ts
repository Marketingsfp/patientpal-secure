import { describe, it, expect } from "bun:test";
import { processarRespostaFrancisco, registrarEntregaFrancisco } from "../replies.server";

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
      configuracao: { departamento: "Recepção" },
      orcamento_id: "orcamento",
    },
  ];
  const mensagens: Linha[] = [];
  const rpcs: Array<{ nome: string; args: Linha }> = [],
    handoffs: Linha[] = [];
  let falhar = false;
  const db = {
    from: (t: string) => new Consulta(t === "francisco_envios" ? envios : mensagens),
    rpc: async (nome: string, args: Linha) => {
      rpcs.push({ nome, args });
      return { error: null };
    },
  };
  const atendimento = async () => ({
    reabrirConversaPorMensagemPaciente: async () => [],
    estadoConversaPorTelefone: async () => ({ id: "conversa" }),
    encaminharParaHumano: async (p: Linha) => {
      handoffs.push(p);
      return { ok: !falhar };
    },
  });
  const deps = { db, atendimento } as unknown as NonNullable<
    Parameters<typeof processarRespostaFrancisco>[1]
  >;
  return {
    envios,
    mensagens,
    rpcs,
    handoffs,
    deps,
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
    expect(await processarRespostaFrancisco(entrada, a.deps)).toBe(true);
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
    ).toBe(true);
    expect(a.rpcs[0]!.args.p_saida).toBe(true);
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
