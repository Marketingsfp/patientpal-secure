/**
 * FASE 3 — o prompt publicado em Arquitetura é a ÚNICA fonte comportamental.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { comporRequestNina, ENVELOPE_TECNICO } from "./prompt-composer";
import { PROMPT_NINA_WHATSAPP_V4 } from "./prompt/behavior-v4";

const MARCADOR = "MARCADOR_TESTE_PROMPT_UNICO";

const contextoFatual = {
  canal: "whatsapp",
  ambiente: "homologacao",
  unidade: { nome_oficial: "Clínica Teste", endereco: null },
  data_hora_atual: { iso: "2026-09-09", hora: "10:00" },
  intencoes: ["informacao"],
  etapa: "IDLE",
  campos_faltantes: ["cpf"],
  catalogo: { publicado: true, servicos: 12, profissionais: 4 },
  ferramentas: { pode_agendar: false },
};

describe("NinaPromptComposer", () => {
  it("usa o marcador do prompt publicado exatamente uma vez", () => {
    const behaviorPrompt = `${MARCADOR}\nRegras conversacionais da clínica.`;
    const req = comporRequestNina({ behaviorPrompt, runtimeContext: contextoFatual });
    const ocorrencias = req.systemPrompt.split(MARCADOR).length - 1;
    expect(ocorrencias).toBe(1);
    expect(req.envelope).toBe(ENVELOPE_TECNICO);
    // nada é acrescentado depois do contexto factual
    expect(req.systemPrompt.trimEnd().endsWith("}")).toBe(true);
  });

  it("passa a usar a nova versão publicada na execução seguinte", () => {
    const v1 = comporRequestNina({
      behaviorPrompt: "VERSAO_ANTIGA",
      runtimeContext: contextoFatual,
    });
    const v2 = comporRequestNina({
      behaviorPrompt: "VERSAO_NOVA",
      runtimeContext: contextoFatual,
    });
    expect(v1.systemPrompt).toContain("VERSAO_ANTIGA");
    expect(v2.systemPrompt).toContain("VERSAO_NOVA");
    expect(v2.systemPrompt).not.toContain("VERSAO_ANTIGA");
  });

  it("runtime context carrega fatos, não blocos comportamentais", () => {
    const req = comporRequestNina({
      behaviorPrompt: PROMPT_NINA_WHATSAPP_V4,
      runtimeContext: contextoFatual,
    });
    expect(req.avisos).toEqual([]);
    const json = JSON.stringify(contextoFatual);
    for (const proibido of ["REGRA OBRIGATÓRIA", "SUBSTITUI A REGRA", "Sou a Nina", "Você deve"]) {
      expect(json).not.toContain(proibido);
    }
  });

  it("envelope técnico não contém regra de atendimento", () => {
    for (const proibido of ["saudação", "agendamento", "handoff", "especialidade", "tom de voz"]) {
      expect(ENVELOPE_TECNICO.toLowerCase()).not.toContain(proibido);
    }
  });

  it("whatsapp.server não concatena mais blocos comportamentais ao system prompt", () => {
    const fonte = readFileSync("src/lib/whatsapp.server.ts", "utf8");
    for (const proibido of [
      "blocoPromptAgenda(",
      "blocoPromptDisponibilidade(",
      "blocoPromptEstado(",
      "blocoPromptSessaoNina(",
      "blocoPromptCatalogo(",
      "blocoPromptFase",
      "ATENDIMENTO HUMANO — REGRA OBRIGATÓRIA",
    ]) {
      expect(fonte).not.toContain(proibido);
    }
    expect(fonte).toContain("comporRequestNina");
  });
});
