/**
 * FASE 6 — identidade da resposta avaliada e entregue.
 *
 * O caso que motivou a fase: o áudio (resumo falado) herdava a nota do texto
 * completo. Aqui isso é impossível por construção — e cada motivo de recusa é
 * explícito, sem inventar vínculo em registro antigo.
 */
import { describe, expect, test } from "bun:test";
import { hashDoTexto } from "./hash";
import {
  confiancaAplicavelAMensagem,
  falaPrecisaDeAvaliacaoPropria,
  representacaoDaMensagem,
  resultadoRegistrado,
  selecionarAvaliacaoDaSaida,
  TEXTO_SEM_EFEITO,
} from "./identidade-saida";

const CLINICA = "clinica-1";
const TEXTO = "Atendemos na Rua das Flores, 100, das 8h às 18h.";
const RESUMO = "Ficamos na Rua das Flores, 100.";

describe("texto avaliado igual ao entregue", () => {
  test("vínculo exato quando clínica, turno, representação e conteúdo batem", () => {
    const r = selecionarAvaliacaoDaSaida(
      [
        {
          clinicaId: CLINICA,
          conversaId: "conv-1",
          execucaoId: "exec-1",
          outgoingMessageId: "msg-1",
          representacao: "texto_completo",
          textoHash: hashDoTexto(TEXTO),
        },
      ],
      {
        clinicaId: CLINICA,
        conversaId: "conv-1",
        execucaoId: "exec-1",
        outgoingMessageId: "msg-1",
        representacao: "texto_completo",
        conteudo: TEXTO,
      },
    );
    expect(r.motivo).toBe("vinculo_exato");
    expect(r.suficiente).toBe(true);
    expect(r.conteudoConferido).toBe(true);
  });
});

describe("texto alterado depois da avaliação", () => {
  test("conteúdo divergente não é apresentado como avaliação da saída", () => {
    const r = selecionarAvaliacaoDaSaida(
      [
        {
          clinicaId: CLINICA,
          execucaoId: "exec-1",
          representacao: "texto_completo",
          textoHash: hashDoTexto(TEXTO),
        },
      ],
      {
        clinicaId: CLINICA,
        execucaoId: "exec-1",
        representacao: "texto_completo",
        conteudo: `${TEXTO} Posso ajudar em mais alguma coisa?`,
      },
    );
    expect(r.motivo).toBe("conteudo_divergente");
    expect(r.suficiente).toBe(false);
  });
});

describe("áudio integral e resumo falado", () => {
  test("resumo falado NÃO herda a nota do texto completo", () => {
    const r = selecionarAvaliacaoDaSaida(
      [
        {
          clinicaId: CLINICA,
          execucaoId: "exec-1",
          representacao: "texto_completo",
          textoHash: hashDoTexto(TEXTO),
        },
      ],
      { clinicaId: CLINICA, execucaoId: "exec-1", representacao: "audio", conteudo: RESUMO },
    );
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toBe("outra_representacao");
    expect(r.avaliacao).toBeNull();
  });

  test("resumo falado com avaliação própria é reconhecido", () => {
    const r = selecionarAvaliacaoDaSaida(
      [
        {
          clinicaId: CLINICA,
          execucaoId: "exec-1",
          representacao: "texto_completo",
          textoHash: hashDoTexto(TEXTO),
        },
        {
          clinicaId: CLINICA,
          execucaoId: "exec-1",
          representacao: "audio_resumo",
          textoHash: hashDoTexto(RESUMO),
        },
      ],
      { clinicaId: CLINICA, execucaoId: "exec-1", representacao: "audio", conteudo: RESUMO },
    );
    expect(r.motivo).toBe("vinculo_exato");
    expect(r.avaliacao?.representacao).toBe("audio_resumo");
  });

  test("áudio integral com o mesmo conteúdo do texto tem vínculo próprio", () => {
    const r = selecionarAvaliacaoDaSaida(
      [
        {
          clinicaId: CLINICA,
          representacao: "audio_integral",
          textoHash: hashDoTexto(TEXTO),
        },
      ],
      { clinicaId: CLINICA, representacao: "audio", conteudo: TEXTO },
    );
    expect(r.suficiente).toBe(true);
    expect(r.avaliacao?.representacao).toBe("audio_integral");
  });

  test("áudio com avaliação sem hash fica sem nota, nunca aproximada", () => {
    const r = selecionarAvaliacaoDaSaida(
      [{ clinicaId: CLINICA, representacao: "audio_resumo", textoHash: null }],
      { clinicaId: CLINICA, representacao: "audio", conteudo: RESUMO },
    );
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toBe("vinculo_incompleto");
  });

  test("conteúdo preparado para fala diferente do avaliado exige avaliação própria", () => {
    const igual = falaPrecisaDeAvaliacaoPropria({
      textoAvaliadoHash: hashDoTexto(TEXTO),
      conteudoFalado: TEXTO,
    });
    expect(igual.precisa).toBe(false);
    const diferente = falaPrecisaDeAvaliacaoPropria({
      textoAvaliadoHash: hashDoTexto(TEXTO),
      conteudoFalado: RESUMO,
    });
    expect(diferente.precisa).toBe(true);
    expect(diferente.hashFalado).not.toBe(igual.hashFalado);
  });
});

describe("vínculo ausente e registro antigo", () => {
  test("sem nenhuma avaliação, o motivo é explícito", () => {
    const r = selecionarAvaliacaoDaSaida([], {
      clinicaId: CLINICA,
      representacao: "texto_completo",
      conteudo: TEXTO,
    });
    expect(r.motivo).toBe("sem_avaliacao");
    expect(r.suficiente).toBe(false);
  });

  test("registro antigo sem hash continua acessível, declarado como não conferido", () => {
    const r = selecionarAvaliacaoDaSaida(
      [{ clinicaId: CLINICA, execucaoId: "exec-antiga", representacao: null, textoHash: null }],
      {
        clinicaId: CLINICA,
        execucaoId: "exec-antiga",
        representacao: "texto_completo",
        conteudo: TEXTO,
      },
    );
    expect(r.motivo).toBe("registro_antigo_sem_hash");
    expect(r.suficiente).toBe(true);
    expect(r.conteudoConferido).toBe(false);
  });

  test("saída sem conteúdo conhecido não afirma conferência", () => {
    const r = selecionarAvaliacaoDaSaida(
      [{ clinicaId: CLINICA, representacao: "texto_completo", textoHash: hashDoTexto(TEXTO) }],
      { clinicaId: CLINICA, representacao: "texto_completo" },
    );
    expect(r.motivo).toBe("vinculo_incompleto");
    expect(r.conteudoConferido).toBe(false);
  });
});

describe("isolamento entre turnos e clínicas", () => {
  test("avaliação de outra clínica nunca é usada", () => {
    const r = selecionarAvaliacaoDaSaida(
      [{ clinicaId: "outra", representacao: "texto_completo", textoHash: hashDoTexto(TEXTO) }],
      { clinicaId: CLINICA, representacao: "texto_completo", conteudo: TEXTO },
    );
    expect(r.motivo).toBe("outro_escopo");
    expect(r.avaliacao).toBeNull();
  });

  test("avaliação de outro turno/conversa não atravessa", () => {
    const r = selecionarAvaliacaoDaSaida(
      [
        {
          clinicaId: CLINICA,
          conversaId: "conv-2",
          execucaoId: "exec-2",
          representacao: "texto_completo",
          textoHash: hashDoTexto(TEXTO),
        },
      ],
      {
        clinicaId: CLINICA,
        conversaId: "conv-1",
        execucaoId: "exec-1",
        representacao: "texto_completo",
        conteudo: TEXTO,
      },
    );
    expect(r.motivo).toBe("outro_escopo");
  });

  test("mensagem de outro id não empresta a avaliação", () => {
    const r = selecionarAvaliacaoDaSaida(
      [
        {
          clinicaId: CLINICA,
          outgoingMessageId: "msg-9",
          representacao: "texto_completo",
          textoHash: hashDoTexto(TEXTO),
        },
      ],
      {
        clinicaId: CLINICA,
        outgoingMessageId: "msg-1",
        representacao: "texto_completo",
        conteudo: TEXTO,
      },
    );
    expect(r.motivo).toBe("outro_escopo");
  });
});

describe("recomendação CLARIFY com efeito CONTINUE", () => {
  test("resultado registrado é o efeito, nunca a tradução da recomendação", () => {
    expect(resultadoRegistrado({ resultadoFinal: null })).toBe(TEXTO_SEM_EFEITO);
    expect(
      resultadoRegistrado({
        resultadoFinal: "respondido_pela_nina",
        rotulo: (v) => (v === "respondido_pela_nina" ? "Respondido pela Nina" : null),
      }),
    ).toBe("Respondido pela Nina");
    // CLARIFY é recomendação: sem efeito gravado, nada é afirmado.
    expect(resultadoRegistrado({ resultadoFinal: undefined })).toBe(TEXTO_SEM_EFEITO);
  });
});

describe("selo da Inbox", () => {
  test("bolha de áudio não recebe o selo do texto completo", () => {
    const r = confiancaAplicavelAMensagem(
      { representacao: "texto_completo", texto_final_hash: hashDoTexto(TEXTO) },
      { tipo: "audio", texto: `🎤 ${RESUMO}` },
    );
    expect(r.aplicavel).toBe(false);
    expect(r.motivo).toBe("outra_representacao");
  });

  test("bolha de texto com o conteúdo avaliado recebe o selo", () => {
    const r = confiancaAplicavelAMensagem(
      { representacao: "texto_completo", texto_final_hash: hashDoTexto(TEXTO) },
      { tipo: "text", texto: TEXTO },
    );
    expect(r.aplicavel).toBe(true);
    expect(r.motivo).toBe("vinculo_exato");
  });

  test("bolha de áudio com avaliação própria do falado recebe o selo", () => {
    const r = confiancaAplicavelAMensagem(
      { representacao: "audio_resumo", texto_final_hash: hashDoTexto(RESUMO) },
      { tipo: "audio", texto: `🎤 ${RESUMO}` },
    );
    expect(r.aplicavel).toBe(true);
  });

  test("prefixo do áudio é retirado antes de comparar o conteúdo", () => {
    expect(representacaoDaMensagem({ tipo: "audio", texto: `🎤 ${RESUMO}` }).conteudo).toBe(RESUMO);
    expect(representacaoDaMensagem({ tipo: "text", texto: TEXTO }).representacao).toBe(
      "texto_completo",
    );
  });
});
