import { describe, expect, it } from "bun:test";
import {
  avisoEntregue,
  chaveAvisoEncaminhamento,
  decidirEntregaAviso,
  decisaoProduzMensagem,
  precisaAvisoDoChamador,
  type OrigemAviso,
  type RegistroAviso,
  type ResultadoAvisoEncaminhamento,
} from "../aviso-encaminhamento";

const origem: OrigemAviso = {
  clinicaId: "cl-1",
  ambiente: "producao",
  conversaId: "cv-1",
  sessaoId: "s-1",
  turnoId: "t-1",
  protocolo: "MJ-52",
};

function registro(p: Partial<RegistroAviso>): RegistroAviso {
  return {
    chave: "k",
    estado: "preparado",
    protocolo: "MJ-52",
    texto: "aviso",
    mensagemId: null,
    transporteId: null,
    tentativas: 0,
    atualizadoEm: new Date().toISOString(),
    ...p,
  };
}

describe("identidade da operação de aviso", () => {
  it("é estável entre novas tentativas do mesmo turno", () => {
    expect(chaveAvisoEncaminhamento(origem)).toBe(chaveAvisoEncaminhamento({ ...origem }));
  });

  it("muda quando muda o turno, a sessão, a conversa ou o ambiente", () => {
    const base = chaveAvisoEncaminhamento(origem);
    expect(chaveAvisoEncaminhamento({ ...origem, turnoId: "t-2" })).not.toBe(base);
    expect(chaveAvisoEncaminhamento({ ...origem, sessaoId: "s-2" })).not.toBe(base);
    expect(chaveAvisoEncaminhamento({ ...origem, conversaId: "cv-2" })).not.toBe(base);
    expect(chaveAvisoEncaminhamento({ ...origem, ambiente: "homologacao" })).not.toBe(base);
    expect(chaveAvisoEncaminhamento({ ...origem, clinicaId: "cl-2" })).not.toBe(base);
  });

  it("sem turno, o protocolo identifica a operação", () => {
    const semTurno = { ...origem, turnoId: null };
    expect(chaveAvisoEncaminhamento(semTurno)).toContain("p:MJ-52");
    expect(chaveAvisoEncaminhamento(semTurno)).toBe(chaveAvisoEncaminhamento({ ...semTurno }));
  });
});

describe("decisão de entrega", () => {
  it("sem registro anterior, envia", () => {
    expect(decidirEntregaAviso(null)).toBe("enviar");
  });

  it("já confirmado, não produz segunda mensagem", () => {
    const d = decidirEntregaAviso(registro({ estado: "confirmado", mensagemId: "m1" }));
    expect(d).toBe("ja_entregue");
    expect(decisaoProduzMensagem(d)).toBe(false);
  });

  it("envio em andamento por outro caminho: aguarda", () => {
    const d = decidirEntregaAviso(registro({ estado: "envio_pendente" }));
    expect(d).toBe("aguardar");
    expect(decisaoProduzMensagem(d)).toBe(false);
  });

  it("reserva vencida vira conferência, nunca reenvio às cegas", () => {
    const antiga = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(decidirEntregaAviso(registro({ estado: "envio_pendente", atualizadoEm: antiga }))).toBe(
      "verificar_antes_de_reenviar",
    );
  });

  it("resultado incerto exige conferir antes de repetir", () => {
    expect(decidirEntregaAviso(registro({ estado: "incerto" }))).toBe(
      "verificar_antes_de_reenviar",
    );
  });

  it("falha conhecida permite nova tentativa até o limite", () => {
    expect(decidirEntregaAviso(registro({ estado: "falhou", tentativas: 1 }))).toBe("reenviar");
    expect(decidirEntregaAviso(registro({ estado: "falhou", tentativas: 3 }))).toBe("desistir");
  });

  it("tentativa nunca é entrega confirmada", () => {
    expect(avisoEntregue("envio_pendente")).toBe(false);
    expect(avisoEntregue("incerto")).toBe(false);
    expect(avisoEntregue("falhou")).toBe(false);
    expect(avisoEntregue("confirmado")).toBe(true);
  });
});

describe("quem avisa o paciente", () => {
  function resultado(p: Partial<ResultadoAvisoEncaminhamento>): ResultadoAvisoEncaminhamento {
    return {
      chave: "k",
      ambiente: "producao",
      estado: "confirmado",
      protocolo: "MJ-52",
      texto: "aviso",
      mensagemId: "m1",
      transporteId: null,
      entregue: true,
      reaproveitado: false,
      ...p,
    };
  }

  it("o encaminhamento já avisou: a finalização da Nina cala", () => {
    expect(precisaAvisoDoChamador(resultado({}))).toBe(false);
  });

  it("entrega em andamento: a finalização também não duplica", () => {
    expect(
      precisaAvisoDoChamador(resultado({ estado: "envio_pendente", entregue: false })),
    ).toBe(false);
  });

  it("falha no aviso do encaminhamento: a finalização volta a ser responsável", () => {
    expect(precisaAvisoDoChamador(resultado({ estado: "falhou", entregue: false }))).toBe(true);
  });

  it("sem operação registrada, quem chama avisa", () => {
    expect(precisaAvisoDoChamador(null)).toBe(true);
  });
});
