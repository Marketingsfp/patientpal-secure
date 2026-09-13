/**
 * COORDENAÇÃO DO AVISO DE ENCAMINHAMENTO (camada pura).
 *
 * Problema real (protocolo MJ-52): uma única decisão de encaminhamento
 * produziu DOIS avisos ao paciente — a mensagem do protocolo, vinda do módulo
 * de atendimento, e o aviso da finalização da Nina. Cada módulo achou que a
 * comunicação era sua.
 *
 * Aqui vive a regra, sem banco e sem rede, para poder ser testada:
 *
 *  1. IDENTIDADE DA OPERAÇÃO — clínica + ambiente + conversa + sessão + turno
 *     de origem. A mesma decisão sempre produz a MESMA chave, inclusive nas
 *     novas tentativas do mesmo turno. É essa chave que o banco protege com
 *     unicidade: memória de processo não sobrevive a retry nem a outro worker.
 *
 *  2. CICLO DE VIDA EXPLÍCITO — preparado, envio pendente, confirmado, falhou
 *     e incerto são fatos diferentes. "Tentei enviar" nunca é "o paciente
 *     recebeu"; resultado incerto (timeout) exige conferir antes de reenviar.
 *
 *  3. UM ÚNICO RESPONSÁVEL — quem tem a reserva entrega; qualquer outro
 *     caminho do mesmo turno apenas reaproveita o que já foi dito.
 */

/** Ambiente da operação: homologação nunca encaminha para fila real. */
export type AmbienteAviso = "producao" | "homologacao";

export const ESTADOS_AVISO = [
  /** Texto pronto, nada enviado. */
  "preparado",
  /** Envio em andamento (reserva ativa). Nenhum outro caminho pode enviar. */
  "envio_pendente",
  /** O transporte confirmou: existe identificador da mensagem entregue. */
  "confirmado",
  /** O envio falhou de forma conhecida; pode haver nova tentativa. */
  "falhou",
  /** Resultado desconhecido (timeout/exceção): conferir ANTES de reenviar. */
  "incerto",
] as const;
export type EstadoAviso = (typeof ESTADOS_AVISO)[number];

export const ROTULO_ESTADO_AVISO: Record<EstadoAviso, string> = {
  preparado: "Aviso preparado, ainda não enviado",
  envio_pendente: "Envio em andamento",
  confirmado: "Aviso entregue ao paciente",
  falhou: "Falha no envio do aviso",
  incerto: "Resultado do envio desconhecido",
};

/** Só o estado confirmado autoriza dizer que o paciente foi avisado. */
export function avisoEntregue(estado: EstadoAviso | null | undefined): boolean {
  return estado === "confirmado";
}

/**
 * ORIGEM DO TURNO — o que identifica a decisão de encaminhamento.
 * `turnoId` é o identificador do turno da Nina; quando ele não existe (handoff
 * manual, atribuição por uma pessoa), o protocolo faz esse papel, porque é
 * único por atendimento.
 */
export type OrigemAviso = {
  clinicaId: string;
  ambiente: AmbienteAviso;
  conversaId: string;
  sessaoId?: string | null;
  turnoId?: string | null;
  protocolo?: string | null;
};

const VERSAO_CHAVE = "v1";

function parte(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : "-";
}

/**
 * Chave persistente e estável da operação. Duas tentativas do MESMO turno
 * produzem a mesma chave; turnos diferentes, sessões diferentes ou ambientes
 * diferentes produzem chaves diferentes.
 */
export function chaveAvisoEncaminhamento(o: OrigemAviso): string {
  // Sem turno e sem protocolo não há operação identificável: a chave cai na
  // sessão, que ainda distingue um atendimento do seguinte.
  const origem = o.turnoId ? `t:${o.turnoId}` : o.protocolo ? `p:${o.protocolo}` : "s:sessao";
  return [
    "aviso-handoff",
    VERSAO_CHAVE,
    parte(o.clinicaId),
    parte(o.ambiente),
    parte(o.conversaId),
    parte(o.sessaoId),
    origem,
  ].join(":");
}

/** Linha persistida do aviso (o que o banco devolve). */
export type RegistroAviso = {
  chave: string;
  estado: EstadoAviso;
  protocolo: string | null;
  texto: string | null;
  mensagemId: string | null;
  transporteId: string | null;
  tentativas: number;
  atualizadoEm: string | null;
};

export type DecisaoEntrega =
  /** Ninguém entregou ainda e a reserva é minha: posso enviar. */
  | "enviar"
  /** Já entregue neste turno: reaproveitar, sem segunda bolha. */
  | "ja_entregue"
  /** Outro caminho está enviando agora: não duplicar. */
  | "aguardar"
  /** Timeout/resultado incerto: conferir o envio anterior antes de repetir. */
  | "verificar_antes_de_reenviar"
  /** Falha conhecida, ainda dentro do limite de tentativas. */
  | "reenviar"
  /** Falhas demais: não insistir automaticamente. */
  | "desistir";

/** Tempo máximo que uma reserva de envio fica válida antes de virar incerta. */
export const RESERVA_EXPIRA_MS = 60_000;
export const MAX_TENTATIVAS_AVISO = 3;

/**
 * Decide o que fazer com uma operação de aviso, olhando SÓ o estado
 * persistido. Sem isso, dois caminhos concorrentes enviam dois avisos.
 */
export function decidirEntregaAviso(
  registro: RegistroAviso | null | undefined,
  agora: Date = new Date(),
  reservaExpiraMs: number = RESERVA_EXPIRA_MS,
): DecisaoEntrega {
  if (!registro) return "enviar";
  switch (registro.estado) {
    case "confirmado":
      return "ja_entregue";
    case "preparado":
      return "enviar";
    case "incerto":
      return "verificar_antes_de_reenviar";
    case "envio_pendente": {
      const em = registro.atualizadoEm ? Date.parse(registro.atualizadoEm) : NaN;
      if (Number.isNaN(em)) return "aguardar";
      // Reserva ainda quente: outro caminho do mesmo turno está enviando.
      if (agora.getTime() - em < reservaExpiraMs) return "aguardar";
      // Reserva vencida: o envio pode ter saído. Nunca reenviar às cegas.
      return "verificar_antes_de_reenviar";
    }
    case "falhou":
      return registro.tentativas >= MAX_TENTATIVAS_AVISO ? "desistir" : "reenviar";
  }
}

/** A decisão autoriza produzir uma nova mensagem para o paciente? */
export function decisaoProduzMensagem(d: DecisaoEntrega): boolean {
  return d === "enviar" || d === "reenviar";
}

/**
 * Resultado estruturado do encaminhamento: é isto que o módulo de
 * encaminhamento devolve a quem o chamou, para que o chamador NÃO precise
 * inventar a própria comunicação.
 */
export type ResultadoAvisoEncaminhamento = {
  /** Chave persistente da operação. */
  chave: string;
  ambiente: AmbienteAviso;
  estado: EstadoAviso;
  /** Protocolo real quando a clínica usa protocolo. */
  protocolo: string | null;
  /** Texto preparado do aviso (mesmo quando ainda não saiu). */
  texto: string | null;
  /** Mensagem já existente, quando houver. */
  mensagemId: string | null;
  transporteId: string | null;
  /** O responsável por este turno já falou com o paciente. */
  entregue: boolean;
  /** Esta chamada foi uma repetição do mesmo turno (não gerou nova bolha). */
  reaproveitado: boolean;
};

/**
 * O chamador (finalização da Nina) deve produzir o próprio aviso?
 * Só quando ninguém entregou nem está entregando por este turno.
 */
export function precisaAvisoDoChamador(
  r: ResultadoAvisoEncaminhamento | null | undefined,
): boolean {
  if (!r) return true;
  if (r.entregue) return false;
  return r.estado !== "envio_pendente";
}
