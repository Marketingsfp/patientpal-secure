import { describe, expect, it } from "bun:test";
import { avaliarGrounding, extrairClaimsDoTexto } from "./claims";
import type { FatoRecuperado } from "./evidencia";
import type { ContextoConfianca } from "./types";

const catalogo: FatoRecuperado[] = [
  {
    consulta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "catalogo_publicado",
    entidade: "servico",
    campo: "nome",
    valor: "Cardiologia",
    chave: { procedimento: "Cardiologia" },
  },
  {
    consulta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "catalogo_publicado",
    entidade: "profissional",
    campo: "nome",
    valor: "Carlos Silva",
    chave: { procedimento: "Cardiologia", medicoNome: "Carlos Silva" },
  },
];
const endereco: FatoRecuperado = {
  consulta: "consultar_base_conhecimento",
  capacidade: "searchKnowledgeBase",
  fonte: "catalogo_publicado",
  entidade: "endereco",
  campo: "endereco",
  valor: "Rua das Acácias, 100",
};
function contexto(fatos = catalogo): ContextoConfianca {
  return {
    requestedAction: null,
    fatos,
    retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
    toolResults: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        success: true,
        temConteudo: true,
      },
    ],
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

describe("área de atendimento não é endereço", () => {
  it.each([
    "O exame avalia a região lombar.",
    "A imagem mostra a zona de transição.",
  ])("termos anatômicos não viram localização: %s", (texto) => {
    expect(extrairClaimsDoTexto(texto).filter((c) => c.tipo === "endereco")).toHaveLength(0);
  });

  it.each([
    "Atendemos na área de **Cardiologia** com os seguintes profissionais:",
    "Atendemos na especialidade de Cardiologia.",
    "Atendemos em Cardiologia.",
    "Atendemos na Cardiologia.",
    "Atendemos Cardiologia.",
  ])("confere o serviço na base sem inventar uma afirmação de localização: %s", (texto) => {
    const extraidos = extrairClaimsDoTexto(texto);
    expect(extraidos.filter((c) => c.tipo === "endereco")).toHaveLength(0);
    expect(extraidos.filter((c) => c.tipo === "servico").map((c) => c.valor)).toEqual([
      "Cardiologia",
    ]);
    const r = avaliarGrounding(contexto(), texto);
    expect(r.claims.filter((c) => c.tipo === "servico").every((c) => c.suportado)).toBe(true);
    expect(r.semEvidencia).toHaveLength(0);
  });

  it("a construção clínica não aprova uma especialidade ausente da base", () => {
    const r = avaliarGrounding(
      contexto(),
      "Atendemos na área de Oncologia com os seguintes profissionais:",
    );
    expect(r.claims.some((c) => c.tipo === "servico" && !c.suportado)).toBe(true);
    expect(r.claims.filter((c) => c.tipo === "endereco")).toHaveLength(0);
  });

  it("mantém a prova de cada profissional citado após o cabeçalho clínico", () => {
    const cabecalho = "Atendemos na área de **Cardiologia** com os seguintes profissionais:\n";
    const correto = avaliarGrounding(contexto(), `${cabecalho}Dr. Carlos Silva.`);
    expect(correto.claims.some((c) => c.tipo === "profissional" && c.suportado)).toBe(true);
    const errado = avaliarGrounding(contexto(), `${cabecalho}Dra. Marina Oliveira.`);
    expect(errado.claims.some((c) => c.tipo === "profissional" && !c.suportado)).toBe(true);
  });

  it.each([
    "Atendemos na Rua das Acácias, 100.",
    "Atendemos em Belo Horizonte.",
    "Atendemos na área de Jardim Central.",
    "Atendemos na unidade Centro.",
  ])("mantém localização como endereço que precisa de prova: %s", (texto) => {
    const r = avaliarGrounding(contexto(), texto);
    expect(r.claims.some((c) => c.tipo === "endereco" && !c.suportado)).toBe(true);
  });

  it.each([
    "Atendemos na área de Cardiologia na Rua das Acácias, 100.",
    "Atendemos na área de Cardiologia na clínica Exemplo, Rua das Acácias, 100.",
  ])("confere separadamente especialidade e rua na mesma frase: %s", (texto) => {
    const semEndereco = avaliarGrounding(contexto(), texto);
    expect(semEndereco.claims.some((c) => c.tipo === "servico" && c.suportado)).toBe(true);
    expect(semEndereco.claims.some((c) => c.tipo === "endereco" && !c.suportado)).toBe(true);
    const comEndereco = avaliarGrounding(contexto([...catalogo, endereco]), texto);
    expect(comEndereco.claims.some((c) => c.tipo === "endereco" && c.suportado)).toBe(true);
    expect(comEndereco.semEvidencia).toHaveLength(0);
    const numeroErrado = avaliarGrounding(
      contexto([...catalogo, endereco]),
      texto.replace("100", "200"),
    );
    expect(numeroErrado.claims.some((c) => c.tipo === "endereco" && !c.suportado)).toBe(true);
  });

  it.each([
    "Atendemos na área de Cardiologia no bairro Centro.",
    "Atendemos na área de Cardiologia na cidade de Belo Horizonte.",
    "Atendemos na área de Cardiologia e ficamos no bairro Centro.",
    "Atendemos na área de Cardiologia e estamos em Belo Horizonte.",
  ])("não oculta localização sem logradouro depois da oferta clínica: %s", (texto) => {
    const r = avaliarGrounding(contexto(), texto);
    const servicos = r.claims.filter((c) => c.tipo === "servico");
    expect(servicos).toHaveLength(1);
    expect(servicos[0]?.suportado).toBe(true);
    expect(r.claims.some((c) => c.tipo === "endereco" && !c.suportado)).toBe(true);
  });
});
