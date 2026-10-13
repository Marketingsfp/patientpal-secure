import { describe, expect, test } from "bun:test";
import { motivoParaAtendimento } from "../texto-interno-apresentacao";
import { MOTIVO_CARTAO_CONSULTA } from "@/lib/nina/cartao-consulta";
import { MOTIVO_NOME_NAO_INFORMADO } from "@/lib/nina/atendimento-sem-indicacao";
import {
  MOTIVO_IDENTIFICACAO_PENDENTE,
  MOTIVO_MEDICO_NAO_IDENTIFICADO,
} from "@/lib/nina/catalogo-esclarecimento";
import { MOTIVO_MEDICO_SEM_REGISTRO, MOTIVO_SEM_REGISTRO } from "@/lib/nina/catalogo-sem-registro";
import { MOTIVO_TIMEOUT_PACIENTE } from "@/lib/nina/espera-timeout-motivo";
import { FOTO_SEGUNDA_FALHA } from "@/lib/nina/fotos";
import { motivoListaExtensa } from "@/lib/nina/lista-profissionais-extensa";
import { motivoMultiplos } from "@/lib/nina/multiplos-atendimentos";
import { motivoAlteracao } from "@/lib/nina/cancelamento-remarcacao";
import { motivoTelefoneNaoAtualizado } from "@/lib/nina/telefone-paciente";
import { motivoRegraHumano } from "@/lib/nina/regras-catalogo";

const GENERICO = "O motivo registrado contém informações técnicas";

/**
 * Todo motivo que as regras da Nina registram numa transferência precisa ter
 * texto para a equipe. Ao criar uma regra nova de encaminhamento, inclua o
 * motivo aqui e a tradução em texto-interno-apresentacao.ts.
 */
const MOTIVOS_DAS_REGRAS: Array<[string, string]> = [
  ["agendamento por item", "AGENDAMENTO_TRANSICAO: Consulta — Pediatria; PROFISSIONAL TESTE."],
  ["cartão consulta", MOTIVO_CARTAO_CONSULTA],
  ["atendimento não informado", MOTIVO_NOME_NAO_INFORMADO],
  ["identificação pendente", MOTIVO_IDENTIFICACAO_PENDENTE],
  ["médico não identificado", MOTIVO_MEDICO_NAO_IDENTIFICADO],
  ["sem registro", MOTIVO_SEM_REGISTRO],
  ["médico sem registro", MOTIVO_MEDICO_SEM_REGISTRO],
  ["30 minutos sem resposta", MOTIVO_TIMEOUT_PACIENTE],
  ["foto não lida", FOTO_SEGUNDA_FALHA],
  ["lista extensa", motivoListaExtensa({ total: 9, especialidade: "cardiologia" })],
  ["vários atendimentos", motivoMultiplos([])],
  ["vários exames na foto", motivoMultiplos(["Exame A", "Exame B"])],
  ["cancelamento", motivoAlteracao("cancelamento")],
  ["remarcação", motivoAlteracao("remarcacao")],
  ["telefone não atualizado", motivoTelefoneNaoAtualizado("ERRO_TESTE", false)],
  ["encaminhamento obrigatório no cadastro", motivoRegraHumano([{ nome: "Exame Teste" }])],
  [
    "horários habituais",
    "HORARIOS_HABITUAIS_NAO_INFORMADOS: Profissional Teste. A equipe deve conferir a escala.",
  ],
  ["urgência (Jev)", "JEV_URGENCIA_CLINICA: dor no peito"],
  ["pedido de atendente (Jev)", "JEV_PEDIDO_ATENDENTE: pediu atendente"],
  ["irritação (Jev)", "JEV_IRRITACAO: paciente irritado"],
  ["dúvida repetida (Jev)", "JEV_DUVIDA_REPETIDA: não entendeu"],
  ["modalidade não definida", "MODALIDADE_NAO_DEFINIDA: consulta"],
];

describe("motivos de transferência das regras da Nina", () => {
  test.each(MOTIVOS_DAS_REGRAS)("%s tem texto para a equipe", (_, motivo) => {
    const texto = motivoParaAtendimento(motivo);
    expect(texto).toBeTruthy();
    expect(texto).not.toContain(GENERICO);
  });

  test("agendamento informa o atendimento que a equipe vai confirmar", () => {
    const texto = motivoParaAtendimento(
      "AGENDAMENTO_TRANSICAO: Consulta — Pediatria; PROFISSIONAL TESTE.",
    )!;
    expect(texto).toContain("deseja agendar");
    expect(texto).toContain("Detalhe: Consulta — Pediatria; PROFISSIONAL TESTE.");
  });
});
