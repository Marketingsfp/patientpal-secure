import type { ResultadoDistribuicaoFila } from "@/lib/atendimento/distribuicao-contrato";
import type { EstadoManualPresenca } from "@/lib/atendimento/presenca-manual";

export type AvisoDistribuicao = {
  texto: string;
  tom: "sucesso" | "aviso" | "erro" | "neutro";
};

const MOTIVOS: Record<string, string> = {
  capacidade_lotada: "Capacidade atingida.",
  sem_perfil_telefonia: "Seu perfil não recebe a distribuição automática da Telefonia.",
  admin_excluido: "Administradores não recebem a distribuição automática.",
  sem_escolha_manual: "Escolha sua disponibilidade para receber conversas.",
  escolha_manual_offline: "Você está offline para novas conversas.",
  escolha_manual_pausa: "Você está em pausa para novas conversas.",
  em_pausa: "Você está em pausa para novas conversas.",
  setor_incompativel: "Não há compatibilidade com o setor desta fila.",
  sem_atendentes_elegiveis: "Nenhum atendente pode receber novas conversas agora.",
  sem_elegiveis: "Nenhum atendente pode receber novas conversas agora.",
  fila_bloqueada: "A fila está fechada para novas conversas.",
};

/** Motivos desconhecidos não são tratados como falta de atendentes nem expostos como SQL. */
export function textoMotivoDistribuicao(motivo: string | null): string | null {
  return motivo ? (MOTIVOS[motivo] ?? "O recebimento de novas conversas está indisponível.") : null;
}

export function textoCargaAtendente(carga: number, capacidade: number | null, reservadas?: number): string {
  if (reservadas !== undefined) {
    return `${Math.max(0, carga - reservadas)} conversa(s) ativa(s), sem limite. ${reservadas}${capacidade === 10 ? "/10" : ""} em Não atribuídas.`;
  }
  return capacidade === null
    ? `${carga} conversa(s) ativa(s), sem limite.`
    : `${carga}/${capacidade} conversas ativas.`;
}

export function mensagemDistribuicaoFila(r: ResultadoDistribuicaoFila): AvisoDistribuicao {
  const partes: string[] = [];
  if (r.meu) {
    partes.push(textoCargaAtendente(r.meu.carga_atual, r.meu.capacidade, r.meu.reservadas));
    const motivo = textoMotivoDistribuicao(r.meu.motivo);
    if (motivo) partes.push(motivo);
  }
  if (r.status === "erro") {
    partes.push(
      "Não foi possível concluir a distribuição da fila. A fila será reavaliada automaticamente.",
    );
  } else {
    if (r.distribuidas > 0) partes.push(`${r.distribuidas} conversa(s) distribuída(s) à equipe.`);
    if (r.pendentes > 0) partes.push(`${r.pendentes} conversa(s) aguardando distribuição.`);
    else if (r.status === "concluida") partes.push("Nenhuma conversa aguardando distribuição.");
    if (r.status === "pendente")
      partes.push("A distribuição ainda está pendente. A fila será reavaliada automaticamente.");
    if (r.status === "bloqueada" && r.motivo && r.motivo !== r.meu?.motivo) {
      partes.push(textoMotivoDistribuicao(r.motivo)!);
    }
  }
  if (r.status === "erro" && r.pendentes > 0)
    partes.push(`${r.pendentes} conversa(s) aguardando distribuição.`);

  return {
    texto: partes.join(" "),
    tom:
      r.status === "erro"
        ? "erro"
        : r.status === "bloqueada" || r.status === "pendente" || !!r.meu?.motivo
          ? "aviso"
          : r.distribuidas > 0
            ? "sucesso"
            : "neutro",
  };
}

export function avisoPresencaConfirmada(
  estado: EstadoManualPresenca,
  distribuicao: ResultadoDistribuicaoFila,
): AvisoDistribuicao {
  const rotulo = estado === "ONLINE" ? "Online" : estado === "OFFLINE" ? "Offline" : "Em pausa";
  const aviso = mensagemDistribuicaoFila(distribuicao);
  return {
    ...aviso,
    texto:
      distribuicao.status === "erro"
        ? `Presença salva: ${rotulo.toLowerCase()}. ${aviso.texto}`
        : `${rotulo}. ${aviso.texto}`,
  };
}

export function validarLimiteAtendente(
  modo: "sem_limite" | "limitado",
  valor: string,
): { ok: true; capacidade: number | null } | { ok: false; erro: string } {
  if (modo === "sem_limite") return { ok: true, capacidade: null };
  const texto = valor.trim();
  const numero = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isInteger(numero) || numero < 1 || numero > 1000) {
    return { ok: false, erro: "Informe um limite inteiro de 1 a 1000 conversas." };
  }
  return { ok: true, capacidade: numero };
}
