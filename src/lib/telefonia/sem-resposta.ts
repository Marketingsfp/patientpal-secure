/**
 * "Quem ficou sem resposta": agrupa as ligações RECEBIDAS por número.
 * Puro, sem I/O. Atendida = situação "ANSWERED" da Sufficit; qualquer outra
 * (hoje só "UNKNOWN") conta como não atendida.
 */
import { normalizarTelefone } from "./numero";

export type ChamadaBasica = {
  externo_id: string;
  inicio: string;
  direcao: string | null;
  situacao: string | null;
  origem_numero: string | null;
  duracao_seg: number | null;
};

export type GrupoNumero = {
  /** E.164 quando é número brasileiro; null quando é ramal/interno. */
  e164: string | null;
  /** Rótulo para a tela (o próprio número ou o ramal). */
  rotulo: string;
  interno: boolean;
  tentativas: number;
  atendidas: number;
  primeira: string;
  ultima: string;
  algumaAtendida: boolean;
};

export type ResumoSemResposta = {
  recebidas: number;
  atendidas: number;
  naoAtendidas: number;
  nuncaFalaram: number;
  grupos: GrupoNumero[];
  /** 24 posições (hora em America/Sao_Paulo). */
  porHora: { hora: number; atendidas: number; naoAtendidas: number }[];
};

export function foiAtendida(c: Pick<ChamadaBasica, "situacao">): boolean {
  return (c.situacao ?? "").toUpperCase() === "ANSWERED";
}

export function ehRecebida(c: Pick<ChamadaBasica, "direcao">): boolean {
  return (c.direcao ?? "").toUpperCase() === "INCOMING";
}

const fmtHora = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hourCycle: "h23",
});

export function horaSaoPaulo(iso: string): number {
  return Number(fmtHora.format(new Date(iso))) % 24;
}

export function resumirSemResposta(chamadas: ChamadaBasica[]): ResumoSemResposta {
  const recebidas = chamadas.filter(ehRecebida);
  const mapa = new Map<string, GrupoNumero>();
  const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, atendidas: 0, naoAtendidas: 0 }));

  for (const c of recebidas) {
    const atendida = foiAtendida(c);
    const h = porHora[horaSaoPaulo(c.inicio)];
    if (atendida) h.atendidas++;
    else h.naoAtendidas++;

    const { e164, original } = normalizarTelefone(c.origem_numero);
    const chave = e164 ?? `interno:${original.replace(/\D/g, "") || "sem-numero"}`;
    const g = mapa.get(chave);
    if (!g) {
      mapa.set(chave, {
        e164,
        rotulo: e164 ?? (original.trim() || "sem número"),
        interno: e164 == null,
        tentativas: 1,
        atendidas: atendida ? 1 : 0,
        primeira: c.inicio,
        ultima: c.inicio,
        algumaAtendida: atendida,
      });
    } else {
      g.tentativas++;
      if (atendida) {
        g.atendidas++;
        g.algumaAtendida = true;
      }
      if (c.inicio < g.primeira) g.primeira = c.inicio;
      if (c.inicio > g.ultima) g.ultima = c.inicio;
    }
  }

  const grupos = [...mapa.values()].sort((a, b) => {
    if (a.algumaAtendida !== b.algumaAtendida) return a.algumaAtendida ? 1 : -1;
    if (a.tentativas !== b.tentativas) return b.tentativas - a.tentativas;
    return b.ultima.localeCompare(a.ultima);
  });

  const atendidas = recebidas.filter(foiAtendida).length;
  return {
    recebidas: recebidas.length,
    atendidas,
    naoAtendidas: recebidas.length - atendidas,
    nuncaFalaram: grupos.filter((g) => !g.algumaAtendida && !g.interno).length,
    grupos,
    porHora,
  };
}

/** Link do WhatsApp só com o número (sem texto). Null para ramal/interno. */
export function linkWhatsApp(g: Pick<GrupoNumero, "e164" | "interno">): string | null {
  if (g.interno || !g.e164) return null;
  return `https://wa.me/${g.e164.replace(/\D/g, "")}`;
}

/** Junta os segmentos da Sufficit num texto, uma linha por trecho com o tempo. */
export function textoDosSegmentos(
  segmentos: { start?: unknown; end?: unknown; text?: unknown }[],
): string {
  return segmentos
    .map((s) => {
      const t = typeof s.text === "string" ? s.text.trim() : "";
      if (!t) return "";
      const ini = typeof s.start === "number" ? s.start : 0;
      const mm = Math.floor(ini / 60);
      const ss = Math.floor(ini % 60);
      return `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}] ${t}`;
    })
    .filter(Boolean)
    .join("\n");
}
