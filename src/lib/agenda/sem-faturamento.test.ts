import { describe, expect, it } from "bun:test";
import {
  MOTIVO_SEM_FATURAMENTO_OUTRO,
  ehSemFaturamento,
  motivoSemFaturamentoFinal,
  podeAutorizarSemFaturamento,
  rotuloSemFaturamento,
} from "./sem-faturamento";

describe("ehSemFaturamento", () => {
  it("reconhece o atendimento marcado (caso do Toxicológico)", () => {
    expect(ehSemFaturamento({ sem_faturamento: true })).toBe(true);
  });

  it("não confunde ausência de marcação com marcação", () => {
    // A coluna nasceu `false` para todos os agendamentos já gravados, e linhas
    // vindas de telas antigas podem nem trazer o campo. Nos dois casos o
    // atendimento é cobrado normalmente.
    expect(ehSemFaturamento({ sem_faturamento: false })).toBe(false);
    expect(ehSemFaturamento({})).toBe(false);
    expect(ehSemFaturamento(null)).toBe(false);
    expect(ehSemFaturamento(undefined)).toBe(false);
  });
});

describe("podeAutorizarSemFaturamento", () => {
  it("libera quem tem a permissão individual e o perfil certo", () => {
    expect(podeAutorizarSemFaturamento("admin", true)).toBe(true);
    expect(podeAutorizarSemFaturamento("gestor", true)).toBe(true);
    expect(podeAutorizarSemFaturamento("supervisor", true)).toBe(true);
  });

  it("perfil de administrador SEM a permissão individual não autoriza sozinho", () => {
    // É o caso da maior parte da equipe: 30 pessoas têm perfil de
    // administrador porque é ele que abre as telas administrativas. Autorizar
    // isenção é permissão concedida nome a nome pela diretoria.
    expect(podeAutorizarSemFaturamento("admin", false)).toBe(false);
    expect(podeAutorizarSemFaturamento("gestor", null)).toBe(false);
    expect(podeAutorizarSemFaturamento("supervisor", undefined)).toBe(false);
  });

  it("a permissão individual sozinha não vale para quem opera o balcão", () => {
    // Marcar uma recepcionista por engano na tela de Equipe não pode
    // transformá-la em quem isenta cobrança.
    expect(podeAutorizarSemFaturamento("recepcao", true)).toBe(false);
    expect(podeAutorizarSemFaturamento("caixa", true)).toBe(false);
    expect(podeAutorizarSemFaturamento("financeiro", true)).toBe(false);
    expect(podeAutorizarSemFaturamento("medico", true)).toBe(false);
    expect(podeAutorizarSemFaturamento(null, true)).toBe(false);
    expect(podeAutorizarSemFaturamento(undefined, true)).toBe(false);
  });
});

describe("motivoSemFaturamentoFinal", () => {
  it("aceita direto o motivo escolhido na lista", () => {
    expect(motivoSemFaturamentoFinal("Acordo da diretoria", "")).toBe("Acordo da diretoria");
  });

  it("exige o texto quando a escolha é 'Outro'", () => {
    // Sem isso, "Outro" viraria um motivo que não explica nada.
    expect(motivoSemFaturamentoFinal(MOTIVO_SEM_FATURAMENTO_OUTRO, "")).toBeNull();
    expect(motivoSemFaturamentoFinal(MOTIVO_SEM_FATURAMENTO_OUTRO, "ok")).toBeNull();
    expect(motivoSemFaturamentoFinal(MOTIVO_SEM_FATURAMENTO_OUTRO, "  Perícia do INSS ")).toBe(
      "Perícia do INSS",
    );
  });

  it("não deixa gravar sem escolher nada", () => {
    expect(motivoSemFaturamentoFinal("", "qualquer coisa")).toBeNull();
    expect(motivoSemFaturamentoFinal(null, null)).toBeNull();
  });
});

describe("rotuloSemFaturamento", () => {
  it("é vazio quando o atendimento não está marcado", () => {
    expect(rotuloSemFaturamento({ sem_faturamento: false })).toBe("");
  });

  it("diz o motivo, quem autorizou, quem marcou e quando", () => {
    // É por este balãozinho que a gerência descobre, meses depois, por que
    // aquele atendimento não entrou no caixa — sem precisar abrir o histórico.
    const txt = rotuloSemFaturamento({
      sem_faturamento: true,
      sem_faturamento_em: "2026-09-03T14:30:00.000Z",
      sem_faturamento_por_nome: "MAYARA",
      sem_faturamento_motivo: "Exame de parceiro (Toxicológico / Detran)",
      sem_faturamento_autorizado_por_nome: "SUELLEN",
    });
    expect(txt).toContain("paga direto ao parceiro");
    expect(txt).toContain("Toxicológico");
    expect(txt).toContain("Autorizado por SUELLEN");
    expect(txt).toContain("MAYARA");
  });

  it("ainda explica a marcação quando faltam os campos novos", () => {
    // As marcações feitas antes desta trava não têm motivo nem autorizador
    // gravados, e o balãozinho não pode ficar mudo por causa disso.
    expect(rotuloSemFaturamento({ sem_faturamento: true })).toContain("parceiro");
    expect(rotuloSemFaturamento({ sem_faturamento: true, sem_faturamento_em: "xxx" })).toContain(
      "parceiro",
    );
  });
});
