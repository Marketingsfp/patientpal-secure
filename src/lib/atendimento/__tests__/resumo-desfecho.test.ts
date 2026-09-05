import { describe, expect, it } from "bun:test";
import {
  ajustarResumoPorDesfecho,
  exigeNovoResumo,
  resumoVigente,
  rotuloDesfecho,
  situacaoPorDesfecho,
} from "../resumo-desfecho";
import type { ResumoHandoff } from "../handoff-resumo";

const base: ResumoHandoff = {
  intencao: "agendamento",
  situacao: "Paciente quer marcar consulta.",
  pendencias: ["Confirmar horário com o paciente", "Paciente pediu recibo"],
  proxima_acao: "Retornar com horário disponível",
  etapa_interrompida: "escolha_horario",
  ultima_pergunta: "Prefere manhã ou tarde?",
  informacoes: [],
  agendamento: null,
} as unknown as ResumoHandoff;

describe("desfecho do resumo", () => {
  it("exige novo resumo nos desfechos relevantes", () => {
    expect(exigeNovoResumo("agendamento_concluido")).toBe(true);
    expect(exigeNovoResumo("conversa_resolvida")).toBe(true);
    expect(exigeNovoResumo("reabertura")).toBe(false);
  });

  it("limpa pendências superadas após agendamento concluído", () => {
    const r = ajustarResumoPorDesfecho(base, "agendamento_concluido");
    expect(r.situacao).toBe(situacaoPorDesfecho("agendamento_concluido"));
    expect(r.pendencias).toEqual(["Paciente pediu recibo"]);
    expect(r.proxima_acao).toBeNull();
    expect(r.etapa_interrompida).toBeNull();
    expect(r.ultima_pergunta).toBeNull();
  });

  it("mantém pendências quando o agendamento falhou", () => {
    const r = ajustarResumoPorDesfecho(base, "agendamento_falhou");
    expect(r.pendencias).toHaveLength(2);
    expect(r.proxima_acao).toBe("Retornar com horário disponível");
  });

  it("só considera vigente o resumo active", () => {
    expect(resumoVigente("active")).toBe(true);
    expect(resumoVigente(null)).toBe(true);
    expect(resumoVigente("superseded")).toBe(false);
    expect(resumoVigente("archived")).toBe(false);
  });

  it("rotula desfechos conhecidos", () => {
    expect(rotuloDesfecho("agendamento_concluido")).toBe("Agendamento concluído");
    expect(rotuloDesfecho(null)).toBeNull();
    expect(rotuloDesfecho("inexistente")).toBeNull();
  });
});
