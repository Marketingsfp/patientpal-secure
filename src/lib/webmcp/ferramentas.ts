/**
 * WebMCP — Fase 3: catálogo de ferramentas do atendimento e da Nina.
 *
 * Cada ferramenta é um ADAPTADOR FINO sobre uma operação que já existe no
 * sistema (as mesmas funções usadas pela tela). Nada aqui reimplementa
 * distribuição, agendamento, publicação ou envio de mensagem, e não existe
 * ferramenta genérica de SQL, JavaScript ou requisição livre.
 *
 * Este módulo é puro: recebe os adaptadores por parâmetro, o que permite
 * testar contrato, permissão e erros sem navegador nem banco.
 */
import type { AmbienteWebmcp } from "./contexto";
import {
  ErroWebmcp,
  comoDado,
  exigirAmbienteDeTeste,
  exigirConversaDeTeste,
  exigirSessao,
  exigirUuid,
  filtrarCatalogo,
  sanitizarListaCatalogo,
  type EfeitoWebmcp,
  type LeadTesteResumo,
} from "./politica";
import type { EscopoAtualizacao } from "./atualizacao";

type Dados = Record<string, unknown>;
type Chamada = (dados: Dados) => Promise<unknown>;

/** Operações reais do sistema, injetadas pela camada de interface. */
export interface ApiWebmcp {
  listarConversas: Chamada;
  obterConversa: Chamada;
  listarMensagens: Chamada;
  listarEventos: Chamada;
  listarNotas: Chamada;
  criarNota: Chamada;
  listarUsuarios: Chamada;
  listarPresenca: Chamada;
  listarDepartamentos: Chamada;
  listarFilaHumana: Chamada;
  transferirConversa: Chamada;
  listarLeadsTeste: Chamada;
  historicoLeadTeste: Chamada;
  enviarMensagemTeste: Chamada;
  resolverConversaTeste: Chamada;
  listarCatalogo: Chamada;
  opcoesCatalogo: Chamada;
  salvarServicoCatalogo: Chamada;
  salvarProfissionalCatalogo: Chamada;
  alterarStatusCatalogo: Chamada;
  organizarTextoCatalogoIA: Chamada;
}

export interface DepsWebmcp {
  autenticado: boolean;
  clinicaId: string | null;
  ambiente: AmbienteWebmcp;
  api: ApiWebmcp;
  /** Seleção interna da Inbox (mesmo mecanismo da tela, sempre por id). */
  selecionarConversa: (conversaId: string) => void;
  /** Recarga incremental da tela após uma operação. */
  notificar: (escopo: EscopoAtualizacao) => void;
}

export interface FerramentaWebmcp {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; consequentialHint: boolean; untrustedContentHint: boolean };
  execute: (entrada: unknown) => Promise<string>;
}

/* ------------------------------------------------------------------ */
/* Utilidades de contrato                                              */
/* ------------------------------------------------------------------ */

const objeto = (props: Dados, obrigatorios: string[] = []): Dados => ({
  type: "object",
  properties: props,
  required: obrigatorios,
  additionalProperties: false,
});

const texto = (descricao: string, max = 2000) => ({ type: "string", description: descricao, maxLength: max });
const uuid = (descricao: string) => ({ type: "string", description: descricao });

function entradaComo(entrada: unknown): Dados {
  if (entrada == null) return {};
  if (typeof entrada !== "object" || Array.isArray(entrada)) {
    throw new ErroWebmcp("entrada_invalida", "A entrada deve ser um objeto.");
  }
  return entrada as Dados;
}

function textoObrigatorio(valor: unknown, campo: string, max: number): string {
  const s = typeof valor === "string" ? valor.trim() : "";
  if (!s) throw new ErroWebmcp("entrada_invalida", `Campo "${campo}" é obrigatório.`);
  if (s.length > max)
    throw new ErroWebmcp("entrada_invalida", `Campo "${campo}" excede ${max} caracteres.`);
  return s;
}

function inteiro(valor: unknown, padrao: number, min: number, max: number): number {
  if (valor == null) return padrao;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErroWebmcp("entrada_invalida", `Valor numérico fora do intervalo ${min}-${max}.`);
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Montagem                                                            */
/* ------------------------------------------------------------------ */

export function montarFerramentasWebmcp(deps: DepsWebmcp): FerramentaWebmcp[] {
  const { api } = deps;

  /** Envolve a execução: sessão, permissão, erro explícito e efeito rotulado. */
  const ferramenta = (
    def: {
      name: string;
      description: string;
      inputSchema: Dados;
      escrita: boolean;
      efeito: EfeitoWebmcp;
      permissao: string;
    },
    corpo: (entrada: Dados, clinicaId: string) => Promise<Dados>,
  ): FerramentaWebmcp => ({
    name: def.name,
    description: `${def.description} Permissão exigida: ${def.permissao}. Efeito: ${
      def.escrita ? "altera dados de homologação" : "somente leitura"
    }.`,
    inputSchema: def.inputSchema,
    annotations: {
      readOnlyHint: !def.escrita,
      consequentialHint: def.escrita,
      // Mensagens de paciente e textos do catálogo são dados, não instruções.
      untrustedContentHint: true,
    },
    execute: async (entrada: unknown) => {
      try {
        const clinicaId = exigirSessao(deps.clinicaId, deps.autenticado);
        if (def.escrita) exigirAmbienteDeTeste(deps.ambiente);
        const resultado = await corpo(entradaComo(entrada), clinicaId);
        return JSON.stringify(
          { ok: true, ferramenta: def.name, efeito: def.efeito, ...resultado },
          null,
          2,
        );
      } catch (e) {
        const erro = e as ErroWebmcp;
        return JSON.stringify(
          {
            ok: false,
            ferramenta: def.name,
            efeito: "nenhum",
            codigo: erro?.codigo ?? "falha",
            erro: comoDado(erro?.message ?? "Falha desconhecida.", 500),
          },
          null,
          2,
        );
      }
    },
  });

  /** Leads de homologação da clínica — fonte de verdade do que é conversa de teste. */
  const leadsDeTeste = async (clinicaId: string): Promise<LeadTesteResumo[]> => {
    const r = (await api.listarLeadsTeste({ clinicaId })) as { leads?: LeadTesteResumo[] };
    return r?.leads ?? [];
  };

  const alvoDeTeste = async (entrada: Dados, clinicaId: string): Promise<string> => {
    const conversaId = exigirUuid(entrada["conversaId"], "conversaId");
    return exigirConversaDeTeste(conversaId, await leadsDeTeste(clinicaId));
  };

  return [
    /* ---------------------------- Atendimento ---------------------------- */
    ferramenta(
      {
        name: "atendimento_listar_conversas",
        description:
          "Lista conversas de atendimento da clínica autorizada, com filtro de escopo, status e busca por nome, telefone ou número da conversa.",
        inputSchema: objeto({
          escopo: {
            type: "string",
            enum: ["minhas", "nina", "nao_atribuidas", "fechadas", "equipe", "todas"],
          },
          status: {
            type: "string",
            enum: ["bot_attending", "active", "waiting", "closed", "finished", "all"],
          },
          busca: texto("Nome, telefone ou número da conversa.", 120),
          limite: { type: "integer", minimum: 1, maximum: 100 },
        }),
        escrita: false,
        efeito: "leitura",
        permissao: "membro da clínica (escopos amplos exigem gestão)",
      },
      async (entrada, clinicaId) => {
        const r = (await api.listarConversas({
          clinicaId,
          escopo: (entrada["escopo"] as string) ?? "minhas",
          status: (entrada["status"] as string) ?? "all",
          ...(entrada["busca"] ? { busca: String(entrada["busca"]).slice(0, 120) } : {}),
          limit: inteiro(entrada["limite"], 30, 1, 100),
        })) as { conversas?: Dados[] };
        return { conversas: r?.conversas ?? [] };
      },
    ),

    ferramenta(
      {
        name: "atendimento_detalhar_conversa",
        description:
          "Detalha uma conversa pelo identificador: responsável, setor, status, protocolo, mensagens recentes e eventos da linha do tempo.",
        inputSchema: objeto(
          {
            conversaId: uuid("Identificador interno da conversa."),
            limiteMensagens: { type: "integer", minimum: 1, maximum: 200 },
          },
          ["conversaId"],
        ),
        escrita: false,
        efeito: "leitura",
        permissao: "membro da clínica com acesso à conversa",
      },
      async (entrada, clinicaId) => {
        const conversaId = exigirUuid(entrada["conversaId"], "conversaId");
        const limit = inteiro(entrada["limiteMensagens"], 40, 1, 200);
        const [conversa, mensagens, eventos] = await Promise.all([
          api.obterConversa({ clinicaId, conversaId }),
          api.listarMensagens({ clinicaId, conversaId, limit }),
          api.listarEventos({ clinicaId, conversaId }),
        ]);
        return { conversa, mensagens, eventos };
      },
    ),

    ferramenta(
      {
        name: "atendimento_listar_atendentes",
        description:
          "Lista atendentes da clínica com presença (online, pausa, offline), setores e fila de não atribuídas.",
        inputSchema: objeto({}),
        escrita: false,
        efeito: "leitura",
        permissao: "membro da clínica",
      },
      async (_entrada, clinicaId) => {
        const [usuarios, presenca, departamentos, fila] = await Promise.all([
          api.listarUsuarios({ clinicaId }),
          api.listarPresenca({ clinicaId }),
          api.listarDepartamentos({ clinicaId }),
          api.listarFilaHumana({ clinicaId, limit: 50 }),
        ]);
        return { usuarios, presenca, departamentos, fila_nao_atribuidas: fila };
      },
    ),

    ferramenta(
      {
        name: "atendimento_abrir_conversa",
        description:
          "Abre uma conversa na Inbox pela seleção interna existente, sem mudar de endereço e sem alterar responsável, fila ou status.",
        inputSchema: objeto({ conversaId: uuid("Identificador interno da conversa.") }, [
          "conversaId",
        ]),
        escrita: false,
        efeito: "operacao_concluida",
        permissao: "membro da clínica com acesso à conversa",
      },
      async (entrada, clinicaId) => {
        const conversaId = exigirUuid(entrada["conversaId"], "conversaId");
        // Revalida no backend que a conversa existe e é acessível nesta clínica.
        const conversa = await api.obterConversa({ clinicaId, conversaId });
        deps.selecionarConversa(conversaId);
        deps.notificar("atendimento");
        return { aberta: true, conversa };
      },
    ),

    ferramenta(
      {
        name: "atendimento_notas_conversa",
        description:
          "Lista as notas internas de uma conversa de homologação. Notas internas nunca são entregues à Nina.",
        inputSchema: objeto({ conversaId: uuid("Conversa de homologação.") }, ["conversaId"]),
        escrita: false,
        efeito: "leitura",
        permissao: "membro da clínica; restrito a conversas de teste",
      },
      async (entrada, clinicaId) => {
        const conversaId = await alvoDeTeste(entrada, clinicaId);
        return { notas: await api.listarNotas({ clinicaId, conversaId }) };
      },
    ),

    ferramenta(
      {
        name: "atendimento_criar_nota",
        description: "Cria uma nota interna em uma conversa de homologação.",
        inputSchema: objeto(
          { conversaId: uuid("Conversa de homologação."), conteudo: texto("Texto da nota.") },
          ["conversaId", "conteudo"],
        ),
        escrita: true,
        efeito: "operacao_concluida",
        permissao: "membro da clínica; restrito a conversas de teste e ambiente de homologação",
      },
      async (entrada, clinicaId) => {
        const conversaId = await alvoDeTeste(entrada, clinicaId);
        const conteudo = textoObrigatorio(entrada["conteudo"], "conteudo", 2000);
        const nota = await api.criarNota({ clinicaId, conversaId, conteudo });
        deps.notificar("atendimento");
        return { nota };
      },
    ),

    ferramenta(
      {
        name: "atendimento_transferir_conversa",
        description:
          "Transfere uma conversa de homologação para outro atendente ou setor usando a transferência real do sistema, que já bloqueia destinos inválidos e administradores.",
        inputSchema: objeto(
          {
            conversaId: uuid("Conversa de homologação."),
            paraUserId: uuid("Atendente destino (opcional)."),
            paraDepartamentoId: uuid("Setor destino (opcional)."),
            motivo: texto("Motivo da transferência.", 500),
          },
          ["conversaId"],
        ),
        escrita: true,
        efeito: "operacao_concluida",
        permissao:
          "regras de transferência do atendimento (gestão ou responsável); ambiente de homologação",
      },
      async (entrada, clinicaId) => {
        const conversaId = await alvoDeTeste(entrada, clinicaId);
        const paraUserId = entrada["paraUserId"]
          ? exigirUuid(entrada["paraUserId"], "paraUserId")
          : null;
        const paraDepartamentoId = entrada["paraDepartamentoId"]
          ? exigirUuid(entrada["paraDepartamentoId"], "paraDepartamentoId")
          : null;
        if (!paraUserId && !paraDepartamentoId) {
          throw new ErroWebmcp(
            "entrada_invalida",
            "Informe o atendente ou o setor de destino.",
          );
        }
        const resultado = await api.transferirConversa({
          clinicaId,
          conversaId,
          paraUserId,
          paraDepartamentoId,
          ...(entrada["motivo"] ? { motivo: String(entrada["motivo"]).slice(0, 500) } : {}),
        });
        deps.notificar("atendimento");
        return { resultado };
      },
    ),

    /* ------------------------- Homologação da Nina ------------------------ */
    ferramenta(
      {
        name: "nina_teste_listar_leads",
        description:
          "Lista os pacientes fictícios de homologação da Nina, com telefone sintético, sessão atual, conversa vinculada e total de mensagens.",
        inputSchema: objeto({}),
        escrita: false,
        efeito: "leitura",
        permissao: "membro da clínica",
      },
      async (_entrada, clinicaId) => ({ leads: await leadsDeTeste(clinicaId) }),
    ),

    ferramenta(
      {
        name: "nina_teste_enviar_mensagem",
        description:
          "Envia uma mensagem como paciente fictício pelo mecanismo existente de Mensagem teste e devolve a resposta produzida pela Nina. Não envia nada para telefone real. A chave de idempotência impede repetição da mesma mensagem.",
        inputSchema: objeto(
          {
            leadId: uuid("Lead de homologação."),
            texto: texto("Mensagem do paciente fictício."),
            tipo: { type: "string", enum: ["text", "audio", "image", "document", "sticker"] },
            chave: texto("Chave de idempotência única desta mensagem (6 a 80 caracteres).", 80),
          },
          ["leadId", "texto", "chave"],
        ),
        escrita: true,
        efeito: "operacao_concluida",
        permissao: "membro da clínica; ambiente de homologação",
      },
      async (entrada, clinicaId) => {
        const leadId = exigirUuid(entrada["leadId"], "leadId");
        const chave = textoObrigatorio(entrada["chave"], "chave", 80);
        if (chave.length < 6)
          throw new ErroWebmcp("entrada_invalida", 'Campo "chave" precisa de ao menos 6 caracteres.');
        const resultado = (await api.enviarMensagemTeste({
          clinicaId,
          leadId,
          tipo: (entrada["tipo"] as string) ?? "text",
          texto: comoDado(entrada["texto"], 2000),
          chave,
        })) as Dados;
        deps.notificar("teste-nina");
        return {
          duplicada: resultado?.["duplicada"] ?? false,
          resposta_da_nina: comoDado(resultado?.["reply"] ?? null),
          erro_do_fluxo: resultado?.["erro"] ?? null,
          bruto: resultado,
        };
      },
    ),

    ferramenta(
      {
        name: "nina_teste_historico",
        description:
          "Mostra o histórico do lead de homologação: mensagens, eventos operacionais, ferramentas usadas pela Nina e o desfecho (encaminhamento ou agendamento) registrado pelo backend.",
        inputSchema: objeto({ leadId: uuid("Lead de homologação.") }, ["leadId"]),
        escrita: false,
        efeito: "leitura",
        permissao: "membro da clínica",
      },
      async (entrada, clinicaId) => {
        const leadId = exigirUuid(entrada["leadId"], "leadId");
        const historico = (await api.historicoLeadTeste({ clinicaId, leadId })) as Dados;
        const conversaId = historico?.["conversaId"] as string | null;
        const conversa = conversaId
          ? await api.obterConversa({ clinicaId, conversaId }).catch(() => null)
          : null;
        return { historico, conversa_estado: conversa };
      },
    ),

    ferramenta(
      {
        name: "nina_teste_encerrar",
        description:
          "Encerra a conversa de homologação pelo fluxo existente de Resolver, iniciando uma nova sessão do mesmo lead. Não toca em outros atendimentos.",
        inputSchema: objeto(
          {
            leadId: uuid("Lead de homologação."),
            conversaId: uuid("Conversa a encerrar."),
            removerAgendamentos: {
              type: "boolean",
              description: "Remove da agenda os agendamentos criados nesta sessão de teste.",
            },
          },
          ["leadId", "conversaId"],
        ),
        escrita: true,
        efeito: "operacao_concluida",
        permissao: "membro da clínica; ambiente de homologação",
      },
      async (entrada, clinicaId) => {
        const leadId = exigirUuid(entrada["leadId"], "leadId");
        const conversaId = await alvoDeTeste(entrada, clinicaId);
        const resultado = await api.resolverConversaTeste({
          clinicaId,
          leadId,
          conversaId,
          removerAgendamentos: entrada["removerAgendamentos"] !== false,
        });
        deps.notificar("teste-nina");
        return { resultado };
      },
    ),

    /* ----------------------------- Catálogo ------------------------------ */
    ferramenta(
      {
        name: "catalogo_buscar",
        description:
          "Busca no catálogo estruturado da Nina (exames/procedimentos e consultas/profissionais) por nome e status. Notas internas não são retornadas.",
        inputSchema: objeto({
          tipo: { type: "string", enum: ["servico", "profissional", "todos"] },
          termo: texto("Parte do nome.", 120),
          status: { type: "string", enum: ["RASCUNHO", "PUBLICADO", "ARQUIVADO"] },
          limite: { type: "integer", minimum: 1, maximum: 100 },
        }),
        escrita: false,
        efeito: "leitura",
        permissao: "membro da clínica",
      },
      async (entrada, clinicaId) => {
        const r = (await api.listarCatalogo({ clinicaId })) as Dados;
        const tipo = (entrada["tipo"] as string) ?? "todos";
        const filtro = {
          termo: entrada["termo"] ? String(entrada["termo"]) : undefined,
          status: entrada["status"] ? String(entrada["status"]) : undefined,
          limite: inteiro(entrada["limite"], 30, 1, 100),
        };
        return {
          servicos:
            tipo === "profissional"
              ? []
              : filtrarCatalogo(sanitizarListaCatalogo(r?.["servicos"]), filtro),
          profissionais:
            tipo === "servico"
              ? []
              : filtrarCatalogo(sanitizarListaCatalogo(r?.["profissionais"]), filtro),
        };
      },
    ),

    ferramenta(
      {
        name: "catalogo_opcoes",
        description:
          "Lista as opções de vínculo do formulário do catálogo: procedimentos, médicos, especialidades, unidades e convênios cadastrados.",
        inputSchema: objeto({}),
        escrita: false,
        efeito: "leitura",
        permissao: "membro da clínica",
      },
      async (_entrada, clinicaId) => ({ opcoes: await api.opcoesCatalogo({ clinicaId }) }),
    ),

    ferramenta(
      {
        name: "catalogo_salvar_servico",
        description:
          "Cria ou edita um exame/procedimento do catálogo pelo mesmo salvamento do formulário. Sem publicar, a alteração fica em revisão.",
        inputSchema: objeto(
          {
            id: uuid("Registro existente (omitir para criar)."),
            publicar: { type: "boolean", description: "Publica após salvar." },
            dados: { type: "object", description: "Campos do formulário de exame/procedimento." },
          },
          ["dados"],
        ),
        escrita: true,
        efeito: "operacao_concluida",
        permissao: "administrador da clínica; ambiente de homologação",
      },
      async (entrada, clinicaId) => {
        const resultado = await api.salvarServicoCatalogo({
          clinicaId,
          id: entrada["id"] ? exigirUuid(entrada["id"], "id") : null,
          publicar: entrada["publicar"] === true,
          dados: entradaComo(entrada["dados"]),
        });
        deps.notificar("catalogo");
        return { resultado };
      },
    ),

    ferramenta(
      {
        name: "catalogo_salvar_profissional",
        description:
          "Cria ou edita uma consulta/profissional do catálogo pelo mesmo salvamento do formulário. Sem publicar, a alteração fica em revisão.",
        inputSchema: objeto(
          {
            id: uuid("Registro existente (omitir para criar)."),
            publicar: { type: "boolean", description: "Publica após salvar." },
            dados: { type: "object", description: "Campos do formulário de consulta/profissional." },
          },
          ["dados"],
        ),
        escrita: true,
        efeito: "operacao_concluida",
        permissao: "administrador da clínica; ambiente de homologação",
      },
      async (entrada, clinicaId) => {
        const resultado = await api.salvarProfissionalCatalogo({
          clinicaId,
          id: entrada["id"] ? exigirUuid(entrada["id"], "id") : null,
          publicar: entrada["publicar"] === true,
          dados: entradaComo(entrada["dados"]),
        });
        deps.notificar("catalogo");
        return { resultado };
      },
    ),

    ferramenta(
      {
        name: "catalogo_alterar_status",
        description:
          "Publica, volta para rascunho ou arquiva um registro do catálogo pelo fluxo existente de revisão.",
        inputSchema: objeto(
          {
            tipo: { type: "string", enum: ["servico", "profissional"] },
            id: uuid("Registro do catálogo."),
            status: { type: "string", enum: ["RASCUNHO", "PUBLICADO", "ARQUIVADO"] },
          },
          ["tipo", "id", "status"],
        ),
        escrita: true,
        efeito: "operacao_concluida",
        permissao: "administrador da clínica; ambiente de homologação",
      },
      async (entrada, clinicaId) => {
        const tipo = entrada["tipo"];
        const status = entrada["status"];
        if (tipo !== "servico" && tipo !== "profissional")
          throw new ErroWebmcp("entrada_invalida", 'Campo "tipo" inválido.');
        if (status !== "RASCUNHO" && status !== "PUBLICADO" && status !== "ARQUIVADO")
          throw new ErroWebmcp("entrada_invalida", 'Campo "status" inválido.');
        const resultado = await api.alterarStatusCatalogo({
          clinicaId,
          tipo,
          id: exigirUuid(entrada["id"], "id"),
          status,
        });
        deps.notificar("catalogo");
        return { resultado };
      },
    ),

    ferramenta(
      {
        name: "catalogo_organizar_ia",
        description:
          "Pede à IA que organize um texto livre nos campos do formulário do catálogo. Devolve apenas um rascunho para revisão: nada é gravado nem publicado por esta ferramenta.",
        inputSchema: objeto(
          {
            tipo: { type: "string", enum: ["servico", "profissional"] },
            texto: texto("Texto livre a organizar.", 20000),
          },
          ["tipo", "texto"],
        ),
        escrita: true,
        efeito: "operacao_iniciada",
        permissao: "administrador da clínica; ambiente de homologação",
      },
      async (entrada, clinicaId) => {
        const tipo = entrada["tipo"];
        if (tipo !== "servico" && tipo !== "profissional")
          throw new ErroWebmcp("entrada_invalida", 'Campo "tipo" inválido.');
        const rascunho = await api.organizarTextoCatalogoIA({
          clinicaId,
          tipo,
          texto: comoDado(entrada["texto"], 20000),
        });
        return { rascunho, gravado: false };
      },
    ),
  ];
}
