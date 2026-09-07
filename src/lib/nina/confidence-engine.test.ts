import { describe, expect, it } from "vitest";
import {
  avaliarConfianca,
  detectarCategorias,
  houveFalhaDeFerramenta,
  type EvidenciaFerramenta,
  type EvidenciasConfianca,
} from "./confidence-engine";

const semEvidencia: EvidenciasConfianca = {
  ferramentas: [],
  catalogoEncontrou: false,
  agendamentoConfirmado: false,
  pacienteIdentificado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
};

const tool = (p: Partial<EvidenciaFerramenta>): EvidenciaFerramenta => ({
  nome: "buscar_procedimentos",
  capacidade: "listCatalog",
  fonte: "base_conhecimento",
  success: true,
  ...p,
});

describe("detecção de afirmações sensíveis", () => {
  it("reconhece valor, horário, preparo, profissional e agendamento", () => {
    expect(detectarCategorias("A ultrassonografia custa R$ 180")).toContain("valor");
    expect(detectarCategorias("Atendemos das 08:00 às 18:00")).toContain("horario");
    expect(detectarCategorias("É preciso jejum de 8 horas")).toContain("preparo");
    expect(detectarCategorias("Você será atendido pelo Dr. Paulo")).toContain("profissional");
    expect(detectarCategorias("Pronto, agendei sua consulta")).toContain("agendamento");
  });

  it("não marca conversa comum", () => {
    expect(detectarCategorias("Oi! Como posso ajudar você hoje?")).toEqual([]);
  });
});

describe("bloqueios absolutos", () => {
  it("preço sem catálogo publicado transfere", () => {
    const d = avaliarConfianca({ texto: "O exame custa R$ 200", evidencias: semEvidencia });
    expect(d.bloqueio).toBe("VALOR_SEM_CATALOGO");
    expect(d.acao).toBe("transferir");
    expect(d.score).toBe(0);
  });

  it("preço com catálogo publicado é liberado", () => {
    const d = avaliarConfianca({
      texto: "O exame custa R$ 200",
      evidencias: { ...semEvidencia, ferramentas: [tool({})], catalogoEncontrou: true },
    });
    expect(d.bloqueio).toBeNull();
    expect(d.acao).toBe("responder");
  });

  it("ferramenta que falhou derruba tudo, mesmo em resposta simples", () => {
    const d = avaliarConfianca({
      texto: "Claro, posso ajudar",
      evidencias: { ...semEvidencia, ferramentas: [tool({ success: false, erro: "TIMEOUT" })] },
    });
    expect(d.bloqueio).toBe("FERRAMENTA_FALHOU");
    expect(d.acao).toBe("transferir");
  });

  it("afirmar agendamento sem gravação confirmada transfere", () => {
    const d = avaliarConfianca({
      texto: "Prontinho, sua consulta está agendada",
      evidencias: { ...semEvidencia, ferramentas: [tool({ capacidade: "checkAvailability" })] },
    });
    expect(d.bloqueio).toBe("AGENDA_SEM_CONFIRMACAO");
  });

  it("agendamento com gravação confirmada passa", () => {
    const d = avaliarConfianca({
      texto: "Prontinho, sua consulta está agendada",
      evidencias: {
        ...semEvidencia,
        ferramentas: [tool({ capacidade: "createAppointment" })],
        agendamentoConfirmado: true,
      },
    });
    expect(d.bloqueio).toBeNull();
    expect(d.acao).toBe("responder");
  });

  it("preparo de exame sem fonte publicada transfere", () => {
    const d = avaliarConfianca({
      texto: "Faça jejum de 8 horas antes do exame",
      evidencias: semEvidencia,
    });
    expect(d.bloqueio).toBe("PREPARO_SEM_FONTE");
  });

  it("disponibilidade sem consulta à agenda transfere", () => {
    const d = avaliarConfianca({
      texto: "Temos horário disponível na quinta",
      evidencias: semEvidencia,
    });
    expect(d.bloqueio).toBe("AGENDA_SEM_CONFIRMACAO");
  });
});

describe("faixas de confiança", () => {
  it("dado do paciente sem identificação cai para esclarecer", () => {
    const d = avaliarConfianca({
      texto: "Seu cadastro está atualizado por aqui",
      evidencias: { ...semEvidencia, ferramentas: [tool({ capacidade: "getPatient" })] },
    });
    expect(d.acao).toBe("esclarecer");
    expect(d.score).toBeLessThan(80);
    expect(d.score).toBeGreaterThanOrEqual(50);
  });

  it("esclarecimento só acontece uma vez; depois transfere", () => {
    const evid = {
      ...semEvidencia,
      ferramentas: [tool({ capacidade: "getPatient" })],
      esclarecimentoUsado: true,
    };
    const d = avaliarConfianca({ texto: "Seu cadastro está atualizado por aqui", evidencias: evid });
    expect(d.acao).toBe("transferir");
  });

  it("conversa comum sem afirmação sensível responde", () => {
    const d = avaliarConfianca({ texto: "Oi! Em que posso ajudar?", evidencias: semEvidencia });
    expect(d.acao).toBe("responder");
    expect(d.score).toBe(100);
  });

  it("handoff já pedido pelo modelo não é reavaliado", () => {
    const d = avaliarConfianca({
      texto: "Vou chamar a equipe",
      evidencias: { ...semEvidencia, handoffSolicitado: true },
    });
    expect(d.acao).toBe("responder");
    expect(d.bloqueio).toBeNull();
  });

  it("resposta vazia nunca é entregue", () => {
    const d = avaliarConfianca({ texto: "   ", evidencias: semEvidencia });
    expect(d.acao).toBe("transferir");
  });
});

describe("apoio", () => {
  it("identifica falha de ferramenta por erro ou insucesso", () => {
    expect(houveFalhaDeFerramenta([tool({})])).toBe(false);
    expect(houveFalhaDeFerramenta([tool({ erro: "X" })])).toBe(true);
    expect(houveFalhaDeFerramenta([tool({ success: false })])).toBe(true);
  });
});
