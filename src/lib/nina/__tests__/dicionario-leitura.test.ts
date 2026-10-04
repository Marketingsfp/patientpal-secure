import { expect, it } from "bun:test";
import { consultarVariacoesDaMensagem } from "../dicionario-leitura";
const registro = (id: string, aliases: string[]) => ({ id, nome: `Atendimento ${id}`, estrutura: { aliases } });

it("lê siglas, sinônimos e erros revisados na mensagem original, sem confundir substrings", () => {
  const r = consultarVariacoesDaMensagem("Vocês fazem USG? E ultrasom ou médico de criança?", [registro("exame", ["USG", "ultrasom", "US"])], [registro("consulta", ["medico de crianca"])]);
  expect(r.candidatos[0].variacoes_encontradas).toEqual(["USG", "ultrasom"]);
  expect(r.candidatos[1].tipo).toBe("consulta");
  expect(consultarVariacoesDaMensagem("buscar", [registro("a", ["US"])], []).candidatos).toEqual([]);
});
it("mantém aliases compartilhados como candidatos distintos, sem escolher um exame", () => {
  const r = consultarVariacoesDaMensagem("USA com doppler", [registro("a", ["USA"]), registro("b", ["USA", "USA com doppler"])], []);
  expect(r.total_candidatos).toBe(2);
  expect(r.candidatos[1].variacoes_encontradas).toEqual(["USA", "USA com doppler"]);
});
it("não transforma pistas em autorização e não lê rascunho ou notas", () => {
  const r = consultarVariacoesDaMensagem("não quero XYZ", [{ ...registro("a", ["XYZ"]), nota_interna: "sigla secreta", rascunho: { estrutura: { aliases: ["ZZZ"] } } } as any], []);
  expect(r.candidatos).toHaveLength(1);
  expect(JSON.stringify(r)).not.toContain("secreta");
  expect(consultarVariacoesDaMensagem("ZZZ", [{ ...registro("a", []), rascunho: { estrutura: { aliases: ["ZZZ"] } } } as any], []).candidatos).toEqual([]);
});
it("limita o contexto enviado, mas informa todos os candidatos encontrados", () => {
  const r = consultarVariacoesDaMensagem("XYZ", Array.from({ length: 25 }, (_, i) => registro(String(i), ["XYZ"])), []);
  expect(r.candidatos).toHaveLength(20);
  expect(r.total_candidatos).toBe(25);
  expect(r.resultado_limitado).toBe(true);
});
