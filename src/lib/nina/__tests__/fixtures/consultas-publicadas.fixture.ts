// Estrutura pública dos casos diagnosticados em 22/09/2026, sem dados de pacientes.
export const cardiologiaAlex = {
  nome: "Alex Louza",
  tipo_atendimento: "Consulta",
  especialidades: [{ nome: "CARDIOLOGIA" }, { nome: "CLINICO GERAL" }, { nome: "CARDIOLOGIA INFANTIL" }],
  observacao_publica: [
    "CONSULTA CARDIOLOGIA\nEspecialidade: CARDIOLOGIA\nIdade/critério informado: a partir de 15 anos\nDinheiro: R$ 120,00\nPix/cartão: R$ 145,00\nObservação: Agendado",
    "CONSULTA CARDIOLOGIA INFANTIL\nEspecialidade: CARDIOLOGIA\nIdade/critério informado: a partir de 1 mês\nDinheiro: R$ 160,00\nPix/cartão: R$ 190,00\nObservação: Agendado",
    "CONSULTA CLÍNICO GERAL\nEspecialidade: CLÍNICO GERAL\nIdade/critério informado: a partir de 15 anos\nDinheiro: R$ 120,00\nPix/cartão: R$ 145,00\nObservação: Agendado",
  ].join("\n\n"),
};

export const avaliacaoOdontologica = (nome: string, dias: string) => ({
  nome, tipo_atendimento: "Avaliação odontológica", especialidades: [{ nome: "ODONTOLOGIA" }],
  observacao_publica: `AVALIAÇÃO ODONTOLÓGICA\nEspecialidade: ODONTOLOGIA\nProfissional: ${nome}\nDias e horários: Sob consulta\nIdade/critério informado: -\nDinheiro: Gratuito\nPix/cartão: Gratuito\nObservação: Ordem de Chegada\nPode chegar até que horas: Até 17h\n\n` +
    `ATENDIMENTO\nEspecialidade: ODONTOLOGIA\nProfissional: ${nome}\nDias e horários: ${dias}\nIdade/critério informado: Não informado\nDinheiro: Não informado\nPix/cartão: Não informado\nObservação: Não informada\nPode chegar até que horas: Não informado`,
});

export const consultaPreventivo = {
  tipo_atendimento: "Consulta", especialidades: [{ nome: "GINECOLOGIA" }, { nome: "CLINICO GERAL" }],
  observacao_publica: "CONSULTA CLÍNICO GERAL\nEspecialidade: CLÍNICO GERAL\nDinheiro: R$ 120,00\nObservação: Agendado\n\n" +
    "CONSULTA + PREVENTIVO\nEspecialidade: GINECOLOGIA\nDinheiro: R$ 172,00\nPix/cartão: R$ 205,00\nObservação: Agendado",
};
