import { describe, expect, it } from "bun:test";
import {
  classificarAmbiente,
  escritaPermitida,
  montarContextoWebmcp,
} from "../contexto";

describe("classificarAmbiente", () => {
  it("reconhece preview, produção e local", () => {
    expect(classificarAmbiente("id-preview--abc.lovable.app")).toBe("preview");
    expect(classificarAmbiente("project--x-dev.lovable.app")).toBe("preview");
    expect(classificarAmbiente("patientpal-secure.lovable.app")).toBe("producao");
    expect(classificarAmbiente("localhost:8080")).toBe("local");
  });

  it("nunca chuta produção para host desconhecido", () => {
    expect(classificarAmbiente("algum-host.exemplo.com")).toBe("desconhecido");
    expect(classificarAmbiente("")).toBe("desconhecido");
  });
});

describe("escritaPermitida", () => {
  const selecao = { leadId: "l1", leadNome: "Lead 1", conversaId: "c1" };

  it("bloqueia escrita em produção mesmo com conversa de teste", () => {
    expect(escritaPermitida("producao", selecao)).toBe(false);
    expect(escritaPermitida("desconhecido", selecao)).toBe(false);
  });

  it("exige conversa de teste selecionada fora de produção", () => {
    expect(escritaPermitida("preview", null)).toBe(false);
    expect(escritaPermitida("preview", { ...selecao, conversaId: null })).toBe(false);
    expect(escritaPermitida("preview", selecao)).toBe(true);
  });
});

describe("montarContextoWebmcp", () => {
  const base = {
    host: "id-preview--abc.lovable.app",
    dentroDeIframe: false,
    autenticado: true,
    usuarioEmail: "atendente@clinica.com",
    clinicaId: "7570ddde-8c1c-4b55-ba72-cf12b2a6c940",
    clinicaNome: "Policlínica Menino Jesus",
    papel: "atendente",
    selecaoTeste: null,
  };

  it("expõe apenas ambiente, clínica, perfil, seleção e capacidades", () => {
    const ctx = montarContextoWebmcp(base);
    expect(Object.keys(ctx).sort()).toEqual(
      [
        "ambiente",
        "autenticado",
        "capacidades",
        "clinica_autorizada",
        "conversa_teste_selecionada",
        "dentro_do_editor",
        "escrita_permitida",
        "observacao",
        "perfil",
      ].sort(),
    );
    expect(ctx.capacidades).toEqual(["contexto:leitura"]);
    expect(ctx.clinica_autorizada?.id).toBe(base.clinicaId);
    expect(ctx.conversa_teste_selecionada).toBeNull();
  });

  it("não devolve perfil nem clínica quando não há sessão", () => {
    const ctx = montarContextoWebmcp({ ...base, autenticado: false });
    expect(ctx.perfil).toBeNull();
    expect(ctx.clinica_autorizada).toBeNull();
    expect(ctx.escrita_permitida).toBe(false);
  });

  it("informa a conversa de homologação selecionada", () => {
    const ctx = montarContextoWebmcp({
      ...base,
      selecaoTeste: { leadId: "l2", leadNome: "Lead 2", conversaId: "c2" },
    });
    expect(ctx.conversa_teste_selecionada).toEqual({
      lead_id: "l2",
      lead_nome: "Lead 2",
      conversa_id: "c2",
    });
    expect(ctx.escrita_permitida).toBe(true);
  });

  it("mantém produção como somente leitura", () => {
    const ctx = montarContextoWebmcp({
      ...base,
      host: "patientpal-secure.lovable.app",
      selecaoTeste: { leadId: "l3", leadNome: "Lead 3", conversaId: "c3" },
    });
    expect(ctx.ambiente).toBe("producao");
    expect(ctx.escrita_permitida).toBe(false);
  });
});
