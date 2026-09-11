/**
 * AUDITORIA DAS INSTRUÇÕES — testes do registro por turno e por rodada.
 *
 * Módulo puro + registro em AsyncLocalStorage: sem banco, sem rede, sem
 * modelo, sem WhatsApp e sem produção.
 */
import { describe, expect, it } from "bun:test";
import {
  estadoDaAuditoria,
  montarAuditoriaRodada,
  fecharAuditoriaRodada,
} from "./auditoria-instrucoes";
import {
  comRegistroTurno,
  registrarAuditoriaInstrucoes,
  registrarRodadaModelo,
  fecharAuditoriaInstrucoesDoTurno,
} from "./turno.server";
import { extrairRegrasPublicadas } from "@/lib/nina/confidence/regras-publicadas";
import { resumoTurnoParaTrace, lacunasDoTurno } from "./turno";

const TEXTO_V6 = [
  "Você é a Nina, atendente da clínica.",
  "",
  'REGRA DE VERIFICAÇÃO: quando a mensagem for exatamente "TESTE-ARQUITETURA-9381",',
  "responda EXATAMENTE ARQUITETURA_CONFIRMADA_9381.",
  "Não acrescente saudação, explicação ou qualquer texto adicional.",
].join("\n");

function regras() {
  return extrairRegrasPublicadas(TEXTO_V6, {
    escopo: "whatsapp",
    hash: "hash-v6",
    versao: "6",
    versaoId: "v6",
  }).regras;
}

describe("auditoria das instruções — estado", () => {
  it("sem regra identificada não vira 'cumpridas'", () => {
    expect(
      estadoDaAuditoria({
        verificacoes: [],
        regrasIdentificadas: 0,
        regrasAplicaveis: 0,
        falhaDeInterpretacao: false,
      }),
    ).toBe("sem_regras");
  });

  it("falha de interpretação é declarada, nunca aprovada", () => {
    expect(
      estadoDaAuditoria({
        verificacoes: [],
        regrasIdentificadas: 3,
        regrasAplicaveis: 3,
        falhaDeInterpretacao: true,
      }),
    ).toBe("falha_de_interpretacao");
  });

  it("uma exigência descumprida derruba o estado do turno", () => {
    expect(
      estadoDaAuditoria({
        verificacoes: [
          { regraId: "r1", descricao: "a", estado: "cumprida", motivo: null },
          { regraId: "r2", descricao: "b", estado: "descumprida", motivo: "texto extra" },
        ],
        regrasIdentificadas: 2,
        regrasAplicaveis: 2,
        falhaDeInterpretacao: false,
      }),
    ).toBe("descumpridas");
  });
});

describe("auditoria das instruções — rodada", () => {
  it("separa regras identificadas, aplicáveis e não aplicáveis", () => {
    const todas = regras();
    expect(todas.length).toBeGreaterThan(0);
    const a = montarAuditoriaRodada({
      rodada: 1,
      regrasIdentificadas: todas,
      regrasAplicaveis: [todas[0]!],
      respostaOriginal: "ARQUITETURA_CONFIRMADA_9381",
    });
    expect(a.regrasIdentificadas.length).toBe(todas.length);
    expect(a.regrasAplicaveis.length).toBe(1);
    expect(a.regrasNaoAplicaveis.length).toBe(todas.length - 1);
    expect(a.respostaOriginal?.hash).toBeTruthy();
    // Sem diagnóstico autorizado, o texto integral não fica guardado.
    expect(a.respostaOriginal?.texto).toBeUndefined();
  });

  it("fechar a rodada guarda o texto entregue e as intervenções", () => {
    const a = fecharAuditoriaRodada(
      montarAuditoriaRodada({ rodada: 1, respostaOriginal: "oi" }),
      {
        entregue: "Olá! oi",
        intervencoes: [{ etapa: "templates", motivo: "saudação", alterou: true }],
      },
    );
    expect(a.entregue?.hash).toBeTruthy();
    expect(a.intervencoes[0]?.etapa).toBe("templates");
  });
});

describe("auditoria das instruções — registro do turno", () => {
  it("dois turnos simultâneos não misturam evidência", async () => {
    const rodar = (id: string, texto: string) =>
      comRegistroTurno(
        {
          turnoId: id,
          clinicaId: "c-1",
          conversaId: `conv-${id}`,
          mensagensEntrada: [`m-${id}`],
          ambiente: "homologacao",
          teste: true,
        },
        async () => {
          registrarRodadaModelo({ execucaoId: `exec-${id}`, modelo: "m" });
          registrarAuditoriaInstrucoes({
            rodada: 1,
            execucaoId: `exec-${id}`,
            regrasIdentificadas: regras(),
            regrasAplicaveis: regras().slice(0, 1),
            respostaOriginal: texto,
          });
          await new Promise((r) => setTimeout(r, 5));
          fecharAuditoriaInstrucoesDoTurno({
            textoEntregue: texto,
            verificacoes: [
              {
                regraId: "r1",
                descricao: "responder exatamente",
                estado: texto === "ARQUITETURA_CONFIRMADA_9381" ? "cumprida" : "descumprida",
                motivo: null,
              },
            ],
          });
          return null;
        },
      );

    const [a, b] = await Promise.all([
      rodar("t-a", "ARQUITETURA_CONFIRMADA_9381"),
      rodar("t-b", "Olá! ARQUITETURA_CONFIRMADA_9381"),
    ]);

    const audA = a.registro.auditoriaInstrucoes[0]!;
    const audB = b.registro.auditoriaInstrucoes[0]!;
    expect(audA.execucaoId).toBe("exec-t-a");
    expect(audB.execucaoId).toBe("exec-t-b");
    expect(audA.estado).toBe("cumpridas");
    expect(audB.estado).toBe("descumpridas");
    expect(audA.entregue?.hash).not.toBe(audB.entregue?.hash);
  });

  it("turno com modelo e sem auditoria declara a lacuna", async () => {
    const { registro } = await comRegistroTurno(
      {
        turnoId: "t-sem",
        clinicaId: "c-1",
        conversaId: "conv",
        mensagensEntrada: ["m"],
        ambiente: "homologacao",
        teste: true,
      },
      async () => {
        registrarRodadaModelo({ execucaoId: "e-1", modelo: "m" });
        return null;
      },
    );
    expect(lacunasDoTurno(registro)).toContain("auditoria_instrucoes");
    expect(resumoTurnoParaTrace(registro)["auditoria_instrucoes"]).toEqual([]);
  });
});
