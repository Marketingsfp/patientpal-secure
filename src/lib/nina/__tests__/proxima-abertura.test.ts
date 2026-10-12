import { describe, expect, it } from "bun:test";
import type { CalendarioPublicado } from "../classificador-periodo";
import {
  fraseAberturaPrevista,
  semanaDaUnidadeNoPrompt,
  semanaDoTexto,
  situacaoFuncionamento,
  type SemanaPrompt,
} from "../proxima-abertura";
import {
  incluirAberturaPrevista,
  montarMensagemHandoffFallback,
  validarMensagemHandoff,
} from "@/lib/atendimento/mensagem-handoff";

const MJ = "7570ddde-8c1c-4b55-ba72-cf12b2a6c940";

// Mesmo formato dos blocos de unidade do prompt publicado (aba Arquitetura).
const PROMPT = [
  "REGRA UNID-01 — MENINO JESUS",
  "Tipo: CONVERSACIONAL",
  "Conduta: Para informações desta unidade, utilize:",
  "Nome: Policlínica Menino Jesus.",
  "Funcionamento habitual: segunda a sexta, das 07h às 18h; sábado, das 07h às 14h; domingo fechado.",
  "REGRA UNID-02 — SÃO FRANCISCO DE PAULA",
  "Nome: Policlínica São Francisco de Paula.",
  "Funcionamento habitual: segunda, terça, quinta e sexta, das 06h às 19h; quarta, das 06h às 21h; sábado, das 06h às 14h; domingo fechado.",
  "REGRA UNID-04 — USO DAS INFORMAÇÕES DAS UNIDADES",
  "Conduta: Informe o endereço e o funcionamento da unidade perguntada.",
].join("\n");

const SEMANA_MJ = semanaDaUnidadeNoPrompt(PROMPT, "POLICLINICA MENINO JESUS");

const situacao = (
  instante: string,
  calendarios: CalendarioPublicado[] = [],
  semana: SemanaPrompt | null = SEMANA_MJ,
) => situacaoFuncionamento({ clinicaId: MJ, semana, agora: new Date(instante), calendarios });

const frase = (instante: string, calendarios: CalendarioPublicado[] = []) => {
  const s = situacao(instante, calendarios);
  if (s.situacao !== "fora_do_horario") throw new Error(`esperava fora do horário: ${s.situacao}`);
  return fraseAberturaPrevista(s.abertura);
};

const calendarioComExcecoes = (excecoes: CalendarioPublicado["excecoes"]) =>
  ({
    versao_id: "v1",
    versao: 1,
    status: "publicado",
    publicado_em: "2026-01-01T00:00:00Z",
    vigencia_inicio: "2026-01-01",
    vigencia_fim: null,
    fuso: "America/Sao_Paulo",
    clinica_id: MJ,
    unidade_id: null,
    // Horário semanal diferente de propósito: só as exceções valem; a semana vem do prompt.
    dias: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      dia_semana: d,
      fechado: false,
      faixas: [{ hora_inicio: "10:00", hora_fim: "11:00" }],
    })),
    excecoes,
  }) as CalendarioPublicado;

describe("horário semanal lido do prompt publicado", () => {
  it("lê a unidade pelo nome cadastrado, ignorando acentos, caixa e pontuação", () => {
    expect(SEMANA_MJ).toEqual([
      "fechado",
      [{ inicio: "07:00", fim: "18:00" }],
      [{ inicio: "07:00", fim: "18:00" }],
      [{ inicio: "07:00", fim: "18:00" }],
      [{ inicio: "07:00", fim: "18:00" }],
      [{ inicio: "07:00", fim: "18:00" }],
      [{ inicio: "07:00", fim: "14:00" }],
    ]);
  });

  it("lê listas de dias, horários diferentes por dia e minutos", () => {
    const sfp = semanaDaUnidadeNoPrompt(PROMPT, "POLICLINICA SAO FRANCISCO DE PAULA")!;
    expect(sfp[2]).toEqual([{ inicio: "06:00", fim: "19:00" }]);
    expect(sfp[3]).toEqual([{ inicio: "06:00", fim: "21:00" }]);
    expect(semanaDoTexto("segunda a sexta, das 7h30 às 12h e das 13:00 às 17:00")![1]).toEqual([
      { inicio: "07:30", fim: "12:00" },
      { inicio: "13:00", fim: "17:00" },
    ]);
  });

  it("sem a unidade, com horário ilegível ou duplicado não há horário", () => {
    expect(semanaDaUnidadeNoPrompt(PROMPT, "CLINICA CONSULTA HOJE")).toBeNull();
    expect(semanaDaUnidadeNoPrompt("", "POLICLINICA MENINO JESUS")).toBeNull();
    expect(
      semanaDaUnidadeNoPrompt(
        "Nome: Policlínica Menino Jesus.\nFuncionamento habitual: segunda a sexta, conforme a agenda.",
        "POLICLINICA MENINO JESUS",
      ),
    ).toBeNull();
    expect(
      semanaDaUnidadeNoPrompt(`${PROMPT}\nREGRA X\n${PROMPT}`, "POLICLINICA MENINO JESUS"),
    ).toBeNull();
  });

  it("mudar o prompt muda o horário, sem alterar código", () => {
    const novo = PROMPT.replace("das 07h às 18h", "das 08h às 20h");
    const semana = semanaDaUnidadeNoPrompt(novo, "POLICLINICA MENINO JESUS");
    // seg 19:00 em Brasília: aberto no horário novo.
    expect(situacao("2026-10-12T22:00:00Z", [], semana).situacao).toBe("aberta");
  });
});

describe("próxima abertura pelo horário real do servidor (Brasília)", () => {
  it("domingo 19:08: fechado, abre amanhã (segunda) às 07h", () => {
    expect(frase("2026-10-11T22:08:00Z")).toBe(
      "No momento estamos fora do horário de funcionamento. Abrimos amanhã (segunda-feira), às 07h, e nesse horário nossa equipe vai te atender por aqui.",
    );
  });

  it("dentro do horário não gera aviso", () => {
    expect(situacao("2026-10-12T13:00:00Z").situacao).toBe("aberta"); // seg 10:00
    expect(situacao("2026-10-17T16:59:00Z").situacao).toBe("aberta"); // sáb 13:59
  });

  it("madrugada abre hoje; fim do expediente abre no dia seguinte", () => {
    expect(frase("2026-10-12T08:30:00Z")).toContain("Abrimos hoje, às 07h"); // seg 05:30
    expect(frase("2026-10-12T21:00:00Z")).toContain("Abrimos amanhã (terça-feira), às 07h"); // seg 18:00
    expect(frase("2026-10-16T23:00:00Z")).toContain("Abrimos amanhã (sábado), às 07h"); // sex 20:00
  });

  it("sábado à tarde pula o domingo fechado e informa a data", () => {
    expect(frase("2026-10-17T18:00:00Z")).toContain("Abrimos na segunda-feira, dia 19/10, às 07h"); // sáb 15:00
  });

  it("feriado e horário especial vêm das exceções do calendário; a semana, do prompt", () => {
    const feriado = calendarioComExcecoes([{ data: "2026-10-12", tipo: "fechado" }]);
    expect(frase("2026-10-11T22:08:00Z", [feriado])).toContain(
      "Abrimos na terça-feira, dia 13/10, às 07h",
    );
    const especial = calendarioComExcecoes([
      { data: "2026-10-12", tipo: "especial", hora_inicio: "09:30", hora_fim: "12:00" },
    ]);
    expect(frase("2026-10-11T22:08:00Z", [especial])).toContain(
      "Abrimos amanhã (segunda-feira), às 09h30",
    );
  });

  it("sem horário no prompt não informa abertura", () => {
    expect(situacao("2026-10-11T22:08:00Z", [], null).situacao).toBe("desconhecida");
  });
});

describe("aviso de transferência fora do horário", () => {
  const abertura = frase("2026-10-11T22:08:00Z");

  it("contingência traz a abertura antes do protocolo e continua válida", () => {
    const texto = montarMensagemHandoffFallback({
      protocolo: "MJ-77",
      motivo: "agendamento",
      aberturaPrevista: abertura,
    });
    expect(texto).toContain(abertura);
    expect(texto.indexOf(abertura)).toBeLessThan(texto.indexOf("Protocolo do atendimento: MJ-77"));
    expect(texto.trimEnd()).toEndWith("Protocolo do atendimento: MJ-77");
  });

  it("dentro do horário a contingência não cita horário", () => {
    const texto = montarMensagemHandoffFallback({ protocolo: "MJ-77", motivo: "agendamento" });
    expect(texto).not.toContain("fora do horário");
  });

  it("fora do horário recusa promessa de atendimento imediato", () => {
    const texto =
      "Vou encaminhar para nossa equipe, que já já continua por aqui.\n\nProtocolo do atendimento: MJ-77";
    expect(validarMensagemHandoff(texto, { protocolo: "MJ-77" }).ok).toBe(true);
    expect(
      validarMensagemHandoff(texto, { protocolo: "MJ-77", foraDoHorario: true }).problemas,
    ).toContain("promete atendimento imediato fora do horário");
  });

  it("mensagem da própria Nina, sem protocolo, recebe a abertura no fim", () => {
    const nina =
      "*Transferido para atendimento humano.* Você não está mais falando com Sofia, a inteligência artificial do atendimento — uma atendente da equipe assume esta conversa e responde por aqui mesmo.";
    expect(incluirAberturaPrevista(nina, abertura)).toBe([nina, abertura].join("\n\n"));
  });

  it("inclusão da abertura é idempotente e sem frase não altera o texto", () => {
    const base = "Vou encaminhar para nossa equipe por aqui.\n\nProtocolo do atendimento: MJ-77";
    const uma = incluirAberturaPrevista(base, abertura);
    expect(incluirAberturaPrevista(uma, abertura)).toBe(uma);
    expect(incluirAberturaPrevista(base, null)).toBe(base);
  });
});
