import { describe, expect, it } from "bun:test";
import {
  itensBaseChat,
  pesquisarBaseChat,
  textoBaseParaRascunho,
  acrescentarBaseAoRascunho,
  type FonteConsultaChat,
} from "../consulta-base-chat";
import { consultarBaseChatCore } from "../consulta-base-chat.server";
const fonte: FonteConsultaChat = {
  servicos: [
    {
      id: "exame",
      nome: "Ultrassonografia abdominal total",
      valor: null,
      valor_observacao: null,
      descricao_publica: null,
      preparo: "Jejum de 6 horas conforme cadastro.",
      restricoes: null,
      executantes: [{ nome: "Dra. Ana", horarios: "Segunda, 08h às 12h" }],
      formas_pagamento: [
        { forma: "Dinheiro", valor: 150 },
        { forma: "Cartão", valor: 180 },
      ],
    },
  ],
  profissionais: [],
};

describe("Consulta da fonte no chat", () => {
  it("mantém condições de preço, recorrência e observação do médico, sem aviso vencido", () => {
    const [i] = itensBaseChat(
      {
        servicos: [],
        profissionais: [
          {
            id: "p",
            nome: "Dra. Ana",
            especialidades: [{ nome: "Cardiologia" }],
            atende_consultorio: null,
            formas_pagamento: [
              { forma: "Pix", valor: 130, condicao: "Retorno" },
              { forma: "Dinheiro", valor: 150, condicao: "Primeira consulta" },
            ],
            convenios: [],
            horarios: [
              {
                dia: "Sábado",
                inicio: "08:00",
                fim: "12:00",
                recorrencia: "Quinzenal",
                observacao: "Primeiro e terceiro sábado",
              },
            ],
            tipo_atendimento: null,
            observacao_publica: null,
            aviso_dia: "AVISO VENCIDO",
            aviso_valido_de: "2026-01-01",
            aviso_valido_ate: "2026-01-31",
          },
        ],
      },
      "2026-10-03",
    );
    const t = textoBaseParaRascunho(i, "2026-10-03T15:00Z");
    expect(t).toContain("Retorno — Pix: R$");
    expect(t).toContain("Primeira consulta — Dinheiro:");
    expect(t).toContain("Quinzenal");
    expect(t).toContain("Primeiro e terceiro sábado");
    expect(t).not.toContain("AVISO VENCIDO");
    expect(pesquisarBaseChat([i], "cardiologista", 0).total).toBe(1);
  });
  it("usa somente fatos públicos, diferencia horário habitual de vaga e identifica a fonte", () => {
    const f = structuredClone(fonte);
    Object.assign(f.servicos[0], { nota_interna: "SEGREDO INTERNO", status: "publicado" });
    const [i] = itensBaseChat(f, "2026-10-03");
    const texto = textoBaseParaRascunho(i, "2026-10-03T15:00:00Z");
    expect(texto).toContain("Jejum de 6 horas");
    expect(texto).toContain("150,00");
    expect(texto).toContain("vagas precisam ser verificadas");
    expect(texto).toContain("Fonte: Cadastro oficial");
    expect(texto).not.toContain("SEGREDO");
    expect(texto.toLowerCase()).not.toContain("pix");
  });
  it("não interpreta ausência como preço zero nem ausência de preparo", () => {
    const f = structuredClone(fonte);
    f.servicos[0].formas_pagamento = [];
    f.servicos[0].preparo = null;
    const [i] = itensBaseChat(f, "2026-10-03");
    expect(i.campos.find((c) => c.nome === "Valores")?.texto).toBe("");
    expect(i.campos.find((c) => c.nome === "Preparo")?.texto).toBe("");
    expect(textoBaseParaRascunho(i, "2026-10-03T15:00Z")).not.toContain("R$ 0");
  });
  it("busca nomes e aliases mantendo registros separados, com paginação", () => {
    const f = structuredClone(fonte);
    f.servicos = Array.from({ length: 25 }, (_, n) => ({
      ...f.servicos[0],
      id: String(n).padStart(2, "0"),
    }));
    const itens = itensBaseChat(f, "2026-10-03");
    const p1 = pesquisarBaseChat(itens, "ultrassom abdominal total", 0);
    const p2 = pesquisarBaseChat(itens, "ultrassom abdominal total", 1);
    expect(p1.total).toBe(25);
    expect(p1.itens).toHaveLength(20);
    expect(p2.itens).toHaveLength(5);
    expect(new Set([...p1.itens, ...p2.itens].map((i) => i.id)).size).toBe(25);
    expect(pesquisarBaseChat(itens, "joelho", 0).total).toBe(0);
  });
  it("preserva o rascunho digitado", () => {
    expect(acrescentarBaseAoRascunho("Olá, Maria!", "Informação da base")).toBe(
      "Olá, Maria!\n\nInformação da base",
    );
  });
  it("nega consulta antes de ler a fonte quando a conversa não é acessível", async () => {
    let leituras = 0;
    const q: any = {
      select() {
        return q;
      },
      eq() {
        return q;
      },
      maybeSingle: async () => ({ data: null, error: null }),
    };
    await expect(
      consultarBaseChatCore(
        { from: () => q } as any,
        "user",
        { clinicaId: "clinica", conversaId: "oculta", termo: "ultrassom", pagina: 0 },
        async () => {
          leituras++;
          return fonte;
        },
      ),
    ).rejects.toThrow();
    expect(leituras).toBe(0);
  });
  it("revalida pelo ID e clínica antes da inserção, recusa registro removido", async () => {
    const filtros: [string, string][] = [];
    const q: any = {
      select() {
        return q;
      },
      eq(k: string, v: string) {
        filtros.push([k, v]);
        return q;
      },
      maybeSingle: async () => ({
        data: { id: "c", owner_type: "HUMAN", status: "active", atribuida_user_id: "u" },
        error: null,
      }),
    };
    const db: any = { from: () => q, rpc: async () => ({ data: true, error: null }) };
    const pedido = {
      clinicaId: "clinica",
      conversaId: "c",
      termo: "",
      pagina: 0,
      registro: { id: "exame", tipo: "servico" as const },
    };
    const r = await consultarBaseChatCore(db, "u", pedido, async (id) => {
      expect(id).toBe("clinica");
      return fonte;
    });
    expect(r.texto).toContain("Jejum");
    expect(filtros).toContainEqual(["clinica_id", "clinica"]);
    await expect(
      consultarBaseChatCore(db, "u", pedido, async () => ({ servicos: [], profissionais: [] })),
    ).rejects.toThrow("não está mais disponível");
  });
});
