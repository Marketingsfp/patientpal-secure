import { describe, expect, it } from "bun:test";
import { configPadraoFrancisco, textoTemplateFrancisco } from "../config";
import { aplicarAcaoTesteFrancisco, iniciarTesteFrancisco } from "../homologacao";
import {
  agirConversaTesteFrancisco,
  carregarTesteFrancisco,
  iniciarConversaTesteFrancisco,
  listarTestesFrancisco,
} from "../homologacao.server";

const em = "2026-10-08T12:00:00.000Z";
const inicio = () => ({
  config: configPadraoFrancisco(),
  clinicaNome: "Clínica Teste",
  etapa: "d1" as const,
});
const sessao = () => iniciarTesteFrancisco("sessao", em, inicio());

describe("conversa de homologação do Francisco", () => {
  it("começa pelo template exato antes de aceitar a resposta do paciente", () => {
    const s = sessao();
    expect(s.mensagens.map((m) => m.autor)).toEqual(["sistema", "francisco"]);
    expect(s.mensagens[1].texto).toBe(
      textoTemplateFrancisco(s.inicio.config, "d1", "Clínica Teste"),
    );
    expect(s.mensagens[1].texto).not.toContain("{{1}}");
  });
  it("interesse pausa D4 e encaminha ao destino humano do teste", () => {
    const s = aplicarAcaoTesteFrancisco(sessao(), "resposta", em, {
      tipo: "paciente",
      texto: "Quero ajuda para pagar",
    });
    expect(s.estado).toBe("humano");
    expect(s.mensagens.at(-1)?.texto).toContain("Recepção");
    expect(() => aplicarAcaoTesteFrancisco(s, "d4", em, { tipo: "d4" })).toThrow("interrompida");
    const posterior = aplicarAcaoTesteFrancisco(s, "outra", em, {
      tipo: "paciente",
      texto: "Pode falar comigo agora",
    });
    expect(posterior.mensagens.filter((m) => m.autor === "francisco")).toHaveLength(1);
  });
  it.each([
    "SAIR",
    "não quero receber mensagens",
    "pare de enviar mensagens",
    "não quero pagar",
    "não tenho interesse",
    "Não",
  ])("reconhece saída: %s", (texto) => {
    const s = aplicarAcaoTesteFrancisco(sessao(), "saida", em, { tipo: "paciente", texto });
    expect(s.estado).toBe("recusado");
    expect(s.mensagens.at(-1)?.texto).toContain("sem encaminhamento humano");
    expect(s.mensagens.filter((m) => m.autor === "francisco")).toHaveLength(1);
    expect(() => aplicarAcaoTesteFrancisco(s, "d4", em, { tipo: "d4" })).toThrow();
  });
  it("avança de D1 para D4 apenas uma vez enquanto não há resposta ou pagamento", () => {
    const s = aplicarAcaoTesteFrancisco(sessao(), "d4", em, { tipo: "d4" });
    expect(s.d4Enviado).toBe(true);
    expect(s.mensagens.at(-1)?.texto).toBe(
      textoTemplateFrancisco(s.inicio.config, "d4", "Clínica Teste"),
    );
    expect(() => aplicarAcaoTesteFrancisco(s, "outro", em, { tipo: "d4" })).toThrow(
      "já foi enviado",
    );
  });
  it("pagamento interrompe a cadência; pode iniciar um cenário diretamente no D4", () => {
    const s = aplicarAcaoTesteFrancisco(sessao(), "pagamento", em, { tipo: "pagamento" });
    expect(s.estado).toBe("pago");
    expect(() => aplicarAcaoTesteFrancisco(s, "d4", em, { tipo: "d4" })).toThrow();
    expect(iniciarTesteFrancisco("d4", em, { ...inicio(), etapa: "d4" }).d4Enviado).toBe(true);
  });
  it("preserva a configuração inicial e respeita etapas desativadas", () => {
    const dados = inicio();
    const s = iniciarTesteFrancisco("s", em, dados);
    dados.config.departamento = "Outro setor";
    expect(s.inicio.config.departamento).toBe("Recepção");
    dados.config.d1 = false;
    expect(() => iniciarTesteFrancisco("s", em, dados)).toThrow("desativada");
    s.inicio.config.d4 = false;
    expect(() => aplicarAcaoTesteFrancisco(s, "d4", em, { tipo: "d4" })).toThrow("desativado");
  });
});

// Banco em memória verifica os filtros reais do repositório, retomada e paginação.
type Linha = {
  id: string;
  clinica_id: string;
  ator: string;
  tipo: string;
  created_at: string;
  dados: Record<string, unknown>;
};
function banco() {
  const linhas: Linha[] = [];
  const tabelas: string[] = [];
  class Consulta {
    filtros: Array<(r: Linha) => boolean> = [];
    ordens: Array<{ k: string; asc: boolean }> = [];
    limite = Infinity;
    select() {
      return this;
    }
    eq(k: string, v: unknown) {
      this.filtros.push(
        (r) => (k === "dados->>sessao" ? r.dados.sessao : r[k as keyof Linha]) === v,
      );
      return this;
    }
    order(k: string, opt?: { ascending: boolean }) {
      this.ordens.push({ k, asc: opt?.ascending !== false });
      return this;
    }
    limit(n: number) {
      this.limite = n;
      return this;
    }
    or(v: string) {
      const [, op, data, id] = v.match(
        /^created_at\.(gt|lt)\.([^,]+),and\(created_at\.eq\.[^,]+,id\.(?:gt|lt)\.([^)]*)\)$/,
      )!;
      this.filtros.push((r) =>
        op === "gt"
          ? r.created_at > data || (r.created_at === data && r.id > id)
          : r.created_at < data || (r.created_at === data && r.id < id),
      );
      return this;
    }
    insert(row: Omit<Linha, "created_at">) {
      if (linhas.some((r) => r.id === row.id)) return Promise.resolve({ error: { code: "23505" } });
      linhas.push({ ...row, created_at: new Date(Date.parse(em) + linhas.length).toISOString() });
      return Promise.resolve({ error: null });
    }
    resultado() {
      const data = linhas
        .filter((r) => this.filtros.every((f) => f(r)))
        .sort((a, b) => {
          for (const { k, asc } of this.ordens) {
            const cmp = String(a[k as keyof Linha]).localeCompare(String(b[k as keyof Linha]));
            if (cmp) return asc ? cmp : -cmp;
          }
          return 0;
        })
        .slice(0, this.limite);
      return { data, error: null };
    }
    maybeSingle() {
      return Promise.resolve({ ...this.resultado(), data: this.resultado().data[0] ?? null });
    }
    then(resolve: (v: ReturnType<Consulta["resultado"]>) => unknown) {
      return Promise.resolve(resolve(this.resultado()));
    }
  }
  const db = {
    from(t: string) {
      tabelas.push(t);
      return new Consulta();
    },
  } as unknown as Parameters<typeof carregarTesteFrancisco>[0];
  return { db, linhas, tabelas };
}

describe("persistência isolada dos testes", () => {
  it("preserva o resultado dos eventos de homologação antigos", async () => {
    const { db, linhas } = banco();
    await iniciarConversaTesteFrancisco(db, "clinica", "ator", "sessao", inicio());
    linhas.push({
      id: "antiga",
      clinica_id: "clinica",
      ator: "ator",
      tipo: "homologacao_chat_acao",
      created_at: em,
      dados: { sessao: "sessao", acao: { tipo: "paciente", texto: "Não quero pagar" } },
    });
    expect((await carregarTesteFrancisco(db, "clinica", "ator", "sessao")).estado).toBe("humano");
    expect(linhas[1].dados).not.toHaveProperty("decisao");
  });
  it("não aceita um identificador de comando que já pertence a outra conversa", async () => {
    const { db } = banco();
    await iniciarConversaTesteFrancisco(db, "clinica", "ator", "primeira", inicio());
    await iniciarConversaTesteFrancisco(db, "clinica", "ator", "segunda", inicio());
    await agirConversaTesteFrancisco(db, "clinica", "ator", "comando", "primeira", {
      tipo: "pagamento",
    });
    await expect(
      agirConversaTesteFrancisco(db, "clinica", "ator", "comando", "segunda", {
        tipo: "pagamento",
      }),
    ).rejects.toThrow("outro teste");
    expect((await carregarTesteFrancisco(db, "clinica", "ator", "segunda")).estado).toBe(
      "aguardando",
    );
  });
  it("retoma o histórico sem duplicar template ou resposta e não acessa tabelas operacionais", async () => {
    const { db, linhas, tabelas } = banco();
    await iniciarConversaTesteFrancisco(db, "clinica", "ator", "sessao", inicio());
    await iniciarConversaTesteFrancisco(db, "clinica", "ator", "sessao", inicio());
    const acao = { tipo: "paciente" as const, texto: "Quero ajuda" };
    let chamadas = 0;
    const classificar = async () => {
      chamadas++;
      return { intencao: "interesse" as const, origem: "gemini" as const };
    };
    await agirConversaTesteFrancisco(
      db,
      "clinica",
      "ator",
      "resposta",
      "sessao",
      acao,
      classificar,
    );
    const s = await agirConversaTesteFrancisco(
      db,
      "clinica",
      "ator",
      "resposta",
      "sessao",
      acao,
      classificar,
    );
    expect(linhas).toHaveLength(2);
    expect(s.estado).toBe("humano");
    expect(s.mensagens.filter((m) => m.autor === "paciente")).toHaveLength(1);
    expect(new Set(tabelas)).toEqual(new Set(["francisco_eventos"]));
    expect(chamadas).toBe(1);
  });
  it("persiste a recusa interpretada e reabre o teste sem nova chamada ao modelo", async () => {
    const { db, linhas } = banco();
    await iniciarConversaTesteFrancisco(db, "clinica", "ator", "sessao", inicio());
    const s = await agirConversaTesteFrancisco(
      db,
      "clinica",
      "ator",
      "recusa",
      "sessao",
      {
        tipo: "paciente",
        texto: "Prefiro deixar o orçamento para lá.",
      },
      async () => ({ intencao: "recusa", origem: "gemini" }),
    );
    expect(s.estado).toBe("recusado");
    expect(linhas[1].dados.decisao).toMatchObject({ intencao: "recusa", origem: "gemini" });
    expect((await carregarTesteFrancisco(db, "clinica", "ator", "sessao")).estado).toBe("recusado");
    expect(s.mensagens.at(-1)?.texto).toContain("sem encaminhamento humano");
  });
  it("recusa sessões de outra clínica ou usuário e não as lista", async () => {
    const { db } = banco();
    await iniciarConversaTesteFrancisco(db, "clinica", "ator", "sessao", inicio());
    await expect(carregarTesteFrancisco(db, "outra", "ator", "sessao")).rejects.toThrow(
      "não encontrada",
    );
    await expect(carregarTesteFrancisco(db, "clinica", "outro", "sessao")).rejects.toThrow(
      "não encontrada",
    );
    expect((await listarTestesFrancisco(db, "clinica", "outro")).itens).toHaveLength(0);
  });
  it("pagina conversas de 20 em 20 e relê todas as ações depois da centésima", async () => {
    const { db, linhas } = banco();
    for (let i = 0; i < 22; i++)
      await iniciarConversaTesteFrancisco(db, "clinica", "ator", `sessao${i}`, inicio());
    const primeira = await listarTestesFrancisco(db, "clinica", "ator");
    expect(primeira.itens).toHaveLength(20);
    expect(
      (await listarTestesFrancisco(db, "clinica", "ator", primeira.proximo!)).itens,
    ).toHaveLength(2);
    for (let i = 0; i < 105; i++)
      linhas.push({
        id: `acao${i.toString().padStart(3, "0")}`,
        clinica_id: "clinica",
        ator: "ator",
        tipo: "homologacao_chat_acao",
        created_at: em,
        dados: { sessao: "sessao0", acao: { tipo: "paciente", texto: `Mensagem ${i}` } },
      });
    const s = await carregarTesteFrancisco(db, "clinica", "ator", "sessao0");
    expect(s.mensagens.filter((m) => m.autor === "paciente")).toHaveLength(105);
  });
});
