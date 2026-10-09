import { describe, expect, it } from "bun:test";
import {
  diaExportacao,
  filtrarMensagensExportacao,
  periodoExportacaoSchema,
  rotuloPeriodoExportacao,
} from "../homologacao-exportacao";
import { lerMensagensExportacao } from "../homologacao-exportacao.server";

const periodo = { modo: "periodo" as const, inicio: "2026-10-05", fim: "2026-10-05" };

describe("PDF de homologação por dia", () => {
  it("inclui o dia completo em Brasília, sem vazar o dia anterior ou seguinte", () => {
    const mensagens = [
      "2026-10-05T02:59:59.999Z",
      "2026-10-05T03:00:00.000Z",
      "2026-10-06T02:59:59.999Z",
      "2026-10-06T03:00:00.000Z",
    ].map((created_at, id) => ({ id, created_at }));
    expect(filtrarMensagensExportacao(mensagens, periodo).map((m) => m.id)).toEqual([1, 2]);
    expect(mensagens).toHaveLength(4);
    expect(diaExportacao("2026-10-06T01:00:00Z")).toBe("2026-10-05");
  });

  it("inclui as duas pontas do intervalo e mantém todo histórico como opção", () => {
    const mensagens = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"].map((dia) => ({
      created_at: `${dia}T15:00:00Z`,
    }));
    expect(filtrarMensagensExportacao(mensagens, { ...periodo, fim: "2026-10-06" })).toEqual(
      mensagens.slice(1, 3),
    );
    expect(filtrarMensagensExportacao(mensagens, { modo: "todos" })).toEqual(mensagens);
    expect(filtrarMensagensExportacao([], periodo)).toEqual([]);
    expect(rotuloPeriodoExportacao(periodo)).toBe("05/10/2026");
    expect(rotuloPeriodoExportacao({ ...periodo, fim: "2026-10-06" })).toBe(
      "05/10/2026 a 06/10/2026",
    );
  });

  it("rejeita datas vazias, impossíveis e invertidas antes de exportar", () => {
    for (const inicio of ["", "05/10/2026", "2026-02-30", "2026-10-06"]) {
      expect(periodoExportacaoSchema.safeParse({ ...periodo, inicio }).success).toBe(false);
    }
    expect(periodoExportacaoSchema.safeParse({ ...periodo, inicio: "2024-02-29" }).success).toBe(
      true,
    );
  });
});

function bancoSimulado(opcoes: { falhar?: string } = {}) {
  const consultas: { tabela: string; filtros: Record<string, unknown>; de: number; ate: number }[] =
    [];
  const mensagens = Array.from({ length: 503 }, (_, i) => ({
    id: String(i).padStart(4, "0"),
    conversa_id: "c-0",
    clinica_id: "clinica",
    created_at: i < 2 ? "2026-10-04T15:00:00Z" : "2026-10-05T15:00:00Z",
    body: `mensagem ${i}`,
    direction: "in",
    enviada_por: null,
    status: "received",
  }));
  const conversas = Array.from({ length: 501 }, (_, i) => ({
    id: `c-${i}`,
    clinica_id: "clinica",
    is_teste: true,
    contato_telefone: "5500010001",
  }));
  return {
    consultas,
    admin: {
      from(tabela: string) {
        const filtros: Record<string, unknown> = {};
        const query = {
          select() {
            return query;
          },
          eq(campo: string, valor: unknown) {
            filtros[campo] = valor;
            return query;
          },
          like(campo: string, valor: string) {
            filtros[campo] = valor;
            return query;
          },
          in(campo: string, valor: string[]) {
            filtros[campo] = valor;
            return query;
          },
          lte(campo: string, valor: string) {
            filtros[`${campo}<=`] = valor;
            return query;
          },
          order() {
            return query;
          },
          async range(de: number, ate: number) {
            consultas.push({ tabela, filtros, de, ate });
            if (opcoes.falhar === tabela)
              return { data: null, error: { message: "falha de leitura" } };
            const linhas =
              tabela === "atend_conversas"
                ? conversas
                : mensagens.filter((m) =>
                    (filtros.conversa_id as string[]).includes(m.conversa_id),
                  );
            return { data: linhas.slice(de, ate + 1), error: null };
          },
        };
        return query;
      },
    },
  };
}

describe("leitura paginada do PDF", () => {
  it("ultrapassa 400 mensagens e 500 sessões, filtra os dias e restringe clínica/lead", async () => {
    const { admin, consultas } = bancoSimulado();
    const resultado = await lerMensagensExportacao(
      admin,
      "clinica",
      { indice: 1, conversa_id: "c-0" },
      periodo,
      "2026-10-06T00:00:00Z",
    );
    expect(resultado).toHaveLength(501);
    expect(resultado[0].id).toBe("0002");
    expect(resultado.at(-1)?.id).toBe("0502");
    expect(consultas.every((c) => c.filtros.clinica_id === "clinica")).toBe(true);
    const sessoes = consultas.filter((c) => c.tabela === "atend_conversas");
    expect(sessoes.map((c) => c.de)).toEqual([0, 500]);
    expect(sessoes[0].filtros).toMatchObject({ is_teste: true, contato_telefone: "550001%" });
    expect(
      consultas
        .filter((c) => c.tabela === "whatsapp_mensagens")
        .every(
          (c) =>
            c.filtros["created_at<="] === "2026-10-06T00:00:00Z" &&
            (c.filtros.conversa_id as string[]).length <= 100,
        ),
    ).toBe(true);
  });

  it("falhas de leitura não produzem um PDF parcial ou falsamente vazio", async () => {
    for (const tabela of ["atend_conversas", "whatsapp_mensagens"]) {
      const { admin } = bancoSimulado({ falhar: tabela });
      await expect(
        lerMensagensExportacao(admin, "clinica", { indice: 1, conversa_id: null }, periodo),
      ).rejects.toThrow("falha de leitura");
    }
  });
});
