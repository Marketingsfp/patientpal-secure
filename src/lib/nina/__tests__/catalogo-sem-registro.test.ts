import { describe, expect, it } from "bun:test";
import { encaminhamentoSemRegistro, pedidoDeItemCatalogo, termosItemCatalogo } from "../catalogo-sem-registro";
import { validarResultado } from "../tool-broker";

const vazio = { ok: true, source: "nina_catalogo", knowledge_status: "not_found", found: false, records: [] };
describe("ausência de atendimento no catálogo", () => {
  it.each([
    "Gostaria de marca a pneumologista", "Quero consulta de pneumologia",
    "Quanto custa o exame PET-CT?", "Vocês realizam o procedimento crioablação?",
    "Qual o preparo da biópsia?", "Quero agendar com Dr. Exemplo",
  ])("pedido identificado: %s", query => {
    expect(pedidoDeItemCatalogo(query)).toBe(true);
    expect(encaminhamentoSemRegistro(validarResultado("consultar_base_conhecimento", vazio), { termo: query }, true)?.motivo).toContain("CATALOGO_SEM_REGISTRO");
  });
  it.each(["Oi bom dia", "Meu nome é João Silva", "123.456.789-00", "Quero marcar uma consulta", "Qual o endereço?", "sim, por favor"])("leitura preventiva não transfere sem item: %s", query => {
    expect(encaminhamentoSemRegistro(validarResultado("consultar_base_conhecimento", vazio), { termo: query }, true)).toBeNull();
  });
  it("consulta explícita do modelo não depende de uma lista de nomes de exames", () => {
    expect(encaminhamentoSemRegistro(validarResultado("consultar_base_conhecimento", vazio), { termo: "Novo atendimento XYZ" })).not.toBeNull();
  });
  it.each(["buscar_medicos", "buscar_procedimentos", "listar_especialidades"])("ausência tipada de %s exige humano", ferramenta => {
    const r = validarResultado(ferramenta, { ok: false, erro: ferramenta === "buscar_medicos" ? "DOCTOR_NOT_FOUND" : "PROCEDURE_NOT_FOUND", fonte: "catalogo_publicado", encaminhar_para_humano: true });
    expect(encaminhamentoSemRegistro(r, {})).not.toBeNull();
  });
  it.each([
    { ok: false, erro: "INTERNAL_ERROR" },
    { ...vazio, ok: false, erro: "INTERNAL_ERROR" },
    { ...vazio, found: true, knowledge_status: "found", records: [{ procedimento: "Exame", preco_dinheiro: null }] },
    { ...vazio, found: true, knowledge_status: "conflict", records: [{ procedimento: "Exame A" }, { procedimento: "Exame B" }] },
  ])("erro ou registro encontrado não comprova ausência (%#)", dados => {
    expect(encaminhamentoSemRegistro(validarResultado("consultar_base_conhecimento", dados), { termo: "exame X" })).toBeNull();
  });
  it("ferramentas de cadastro e clínica não disparam a regra de catálogo", () => {
    for (const nome of ["identificar_paciente", "dados_da_clinica", "horario_funcionamento", "agendar"])
      expect(encaminhamentoSemRegistro(validarResultado(nome, vazio), {})).toBeNull();
  });
  it("pedido completo conserva o item depois de remover as palavras genéricas", () => {
    expect(termosItemCatalogo("Bom dia gostaria por favor de saber o valor de uma consulta de pneumologia")).toEqual(["pneumologia"]);
  });
});
