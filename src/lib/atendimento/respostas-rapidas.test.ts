import { describe, expect, it } from "vitest";
import {
  aplicarVariaveis,
  detectarComandoNoTexto,
  filtrarRespostas,
  LACUNA,
  normalizarComando,
  previewComExemplos,
  primeiroNome,
  substituirTrecho,
  validarComando,
  type RespostaRapida,
} from "./respostas-rapidas";

function r(comando: string, extra: Partial<RespostaRapida> = {}): RespostaRapida {
  return {
    id: comando,
    clinica_id: "c1",
    comando,
    nome: comando,
    conteudo: `conteudo ${comando}`,
    categoria: null,
    ativo: true,
    escopo: "clinica",
    owner_user_id: null,
    ...extra,
  };
}

const base = [
  r("valor", { nome: "Informações de valor", categoria: "Valores" }),
  r("endereco", { nome: "Endereço da unidade", categoria: "Endereço" }),
  r("confirmacao", { nome: "Confirmar agendamento", categoria: "Agendamento" }),
  r("consulta", { nome: "Sobre consulta" }),
  r("convenio", { nome: "Convênios aceitos" }),
  r("preparo_ultrassom", { nome: "Preparo", conteudo: "Preparo para Ultrassonografia" }),
];

describe("comando", () => {
  it("normaliza para o formato aceito", () => {
    expect(normalizarComando("/Valor Consulta")).toBe("valor_consulta");
    expect(normalizarComando("Endereço!")).toBe("endereco");
  });
  it("valida comandos", () => {
    expect(validarComando("/documentos")).toBeNull();
    expect(validarComando("/retorno30")).toBeNull();
    expect(validarComando("/dois valores")).toMatch(/espaços/);
    expect(validarComando("/")).toBeTruthy();
  });
});

describe("detecção no composer", () => {
  it("Teste 1 — barra no início abre a lista", () => {
    expect(detectarComandoNoTexto("/", 1)).toEqual({ inicio: 0, fim: 1, termo: "" });
  });
  it("Teste 21 — barra no meio da mensagem", () => {
    const t = "Bom dia João! /documentos";
    const d = detectarComandoNoTexto(t, t.length);
    expect(d).toEqual({ inicio: 14, fim: t.length, termo: "documentos" });
  });
  it("não dispara dentro de URL ou data", () => {
    expect(detectarComandoNoTexto("https://a/b", 11)).toBeNull();
    expect(detectarComandoNoTexto("12/03", 5)).toBeNull();
  });
  it("Teste 6 e 20 — substitui só o comando, preservando o texto", () => {
    const t = "Bom dia João! /documentos";
    const d = detectarComandoNoTexto(t, t.length)!;
    const out = substituirTrecho(t, d.inicio, d.fim, "Traga RG e CPF.");
    expect(out.texto).toBe("Bom dia João! Traga RG e CPF.");
    expect(out.cursor).toBe(out.texto.length);
  });
});

describe("busca e ordenação", () => {
  it("Teste 2 — /con filtra corretamente", () => {
    const res = filtrarRespostas(base, "con").map((x) => x.comando);
    expect(res.slice(0, 3).sort()).toEqual(["confirmacao", "consulta", "convenio"]);
  });
  it("busca por nome, conteúdo e categoria", () => {
    expect(filtrarRespostas(base, "unidade").map((x) => x.comando)).toContain("endereco");
    expect(filtrarRespostas(base, "valores").map((x) => x.comando)).toContain("valor");
  });
  it("Teste 10 — favoritas primeiro", () => {
    const res = filtrarRespostas(base, "", { favoritos: new Set(["convenio"]) });
    expect(res[0]?.comando).toBe("convenio");
  });
  it("mais usadas sobem", () => {
    const res = filtrarRespostas(base, "", { usos: new Map([["consulta", 9]]) });
    expect(res[0]?.comando).toBe("consulta");
  });
  it("contexto apenas prioriza, sem esconder as demais", () => {
    const res = filtrarRespostas(base, "", { contexto: ["Ultrassonografia"] });
    expect(res[0]?.comando).toBe("preparo_ultrassom");
    expect(res).toHaveLength(base.length);
  });
  it("ignora mensagens inativas", () => {
    const res = filtrarRespostas([...base, r("off", { ativo: false })], "off");
    expect(res).toHaveLength(0);
  });
});

describe("variáveis", () => {
  it("Teste 7 — preenche com dados reais", () => {
    const { texto, faltantes } = aplicarVariaveis(
      "Olá, {{patient.first_name}}! Confirmado para {{appointment.date}} às {{appointment.time}}.",
      {
        "patient.first_name": "João",
        "appointment.date": "12/03/2026",
        "appointment.time": "14:30",
      },
    );
    expect(texto).toBe("Olá, João! Confirmado para 12/03/2026 às 14:30.");
    expect(faltantes).toHaveLength(0);
  });
  it("Teste 8 — sem dado não envia placeholder quebrado", () => {
    const { texto, faltantes } = aplicarVariaveis("Olá, {{patient.name}}", {});
    expect(texto).toBe(`Olá, ${LACUNA}`);
    expect(texto).not.toContain("{{");
    expect(faltantes).toEqual(["nome do paciente"]);
  });
  it("variável desconhecida também vira lacuna", () => {
    const { texto, desconhecidas } = aplicarVariaveis("{{foo.bar}}", {});
    expect(texto).toBe(LACUNA);
    expect(desconhecidas).toEqual(["foo.bar"]);
  });
  it("prévia usa exemplos", () => {
    expect(previewComExemplos("Olá {{patient.first_name}}")).toBe("Olá João");
  });
  it("primeiro nome", () => {
    expect(primeiroNome("João da Silva")).toBe("João");
    expect(primeiroNome(null)).toBe("");
  });
});
