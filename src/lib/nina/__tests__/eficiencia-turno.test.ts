import { describe, expect, test } from "bun:test";
import { criarCompactadorRetornos, criarProgressoTurno, REGRA_MODALIDADES_PAGAMENTO } from "../eficiencia-turno";
import { perguntasConferencia } from "../jev-conferencia";
import { validarResultado } from "../tool-broker";

describe("progresso e contexto por turno", () => {
  test("continua sem teto enquanto existem fatos novos e detecta retorno a um resultado anterior", () => {
    const progresso = criarProgressoTurno();
    for (let dia = 1; dia <= 30; dia++) {
      expect(progresso.registrar("consultar_disponibilidade", validarResultado("consultar_disponibilidade",
        { ok: true, horarios: [{ dia, hora: "09:00" }] }))).toBe(true);
    }
    expect(progresso.registrar("consultar_disponibilidade", validarResultado("consultar_disponibilidade",
      { horarios: [{ hora: "09:00", dia: 1 }], ok: true }))).toBe(false);
  });
  test("instruções e metadados diferentes não transformam o mesmo fato em novidade", () => {
    const progresso = criarProgressoTurno();
    const resultado = (termo: string) => validarResultado("consultar_cadastro", {
      ok: true, records: [{ id: "pediatria", preco_cartao: 145 }], instrucao: termo, pedido_interpretado: { termo }, trace: termo,
    });
    expect(progresso.registrar("consultar_cadastro", resultado("pediatria"))).toBe(true);
    expect(progresso.registrar("consultar_cadastro", resultado("pediatra"))).toBe(false);
    expect(progresso.registrar("consultar_cadastro", validarResultado("consultar_cadastro",
      { ok: true, records: [{ id: "psiquiatria", preco_cartao: 145 }] }))).toBe(true);
  });
  test("cache não conta como progresso e falha diferente permite reformular", () => {
    const progresso = criarProgressoTurno();
    const r = validarResultado("consultar_cadastro", { ok: false, erro: "SEM_VINCULO" });
    expect(progresso.registrar("consultar_cadastro", { ...r, reused: true })).toBe(false);
    expect(progresso.registrar("consultar_cadastro", r)).toBe(true);
    expect(progresso.registrar("consultar_cadastro", r)).toBe(false);
    expect(progresso.registrar("consultar_cadastro", { ...r, erro: "OUTRA_FALHA" })).toBe(true);
  });
  test("compactação preserva fatos, orientações diferentes, primeiro retorno e objeto original", () => {
    const compactar = criarCompactadorRetornos();
    const primeiro = { instrucao: "Texto longo", mapa_campos: { valor: "preço" }, records: [{ preco_cartao: 145 }] };
    const original = structuredClone(primeiro);
    expect(compactar(primeiro)).toEqual(original);
    expect(compactar({ ...primeiro, records: [{ preco_cartao: 200 }] })).toEqual({
      records: [{ preco_cartao: 200 }], orientacoes_identicas_em_retornos_anteriores: ["instrucao", "mapa_campos"],
    });
    expect(compactar({ instrucao: "Orientação nova", horarios: ["09:00"] })).toEqual({ instrucao: "Orientação nova", horarios: ["09:00"] });
    expect(primeiro).toEqual(original);
    expect(criarCompactadorRetornos()(primeiro)).toEqual(original);
  });
  test("Jev recebe a mesma regra autorizada de equivalência Pix/cartão, sem dispensar verificação de valores", () => {
    const perguntas = perguntasConferencia({ agendaConsultada: false, agendamentoConfirmado: false,
      dadosConsultados: ['{"preco_cartao":145,"preco_dinheiro":120}'] });
    expect(perguntas.dado_sem_fonte.instructions).toContain(REGRA_MODALIDADES_PAGAMENTO);
    expect(perguntas.dado_sem_fonte.instructions).toContain("NÃO aparece");
  });
});
