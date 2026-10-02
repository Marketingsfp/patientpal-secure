import { describe, expect, it } from "bun:test";
import {
  profissionalSfp,
  respostaEncaminhamentoSfp,
  resultadoEncaminhamentoSfp,
  itemSfpDoResultado,
} from "../regras-catalogo";
import { mapearServicos, type EntradaOperacional } from "../fonte-operacional";
import { dadosPublicosClinicaGrupo } from "../clinicas-grupo";

// Decisão do dono, 02/10/2026: SFP deixa de ser silencioso.
const SFP = "1d3c4f34-2a0f-40fa-b39a-3609677a11a5";
const CONSULTA_HOJE = "e9e41341-0e53-4216-8284-caeeaf6fb887";

describe("SFP — informa a unidade São Francisco e transfere", () => {
  it("reconhece o profissional-ponte pelo nome do cadastro", () => {
    expect(profissionalSfp("SAO FRANCISCO DE PAULA")).toBe(true);
    expect(profissionalSfp("São Francisco de Paula")).toBe(true);
    expect(profissionalSfp("SFP")).toBe(true);
    expect(profissionalSfp("Dr. Francisco Paula")).toBe(false);
  });

  it("mensagem cita o item e o endereço/telefone do diretório, sem valor nem horário", () => {
    const u = dadosPublicosClinicaGrupo(SFP)!;
    const t = respostaEncaminhamentoSfp(true, "BIOPSIA DA PROSTATA");
    expect(t).toContain("BIOPSIA DA PROSTATA");
    expect(t).toContain("Policlínica São Francisco de Paula");
    expect(t).toContain(u.endereco);
    expect(t).toContain(u.telefone);
    expect(t).not.toContain("R$");
    expect(t).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });

  it("não é mais silencioso: resultado é entregue", () => {
    const r = resultadoEncaminhamentoSfp(true, "USG");
    expect(r.estado).toBe("entregar");
    expect(r.texto).toContain("São Francisco de Paula");
    expect(r.restricoes).not.toContain("handoff_sfp_silencioso");
  });

  it("falha na transferência não afirma que transferiu", () => {
    expect(respostaEncaminhamentoSfp(false, "USG")).toContain("Não consegui transferir");
  });

  it("extrai o nome do item SFP do resultado da busca", () => {
    expect(itemSfpDoResultado({ records: [
      { procedimento: "HEMOGRAMA", medico: "Dra. Ana" },
      { procedimento: "BIOPSIA DA PROSTATA", medico: "SAO FRANCISCO DE PAULA" },
    ] })).toBe("BIOPSIA DA PROSTATA");
  });
});

describe("cadastro da Maria: item feito só pela unidade São Francisco", () => {
  const base: EntradaOperacional = {
    medicos: [
      { id: "sfp", nome: "SAO FRANCISCO DE PAULA", especialidade_id: null, visivel_agendamento_online: false },
      { id: "mj", nome: "Dra. Ana", especialidade_id: null, visivel_agendamento_online: true },
    ] as EntradaOperacional["medicos"],
    disponibilidades: [], agendas: [], especialidades: [], hojeISO: "2026-10-02",
    procedimentos: [
      { id: "bio", nome: "BIOPSIA DA PROSTATA", tipo: "procedimento", valor: 500 },
      { id: "usg", nome: "USG ABDOMEN", tipo: "exame", valor: 120 },
    ] as unknown as EntradaOperacional["procedimentos"],
    vinculos: [
      { medico_id: "sfp", procedimento_id: "bio" },
      { medico_id: "sfp", procedimento_id: "usg" },
      { medico_id: "mj", procedimento_id: "usg" },
    ] as unknown as EntradaOperacional["vinculos"],
  };
  it("só SFP: sem valor/descrição e marcado para encaminhamento", () => {
    const bio = mapearServicos(base).find((s) => s.id === "bio")!;
    expect(bio.valor).toBeNull();
    expect(bio.descricao_publica).toBeNull();
    expect((bio.estrutura as { encaminhamento_humano?: boolean }).encaminhamento_humano).toBe(true);
    expect(JSON.stringify(bio.executantes)).toContain("SAO FRANCISCO DE PAULA");
  });
  it("item também feito por profissional desta clínica segue normal", () => {
    const usg = mapearServicos(base).find((s) => s.id === "usg")!;
    expect((usg.estrutura as { encaminhamento_humano?: boolean }).encaminhamento_humano).toBeUndefined();
    expect(JSON.stringify(usg.executantes)).not.toContain("SAO FRANCISCO");
  });
});

describe("conversa da própria SFP e Consulta Hoje não mudam", () => {
  it("as duas continuam fora do cadastro publicado (CLINICA_SEM_CATALOGO)", async () => {
    const { REGRAS_CATALOGO_PROMPT } = await import("../regras-catalogo");
    // A regra SFP fala de profissional no cadastro, não das clínicas sem catálogo.
    expect(REGRAS_CATALOGO_PROMPT).toContain("PROFISSIONAL_SFP");
    expect(REGRAS_CATALOGO_PROMPT).not.toContain("CLINICA_SEM_CATALOGO");
    expect(dadosPublicosClinicaGrupo(SFP)).not.toBeNull();
    expect(dadosPublicosClinicaGrupo(CONSULTA_HOJE)).not.toBeNull();
  });
});
