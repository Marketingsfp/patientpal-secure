/** Informações públicas confirmadas pelo responsável em 21/09/2026.
 * Diretório informativo: não altera a clínica operacional, Agenda ou métricas.
 */
import { horarioOficialDoDia, semanaOficial } from "./horario-oficial";
import type { CalendarioPublicado } from "./classificador-periodo";
type Dia = { dia: string; fechado: boolean; faixas: { inicio: string; fim: string }[] };
const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function semana(inicio: string, fim: string, sabadoFim: string, quartaFim = fim): Dia[] {
  return dias.map((dia, i) => ({
    dia,
    fechado: i === 0,
    faixas: i === 0 ? [] : [{ inicio, fim: i === 6 ? sabadoFim : i === 3 ? quartaFim : fim }],
  }));
}

export const CLINICAS_GRUPO = [
  {
    id: "7570ddde-8c1c-4b55-ba72-cf12b2a6c940",
    chave: "menino_jesus",
    nome: "Policlínica Menino Jesus",
    aliases: ["menino jesus", "policlinica menino jesus"],
    endereco: "Rua Expedicionários, 148 — Centro, São João de Meriti — RJ",
    cep: "25520-591",
    telefone: "(21) 2655-1085",
    semana: semana("07:00", "18:00", "14:00"),
  },
  {
    id: "1d3c4f34-2a0f-40fa-b39a-3609677a11a5",
    chave: "sao_francisco_de_paula",
    nome: "Policlínica São Francisco de Paula",
    aliases: [
      "sao francisco de paula",
      "policlinica sao francisco de paula",
      "sao francisco",
      "sfp",
    ],
    endereco: "Avenida Comendador Teles, 2414 — Vilar dos Teles, São João de Meriti — RJ",
    cep: "25561-162",
    telefone: "(21) 2699-1990",
    semana: semana("06:00", "19:00", "14:00", "21:00"),
  },
  {
    id: "e9e41341-0e53-4216-8284-caeeaf6fb887",
    chave: "consulta_hoje",
    nome: "Clínica Consulta Hoje",
    aliases: ["consulta hoje", "clinica consulta hoje", "clinica hoje"],
    endereco: "Rua Mercedes, 75 — Centro, Queimados — RJ",
    cep: "26325-320",
    telefone: "(21) 97377-5431",
    semana: semana("08:00", "17:00", "12:00"),
  },
] as const;

export const PARAMETRO_CLINICA_INFORMATIVA = {
  type: "string",
  description:
    "Clínica mencionada pelo paciente ou já definida no assunto. Use menino_jesus, sao_francisco_de_paula, consulta_hoje ou todas (se pediu o conjunto). Omita para a clínica do atendimento. 'Filial', 'outra clínica' ou referência ambígua exigem esclarecer o nome; não escolha sozinho. Não altera onde o agendamento será feito.",
};

export const REGRA_INFORMACOES_GRUPO = `INSTRUÇÃO INST-01 — INFORMAÇÕES PÚBLICAS DAS CLÍNICAS DO GRUPO
Tipo: ESSENCIAL.
Aplica-se: localização, contato e funcionamento das clínicas identificadas no diretório do grupo.
Conduta:
- Para endereço, CEP, telefone ou unidades do grupo, chame dados_da_clinica. Para funcionamento, chame horario_funcionamento. Não pesquise endereço ou nome da clínica como se fosse um procedimento.
- O grupo informado pelo diretório reúne Policlínica Menino Jesus, Policlínica São Francisco de Paula e Clínica Consulta Hoje. Use o parâmetro clinica para a unidade mencionada ou já definida na conversa; use todas somente quando o paciente pedir o conjunto. Sem referência a outra unidade, use a clínica deste atendimento. Se não for possível determinar qual unidade foi mencionada, pergunte qual delas.
- Informe apenas os dados pertinentes à pergunta e identifique a clínica. Confira se a unidade retornada corresponde à solicitada; um retorno de outra unidade não responde ao pedido. O diretório público confirmado é a referência para contato e localização, mesmo se o cadastro administrativo estiver incompleto ou desatualizado. Esses dados institucionais não exigem localizar procedimento ou profissional no catálogo; ausência de procedimento não é motivo para transferir essa pergunta.
- Os horários do diretório são habituais de funcionamento presencial. Não equivalem a disponibilidade de profissional, vaga, horário das atendentes no WhatsApp ou confirmação de abertura em feriado/data excepcional. Para uma data específica, respeite encontrado e as exceções retornadas; sem confirmação, informe apenas o horário habitual e ofereça confirmar com a equipe.
- Os números cadastrados são telefones de contato; não os anuncie como WhatsApp sem confirmação. Não invente endereço, telefone, feriados, serviços, profissionais ou preços de outra unidade.
- Informar outra clínica não transfere a conversa, não muda a identidade da Nina e não autoriza consultar pacientes ou agendar fora da clínica operacional. Esse diretório contém somente informações públicas.`;

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();

export function dadosPublicosClinicaGrupo(clinicaId: string) {
  const c = CLINICAS_GRUPO.find((c) => c.id === clinicaId);
  return c
    ? {
        nome_oficial: c.nome,
        nome_curto: c.nome,
        endereco: `${c.endereco} — CEP ${c.cep}`,
        telefone: c.telefone,
        fonte_contato: "diretorio_publico_confirmado_2026-09-21",
      }
    : null;
}

/** Nome é um seletor de informações públicas, nunca um novo escopo operacional. */
export function selecionarClinicasGrupo(clinicaId: string, solicitada?: unknown) {
  const atual = CLINICAS_GRUPO.find((c) => c.id === clinicaId);
  if (!atual) return null;
  if (solicitada == null || solicitada === "") return [atual];
  if (typeof solicitada !== "string") return [];
  const chave = normalizar(solicitada);
  if (chave === "todas") return [...CLINICAS_GRUPO];
  return CLINICAS_GRUPO.filter(
    (c) => normalizar(c.chave) === chave || c.aliases.some((alias) => alias === chave),
  );
}

/** null mantém o cadastro tradicional das clínicas que não integram este grupo. */
export function consultarDadosClinicasGrupo(clinicaId: string, solicitada?: unknown) {
  const selecionadas = selecionarClinicasGrupo(clinicaId, solicitada);
  if (selecionadas === null) return null;
  if (!selecionadas.length)
    return {
      ok: true as const,
      encontrado: false,
      clinicas: [],
      instrucao: `Pergunte a qual clínica o paciente se refere: ${CLINICAS_GRUPO.map((c) => c.nome).join(", ")}. Não presuma a clínica do atendimento para uma referência ambígua.`,
    };
  const clinicas = selecionadas.map((c) => ({
    chave: c.chave,
    nome: c.nome,
    endereco: c.endereco,
    cep: c.cep,
    telefone: c.telefone,
    whatsapp_confirmado: false,
  }));
  return {
    ok: true as const,
    encontrado: true,
    fonte: "diretorio_publico_confirmado_2026-09-21",
    clinicas,
    ...(clinicas.length === 1 ? { clinica: clinicas[0] } : {}),
    instrucao:
      "Informe os dados solicitados, identificando a clínica. Telefone de contato não confirma WhatsApp. Esta consulta não muda a clínica operacional nem comprova serviços ou vagas em outra unidade.",
  };
}

export function consultarHorariosClinicasGrupo(
  clinicaId: string,
  solicitada?: unknown,
  data?: unknown,
  calendarios: CalendarioPublicado[] = [],
  referencia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
) {
  const selecionadas = selecionarClinicasGrupo(clinicaId, solicitada);
  if (selecionadas === null) return null;
  if (!selecionadas.length) return consultarDadosClinicasGrupo(clinicaId, solicitada);
  const alvo = typeof data === "string" && data ? data : referencia;
  const clinicas = selecionadas.map((c) => {
    const escopo = { clinica_id: c.id, unidade_id: null };
    const oficial = semanaOficial({ referencia: alvo, escopo, calendarios });
    const dia = horarioOficialDoDia({ data: alvo, escopo, calendarios });
    const conflito = oficial.motivo === "conflito_de_configuracao";
    return {
      chave: c.chave,
      nome: c.nome,
      semana: conflito
        ? []
        : oficial.encontrado
          ? oficial.dias.map((d) => ({
              dia: dias[d.dia_semana],
              fechado: d.fechado,
              faixas: d.faixas,
            }))
          : c.semana,
      dia: {
        encontrado: dia.encontrado,
        fechado: dia.fechado,
        faixas: dia.faixas,
        excecao: dia.excecao,
        motivo: dia.motivo,
      },
      fonte_horario: conflito
        ? "conflito_de_configuracao"
        : oficial.encontrado
          ? "calendario_publicado"
          : "diretorio_publico_confirmado_2026-09-21",
      versao_calendario: dia.versao,
    };
  });
  return {
    ok: true as const,
    fonte: "diretorio_publico_confirmado_2026-09-21",
    fuso: "America/Sao_Paulo",
    horario_habitual: true,
    clinicas,
    ...(clinicas.length === 1 ? { semana: clinicas[0].semana, dia: clinicas[0].dia } : {}),
    data: typeof data === "string" && data ? data : null,
    instrucao:
      "Informe a semana como funcionamento presencial habitual. Para uma data específica, só confirme abertura/fechamento quando dia.encontrado=true, respeitando as exceções do calendário publicado. Sem essa confirmação, informe apenas a rotina e ofereça confirmar feriados/exceções com a equipe. Não equivalem a vagas nem ao horário do atendimento humano no WhatsApp.",
  };
}
