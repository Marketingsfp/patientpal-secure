/**
 * Monta as instruções da ligação de demonstração com as MESMAS fontes do
 * WhatsApp (`whatsapp.server.ts`, gerarRespostaNinaInterno):
 *   - instruções publicadas na Arquitetura (`promptInstrucoes("whatsapp")`);
 *   - identidade efetiva da mesma versão;
 *   - regras do turno no contrato de precedência (`resolverPrecedenciaDoTurno`);
 *   - envelope técnico e contexto de fatos (`comporRequestNina`).
 *
 * Diferenças, todas do canal: formato de celular/áudio vira REGRA_CANAL_VOZ;
 * a foto do pedido médico vira REGRA_PEDIDO_MEDICO_LIGACAO; os fluxos que o
 * WhatsApp garante por código entram como REGRA_FLUXO_SISTEMA_LIGACAO. Regras
 * que dependem do estado de uma conversa já em andamento (transferência
 * aguardando dados, leitura ampliada do Jev) não se aplicam ao início da ligação.
 *
 * O teste `ligacao-contrato.test.ts` compara esta lista com a do WhatsApp para
 * que uma regra nova no chat não fique de fora da ligação sem decisão.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { agoraParaNina, saudacaoPorHorarioServidor, type SaudacaoPeriodo } from "@/lib/nina-agora";
import { promptInstrucoes } from "../instrucoes-runtime.server";
import { PROMPT_NINA_WHATSAPP_V4 } from "../prompt/behavior-v4";
import {
  resolverIdentidadeEfetiva,
  valoresIdentidade,
  fatosIdentidade,
} from "../identidade-efetiva";
import { dadosPublicosClinicaGrupo } from "../clinicas-grupo";
import { ferramentasAgendaAtivas } from "../agenda-flag.server";
import { contarCatalogoPublicado } from "../catalogo-prompt.server";
import {
  TRANSICAO_AGENDAMENTO_ATIVA,
  REGRA_TRANSICAO_AGENDAMENTO,
  REGRA_AGENDAMENTO_POR_ITEM,
} from "../transicao-agendamento";
import { REGRA_INFORMACAO_NAO_CADASTRADA } from "../informacao-nao-cadastrada";
import { regraSaudacaoPeriodo } from "../resposta/saudacao-periodo";
import { REGRA_CARTAO_CONSULTA } from "../cartao-consulta";
import { REGRA_CANCELAMENTO_REMARCACAO } from "../cancelamento-remarcacao";
import { REGRA_SEM_INDICACAO, FERRAMENTA_NOME_ATENDIMENTO } from "../atendimento-sem-indicacao";
import { REGRA_DUAS_FALHAS_ENTENDIMENTO } from "../jev-encaminhamento";
import { REGRA_EFICIENCIA_CONSULTAS, REGRA_MODALIDADES_PAGAMENTO } from "../eficiencia-turno";
import {
  REGRA_HORARIOS_HABITUAIS_PRIMEIRO,
  REGRA_SOMENTE_PRIMEIRO_HORARIO,
} from "../prompt/consulta-agenda";
import { REGRA_SELECAO_ATENDIMENTO_CONSULTA } from "../atendimento-consulta";
import { REGRA_ESCOLHA_PROFISSIONAL_NOMINAL } from "../prompt/regras-catalogo";
import {
  REGRA_IDADE_NAO_INFORMADA,
  REGRA_DEBITO_CREDITO,
  REGRA_ACOMPANHANTE,
  REGRA_EXPLICACAO_ESPECIALIDADE,
  REGRA_AGENDAMENTO_PELA_EQUIPE,
  REGRA_GENERO_PROFISSIONAL,
} from "../regras-administrativas-confirmadas";
import { REGRA_PRESERVAR_RESERVA } from "../procedimento-sessao";
import { REGRA_CADASTRO_AGENDAMENTO } from "../cadastro-paciente";
import { REGRA_CONSULTA_CATALOGO } from "../catalogo-busca";
import { REGRA_IDENTIDADE_ATENDIMENTO } from "../prompt/identidade-atendimento";
import { REGRA_FINALIDADE_VACINA } from "../finalidade-vacina";
import { REGRA_IDENTIFICACAO_UNIFICADA } from "../identificacao-catalogo";
import { REGRA_DICIONARIO_PUBLICADO } from "../dicionario-leitura";
import {
  resolverPrecedenciaDoTurno,
  type InstrucaoAdicionalTurno,
} from "../prompt/precedencia-turno";
import { hashDoTexto } from "../confidence/hash";
import { comporRequestNina } from "../prompt-composer";
import { FERRAMENTAS_NINA_CONSULTA, FERRAMENTAS_NINA_PACIENTE } from "../paciente-tools.server";
import { semFerramentasDeVaga } from "../consulta-agenda";
import { FERRAMENTA_HANDOFF } from "../handoff-tool.server";
import {
  REGRA_CANAL_VOZ,
  REGRA_FLUXO_SISTEMA_LIGACAO,
  REGRA_PEDIDO_MEDICO_LIGACAO,
  REGRA_SIMULACAO_LIGACAO,
  instrucoesCamadaVoz,
} from "./regras-ligacao";
import type { ResumoInstrucoesLigacao } from "./config";

/**
 * Regras do WhatsApp que NÃO entram na ligação, com o motivo. Usada pelo teste
 * de paridade: um código novo no chat que não esteja aqui nem na lista da
 * ligação falha o teste.
 */
export const REGRAS_WHATSAPP_FORA_DA_LIGACAO: Record<string, string> = {
  RESPONDER_ANTES_DA_TRANSFERENCIA: "depende de uma transferência já aguardando dados",
  FORMATO_AUDIO: "substituída por CANAL_VOZ",
  FORMATO_MOBILE_OBRIGATORIO: "substituída por CANAL_VOZ",
  SOLICITAR_FOTO_PEDIDO_MEDICO: "substituída por PEDIDO_MEDICO_LIGACAO (decisão de 15/10/2026)",
};

/** Regras que só tratam de vagas e reserva (mesmo conjunto do WhatsApp). */
const SO_COM_AGENDA = new Set([
  "SOMENTE_PRIMEIRO_HORARIO",
  "TIPO_CONSULTA_ANTES_AGENDA",
  "ESCOLHA_ANTES_DOS_DETALHES",
  "CADASTRO_PESSOA_ATENDIDA",
]);

/** Lista do contrato da ligação, na mesma ordem e com os mesmos códigos do WhatsApp. */
export function instrucoesDaLigacao(o: {
  podeAgendar: boolean;
  baseConhecimento: boolean;
  saudacao: SaudacaoPeriodo;
}): InstrucaoAdicionalTurno[] {
  const regras: InstrucaoAdicionalTurno[] = [];
  if (!o.podeAgendar)
    regras.push({
      codigo: "TRANSICAO_AGENDAMENTO_HUMANO",
      nivel: "inegociavel",
      origem: "src/lib/nina/transicao-agendamento.ts",
      motivo:
        "Medida temporaria: a Nina informa; ordem de chegada comparece; os demais agendamentos vao para a equipe.",
      texto: REGRA_TRANSICAO_AGENDAMENTO,
    });
  else if (TRANSICAO_AGENDAMENTO_ATIVA)
    regras.push({
      codigo: "AGENDAMENTO_POR_ITEM",
      nivel: "inegociavel",
      origem: "src/lib/nina/transicao-agendamento.ts",
      motivo:
        "A Nina agenda somente os itens do catálogo marcados com 'Nina pode agendar' (regra de 12/10/2026).",
      texto: REGRA_AGENDAMENTO_POR_ITEM,
    });
  regras.push(
    {
      codigo: "INFORMACAO_NAO_CADASTRADA",
      nivel: "inegociavel",
      origem: "src/lib/nina/informacao-nao-cadastrada.ts",
      motivo:
        "Informação que o cadastro não traz é passada pela recepção, sem suposição nem menção a cadastro.",
      texto: REGRA_INFORMACAO_NAO_CADASTRADA,
    },
    {
      codigo: "SAUDACAO_PELO_HORARIO",
      nivel: "inegociavel",
      origem: "src/lib/nina/resposta/saudacao-periodo.ts",
      motivo:
        "A saudação segue o horário real do servidor (Brasília), não o cumprimento do paciente.",
      texto: regraSaudacaoPeriodo(o.saudacao),
    },
    {
      codigo: "CARTAO_CONSULTA_HUMANO",
      nivel: "inegociavel",
      origem: "src/lib/nina/cartao-consulta.ts",
      motivo: "Assuntos do cartão consulta são exclusivos da equipe humana.",
      texto: REGRA_CARTAO_CONSULTA,
    },
    {
      codigo: "CANCELAMENTO_REMARCACAO_HUMANO",
      nivel: "inegociavel",
      origem: "src/lib/nina/cancelamento-remarcacao.ts",
      motivo: "Cancelamentos e remarcações são exclusivos da equipe humana.",
      texto: REGRA_CANCELAMENTO_REMARCACAO,
    },
    {
      codigo: "SEM_INDICACAO_CLINICA",
      nivel: "inegociavel",
      origem: "src/lib/nina/atendimento-sem-indicacao.ts",
      motivo: "O paciente informa o atendimento; a Nina não faz indicação clínica.",
      texto: REGRA_SEM_INDICACAO,
    },
    {
      codigo: "ENTENDIMENTO_DUAS_FALHAS",
      nivel: "inegociavel",
      origem: "src/lib/nina/jev-encaminhamento.ts",
      motivo: "Regra confirmada: duas mensagens do paciente sem entendimento encaminham.",
      texto: REGRA_DUAS_FALHAS_ENTENDIMENTO,
    },
    {
      codigo: "CONSULTAS_SEM_REDUNDANCIA",
      origem: "src/lib/nina/eficiencia-turno.ts",
      motivo: "Reutilizar vínculos oficiais sem repetir pesquisas.",
      texto: REGRA_EFICIENCIA_CONSULTAS,
    },
    {
      codigo: "PAGAMENTO_COMPROVADO",
      nivel: "inegociavel",
      origem: "src/lib/nina/eficiencia-turno.ts",
      motivo: "Regra confirmada pelo responsável: Pix e cartão têm sempre o mesmo valor.",
      texto: REGRA_MODALIDADES_PAGAMENTO,
    },
    {
      codigo: "SOMENTE_PRIMEIRO_HORARIO",
      nivel: "inegociavel",
      origem: "src/lib/nina/prompt/consulta-agenda.ts",
      motivo: "Pedido pela primeira vaga não solicita uma lista de alternativas.",
      texto: REGRA_SOMENTE_PRIMEIRO_HORARIO,
    },
    {
      codigo: "TIPO_CONSULTA_ANTES_AGENDA",
      nivel: "inegociavel",
      origem: "src/lib/nina/atendimento-consulta.ts",
      motivo: "Distinguir consulta, revisão e noturna antes de vincular vagas.",
      texto: REGRA_SELECAO_ATENDIMENTO_CONSULTA,
    },
    {
      codigo: "IDADE_NAO_INFORMADA_SEM_RESTRICAO",
      nivel: "inegociavel",
      origem: "src/lib/nina/regras-administrativas-confirmadas.ts",
      motivo: "Regra confirmada: campo de idade não informado não cria restrição etária.",
      texto: REGRA_IDADE_NAO_INFORMADA,
    },
    {
      codigo: "DEBITO_CREDITO_VALOR_CARTAO",
      nivel: "inegociavel",
      origem: "src/lib/nina/regras-administrativas-confirmadas.ts",
      motivo: "Regra confirmada em 14/10/2026: débito e crédito usam o valor de Pix/cartão.",
      texto: REGRA_DEBITO_CREDITO,
    },
    {
      codigo: "ACOMPANHANTE_PERMITIDO",
      nivel: "inegociavel",
      origem: "src/lib/nina/regras-administrativas-confirmadas.ts",
      motivo: "Regra confirmada em 14/10/2026: acompanhante e responsável podem acompanhar.",
      texto: REGRA_ACOMPANHANTE,
    },
    {
      codigo: "EXPLICACAO_GERAL_CURTA",
      nivel: "inegociavel",
      origem: "src/lib/nina/regras-administrativas-confirmadas.ts",
      motivo: "Regra confirmada em 14/10/2026: explicação geral curta, sem orientação clínica.",
      texto: REGRA_EXPLICACAO_ESPECIALIDADE,
    },
    {
      codigo: "AGENDAMENTO_PELA_EQUIPE_NA_LISTA",
      nivel: "inegociavel",
      origem: "src/lib/nina/regras-administrativas-confirmadas.ts",
      motivo:
        "Regra confirmada em 14/10/2026: profissional de atendimento humano obrigatório aparece com aviso.",
      texto: REGRA_AGENDAMENTO_PELA_EQUIPE,
    },
    {
      codigo: "GENERO_DO_CADASTRO_DO_MEDICO",
      nivel: "inegociavel",
      origem: "src/lib/nina/regras-administrativas-confirmadas.ts",
      motivo: "Regra confirmada em 14/10/2026: médica/médico e Dr./Dra. pelo cadastro do médico.",
      texto: REGRA_GENERO_PROFISSIONAL,
    },
    {
      codigo: "PEDIDOS_PARALELOS_PRESERVAM_RESERVA",
      nivel: "inegociavel",
      origem: "src/lib/nina/procedimento-sessao.ts",
      motivo: "Perguntas sobre outros exames não apagam a escolha ou o aceite do resumo entregue.",
      texto: REGRA_PRESERVAR_RESERVA,
    },
    {
      codigo: "ESCOLHA_PROFISSIONAL_NOMINAL",
      nivel: "inegociavel",
      origem: "src/lib/nina/prompt/regras-catalogo.ts",
      motivo: "Setores e equipes não são opções de médicos para o paciente escolher.",
      texto: REGRA_ESCOLHA_PROFISSIONAL_NOMINAL,
    },
    {
      codigo: "ESCOLHA_ANTES_DOS_DETALHES",
      nivel: "inegociavel",
      origem: "src/lib/nina/prompt/consulta-agenda.ts",
      motivo:
        "No agendamento, perguntar primeiro pela primeira vaga ou escolha dos profissionais; detalhar conforme a preferência.",
      texto: REGRA_HORARIOS_HABITUAIS_PRIMEIRO,
    },
    {
      codigo: "CADASTRO_PESSOA_ATENDIDA",
      nivel: "inegociavel",
      origem: "src/lib/nina/cadastro-paciente.ts",
      motivo: "Dados da pessoa atendida com o WhatsApp do remetente, inclusive responsáveis.",
      texto: REGRA_CADASTRO_AGENDAMENTO,
    },
    {
      codigo: "CANAL_VOZ",
      nivel: "inegociavel",
      origem: "src/lib/nina/ligacao/regras-ligacao.ts",
      motivo: "Na ligação a resposta é falada: substitui o formato de celular e de áudio.",
      texto: REGRA_CANAL_VOZ,
    },
    {
      codigo: "CATALOGO_UMA_LEITURA_POR_RESPOSTA",
      origem: "src/lib/nina/catalogo-busca.ts",
      motivo: "Reutilizar a leitura do catálogo entre ferramentas e revisões desta resposta.",
      texto: REGRA_CONSULTA_CATALOGO,
    },
    {
      codigo: "PRESERVAR_IDENTIDADE_ATENDIMENTO",
      origem: "src/lib/nina/prompt/identidade-atendimento.ts",
      motivo:
        "Preservar Clínico Geral e separar a consulta da escolha do profissional nas pesquisas.",
      texto: REGRA_IDENTIDADE_ATENDIMENTO,
    },
    {
      codigo: "FINALIDADE_VACINA",
      nivel: "inegociavel",
      origem: "src/lib/nina/finalidade-vacina.ts",
      motivo: "Preservar vacinação e distinguir falta de informação de dúvida de identificação.",
      texto: REGRA_FINALIDADE_VACINA,
    },
    {
      codigo: "IDENTIFICACAO_UNIFICADA",
      nivel: "inegociavel",
      origem: "src/lib/nina/identificacao-catalogo.ts",
      motivo: "Confirmação de candidatos e uma releitura inconclusiva antes do encaminhamento.",
      texto: REGRA_IDENTIFICACAO_UNIFICADA,
    },
  );
  if (o.baseConhecimento)
    regras.push(
      {
        codigo: "PEDIDO_MEDICO_LIGACAO",
        nivel: "inegociavel",
        origem: "src/lib/nina/ligacao/regras-ligacao.ts",
        motivo: "Na ligação não há como receber foto: o pedido segue pelo WhatsApp (15/10/2026).",
        texto: REGRA_PEDIDO_MEDICO_LIGACAO,
      },
      {
        codigo: "CONSULTAR_DICIONARIO_PUBLICADO",
        origem: "src/lib/nina/dicionario-leitura.ts",
        motivo:
          "Consultar as variações publicadas antes de interpretar consultas, exames e procedimentos.",
        texto: REGRA_DICIONARIO_PUBLICADO,
      },
    );
  regras.push(
    {
      codigo: "FLUXO_SISTEMA_LIGACAO",
      nivel: "inegociavel",
      origem: "src/lib/nina/ligacao/regras-ligacao.ts",
      motivo: "Fluxos que o WhatsApp garante por código, escritos para a ligação.",
      texto: REGRA_FLUXO_SISTEMA_LIGACAO,
    },
    {
      codigo: "SIMULACAO_LIGACAO",
      nivel: "inegociavel",
      origem: "src/lib/nina/ligacao/regras-ligacao.ts",
      motivo: "Na demonstração, agendar, identificar e encaminhar são simulados.",
      texto: REGRA_SIMULACAO_LIGACAO,
    },
  );
  return o.podeAgendar ? regras : regras.filter((r) => !SO_COM_AGENDA.has(r.codigo));
}

type FerramentaChat = { type: "function"; function: { name: string } };

/** Mesmo conjunto de ferramentas do WhatsApp (`whatsapp.server.ts`). */
export function ferramentasDaLigacao(podeAgendar: boolean): readonly FerramentaChat[] {
  const base = podeAgendar
    ? FERRAMENTAS_NINA_PACIENTE
    : semFerramentasDeVaga(FERRAMENTAS_NINA_CONSULTA);
  return [...base, FERRAMENTA_HANDOFF, FERRAMENTA_NOME_ATENDIMENTO] as readonly FerramentaChat[];
}

async function dadosDaUnidade(clinicaId: string) {
  const { data, error } = await supabaseAdmin
    .from("clinicas")
    .select("nome, endereco, cidade, estado, cep, telefone, email")
    .eq("id", clinicaId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar os dados da clínica.");
  const nome = data?.nome ?? "esta unidade";
  const endereco = [
    data?.endereco,
    [data?.cidade, data?.estado].filter(Boolean).join("/"),
    data?.cep,
  ]
    .filter((p) => p && String(p).trim())
    .join(" - ");
  return {
    nome_oficial: nome,
    nome_curto:
      String(nome)
        .split(/\s+[—–-]\s+/)[0]
        ?.trim() || nome,
    endereco: endereco || null,
    telefone: data?.telefone ?? null,
    email: data?.email ?? null,
    ...dadosPublicosClinicaGrupo(clinicaId),
  };
}

export type SessaoLigacaoMontada = {
  instrucoesVoz: string;
  instrucoesApoio: string;
  ferramentas: readonly FerramentaChat[];
  podeAgendar: boolean;
  resumo: ResumoInstrucoesLigacao;
};

/** Instruções e ferramentas de uma ligação, lidas no momento em que ela começa. */
export async function montarSessaoLigacao(clinicaId: string): Promise<SessaoLigacaoMontada> {
  const valoresNeutros = valoresIdentidade(
    resolverIdentidadeEfetiva({ template: "", origem: "codigo", versao: null, versaoId: null }),
  );
  const promptReserva = Object.entries(valoresNeutros).reduce(
    (texto, [marcador, valor]) => texto.split(marcador).join(valor),
    PROMPT_NINA_WHATSAPP_V4,
  );
  const [instrucoes, unidade, podeAgendar, catalogo] = await Promise.all([
    promptInstrucoes(
      "whatsapp",
      (template) =>
        valoresIdentidade(
          resolverIdentidadeEfetiva({
            template,
            origem: "publicada",
            versao: null,
            versaoId: null,
          }),
        ),
      promptReserva,
    ),
    dadosDaUnidade(clinicaId),
    ferramentasAgendaAtivas(clinicaId),
    contarCatalogoPublicado(clinicaId).catch(() => ({ selecao: undefined })),
  ]);
  const identidade = resolverIdentidadeEfetiva({
    template: instrucoes.template,
    origem: instrucoes.origem,
    versao: instrucoes.versao,
    versaoId: instrucoes.versaoId,
  });
  const regras = instrucoesDaLigacao({
    podeAgendar,
    baseConhecimento: catalogo.selecao?.fonte === "base_conhecimento",
    saudacao: saudacaoPorHorarioServidor(),
  });
  const precedencia = resolverPrecedenciaDoTurno({
    instrucoesAdicionais: regras,
    textoPublicado: instrucoes.texto,
    escopo: "whatsapp",
    hash: hashDoTexto(instrucoes.texto) ?? null,
    versao: instrucoes.versao != null ? String(instrucoes.versao) : null,
    versaoId: instrucoes.versaoId ?? null,
    publicadoEm: instrucoes.publicadoEm ?? null,
    mensagemPaciente: null,
    ambiente: "producao",
    // A ligação começa sempre com a apresentação, como uma sessão nova do chat.
    saudacaoObrigatoria: true,
    regrasPublicadasNoPrompt: true,
  });
  const request = comporRequestNina({
    behaviorPrompt: instrucoes.texto,
    contratoPrecedencia: precedencia.contrato,
    runtimeContext: {
      canal: "ligacao",
      ambiente: "producao",
      unidade,
      identidade_atendimento: fatosIdentidade(identidade),
      data_hora_atual: agoraParaNina(),
      pode_agendar: podeAgendar,
      sessao: { nova_sessao: true, saudacao_obrigatoria: precedencia.saudacaoObrigatoria },
    },
  });
  const ferramentas = ferramentasDaLigacao(podeAgendar);
  return {
    instrucoesVoz: instrucoesCamadaVoz(identidade.apresentacao.assistente, unidade.nome_curto),
    instrucoesApoio: request.systemPrompt,
    ferramentas,
    podeAgendar,
    resumo: {
      versaoPrompt: instrucoes.versao,
      origemPrompt: instrucoes.origem,
      podeAgendar,
      regras: ["PRIVACIDADE_PACIENTE", ...regras.map((r) => r.codigo)],
      ferramentas: ferramentas.map((f) => f.function.name),
    },
  };
}
