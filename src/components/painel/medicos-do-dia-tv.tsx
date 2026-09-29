import { useEffect, useRef, useState } from "react";
import { Minimize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MedicoDoDia = {
  id: string;
  nome: string;
  especialidade: string | null;
  total: number;
  pagos: number;
  novos: number;
};

/** Proporção de referência de um card compacto (largura x altura, em px). */
const CARD_W = 240;
const CARD_H = 140;

/**
 * Escolhe quantas colunas usar para que todos os cards caibam na área sem
 * rolagem: testa de 1 a 10 colunas e fica com a que deixa o card maior,
 * respeitando a proporção de referência.
 */
function melhorColunas(n: number, largura: number, altura: number) {
  if (n <= 0 || largura <= 0 || altura <= 0) return 1;
  let melhor = 1;
  let melhorEscala = 0;
  for (let cols = 1; cols <= Math.min(10, n); cols++) {
    const linhas = Math.ceil(n / cols);
    const escala = Math.min(largura / cols / CARD_W, altura / linhas / CARD_H);
    if (escala > melhorEscala) {
      melhorEscala = escala;
      melhor = cols;
    }
  }
  return melhor;
}

/** Opções do seletor de atualização automática; 0 = desligada. */
const INTERVALOS = [
  { ms: 30_000, rotulo: "30s" },
  { ms: 60_000, rotulo: "1m" },
  { ms: 300_000, rotulo: "5m" },
  { ms: 0, rotulo: "Desligado" },
];
const CHAVE_INTERVALO = "painel-modo-tv-intervalo";

/** Intervalo lembrado neste navegador (a TV costuma ficar sempre na mesma escolha). */
function lerIntervaloSalvo() {
  try {
    const salvo = Number(localStorage.getItem(CHAVE_INTERVALO));
    if (INTERVALOS.some((op) => op.ms === salvo) && localStorage.getItem(CHAVE_INTERVALO) !== null)
      return salvo;
  } catch {
    // Armazenamento bloqueado: usa o padrão.
  }
  return 30_000;
}

/** "0:28" ou "4:05" — minutos e segundos, legível de longe na TV. */
function formatarRestante(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Modo TV do quadro "Médicos do dia": ocupa a tela inteira por cima do menu
 * lateral e da barra superior, pede tela cheia ao navegador e distribui os
 * cards para caberem sem rolagem. Sair da tela cheia (Esc) fecha o modo.
 * Enquanto aberto, a atualização periódica é comandada daqui, no intervalo
 * escolhido no seletor (a consulta do Dashboard desliga o próprio timer); o
 * tempo real continua valendo e reinicia a contagem.
 */
export function MedicosDoDiaTv({
  medicos,
  atualizando,
  atualizadoEm,
  onAtualizar,
  onSair,
}: {
  medicos: MedicoDoDia[];
  atualizando: boolean;
  atualizadoEm: number;
  onAtualizar: () => void;
  onSair: () => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [agora, setAgora] = useState(() => new Date());
  const [intervalo, setIntervalo] = useState(lerIntervaloSalvo);
  const ultimoDisparo = useRef(0);

  const escolherIntervalo = (ms: number) => {
    setIntervalo(ms);
    try {
      localStorage.setItem(CHAVE_INTERVALO, String(ms));
    } catch {
      // Sem armazenamento: vale só até fechar o modo TV.
    }
  };

  // A contagem parte da última atualização recebida (automática, manual ou
  // tempo real) ou do último disparo, para não repetir o pedido se ele falhar.
  const base = Math.max(atualizadoEm || 0, ultimoDisparo.current);
  const restanteMs = intervalo > 0 ? Math.max(0, base + intervalo - agora.getTime()) : 0;

  useEffect(() => {
    if (intervalo <= 0 || atualizando || restanteMs > 0) return;
    ultimoDisparo.current = Date.now();
    onAtualizar();
  }, [intervalo, atualizando, restanteMs, onAtualizar]);

  // Tela cheia do navegador; quando o usuário sai dela (Esc), fecha o modo TV.
  useEffect(() => {
    const el = document.documentElement;
    let pediu = false;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen()
        .then(() => {
          pediu = true;
        })
        .catch(() => {
          // Navegador recusou: o modo TV segue ocupando a janela inteira.
        });
    }
    const aoMudar = () => {
      if (!document.fullscreenElement) onSair();
    };
    document.addEventListener("fullscreenchange", aoMudar);
    return () => {
      document.removeEventListener("fullscreenchange", aoMudar);
      if (pediu && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onSair]);

  // Esc também fecha quando o navegador não entrou em tela cheia.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onSair();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onSair]);

  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 1_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const GAP = 10;
  const cols = melhorColunas(medicos.length, area.w, area.h);
  const linhas = Math.max(1, Math.ceil(medicos.length / cols));
  const cardW = (area.w - GAP * (cols - 1)) / cols;
  const cardH = (area.h - GAP * (linhas - 1)) / linhas;
  // Fonte do número principal acompanha o tamanho do card.
  const escala = Math.max(0.7, Math.min(2.2, Math.min(cardW / CARD_W, cardH / CARD_H)));

  const totalAtend = medicos.reduce((s, m) => s + m.total, 0);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-50 dark:bg-background">
      {/* Barra do tempo restante até a próxima atualização. */}
      <div className="h-1 w-full bg-slate-200 dark:bg-slate-800">
        {intervalo > 0 && (
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.min(100, (restanteMs / intervalo) * 100)}%` }}
          />
        )}
      </div>
      <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-200 bg-card">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-800 truncate">
            Médicos do dia — {medicos.length} profissional(is) · {totalAtend} atendimento(s)
          </h1>
          <p className="text-[12px] text-slate-600 dark:text-slate-400">
            {agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}{" "}
            · atualizado às{" "}
            {new Date(atualizadoEm || Date.now()).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
        {/* Hora atual e contagem em tamanho grande, para leitura de longe. */}
        <div className="flex items-end gap-6 shrink-0">
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-widest font-semibold text-slate-500">
              Agora
            </div>
            <div className="text-4xl font-bold tabular-nums leading-none text-slate-900">
              {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-widest font-semibold text-slate-500">
              Próxima atualização
            </div>
            <div className="text-4xl font-bold tabular-nums leading-none text-primary">
              {intervalo <= 0
                ? "—"
                : atualizando || restanteMs === 0
                  ? "…"
                  : formatarRestante(restanteMs)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="inline-flex rounded-md border border-slate-200 bg-card p-0.5"
            role="group"
            aria-label="Intervalo da atualização automática"
          >
            {INTERVALOS.map((op) => (
              <button
                key={op.ms}
                type="button"
                onClick={() => escolherIntervalo(op.ms)}
                aria-pressed={intervalo === op.ms}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium",
                  intervalo === op.ms
                    ? "bg-primary text-primary-foreground"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                {op.rotulo}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={onAtualizar} disabled={atualizando}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", atualizando && "animate-spin")} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={onSair}>
            <Minimize2 className="h-4 w-4 mr-1.5" />
            Sair do modo TV
          </Button>
        </div>
      </header>

      <div ref={areaRef} className="flex-1 min-h-0 p-2.5 overflow-hidden">
        {medicos.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-lg">
            Nenhum médico com atendimentos hoje
          </div>
        ) : (
          <div
            className="grid h-full"
            style={{
              gap: GAP,
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${linhas}, minmax(0, 1fr))`,
            }}
          >
            {medicos.map((m) => {
              const pct = m.total > 0 ? Math.round((m.pagos / m.total) * 100) : 0;
              return (
                <div
                  key={m.id}
                  className="min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-card p-2.5 flex flex-col"
                >
                  <div
                    className="font-semibold text-slate-800 truncate leading-tight"
                    style={{ fontSize: `${Math.round(13 * escala)}px` }}
                    title={m.nome}
                  >
                    {m.nome}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {m.especialidade ?? "Sem especialidade"}
                  </div>
                  <div className="flex-1 min-h-0 flex items-center gap-2">
                    <span
                      className="font-bold tabular-nums text-slate-900 leading-none"
                      style={{ fontSize: `${Math.round(30 * escala)}px` }}
                    >
                      {m.total}
                    </span>
                    <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                      Atend.
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded-md bg-emerald-50 px-1.5 py-1 text-xs">
                      <span className="font-semibold text-emerald-700">Pagos </span>
                      <span className="font-bold tabular-nums text-emerald-800">{pct}%</span>
                    </div>
                    <div className="rounded-md bg-sky-50 px-1.5 py-1 text-xs">
                      <span className="font-semibold text-sky-700">Novos </span>
                      <span className="font-bold tabular-nums text-sky-800">{m.novos}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
