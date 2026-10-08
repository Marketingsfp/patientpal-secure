/**
 * Caminho de UMA mensagem de paciente em PRODUÇÃO: do webhook da Meta até a
 * resposta entregue no WhatsApp do paciente.
 *
 * Somente descrição (nada aqui executa o fluxo). Ficam de fora homologação,
 * leads de teste, carga, avaliações, canal de voz e observabilidade. Cada
 * etapa aponta para o arquivo e a função reais; o teste
 * `__tests__/caminho-producao.test.ts` confere que existem no repositório.
 *
 * Rastreado no código em 03/10/2026 (origin/main 4f3065f96).
 */

export type FaixaCaminho = "chegada" | "antes_nina" | "turno_nina" | "entrega";

export type TipoEtapa =
  /** Passo do caminho principal. */
  | "passo"
  /** Passo que só acontece em uma condição (fica ao lado do caminho). */
  | "condicional"
  /** Fim do caminho: a mensagem não segue adiante por aqui. */
  | "saida"
  /** Rotina que roda sozinha, fora da chegada de mensagens. */
  | "rotina";

export type DesfechoSaida =
  | "entregue"
  | "humano"
  | "sem_nina"
  | "ignorada"
  | "erro";

export type EtapaCaminho = {
  id: string;
  titulo: string;
  /** O que acontece, em linguagem simples. */
  explicacao: string;
  /** Quando a etapa acontece (só para condicionais, saídas e rotinas). */
  quando?: string;
  faixa: FaixaCaminho;
  tipo: TipoEtapa;
  desfecho?: DesfechoSaida;
  /** -1 = à esquerda do caminho, 0 = caminho principal, 1 e 2 = à direita. */
  coluna: -1 | 0 | 1 | 2;
  linha: number;
  arquivo?: string;
  funcao?: string;
  tabelas?: string[];
  /** Componente equivalente no mapa técnico (abre o painel de código). */
  componente?: string;
  /** Alerta sobre um comportamento real que merece atenção. */
  atencao?: string;
};

export type LigacaoCaminho = {
  de: string;
  para: string;
  rotulo?: string;
  tipo: "principal" | "desvio" | "retorno";
};

export const FAIXAS_CAMINHO: Array<{ id: FaixaCaminho; titulo: string; resumo: string }> = [
  { id: "chegada", titulo: "1. Chegada", resumo: "A Meta entrega a mensagem e o sistema guarda tudo antes de decidir." },
  { id: "antes_nina", titulo: "2. Antes da Nina", resumo: "Respostas automáticas e a decisão de quem atende." },
  { id: "turno_nina", titulo: "3. Turno da Nina", resumo: "A Nina lê o contexto, consulta o cadastro e escreve a resposta." },
  { id: "entrega", titulo: "4. Entrega", resumo: "Confere de novo, envia pela Meta e espera o paciente." },
];

const WEBHOOK = "src/routes/api/public/whatsapp.$clinicaId.ts";
const TURNO = "src/lib/whatsapp.server.ts";
const TRANSPORTE = "src/lib/nina/whatsapp-processamento.server.ts";
const HANDOFF = "src/lib/atendimento/handoff.server.ts";

export const ETAPAS_CAMINHO: EtapaCaminho[] = [
  // ───────────── 1. CHEGADA ─────────────
  {
    id: "meta",
    titulo: "Paciente envia no WhatsApp",
    explicacao: "A Meta (WhatsApp Cloud API) recebe a mensagem e avisa o sistema pelo endereço do webhook da clínica.",
    faixa: "chegada", tipo: "passo", coluna: 0, linha: 0,
  },
  {
    id: "webhook",
    titulo: "Webhook recebe o aviso",
    explicacao: "Rota pública que recebe o aviso da Meta para aquela clínica e começa a medir o tempo de resposta.",
    faixa: "chegada", tipo: "passo", coluna: 0, linha: 1,
    arquivo: WEBHOOK, funcao: "POST", componente: "message.inbound",
  },
  {
    id: "log",
    titulo: "Guarda o aviso bruto",
    explicacao: "Antes de qualquer conferência, o aviso inteiro é guardado no registro do webhook. No fim, o mesmo registro recebe o resultado.",
    faixa: "chegada", tipo: "passo", coluna: 0, linha: 2,
    arquivo: WEBHOOK, funcao: "registrarLogWebhook", tabelas: ["whatsapp_webhook_logs"],
    componente: "message.log_raw",
  },
  {
    id: "config",
    titulo: "Carrega a conexão da clínica",
    explicacao: "Lê a configuração do WhatsApp da clínica (número e chave de acesso da Meta).",
    faixa: "chegada", tipo: "passo", coluna: 0, linha: 3,
    arquivo: TURNO, funcao: "loadWhatsAppConfig", tabelas: ["whatsapp_configs"],
  },
  {
    id: "sem_config",
    titulo: "Clínica sem WhatsApp configurado",
    explicacao: "O sistema responde erro para a Meta e a mensagem não é processada.",
    quando: "Não existe configuração ou falta a chave de acesso.",
    faixa: "chegada", tipo: "saida", desfecho: "ignorada", coluna: 1, linha: 3,
    arquivo: WEBHOOK, funcao: "loadWhatsAppConfig",
  },
  {
    id: "assinatura",
    titulo: "Confere a assinatura da Meta",
    explicacao: "Compara a assinatura enviada pela Meta com a chave secreta da clínica.",
    faixa: "chegada", tipo: "passo", coluna: 0, linha: 4,
    arquivo: WEBHOOK, funcao: "verifySignature", componente: "message.validate",
    atencao: "Se a assinatura não confere (ou falta a chave secreta), o aviso é recusado antes de gravar qualquer coisa e a Meta tenta de novo. Chave secreta errada na configuração faz as mensagens da clínica pararem de chegar até ser corrigida.",
  },
  {
    id: "recibo",
    titulo: "Aviso de entrega ou leitura",
    explicacao: "Quando o aviso é só \"entregue\" ou \"lido\" de uma mensagem enviada, o sistema atualiza os lembretes de consulta e não chama a Nina.",
    quando: "O aviso da Meta não traz mensagem nova, só recibos.",
    faixa: "chegada", tipo: "saida", desfecho: "ignorada", coluna: 1, linha: 5,
    arquivo: "src/lib/agenda/confirmacao-whatsapp.server.ts", funcao: "registrarStatusEntregaConfirmacao",
    componente: "status.update",
  },
  {
    id: "tipo",
    titulo: "Separa cada mensagem recebida",
    explicacao: "Um aviso pode trazer várias mensagens. Cada uma segue o caminho abaixo; áudio de voz é tratado como áudio.",
    faixa: "chegada", tipo: "passo", coluna: 0, linha: 5,
    arquivo: WEBHOOK, funcao: "POST",
  },
  {
    id: "midia",
    titulo: "Áudio vira texto · imagem é lida",
    explicacao: "Áudio: baixa e transcreve. Imagem: baixa, guarda no armazenamento privado e procura um pedido médico para virar texto. Mídias com mais de 30 dias são limpas nesse momento.",
    quando: "A mensagem é áudio ou imagem.",
    faixa: "chegada", tipo: "condicional", coluna: -1, linha: 6,
    arquivo: "src/lib/whatsapp-midia.server.ts", funcao: "receberMidiaWhatsapp",
    tabelas: ["whatsapp_mensagens.media_url"], componente: "audio.transcribe",
  },
  {
    id: "grava",
    titulo: "Grava a mensagem do paciente",
    explicacao: "Salva a mensagem na conversa (o banco cria ou atualiza a conversa sozinho) e marca a versão da conversa, usada depois para não enviar resposta velha.",
    faixa: "chegada", tipo: "passo", coluna: 0, linha: 6,
    arquivo: "src/lib/nina/entrada-persistida.server.ts", funcao: "persistirEntradaNina",
    tabelas: ["whatsapp_mensagens", "atend_conversas"], componente: "message.deduplicate",
  },
  {
    id: "duplicada",
    titulo: "Mensagem repetida",
    explicacao: "A Meta reenviou uma mensagem que já foi tratada. Ela é ignorada para o paciente não receber duas respostas.",
    quando: "O código da mensagem na Meta já existe e já foi consumido.",
    faixa: "chegada", tipo: "saida", desfecho: "ignorada", coluna: 1, linha: 6,
    arquivo: "src/lib/nina/entrada-persistida.server.ts", funcao: "persistirEntradaNina",
  },

  // ───────────── 2. ANTES DA NINA ─────────────
  {
    id: "lembrete",
    titulo: "É resposta a lembrete de consulta?",
    explicacao: "Se o paciente respondeu ao lembrete (confirmar, desmarcar), o sistema trata a resposta sozinho.",
    faixa: "antes_nina", tipo: "passo", coluna: 0, linha: 7,
    arquivo: "src/lib/agenda/confirmacao-whatsapp.server.ts", funcao: "processarRespostaConfirmacao",
    tabelas: ["agendamento_confirmacoes", "agendamentos"], componente: "reminder.reply",
  },
  {
    id: "codigo",
    titulo: "É código de verificação do site?",
    explicacao: "Se a mensagem é o código que o paciente recebeu no site, o sistema confirma o código sozinho.",
    faixa: "antes_nina", tipo: "passo", coluna: 0, linha: 8,
    arquivo: "src/lib/integracoes/verificacao-v1.server.ts", funcao: "reconhecerCodigoVerificacao",
    tabelas: ["integracao_verificacoes"], componente: "verification.code",
  },
  {
    id: "automatica",
    titulo: "Resposta automática, sem a Nina",
    explicacao: "O sistema envia uma frase curta de confirmação e a mensagem não passa pela Nina.",
    quando: "Era resposta a lembrete ou código de verificação.",
    faixa: "antes_nina", tipo: "saida", desfecho: "entregue", coluna: 1, linha: 7.5,
    arquivo: TURNO, funcao: "metaSendText",
  },
  {
    id: "reabre",
    titulo: "Reabre conversa encerrada",
    explicacao: "Se a conversa estava encerrada, volta a ficar aberta com a Nina (ou na fila, se a Nina estiver desligada na clínica).",
    quando: "A conversa estava encerrada ou resolvida.",
    faixa: "antes_nina", tipo: "condicional", coluna: -1, linha: 9,
    arquivo: HANDOFF, funcao: "reabrirConversaPorMensagemPaciente",
    tabelas: ["atend_conversas", "atend_conversa_eventos"], componente: "conversation.reopen",
  },
  {
    id: "cancela_espera",
    titulo: "Para o relógio de 30 minutos",
    explicacao: "O paciente respondeu, então a espera aberta na última resposta da Nina é cancelada. Prazos vencidos de outras conversas também são verificados aqui.",
    faixa: "antes_nina", tipo: "passo", coluna: 0, linha: 9,
    arquivo: "src/lib/nina/espera-paciente.server.ts", funcao: "limparEsperaPorTelefone",
    tabelas: ["atend_conversas"],
  },
  {
    id: "decide",
    titulo: "Quem atende: Nina ou humano?",
    explicacao: "A Nina só responde se estiver ligada na clínica, se a conversa estiver com ela e se houver algo para ler (texto, áudio ou imagem).",
    faixa: "antes_nina", tipo: "passo", coluna: 0, linha: 10,
    arquivo: HANDOFF, funcao: "ninaPodeResponder", componente: "routing.decide",
  },
  {
    id: "sem_nina",
    titulo: "Fica com a equipe",
    explicacao: "A Nina não responde. Se a conversa não tem dono, o sistema tenta atribuir a um atendente online; sem ninguém online, fica em \"Não atribuídas\".",
    quando: "Conversa com atendente, pausada, Nina desligada ou mensagem sem conteúdo (reação, localização).",
    faixa: "antes_nina", tipo: "saida", desfecho: "sem_nina", coluna: 1, linha: 10,
    arquivo: HANDOFF, funcao: "atribuirAtendenteOnline", tabelas: ["atend_conversas"],
    componente: "handoff.assign",
  },

  // ───────────── 3. TURNO DA NINA ─────────────
  {
    id: "lote",
    titulo: "Junta mensagens seguidas e trava a conversa",
    explicacao: "Espera 1 segundo de silêncio (no máximo 2,5 s) para juntar mensagens mandadas em sequência e trava a conversa, para só uma resposta ser gerada por vez.",
    faixa: "turno_nina", tipo: "passo", coluna: 0, linha: 11,
    arquivo: "src/lib/nina/burst.server.ts", funcao: "aguardarTurnoNina",
    tabelas: ["nina_message_batches", "nina_conversa_locks"], componente: "turn.batch",
  },
  {
    id: "agrupada",
    titulo: "Respondida junto com a próxima",
    explicacao: "Chegou uma mensagem mais nova; ela assume o turno e responde as duas de uma vez.",
    quando: "Outra mensagem do mesmo paciente chegou durante a espera.",
    faixa: "turno_nina", tipo: "saida", desfecho: "ignorada", coluna: 1, linha: 11,
    arquivo: TRANSPORTE, funcao: "processarRespostaWhatsappNina",
  },
  {
    id: "contexto",
    titulo: "Lê a conversa e a sessão",
    explicacao: "Carrega as últimas mensagens, o cadastro já vinculado à conversa e a sessão (nova sessão depois de 4 h sem conversa). Não procura paciente pelo telefone.",
    faixa: "turno_nina", tipo: "passo", coluna: 0, linha: 12,
    arquivo: TURNO, funcao: "gerarRespostaNinaInterno",
    tabelas: ["whatsapp_mensagens", "atend_conversas"], componente: "session.resolve",
  },
  {
    id: "jev",
    titulo: "Jev confere a intenção",
    explicacao: "Um segundo modelo confere o que o paciente quer e se a Nina está entendendo. Pode decidir encaminhar.",
    quando: "Fases do Jev ligadas para a clínica.",
    faixa: "turno_nina", tipo: "condicional", coluna: -1, linha: 12,
    arquivo: "src/lib/nina/jev.server.ts", funcao: "perguntarJev",
    tabelas: ["nina_jev_decisoes"], componente: "jev.filtro",
  },
  {
    id: "instrucoes",
    titulo: "Instruções publicadas e cadastro",
    explicacao: "Usa a versão publicada das Instruções da Nina e lê uma única vez, para esta resposta, o cadastro de médicos, horários e procedimentos.",
    faixa: "turno_nina", tipo: "passo", coluna: 0, linha: 13,
    arquivo: "src/lib/nina/instrucoes-runtime.server.ts", funcao: "promptInstrucoes",
    tabelas: ["nina_instrucoes_versoes"], componente: "instructions.published",
  },
  {
    id: "monta",
    titulo: "Monta o pedido ao modelo",
    explicacao: "Junta instruções, histórico, estado do atendimento e as ferramentas permitidas em um único pedido.",
    faixa: "turno_nina", tipo: "passo", coluna: 0, linha: 14,
    arquivo: "src/lib/nina/prompt-composer.ts", funcao: "comporRequestNina", componente: "prompt.compose",
  },
  {
    id: "modelo",
    titulo: "Modelo escreve a resposta",
    explicacao: "Chama o modelo de IA. Ele responde com texto ou pede uma ferramenta; com a agenda desligada são até 3 rodadas, e na última ele é obrigado a responder com o que já consultou.",
    faixa: "turno_nina", tipo: "passo", coluna: 0, linha: 15,
    arquivo: "src/lib/nina/ai-gateway.server.ts", funcao: "ninaAIGateway",
    tabelas: ["nina_execucoes"], componente: "llm.generate",
  },
  {
    id: "ferramentas",
    titulo: "Ferramentas consultam o cadastro",
    explicacao: "Executa o que o modelo pediu (médicos, horários habituais, valores, procedimentos) e devolve o resultado ao modelo para a próxima rodada.",
    quando: "O modelo pediu uma ferramenta.",
    faixa: "turno_nina", tipo: "condicional", coluna: -1, linha: 15,
    arquivo: "src/lib/nina/tool-broker.server.ts", funcao: "criarToolBroker", componente: "tool.execute",
  },
  {
    id: "humano",
    titulo: "Encaminha para a equipe",
    explicacao: "Tira a conversa da Nina, gera o protocolo, coloca na fila e avisa o paciente com o número do protocolo. A Nina não manda uma segunda mensagem.",
    quando: "Paciente pediu atendente, quer marcar, a informação não existe no cadastro, o Jev decidiu ou acabaram as rodadas.",
    faixa: "turno_nina", tipo: "saida", desfecho: "humano", coluna: 1, linha: 15,
    arquivo: HANDOFF, funcao: "encaminharParaHumano",
    tabelas: ["atend_conversas", "atend_conversa_eventos", "atend_aviso_encaminhamento"],
    componente: "handoff.queue",
  },
  {
    id: "ajustes",
    titulo: "Revisa o texto final",
    explicacao: "Aplica as mensagens automáticas publicadas, confere a apresentação da sessão, remove promessas sem confirmação e emojis, e guarda o estado do atendimento e as evidências.",
    faixa: "turno_nina", tipo: "passo", coluna: 0, linha: 16,
    arquivo: "src/lib/nina/resposta/finalizacao.server.ts", funcao: "finalizarResposta",
    tabelas: ["atend_conversas.nina_fluxo_estado", "nina_execucao_evidencias"],
    componente: "response.finalize",
  },
  {
    id: "erro_modelo",
    titulo: "Falha do modelo",
    explicacao: "O modelo é chamado de novo automaticamente. Se continuar falhando, o vigia tenta outra vez ou encaminha para a equipe.",
    quando: "O serviço de IA não respondeu depois das tentativas.",
    faixa: "turno_nina", tipo: "saida", desfecho: "erro", coluna: 1, linha: 16,
    arquivo: "src/lib/nina/ai-gateway.server.ts", funcao: "ninaAIGateway",
  },

  // ───────────── 4. ENTREGA ─────────────
  {
    id: "reconfere",
    titulo: "Confere de novo antes de enviar",
    explicacao: "Verifica se a conversa ainda está com a Nina e se o paciente não mandou nada novo enquanto ela escrevia.",
    faixa: "entrega", tipo: "passo", coluna: 0, linha: 17,
    arquivo: "src/lib/nina/revisao-conversa.server.ts", funcao: "respostaObsoleta", componente: "turn.stale",
  },
  {
    id: "descartada",
    titulo: "Resposta descartada",
    explicacao: "A resposta não é enviada: um atendente assumiu ou chegou mensagem nova, que gera outra resposta já com o contexto atualizado.",
    quando: "A conversa mudou enquanto a Nina escrevia.",
    faixa: "entrega", tipo: "saida", desfecho: "ignorada", coluna: 1, linha: 17,
    arquivo: TRANSPORTE, funcao: "processarRespostaWhatsappNina",
  },
  {
    id: "audio",
    titulo: "Responde em áudio",
    explicacao: "Gera a voz da Nina e envia o áudio pela Meta. Texto longo ou em lista vai em áudio resumido mais o texto completo. Se o áudio falhar, vai só o texto.",
    quando: "O paciente mandou áudio e a resposta em áudio está ligada.",
    faixa: "entrega", tipo: "condicional", coluna: -1, linha: 18,
    arquivo: "src/lib/nina-audio.server.ts", funcao: "sintetizarFala", componente: "audio.fallback",
  },
  {
    id: "envia",
    titulo: "Envia a resposta pela Meta",
    explicacao: "Envia o texto ao WhatsApp do paciente pela API da Meta.",
    faixa: "entrega", tipo: "passo", coluna: 0, linha: 18,
    arquivo: TURNO, funcao: "metaSendText", componente: "message.outbound",
  },
  {
    id: "erro_envio",
    titulo: "Meta recusou ou não respondeu",
    explicacao: "Limite de envio: tenta de novo mais tarde. Recusa: marca falha. Sem resposta da Meta (não dá para saber se chegou): encaminha para a equipe.",
    quando: "O envio à Meta deu erro.",
    faixa: "entrega", tipo: "saida", desfecho: "erro", coluna: 1, linha: 18,
    arquivo: "src/lib/nina/watchdog.server.ts", funcao: "entregarComCheckpointNina",
  },
  {
    id: "grava_saida",
    titulo: "Grava a resposta na conversa",
    explicacao: "A resposta enviada fica registrada na conversa, visível para a equipe.",
    faixa: "entrega", tipo: "passo", coluna: 0, linha: 19,
    arquivo: TRANSPORTE, funcao: "processarRespostaWhatsappNina",
    tabelas: ["whatsapp_mensagens"], componente: "message.persist",
  },
  {
    id: "espera",
    titulo: "Liga o relógio de 30 minutos",
    explicacao: "Começa a esperar a resposta do paciente e libera a trava da conversa para a próxima mensagem.",
    faixa: "entrega", tipo: "passo", coluna: 0, linha: 20,
    arquivo: "src/lib/nina/espera-paciente.server.ts", funcao: "registrarEsperaPorTelefone",
    tabelas: ["atend_conversas"], componente: "wait.start",
  },
  {
    id: "entregue",
    titulo: "Paciente recebe a resposta",
    explicacao: "Fim do caminho. A próxima mensagem do paciente começa tudo de novo no webhook.",
    faixa: "entrega", tipo: "saida", desfecho: "entregue", coluna: 0, linha: 21,
  },
  {
    id: "vigia",
    titulo: "Vigia (a cada minuto)",
    explicacao: "Rotina automática: encaminha à equipe as conversas em que o paciente não respondeu em 30 minutos e retoma respostas que pararam no meio por falha.",
    quando: "Roda sozinha, sem depender de mensagem nova.",
    faixa: "turno_nina", tipo: "rotina", coluna: 2, linha: 15,
    arquivo: "src/routes/api/public/nina.watchdog.ts", funcao: "executarJobWatchdog",
    componente: "wait.timeout_job",
  },
];

export const LIGACOES_CAMINHO: LigacaoCaminho[] = [
  // Caminho principal
  { de: "meta", para: "webhook", tipo: "principal" },
  { de: "webhook", para: "log", tipo: "principal" },
  { de: "log", para: "config", tipo: "principal" },
  { de: "config", para: "assinatura", tipo: "principal" },
  { de: "assinatura", para: "tipo", tipo: "principal" },
  { de: "tipo", para: "grava", tipo: "principal" },
  { de: "grava", para: "lembrete", tipo: "principal", rotulo: "nova" },
  { de: "lembrete", para: "codigo", tipo: "principal", rotulo: "não" },
  { de: "codigo", para: "cancela_espera", tipo: "principal", rotulo: "não" },
  { de: "cancela_espera", para: "decide", tipo: "principal" },
  { de: "decide", para: "lote", tipo: "principal", rotulo: "Nina" },
  { de: "lote", para: "contexto", tipo: "principal" },
  { de: "contexto", para: "instrucoes", tipo: "principal" },
  { de: "instrucoes", para: "monta", tipo: "principal" },
  { de: "monta", para: "modelo", tipo: "principal" },
  { de: "modelo", para: "ajustes", tipo: "principal", rotulo: "texto" },
  { de: "ajustes", para: "reconfere", tipo: "principal" },
  { de: "reconfere", para: "envia", tipo: "principal", rotulo: "ok" },
  { de: "envia", para: "grava_saida", tipo: "principal" },
  { de: "grava_saida", para: "espera", tipo: "principal" },
  { de: "espera", para: "entregue", tipo: "principal" },

  // Condicionais (ao lado do caminho)
  { de: "tipo", para: "midia", tipo: "desvio", rotulo: "mídia" },
  { de: "midia", para: "grava", tipo: "desvio" },
  { de: "codigo", para: "reabre", tipo: "desvio", rotulo: "encerrada" },
  { de: "reabre", para: "cancela_espera", tipo: "desvio" },
  { de: "contexto", para: "jev", tipo: "desvio", rotulo: "se ligado" },
  { de: "jev", para: "instrucoes", tipo: "desvio" },
  { de: "modelo", para: "ferramentas", tipo: "desvio", rotulo: "consulta" },
  { de: "ferramentas", para: "modelo", tipo: "retorno", rotulo: "resultado" },
  { de: "reconfere", para: "audio", tipo: "desvio", rotulo: "áudio" },
  { de: "audio", para: "grava_saida", tipo: "desvio" },

  // Saídas
  { de: "config", para: "sem_config", tipo: "desvio", rotulo: "sem config" },
  { de: "tipo", para: "recibo", tipo: "desvio", rotulo: "só recibo" },
  { de: "grava", para: "duplicada", tipo: "desvio", rotulo: "repetida" },
  { de: "lembrete", para: "automatica", tipo: "desvio", rotulo: "sim" },
  { de: "codigo", para: "automatica", tipo: "desvio", rotulo: "sim" },
  { de: "decide", para: "sem_nina", tipo: "desvio", rotulo: "equipe" },
  { de: "lote", para: "agrupada", tipo: "desvio", rotulo: "nova msg" },
  { de: "modelo", para: "humano", tipo: "desvio", rotulo: "encaminhar" },
  { de: "modelo", para: "erro_modelo", tipo: "desvio", rotulo: "falhou" },
  { de: "reconfere", para: "descartada", tipo: "desvio", rotulo: "mudou" },
  { de: "envia", para: "erro_envio", tipo: "desvio", rotulo: "erro" },
  { de: "vigia", para: "humano", tipo: "retorno", rotulo: "30 min" },
];
