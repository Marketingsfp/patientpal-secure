import { describe, expect, it } from "bun:test";
import {
  prepararBuscaCatalogo,
  compararNomeProfissional,
  perguntaIdentificacaoProfissional,
} from "../catalogo-busca";
import { encaminhamentoSemRegistro } from "../catalogo-sem-registro";
import { resultadoExigeHumano } from "../regras-catalogo";
import { validarResultado } from "../tool-broker";
import { extrairEvidencia } from "../confidence/evidencia-extrator";

describe("interpretação de escrita sem trocar o atendimento", () => {
  it.each([
    "USG de tireoide",
    "ultra de tireoide",
    "ultrassom de tireoide",
    "ultra-som de tireoide",
    "ultrassonogragia de tireoide",
    "ultrassonografia de tireiode",
  ])("reconhece %s somente no exame solicitado", (query) => {
    const nomes = [
      "Ultrassonografia de tireoide",
      "Ultrassonografia de abdome total",
      "Punção de tireoide",
    ];
    const busca = prepararBuscaCatalogo(query, nomes);
    expect(nomes.filter((nome) => busca.pontuar(nome, "") > 0)).toEqual([nomes[0]!]);
  });
  it.each([
    ["ECG", "Eletrocardiograma", "Eletroencefalograma"],
    ["EEG", "Eletroencefalograma", "Eletrocardiograma"],
    ["RX de tórax", "Radiografia de tórax", "Tomografia de tórax"],
    ["cardio", "Cardiologia", "Ecocardiograma"],
    ["otorrino", "Otorrinolaringologia", "Ortopedia"],
    ["ortopedissta", "Ortopedia", "Pediatria"],
    ["nebulisacao", "Nebulização", "Nebulizador"],
  ])("equivalência de %s mantém a distinção clínica", (query, certo, errado) => {
    const busca = prepararBuscaCatalogo(query, [certo, errado]);
    expect(busca.pontuar(certo, "")).toBeGreaterThan(0);
    expect(busca.pontuar(errado, "")).toBe(0);
  });
  it.each(["USG abdome total", "USG com Doppler", "USG sem Doppler"])(
    "preserva qualificadores: %s",
    (query) => {
      const nomes = [
        "Ultrassonografia abdome superior",
        "Ultrassonografia sem Doppler",
        "Ultrassonografia com Doppler",
      ];
      const busca = prepararBuscaCatalogo(query, nomes);
      expect(nomes.filter((n) => busca.pontuar(n, "") > 0)).toEqual(
        query.includes("total") ? [] : [query.includes("sem") ? nomes[1]! : nomes[2]!],
      );
    },
  );
  it("não transforma urologia em neurologia por proximidade", () => {
    expect(prepararBuscaCatalogo("urologista", ["Neurologia"]).pontuar("Neurologia", "")).toBe(0);
  });
  it.each(["USG transvaginal", "ultra de transvaginal", "ultrassonografia transavaginal"])(
    "identifica o nome completo de %s sem incluir variantes",
    (query) => {
      const nomes = [
        "USG TRANSVAGINAL",
        "USG TRANSVAGINAL COM DOPPLER",
        "USG TRANSVAGINAL GEMELAR",
      ];
      const busca = prepararBuscaCatalogo(query, nomes);
      expect(nomes.filter(busca.correspondeNomeCompleto)).toEqual([nomes[0]!]);
    },
  );
  it("a identidade completa preserva números, com/sem e qualificadores", () => {
    for (const [query, diferente] of [
      ["USG transvaginal com Doppler", "USG transvaginal sem Doppler"],
      ["USG transvaginal gemelar", "USG transvaginal"],
      ["USG cervical infantil", "USG cervical"],
      ["USG morfológica de 1 trimestre", "USG morfológica de 2 trimestre"],
      ["Hepatite A", "Hepatite"],
    ]) {
      const busca = prepararBuscaCatalogo(query!, [query!, diferente!]);
      expect(busca.correspondeNomeCompleto(query!)).toBe(true);
      expect(busca.correspondeNomeCompleto(diferente!)).toBe(false);
    }
  });
  it("siglas desconhecidas exigem esclarecimento, sem concluir ausência", () => {
    expect(prepararBuscaCatalogo("quero xyz", []).siglasDesconhecidas).toEqual(["xyz"]);
    const dados = {
      ok: true,
      knowledge_status: "not_found",
      found: false,
      records: [],
      esclarecimento: { tipo: "sigla", pergunta: "Qual é o nome por extenso?", opcoes: [] },
    };
    for (const nome of ["consultar_base_conhecimento", "buscar_procedimentos", "buscar_medicos"])
      expect(encaminhamentoSemRegistro(validarResultado(nome, dados), { termo: "xyz" })).toBeNull();
  });
  it("um nome aproximado sugere confirmação, sem resolver uma identidade", () => {
    expect(compararNomeProfissional("Joao Hleio", "João Hélio")).toBe("aproximado");
    expect(compararNomeProfissional("Joao Helio", "Dr. João Hélio")).toBe("exato");
    expect(compararNomeProfissional("Joao Santos", "João Hélio")).toBeNull();
  });
  it("homônimos são diferenciados por dados publicados; sem diferenças não escolhe", () => {
    expect(
      perguntaIdentificacaoProfissional([
        { nome: "João Silva", especialidade: "Cardiologia", unidade: "Centro" },
        { nome: "João Silva", especialidade: "Ortopedia", unidade: "Norte" },
      ]),
    ).toContain("João Silva — Ortopedia — Norte");
    expect(
      perguntaIdentificacaoProfissional([{ nome: "João Silva" }, { nome: "João Silva" }]),
    ).toContain("ainda não permitem distingui-los");
  });
  it("candidatos não comprovam preço nem disparam transferência SFP", () => {
    const dados = {
      knowledge_status: "found",
      price: "R$ 100",
      records: [
        { id: "s1", procedimento: "Ultrassonografia A", preco_dinheiro: 100, medico: "SFP" },
      ],
      esclarecimento: {
        tipo: "procedimento",
        pergunta: "Qual exame?",
        opcoes: [
          { id: "s1", nome: "Ultrassonografia A" },
          { id: "s2", nome: "Ultrassonografia B" },
        ],
      },
    };
    expect(resultadoExigeHumano(dados)).toBe(false);
    const ex = extrairEvidencia({
      ferramenta: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      clinicaId: "clinica",
      success: true,
      dados,
    });
    expect(ex.consulta.status).toBe("parcial");
    expect(ex.fatos).toHaveLength(2);
    expect(ex.fatos.every((f) => f.campo === "nome")).toBe(true);
  });
});

it("erros em palavras comuns do pedido não ocultam a especialidade", () => {
  const busca = prepararBuscaCatalogo("Gostria de uma consutla com ortopedista", ["Ortopedia"]);
  expect(busca.pontuar("", "Ortopedia")).toBeGreaterThan(0);
});
