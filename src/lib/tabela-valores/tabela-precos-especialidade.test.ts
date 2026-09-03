import { describe, expect, it } from "bun:test";
import {
  cabecalhosDaTabela,
  conveniosQueMudamPreco,
  linhasDaEspecialidade,
  linhasDeTexto,
  linhasParaPlanilha,
} from "./tabela-precos-especialidade";
import type { TabelaValoresDados } from "@/lib/agenda/refs-cache";
import type { ServicoTabela } from "./calcular";

const ODONTO = "esp-odonto";
const OUTRA = "esp-cardio";
const CARTAO = "conv-cartao";
const SEM_DESCONTO = "conv-neutro";

const servico = (id: string, nome: string, dinheiro: number, cartao: number): ServicoTabela => ({
  id,
  nome,
  codigo: null,
  grupo: "ODONTOLOGIA",
  tipo: "procedimento",
  duracao_minutos: 30,
  preparo: null,
  valor_variavel: false,
  valor_padrao: dinheiro,
  valor_dinheiro: dinheiro,
  valor_dinheiro_pix: dinheiro,
  valor_pix: cartao,
  valor_cartao: cartao,
  valor_cartao_credito: cartao,
  valor_cartao_debito: cartao,
});

// Reproduz o cenário de produção: 5% de desconto do Cartão Consulta em
// procedimentos de odontologia, e um segundo convênio sem nenhuma regra.
const dados = {
  servicos: [
    servico("s2", "RESTAURACAO", 200, 220),
    servico("s1", "ACESSO PULPAR", 140, 154),
    servico("sx", "ECOCARDIOGRAMA", 300, 330),
  ],
  convenios: [
    { id: CARTAO, nome: "CARTÃO CONSULTA" },
    { id: SEM_DESCONTO, nome: "CONVÊNIO SEM REGRA" },
  ],
  regrasPorConvenio: {
    [CARTAO]: [
      {
        id: "r1",
        convenio_id: CARTAO,
        especialidade_id: ODONTO,
        procedimento_id: null,
        tipo: "procedimento",
        modo: "percentual_desconto",
        valor: null,
        valor_cartao: null,
        percentual: 5,
        percentual_cartao: null,
        prioridade: 10,
        ativo: true,
        gratuito: false,
      },
    ],
    [SEM_DESCONTO]: [],
  },
  valoresManuais: {},
  especialidadesPorServico: { s1: [ODONTO], s2: [ODONTO], sx: [OUTRA] },
  medicosPorServico: {},
} as unknown as TabelaValoresDados;

describe("linhasDaEspecialidade", () => {
  it("traz só os serviços da especialidade pedida, em ordem alfabética", () => {
    const linhas = linhasDaEspecialidade(dados, ODONTO);
    expect(linhas.map((l) => l.servico.nome)).toEqual(["ACESSO PULPAR", "RESTAURACAO"]);
  });

  it("devolve lista vazia quando a especialidade não foi encontrada", () => {
    expect(linhasDaEspecialidade(dados, null)).toEqual([]);
  });

  it("aplica o desconto do convênio sobre o particular", () => {
    const [acesso] = linhasDaEspecialidade(dados, ODONTO);
    expect(acesso.particular.dinheiro).toBe(140);
    expect(acesso.particular.outros).toBe(154);
    expect(acesso.porConvenio[CARTAO].dinheiro).toBe(133); // 140 - 5%
    expect(acesso.porConvenio[CARTAO].outros).toBe(146.3); // 154 - 5%
  });
});

describe("conveniosQueMudamPreco", () => {
  it("deixa de fora o convênio que repetiria o particular na folha", () => {
    const linhas = linhasDaEspecialidade(dados, ODONTO);
    expect(conveniosQueMudamPreco(linhas, dados.convenios).map((c) => c.id)).toEqual([CARTAO]);
  });
});

describe("montagem da folha", () => {
  const linhas = linhasDaEspecialidade(dados, ODONTO);
  const convenios = conveniosQueMudamPreco(linhas, dados.convenios);

  it("gera duas colunas de valor por convênio, além do particular", () => {
    expect(cabecalhosDaTabela(convenios)).toEqual([
      "Procedimento",
      "Particular — Dinheiro",
      "Particular — Cartão/Pix",
      "CARTÃO CONSULTA — Dinheiro",
      "CARTÃO CONSULTA — Cartão/Pix",
    ]);
  });

  it("na impressão o valor sai formatado em real", () => {
    const [primeira] = linhasDeTexto(linhas, convenios);
    expect(primeira[0]).toBe("ACESSO PULPAR");
    expect(primeira[1]).toContain("140,00");
    expect(primeira[3]).toContain("133,00");
  });

  it("na planilha o valor sai como número, para o Excel ordenar e filtrar", () => {
    const [primeira] = linhasParaPlanilha(linhas, convenios);
    expect(primeira[1]).toBe(140);
    expect(typeof primeira[3]).toBe("number");
  });

  it("cabeçalho e linha têm o mesmo número de colunas", () => {
    expect(linhasDeTexto(linhas, convenios)[0].length).toBe(cabecalhosDaTabela(convenios).length);
  });
});
