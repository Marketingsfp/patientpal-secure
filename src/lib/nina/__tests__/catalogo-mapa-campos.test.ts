import { expect, test } from "bun:test";
import { camposDoCatalogo, mapaCamposResultado } from "../catalogo-mapa-campos";
import {
  montarResultadoCatalogo,
  servicoParaRegistro,
  profissionalParaRegistro,
  type ServicoPublicado,
  type ProfissionalPublicado,
} from "../catalogo-conhecimento";

const servico: ServicoPublicado = {
  id: "exame",
  nome: "Exame de teste",
  procedimento_id: "procedimento",
  valor: null,
  valor_observacao: "Valor por região",
  descricao_publica: "Descrição publicada",
  preparo: "Preparo confirmado",
  restricoes: "Restrição confirmada",
  executantes: [{ nome: "Profissional A", horarios: "Segunda às 9h", observacao: "Quinzenal" }],
  formas_pagamento: [
    { forma: "Dinheiro", valor: 100 },
    { forma: "Pix", valor: 120 },
  ],
  estrutura: {
    pedido_medico: "obrigatorio",
    aliases: ["Exame popular"],
    complementos: [{ chave: "exame de teste::", criterio_adicional: "Critério confirmado" }],
  },
};
const profissional: ProfissionalPublicado = {
  id: "consulta",
  nome: "Profissional B",
  especialidades: [{ nome: "Especialidade B" }],
  atende_consultorio: null,
  formas_pagamento: [{ forma: "Dinheiro", valor: 200, condicao: "Consulta B" }],
  convenios: [],
  horarios: [
    {
      dia: "Terça-feira",
      inicio: "10:00",
      fim: null,
      recorrencia: "Quinzenal",
      observacao: "Confirmar data",
    },
  ],
  tipo_atendimento: "Hora marcada",
  observacao_publica: "Condições da consulta",
  aviso_dia: "Aviso temporário",
  aviso_valido_de: "2026-10-01",
  aviso_valido_ate: "2026-10-03",
  estrutura: {
    pedido_medico: "dispensado",
    complementos: [
      { chave: "consulta::profissional b", criterio_adicional: "Critério da consulta" },
    ],
  },
  unidades: { nome: "Unidade B" },
};

// Valida o caminho em cada objeto; listas vazias são válidas, não fatos ausentes inventados.
function caminhoExiste(valor: unknown, partes: string[]): boolean {
  if (!partes.length) return true;
  if (!valor || typeof valor !== "object") return false;
  const [parte, ...resto] = partes;
  const lista = parte!.endsWith("[]");
  const chave = lista ? parte!.slice(0, -2) : parte!;
  if (!Object.hasOwn(valor, chave)) return false;
  const filho = (valor as Record<string, unknown>)[chave];
  return lista
    ? Array.isArray(filho) && filho.every((v) => caminhoExiste(v, resto))
    : caminhoExiste(filho, resto);
}

test("todos os caminhos do mapa correspondem ao contrato retornado para os dois catálogos", () => {
  for (const [tipo, registro] of [
    ["servico", servicoParaRegistro(servico)],
    ["profissional", profissionalParaRegistro(profissional, "2026-10-02")],
  ] as const) {
    const campos = camposDoCatalogo(tipo);
    expect(new Set(campos.map((c) => c.campo)).size).toBe(campos.length);
    for (const c of campos)
      expect(caminhoExiste(registro, c.caminho.split(".")), `${tipo}: ${c.caminho}`).toBe(true);
  }
});

test("o mapa acompanha o retorno e não mistura consultas com exames", () => {
  const resultado = montarResultadoCatalogo({
    servicos: [servico],
    profissionais: [profissional],
    hojeISO: "2026-10-04",
  });
  expect(resultado.mapa_campos?.exames_procedimentos?.nome_medico).toBe(
    "extras.executantes[].nome",
  );
  expect(resultado.mapa_campos?.consultas_profissionais?.nome_medico).toBe("medico");
  expect(resultado.records[0]!.extras?.formas_pagamento).toEqual(servico.formas_pagamento);
  expect(resultado.records[1]!.extras?.formas_pagamento).toEqual(profissional.formas_pagamento);
  expect(resultado.records[1]!.extras?.horarios).toEqual(profissional.horarios);
  expect(resultado.mapa_campos?.fontes_externas.vagas_disponiveis).toBe(
    "consultar_disponibilidade",
  );
  expect(mapaCamposResultado(["servico"]).consultas_profissionais).toBeUndefined();
});

test("campo desconhecido continua desconhecido e mapa vazio não cria catálogo", () => {
  const r = profissionalParaRegistro(
    { ...profissional, estrutura: undefined, observacao_publica: null },
    "2026-10-04",
  );
  expect(r.extras?.atende_consultorio).toBeNull();
  expect(r.extras?.observacao_publica).toBeNull();
  expect((r.extras?.estrutura as { pedido_medico: string }).pedido_medico).toBe("nao_informado");
  const vazio = montarResultadoCatalogo({ servicos: [], profissionais: [], hojeISO: "2026-10-04" });
  expect(vazio.found).toBe(false);
  expect(vazio.mapa_campos).toBeUndefined();
});

test("aviso expirado, nota interna e rascunho não aparecem nos novos caminhos públicos", () => {
  const dados = {
    ...profissional,
    nota_interna: "SEGREDO_INTERNO",
    rascunho: { observacao_publica: "RASCUNHO_PRIVADO" },
  };
  const vigente = profissionalParaRegistro(dados, "2026-10-02");
  expect(vigente.extras?.aviso_vigente).toEqual({
    texto: "Aviso temporário",
    valido_de: "2026-10-01",
    valido_ate: "2026-10-03",
  });
  const expirado = profissionalParaRegistro(dados, "2026-10-04");
  expect(expirado.extras?.aviso_vigente).toBeNull();
  expect(JSON.stringify(expirado)).not.toContain("Aviso temporário");
  expect(JSON.stringify(vigente)).not.toContain("SEGREDO_INTERNO");
  expect(JSON.stringify(vigente)).not.toContain("RASCUNHO_PRIVADO");
});
