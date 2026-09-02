import { describe, expect, it } from "bun:test";
import type { CbRegra } from "@/lib/cb-regras";
import {
  baseParticular,
  calcularConvenio,
  calcularParticular,
  casaBusca,
  escolherRegraServico,
  type ServicoTabela,
} from "./calcular";

const servico = (over: Partial<ServicoTabela> = {}): ServicoTabela => ({
  id: "proc-1",
  nome: "Consulta Cardiologia",
  codigo: "0301",
  grupo: "Consultas",
  tipo: "consulta",
  duracao_minutos: 15,
  preparo: null,
  valor_variavel: false,
  valor_padrao: 0,
  valor_dinheiro: 120,
  valor_dinheiro_pix: 0,
  valor_pix: 0,
  valor_cartao: 145,
  valor_cartao_credito: 0,
  valor_cartao_debito: 0,
  ...over,
});

const regra = (over: Partial<CbRegra> = {}): CbRegra => ({
  id: "r1",
  convenio_id: "cv1",
  especialidade_id: null,
  procedimento_id: null,
  tipo: null,
  modo: "valor_fixo",
  valor: null,
  percentual: null,
  prioridade: 0,
  ativo: true,
  ...over,
});

describe("baseParticular", () => {
  it("usa dinheiro e cartão do cadastro (consulta de R$ 120 / R$ 145)", () => {
    expect(baseParticular(servico())).toEqual({ dinheiro: 120, outros: 145 });
  });

  it("cai para valor_padrao quando o serviço só tem esse campo preenchido", () => {
    const s = servico({ valor_dinheiro: 0, valor_cartao: 0, valor_padrao: 80 });
    expect(baseParticular(s)).toEqual({ dinheiro: 80, outros: 80 });
  });

  it("repete o dinheiro no cartão quando não há valor de cartão cadastrado", () => {
    const s = servico({ valor_cartao: 0, valor_cartao_credito: 0, valor_cartao_debito: 0 });
    expect(baseParticular(s)).toEqual({ dinheiro: 120, outros: 120 });
  });
});

describe("calcularParticular", () => {
  it("não inventa desconto nem aviso", () => {
    const l = calcularParticular(servico());
    expect(l).toEqual({
      dinheiro: 120,
      outros: 145,
      gratuito: false,
      origem: "particular",
      avisos: [],
    });
  });
});

describe("escolherRegraServico", () => {
  it("prefere a regra do serviço específico à regra genérica do tipo", () => {
    const generica = regra({ id: "generica", tipo: "consulta" });
    const doServico = regra({ id: "do-servico", procedimento_id: "proc-1" });
    const escolhida = escolherRegraServico([generica, doServico], [], "consulta", "proc-1");
    expect(escolhida?.id).toBe("do-servico");
  });

  it("acha a regra da especialidade vinculada ao serviço", () => {
    const daEsp = regra({ id: "da-esp", especialidade_id: "esp-cardio" });
    const escolhida = escolherRegraServico([daEsp], ["esp-cardio"], "consulta", "proc-1");
    expect(escolhida?.id).toBe("da-esp");
  });

  it("ignora regra de especialidade que o serviço não tem", () => {
    const deOutra = regra({ id: "de-outra", especialidade_id: "esp-orto" });
    expect(escolherRegraServico([deOutra], ["esp-cardio"], "consulta", "proc-1")).toBeNull();
  });

  it("deixa a gratuidade vencer o desconto no mesmo nível de especificidade", () => {
    const desconto = regra({
      id: "desconto",
      procedimento_id: "proc-1",
      modo: "percentual_desconto",
      percentual: 10,
      prioridade: 100,
    });
    const cortesia = regra({
      id: "cortesia",
      procedimento_id: "proc-1",
      gratuito: true,
      prioridade: 10,
    });
    const escolhida = escolherRegraServico([desconto, cortesia], [], "consulta", "proc-1");
    expect(escolhida?.id).toBe("cortesia");
  });
});

describe("calcularConvenio", () => {
  it("aplica valor fixo com preço próprio de cartão", () => {
    const l = calcularConvenio({
      servico: servico(),
      regras: [regra({ procedimento_id: "proc-1", valor: 60, valor_cartao: 70 })],
      especialidadesDoServico: [],
      valorManual: null,
    });
    expect(l.dinheiro).toBe(60);
    expect(l.outros).toBe(70);
    expect(l.origem).toBe("regra");
  });

  it("repete o valor em dinheiro no cartão quando a regra não separa os dois", () => {
    const l = calcularConvenio({
      servico: servico(),
      regras: [regra({ procedimento_id: "proc-1", valor: 60 })],
      especialidadesDoServico: [],
      valorManual: null,
    });
    expect(l.dinheiro).toBe(60);
    expect(l.outros).toBe(60);
  });

  it("aplica percentual de desconto sobre cada base", () => {
    const l = calcularConvenio({
      servico: servico(),
      regras: [
        regra({
          procedimento_id: "proc-1",
          modo: "percentual_desconto",
          percentual: 50,
          percentual_cartao: 20,
        }),
      ],
      especialidadesDoServico: [],
      valorManual: null,
    });
    expect(l.dinheiro).toBe(60);
    expect(l.outros).toBe(116);
  });

  it("marca gratuidade como R$ 0,00 nas duas formas", () => {
    const l = calcularConvenio({
      servico: servico(),
      regras: [regra({ procedimento_id: "proc-1", gratuito: true })],
      especialidadesDoServico: [],
      valorManual: null,
    });
    expect(l.gratuito).toBe(true);
    expect(l.dinheiro).toBe(0);
    expect(l.outros).toBe(0);
  });

  it("avisa a carência sem esconder o benefício", () => {
    const l = calcularConvenio({
      servico: servico(),
      regras: [regra({ procedimento_id: "proc-1", valor: 60, carencia_mensalidades: 3 })],
      especialidadesDoServico: [],
      valorManual: null,
    });
    expect(l.dinheiro).toBe(60);
    expect(l.avisos.join(" ")).toContain("3ª mensalidade");
  });

  it("avisa o limite de uso do benefício", () => {
    const l = calcularConvenio({
      servico: servico(),
      regras: [
        regra({ procedimento_id: "proc-1", valor: 9.99, limite_qtd: 1, limite_periodo: "mes" }),
      ],
      especialidadesDoServico: [],
      valorManual: null,
    });
    expect(l.avisos.join(" ")).toContain("1x por mês");
  });

  it("usa a tabela digitada à mão quando nenhuma regra cobre o serviço", () => {
    const l = calcularConvenio({
      servico: servico(),
      regras: [],
      especialidadesDoServico: [],
      valorManual: { valor_dinheiro: 90, valor_outros: 100 },
    });
    expect(l.dinheiro).toBe(90);
    expect(l.outros).toBe(100);
    expect(l.origem).toBe("tabela-convenio");
  });

  it("nunca deixa o convênio sair mais caro que o particular", () => {
    // Caso real do cadastro: linha antiga de R$ 147,25 contra particular de
    // R$ 120,00 em dinheiro. A forma encarecida volta ao particular.
    const l = calcularConvenio({
      servico: servico(),
      regras: [],
      especialidadesDoServico: [],
      valorManual: { valor_dinheiro: 147.25, valor_outros: 100 },
    });
    expect(l.dinheiro).toBe(120);
    expect(l.outros).toBe(100);
  });

  it("volta ao particular quando a tabela do convênio não barateia nada", () => {
    const l = calcularConvenio({
      servico: servico(),
      regras: [],
      especialidadesDoServico: [],
      valorManual: { valor_dinheiro: 200, valor_outros: 200 },
    });
    expect(l.origem).toBe("particular");
    expect(l.dinheiro).toBe(120);
    expect(l.outros).toBe(145);
  });

  it("cobra particular quando o convênio não tem regra nem tabela", () => {
    const l = calcularConvenio({
      servico: servico(),
      regras: [],
      especialidadesDoServico: [],
      valorManual: null,
    });
    expect(l.origem).toBe("particular");
  });
});

describe("casaBusca", () => {
  it("acha sem acento e em qualquer ordem", () => {
    expect(casaBusca("cardio consulta", ["Consulta Cardiologia", "0301", "Consultas"])).toBe(true);
  });

  it("acha pelo código", () => {
    expect(casaBusca("0301", ["Consulta Cardiologia", "0301", "Consultas"])).toBe(true);
  });

  it("não acha o que não existe", () => {
    expect(casaBusca("raio x", ["Consulta Cardiologia", "0301", "Consultas"])).toBe(false);
  });

  it("busca vazia mostra tudo", () => {
    expect(casaBusca("   ", ["qualquer"])).toBe(true);
  });
});
