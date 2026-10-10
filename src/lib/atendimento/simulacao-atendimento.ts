import type { ConversaCardData } from "@/components/nina/InboxConversationCard";
import type { FiltroAtendente } from "./filtros-atendente";
import { ordenarInbox } from "./ordem-inbox";

export const USUARIO_SIMULADO = "atendente-simulada";
export type MensagemSimulada = {
  id: string;
  body: string;
  direction: "in" | "out";
  recebida_em: string;
};
export type ConversaSimulada = ConversaCardData & {
  status: "active" | "closed";
  created_at: string;
  inbox_entrada_em: string;
  resolved_at?: string;
  mensagens: MensagemSimulada[];
  esperaDesde: string | null;
};
type Chegada = {
  id: number;
  emMs: number;
  conversaId: string;
  nome: string;
  texto: string;
  nova: boolean;
};
export type Simulacao = {
  conversas: ConversaSimulada[];
  chegadas: Chegada[];
  executando: boolean;
  decorridoMs: number;
  presenca: "ONLINE" | "PAUSA" | "PAUSA_SAIDA" | "OFFLINE";
};
const CENARIOS = [
  [
    "Ana Martins",
    "Olá, gostaria de informações sobre uma consulta.",
    "Vocês têm horário pela manhã?",
  ],
  [
    "Bruno Lima",
    "Bom dia! Preciso saber o preparo de um exame.",
    "Posso tomar água antes do exame?",
  ],
  [
    "Carla Souza",
    "Olá! Quero confirmar o horário do meu atendimento.",
    "Preciso chegar com antecedência?",
  ],
  ["Daniel Alves", "Gostaria de falar com o laboratório.", "Quais documentos devo levar?"],
  [
    "Elisa Santos",
    "Boa tarde! Tenho uma dúvida sobre tomografia.",
    "Como recebo as orientações de preparo?",
  ],
  [
    "Felipe Costa",
    "Olá, gostaria de informações sobre ressonância.",
    "Posso falar com a equipe responsável?",
  ],
];

/** Somente memória. Nenhum identificador ou telefone de paciente real. */
export function criarSimulacao(quantidade = 6, intervaloMs = 3000): Simulacao {
  const total = Math.max(1, Math.min(24, Math.trunc(quantidade)));
  const intervalo = Math.max(1000, Math.min(10000, intervaloMs));
  const chegadas = Array.from({ length: total }, (_, i) => {
    const [nome, texto, retorno] = CENARIOS[i % CENARIOS.length];
    const conversaId = `simulada-${i + 1}`;
    return [
      {
        id: i * 2,
        emMs: i * intervalo,
        conversaId,
        nome: `${nome} · fictício ${i + 1}`,
        texto,
        nova: true,
      },
      { id: i * 2 + 1, emMs: i * intervalo + 9000, conversaId, nome, texto: retorno, nova: false },
    ];
  })
    .flat()
    .sort((a, b) => a.emMs - b.emMs || a.id - b.id);
  return { conversas: [], chegadas, executando: true, decorridoMs: 0, presenca: "ONLINE" };
}

/** Pausa a execução por completo; presença fora de Online impede apenas novas atribuições. */
export function avancarSimulacao(estado: Simulacao, ms: number, agora: number): Simulacao {
  if (!estado.executando) return estado;
  const decorridoMs = estado.decorridoMs + Math.max(0, ms);
  let conversas = [...estado.conversas];
  const chegadas: Chegada[] = [];
  for (const e of estado.chegadas) {
    if (e.emMs > decorridoMs || (e.nova && estado.presenca !== "ONLINE")) {
      chegadas.push(e);
      continue;
    }
    const atual = conversas.find((c) => c.id === e.conversaId);
    if (!e.nova && !atual) {
      chegadas.push(e);
      continue;
    }
    if (atual?.status === "closed") continue;
    const quando = new Date(agora - Math.max(0, decorridoMs - e.emMs)).toISOString();
    const mensagem: MensagemSimulada = {
      id: `mensagem-${e.id}`,
      body: e.texto,
      direction: "in",
      recebida_em: quando,
    };
    if (e.nova) {
      conversas.push({
        id: e.conversaId,
        contato_nome: e.nome,
        contato_telefone: "Número fictício",
        status: "active",
        owner_type: "HUMAN",
        atribuida_user_id: USUARIO_SIMULADO,
        is_teste: true,
        created_at: quando,
        inbox_entrada_em: quando,
        ultima_msg_em: quando,
        nao_lidas: 1,
        mensagens: [mensagem],
        esperaDesde: quando,
      });
    } else {
      conversas = conversas.map((c) =>
        c.id !== e.conversaId
          ? c
          : {
              ...c,
              ultima_msg_em: quando,
              nao_lidas: (c.nao_lidas ?? 0) + 1,
              esperaDesde: c.esperaDesde ?? quando,
              mensagens: [...c.mensagens, mensagem],
            },
      );
    }
  }
  return { ...estado, conversas, chegadas, decorridoMs, executando: chegadas.length > 0 };
}

export function abrirConversaSimulada(estado: Simulacao, id: string): Simulacao {
  return {
    ...estado,
    conversas: estado.conversas.map((c) =>
      c.id !== id
        ? c
        : {
            ...c,
            nao_lidas: 0,
            inbox_aberta_user_id: USUARIO_SIMULADO,
            inbox_aberta_entrada_em: new Date(c.inbox_entrada_em)
              .toISOString()
              .replace(/Z$/, "000Z"),
          },
    ),
  };
}

export function responderSimulacao(
  estado: Simulacao,
  id: string,
  body: string,
  agora: number,
): Simulacao {
  const texto = body.trim();
  if (!texto || estado.presenca === "OFFLINE") return estado;
  const quando = new Date(agora).toISOString();
  return {
    ...estado,
    conversas: estado.conversas.map((c) =>
      c.id !== id || c.status === "closed"
        ? c
        : {
            ...c,
            esperaDesde: null,
            nao_lidas: 0,
            ultima_msg_em: quando,
            mensagens: [
              ...c.mensagens,
              {
                id: `resposta-${c.mensagens.length}`,
                body: texto,
                direction: "out",
                recebida_em: quando,
              },
            ],
          },
    ),
  };
}

export function resolverSimulacao(estado: Simulacao, id: string, agora: number): Simulacao {
  if (estado.presenca === "OFFLINE") return estado;
  return {
    ...estado,
    conversas: estado.conversas.map((c) =>
      c.id !== id || c.status === "closed"
        ? c
        : {
            ...c,
            status: "closed",
            resolved_at: new Date(agora).toISOString(),
            esperaDesde: null,
            nao_lidas: 0,
          },
    ),
  };
}

export function conversasDaSimulacao(
  estado: Simulacao,
  filtro: FiltroAtendente,
): ConversaSimulada[] {
  const linhas = estado.conversas.filter((c) =>
    filtro === "fechadas"
      ? c.status === "closed"
      : c.status === "active" && (filtro !== "pendentes" || !!c.esperaDesde),
  );
  const espera = Object.fromEntries(
    linhas.filter((c) => c.esperaDesde).map((c) => [c.id, c.esperaDesde!]),
  );
  return ordenarInbox(
    linhas,
    filtro === "fechadas" ? "resolvidas" : filtro === "pendentes" ? "espera" : "recentes",
    espera,
  );
}
