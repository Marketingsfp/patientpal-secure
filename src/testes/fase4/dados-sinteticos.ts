/**
 * FASE 4 — dados sintéticos dos cenários reprodutíveis.
 *
 * Nada aqui toca banco, rede ou navegador: são apenas registros fictícios,
 * estáveis e nomeados, usados pelos testes de contrato. Os identificadores
 * são fixos para que qualquer execução produza exatamente o mesmo resultado.
 *
 * Regra: nome fictício sempre com o prefixo "TESTE" para nunca ser confundido
 * com paciente real em nenhuma evidência.
 */

export const CLINICA_TESTE = "11111111-1111-1111-1111-111111111111";

export const CONVERSA_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const CONVERSA_B = "bbbbbbbb-0000-4000-8000-000000000002";
export const CONVERSA_SEM_NOME = "cccccccc-0000-4000-8000-000000000003";

export const ATENDENTE_ONLINE = "dddddddd-0000-4000-8000-000000000010";
export const ATENDENTE_PAUSA = "dddddddd-0000-4000-8000-000000000011";
export const ATENDENTE_OFFLINE = "dddddddd-0000-4000-8000-000000000012";
export const ADMIN = "dddddddd-0000-4000-8000-000000000013";

/** Conversas como a Inbox as recebe (com o vínculo de paciente embutido). */
export const conversas = {
  /** Vínculo explícito com paciente: o nome do paciente manda. */
  comPaciente: {
    id: CONVERSA_A,
    contato_nome: "5511999990001",
    contato_telefone: "+55 11 99999-0001",
    pacientes: { nome: "TESTE Maria Aparecida da Silva Sauro" },
  },
  /** Sem vínculo, mas com nome de verdade gravado na conversa. */
  comNomeDoContato: {
    id: CONVERSA_B,
    contato_nome: "TESTE João Batista",
    contato_telefone: "+55 11 99999-0002",
    pacientes: null,
  },
  /** Só telefone: a tela mostra "Paciente não identificado". */
  semNome: {
    id: CONVERSA_SEM_NOME,
    contato_nome: "+55 11 99999-0003",
    contato_telefone: "+55 11 99999-0003",
    pacientes: null,
  },
} as const;

/** Equipe sintética, com perfil e presença. */
export const equipe = [
  { id: ATENDENTE_ONLINE, nome: "TESTE Atendente Online", role: "atendente" },
  { id: ATENDENTE_PAUSA, nome: "TESTE Atendente Pausa", role: "atendente" },
  { id: ATENDENTE_OFFLINE, nome: "TESTE Atendente Offline", role: "atendente" },
  { id: ADMIN, nome: "TESTE Administradora", role: "admin" },
] as const;

const agora = () => new Date().toISOString();
const minutosAtras = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const presenca = {
  online: { status: "ONLINE", vistoEm: agora(), emPausa: false },
  pausa: { status: "ONLINE", vistoEm: agora(), emPausa: true },
  /** Heartbeat vencido (a janela válida é de 5 minutos). */
  offline: { status: "ONLINE", vistoEm: minutosAtras(30), emPausa: false },
  nuncaVisto: { status: null, vistoEm: null, emPausa: false },
} as const;

/** Catálogo sintético: um exame com valores diferentes por forma de pagamento. */
export const servicoPublicado = {
  id: "eeeeeeee-0000-4000-8000-000000000020",
  nome: "TESTE Ultrassonografia de Abdome Total",
  valor: null,
  valor_observacao: "Valor sujeito a confirmação na recepção.",
  descricao_publica: "Exame de imagem do abdome.",
  preparo: "Jejum de 8 horas e bexiga cheia.",
  restricoes: "Não realizar em gestantes acima de 20 semanas.",
  executantes: [{ nome: "TESTE Dr. Carlos Andrade" }],
  formas_pagamento: [
    { forma: "Dinheiro/PIX", valor: 180 },
    { forma: "Cartão de crédito", valor: 210, condicao: "até 3x" },
  ],
} as const;

/** Profissional sintético com atendimento quinzenal e aviso com validade. */
export const profissionalPublicado = {
  id: "ffffffff-0000-4000-8000-000000000021",
  nome: "TESTE Dra. Helena Prado",
  especialidades: [{ nome: "Cardiologia" }],
  atende_consultorio: true,
  formas_pagamento: [{ forma: "Dinheiro/PIX", valor: 300 }],
  convenios: [{ nome: "TESTE Convênio Vida" }],
  horarios: [{ dia: "Quinta", inicio: "08:00", fim: "12:00", recorrencia: "quinzenal" }],
  tipo_atendimento: "Consulta",
  observacao_publica: "Atende quinzenalmente.",
  aviso_dia: "Nesta semana o atendimento começa às 09:00.",
  aviso_valido_de: "2026-01-10",
  aviso_valido_ate: "2026-01-20",
  unidades: { nome: "TESTE Unidade Centro" },
} as const;
