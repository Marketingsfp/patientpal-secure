/** Handlers reais com banco e geração simulados, isolados dos outros testes. */
import { beforeEach, expect, mock, test } from "bun:test";
const CLINICA = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const VERSION = "2026-09-17T12:00:00.123456+00:00";
let role = "admin",
  registro: any,
  corrida = false,
  escritas: any[] = [],
  leituras: any[] = [],
  chamadasIA: any[] = [];
const banco = {
  from(tabela: string) {
    const filtros: Record<string, unknown> = {};
    let valores: any;
    const q: any = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        filtros[k] = v;
        return q;
      },
      update: (v: any) => {
        valores = v;
        return q;
      },
      insert: () => {
        throw new Error("Editar não deve inserir outro registro");
      },
      maybeSingle: async () => {
        if (tabela === "clinica_memberships") return { data: role ? { role } : null, error: null };
        if (valores) {
          if (corrida) registro.updated_at = "2026-09-17T13:00:00+00:00";
          if (
            filtros.id !== registro.id ||
            filtros.clinica_id !== registro.clinica_id ||
            (filtros.updated_at && filtros.updated_at !== registro.updated_at)
          )
            return { data: null, error: null };
          escritas.push({ tabela, filtros, valores });
          Object.assign(registro, valores);
          return { data: { id: registro.id }, error: null };
        }
        leituras.push({ tabela, filtros });
        return {
          data:
            filtros.id === registro.id && filtros.clinica_id === registro.clinica_id
              ? structuredClone(registro)
              : null,
          error: null,
        };
      },
    };
    return q;
  },
};
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validar = (v: any) => v;
    const q: any = {
      middleware: () => q,
      inputValidator: (v: any) => {
        validar = v;
        return q;
      },
      handler: (fn: any) => async (arg: any) =>
        fn({ data: validar(arg.data), context: { supabase: banco, userId: "operador" } }),
    };
    return q;
  },
}));
mock.module("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
mock.module("@/lib/nina/catalogo-ia.server", () => ({
  editarTextoComIA: async (...args: any[]) => {
    chamadasIA.push(args);
    return {
      alteracoes: [
        {
          operacao: "definir",
          caminho: "/preparo",
          valor_json: JSON.stringify("Trazer exames anteriores e documento."),
        },
      ],
      pendencias: [],
      ambiguidades: [],
    };
  },
}));
const f = await import("../../catalogo.functions");
const chamar = (fn: any, data: any) => fn({ data });
const pedido = () => ({
  clinicaId: CLINICA,
  tipo: "servico",
  id: ID,
  texto: "No preparo, acrescente trazer documento.",
});
beforeEach(() => {
  role = "admin";
  corrida = false;
  escritas = [];
  leituras = [];
  chamadasIA = [];
  registro = {
    id: ID,
    clinica_id: CLINICA,
    nome: "Mamografia",
    preparo: "Trazer exames anteriores.",
    valor: 160,
    formas_pagamento: [
      { forma: "Dinheiro", valor: 160 },
      { forma: "Cartão", valor: 200 },
    ],
    status: "PUBLICADO",
    updated_at: VERSION,
    rascunho: null,
  };
});
test("prévia lê os dados atuais do banco, filtra clínica/id e nunca escreve", async () => {
  const r = await chamar(f.preverEdicaoCatalogoIA, {
    ...pedido(),
    cadastro: { nome: "forjado", valor: 1 },
  });
  expect(r.id).toBe(ID);
  expect(r.esperadoUpdatedAt).toBe(VERSION);
  expect(chamadasIA[0][2].nome).toBe("Mamografia");
  expect(chamadasIA[0][2].valor).toBe(160);
  expect(leituras[0].filtros).toEqual({ clinica_id: CLINICA, id: ID });
  expect(escritas).toHaveLength(0);
});
test("atendente não gera prévia nem publica", async () => {
  role = "atendente";
  await expect(chamar(f.preverEdicaoCatalogoIA, pedido())).rejects.toThrow("administradores");
  await expect(
    chamar(f.salvarServicoCatalogo, {
      clinicaId: CLINICA,
      id: ID,
      dados: registro,
      publicar: true,
    }),
  ).rejects.toThrow("administradores");
  expect(chamadasIA).toHaveLength(0);
  expect(escritas).toHaveLength(0);
});
test("sem vínculo ativo não acessa catálogo", async () => {
  role = "";
  await expect(chamar(f.preverEdicaoCatalogoIA, pedido())).rejects.toThrow("Sem acesso");
  expect(chamadasIA).toHaveLength(0);
});
test("cadastro de outra clínica não é enviado ao modelo", async () => {
  registro.clinica_id = ID;
  await expect(chamar(f.preverEdicaoCatalogoIA, pedido())).rejects.toThrow("não encontrado");
  expect(chamadasIA).toHaveLength(0);
});
test("confirmar altera o mesmo ID, publica e mantém preços e clínica", async () => {
  const previa = await chamar(f.preverEdicaoCatalogoIA, pedido());
  expect(escritas).toHaveLength(0);
  await chamar(f.salvarServicoCatalogo, {
    clinicaId: CLINICA,
    id: previa.id,
    dados: previa.dados,
    esperadoUpdatedAt: previa.esperadoUpdatedAt,
    publicar: true,
  });
  expect(escritas).toHaveLength(1);
  expect(escritas[0].filtros).toEqual({ id: ID, clinica_id: CLINICA, updated_at: VERSION });
  expect(registro.status).toBe("PUBLICADO");
  expect(registro.valor).toBe(160);
  expect(registro.formas_pagamento[1].valor).toBe(200);
  expect(registro.rascunho).toBeNull();
});
test("prévia antiga não sobrescreve outra edição", async () => {
  const previa = await chamar(f.preverEdicaoCatalogoIA, pedido());
  registro.updated_at = "2026-09-17T13:00:00+00:00";
  await expect(
    chamar(f.salvarServicoCatalogo, {
      clinicaId: CLINICA,
      id: ID,
      dados: previa.dados,
      esperadoUpdatedAt: VERSION,
      publicar: true,
    }),
  ).rejects.toThrow("nova prévia");
  expect(escritas).toHaveLength(0);
});
test("corrida depois da leitura também não sobrescreve outra edição", async () => {
  corrida = true;
  await expect(
    chamar(f.salvarServicoCatalogo, {
      clinicaId: CLINICA,
      id: ID,
      dados: registro,
      esperadoUpdatedAt: VERSION,
      publicar: true,
    }),
  ).rejects.toThrow("nova prévia");
  expect(escritas).toHaveLength(0);
});
test("edição exige ID, não cria duplicata se ele faltar", async () => {
  await expect(
    chamar(f.salvarServicoCatalogo, {
      clinicaId: CLINICA,
      dados: registro,
      esperadoUpdatedAt: VERSION,
      publicar: true,
    }),
  ).rejects.toThrow("cadastro existente");
  expect(escritas).toHaveLength(0);
});
test("confirmação de profissional atualiza a tabela correta e preserva vínculo", async () => {
  registro = { ...registro, nome: "Dra. Ana", medico_id: ID };
  await chamar(f.salvarProfissionalCatalogo, {
    clinicaId: CLINICA,
    id: ID,
    esperadoUpdatedAt: VERSION,
    publicar: true,
    dados: { nome: "Dra. Ana", medico_id: ID, observacao_publica: "Trazer exames anteriores." },
  });
  expect(escritas[0].tabela).toBe("nina_cat_profissionais");
  expect(registro.medico_id).toBe(ID);
});
