/**
 * FASE 1 — REPRODUÇÃO DA CAUSA DO BLOQUEIO DA SAUDAÇÃO.
 *
 * Executa a cadeia real, com os módulos originais, para a mensagem
 * "oi boa tarde" respondida com a apresentação válida da identidade
 * publicada, e com o bloco APRESENTAÇÃO das instruções publicadas — que
 * contém a regra aberta "Não acrescente 'Como posso ajudar' quando ela já
 * explicou o que precisa".
 *
 * Não há rede, banco, modelo nem HTTP: a reprodução acontece só com o texto
 * publicado e o texto da resposta. Isso demonstra que o bloqueio NÃO depende
 * de falha de reescrita (HTTP 400).
 *
 *   bun run scripts/nina/reproduzir-bloqueio-saudacao.ts
 */
import { detectarIntencoes, intencaoAmbigua } from "../../src/lib/nina/atendimento-fase1";
import { montarContextoCanonicoTurno } from "../../src/lib/nina/confidence/contexto-turno";
import {
  montarInstrucoesDoTurno,
  enriquecerContextoAvaliacao,
} from "../../src/lib/nina/confidence/contexto-avaliacao";
import {
  avaliarObrigacoes,
  InstructionComplianceValidator,
} from "../../src/lib/nina/confidence/obrigacoes";
import { decidirConfianca } from "../../src/lib/nina/confidence/engine";
import {
  medirEvidencia,
  nivelDaPontuacao,
  POLITICA_PADRAO,
} from "../../src/lib/nina/confidence/policy";
import { decidirHandoff } from "../../src/lib/nina/confidence/handoff-decision";
import { decidirBloqueioBaixaConfianca } from "../../src/lib/nina/confidence/baixa-confiabilidade";
import type {
  ContextoConfianca,
  ResultadoValidador,
} from "../../src/lib/nina/confidence/types";

const MENSAGEM = "oi boa tarde";
const RESPOSTA =
  "Olá, boa tarde! Sou a Nina, assistente virtual da Policlínica Menino Jesus. Como posso te ajudar?";

/** Bloco APRESENTAÇÃO tal como publicado em Arquitetura → Instruções da Nina. */
const TEXTO_PUBLICADO = `APRESENTAÇÃO

Na primeira mensagem de cada conversa, apresente-se assim: "Olá, [saudação]! Sou a Nina, assistente virtual da [estabelecimento]. Como posso te ajudar?"
Não repita a apresentação nas mensagens seguintes da mesma conversa.
Não acrescente "Como posso ajudar" quando ela já explicou o que precisa.
`;

function linha(titulo: string) {
  console.log(`\n--- ${titulo} ---`);
}

const canonico = montarContextoCanonicoTurno(
  { mensagemPaciente: MENSAGEM, podeAgendar: true },
  { detectarIntencoes, intencaoAmbigua },
);

const instrucoes = montarInstrucoesDoTurno({
  escopo: "whatsapp",
  versao: "repro-fase1",
  texto: TEXTO_PUBLICADO,
});

const ctxBase = {
  tipoAvaliacao: "answer_confidence",
  draftText: RESPOSTA,
  mensagemPaciente: MENSAGEM,
  intent: canonico.intent,
  requestedAction: canonico.requestedAction,
  turnType: canonico.turnType,
  intentAmbiguo: canonico.intentAmbiguo,
  fatos: [],
  toolResults: [],
  instrucoes,
} as unknown as ContextoConfianca;
const ctx: ContextoConfianca = enriquecerContextoAvaliacao(ctxBase);

linha("1. Regras extraídas da publicação");
for (const r of instrucoes.regras ?? []) {
  console.log(
    `  [${r.ordem}] verificacao=${r.verificacao} natureza=${r.natureza} condicao=${r.condicao.tipo} :: ${r.descricao}`,
  );
}

linha("2. Classificação do turno");
console.log(
  `  turnType=${canonico.turnType} requestedAction=${String(canonico.requestedAction)} intentAmbiguo=${canonico.intentAmbiguo}`,
);

linha("3. Obrigações avaliadas");
const obr = avaliarObrigacoes(ctx, RESPOSTA, null);
console.log(`  estadoRestricoes=${obr.estadoRestricoes}`);
for (const a of obr.avaliacoes) {
  console.log(`  ${a.status.padEnd(14)} ${a.motivo} :: ${a.obrigacao.descricao}`);
}

linha("4. InstructionComplianceValidator (implementação ATUAL)");
const atual = InstructionComplianceValidator(ctx, null);
console.log(`  status=${atual.status} score=${atual.score} reason=${atual.reasonCode}`);

linha("5. Motor completo (implementação ATUAL)");
const r = decidirConfianca(ctx);
console.log(
  `  score=${r.score} cobertura=${r.evidenceCoverage} nivel=${r.level} decisao=${r.decision} hardBlockers=${JSON.stringify(r.hardBlockers ?? [])} unknown=${JSON.stringify(r.unknownDimensions)}`,
);
const plano = decidirHandoff({
  avaliacaoAcao: r,
  decisaoEfetiva: r.decision,
  tipoTurno: canonico.turnType,
  tentativasEsclarecimento: 0,
});
console.log(`  handoff.transferir=${plano.transferir} motivo=${plano.motivo ?? "—"}`);
const bloqueioAtual = decidirBloqueioBaixaConfianca({
  nivel: r.level,
  score: r.score,
  decisaoMotor: r.decision,
  etapa: "D",
  ambiente: "homologacao",
  turnoSocialSemAcao: true,
  bloqueadoresAbsolutos: r.hardBlockers ?? [],
});
console.log(
  `  bloqueio.bloquear=${bloqueioAtual.bloquear} encaminhar=${bloqueioAtual.encaminhar} :: ${bloqueioAtual.explicacao}`,
);

// ------------------------------------------------------------------------
// 6. Caminho ANTERIOR reinstaurado passo a passo, com os MESMOS módulos: só
//    o ramo que marcava a regra aberta como UNKNOWN é reposto aqui.
// ------------------------------------------------------------------------
linha("6. Caminho anterior (regra aberta como UNKNOWN)");
const antes: ResultadoValidador = {
  validator: "InstructionComplianceValidator",
  status: "UNKNOWN",
  score: 0,
  reasonCode: "RESTRICAO_PUBLICADA_NAO_VERIFICADA",
  evidence: { estadoRestricoes: obr.estadoRestricoes },
  blocker: null,
};
const validadoresAntes: ResultadoValidador[] = [
  ...(r.validators ?? []).filter((v) => v.validator !== "InstructionComplianceValidator"),
  antes,
];
const medida = medirEvidencia(validadoresAntes, POLITICA_PADRAO);
const nivelAntes = nivelDaPontuacao(Math.min(medida.score, medida.tetoScore ?? 100));
console.log(
  `  cobertura=${medida.cobertura} teto=${medida.tetoScore ?? "—"} score=${Math.min(medida.score, medida.tetoScore ?? 100)} nivel=${nivelAntes}`,
);
const bloqueioAntes = decidirBloqueioBaixaConfianca({
  nivel: nivelAntes,
  score: Math.min(medida.score, medida.tetoScore ?? 100),
  decisaoMotor: r.decision,
  etapa: "D",
  ambiente: "homologacao",
});
console.log(
  `  bloqueio.bloquear=${bloqueioAntes.bloquear} encaminhar=${bloqueioAntes.encaminhar} :: ${bloqueioAntes.explicacao}`,
);
