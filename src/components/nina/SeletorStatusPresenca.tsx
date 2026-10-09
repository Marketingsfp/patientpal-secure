/**
 * Seletor de status do atendente: um único botão mostra o status atual e, ao clicar, abre uma lista
 * vertical com todas as opções. O comportamento é o de sempre (o estado mostrado é o confirmado pelo
 * servidor; durante a gravação nada muda de lugar); só o espaço ocupado na barra lateral diminuiu.
 */
import { Check, ChevronDown, Circle, Coffee, DoorOpen, Loader2, PowerOff } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TempoPausa } from "@/components/nina/CronometroPausa";
import { ROTULO_ESTADO_MANUAL, type EstadoManualPresenca } from "@/lib/atendimento/presenca-manual";

export type AlvoStatusPresenca = "online" | "pausa" | "pausa_saida" | "offline";

const OPCOES: {
  alvo: AlvoStatusPresenca;
  estado: EstadoManualPresenca;
  icone: ReactNode;
  /** Cor do botão quando este é o status atual. */
  ativo: string;
  /** Cor do ícone na lista. */
  cor: string;
}[] = [
  {
    alvo: "online",
    estado: "ONLINE",
    icone: <Circle className="h-3 w-3 fill-current" />,
    ativo: "bg-atd-ok hover:bg-atd-ok/90 text-atd-on-strong",
    cor: "text-atd-ok",
  },
  {
    alvo: "pausa",
    estado: "PAUSA",
    icone: <Coffee className="h-3.5 w-3.5" />,
    ativo: "bg-atd-warn hover:bg-atd-warn/90 text-atd-warn-ink",
    cor: "text-atd-warn-ink",
  },
  {
    alvo: "pausa_saida",
    estado: "PAUSA_SAIDA",
    icone: <DoorOpen className="h-3.5 w-3.5" />,
    ativo: "bg-atd-warn hover:bg-atd-warn/90 text-atd-warn-ink",
    cor: "text-atd-warn-ink",
  },
  {
    alvo: "offline",
    estado: "OFFLINE",
    icone: <PowerOff className="h-3.5 w-3.5" />,
    ativo: "bg-atd-idle hover:bg-atd-idle/90 text-atd-on-strong",
    cor: "text-atd-idle-ink",
  },
];

export function SeletorStatusPresenca({
  selecionado,
  salvando,
  desabilitado,
  carregando,
  inicioPausa,
  onEscolher,
}: {
  /** Último estado confirmado pelo servidor (null = ainda não escolheu). */
  selecionado: EstadoManualPresenca | null;
  /** Estado em gravação, se houver. */
  salvando: EstadoManualPresenca | null;
  desabilitado: boolean;
  carregando: boolean;
  /** Início da contagem de pausa (só nas duas pausas). */
  inicioPausa: string | null;
  onEscolher: (alvo: AlvoStatusPresenca) => void;
}) {
  const atual = OPCOES.find((o) => o.estado === selecionado) ?? null;
  const rotulo = carregando
    ? "Carregando…"
    : atual
      ? ROTULO_ESTADO_MANUAL[atual.estado]
      : "Escolha sua disponibilidade";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={desabilitado}>
          <Button
            size="sm"
            aria-label={`Meu status: ${rotulo}. Clique para alterar.`}
            className={`h-8 min-w-0 flex-1 justify-between gap-2 px-2 text-xs font-medium ${
              atual
                ? atual.ativo
                : "border border-atd-warn/60 bg-atd-warn-bg text-atd-warn-ink hover:bg-atd-warn-bg/90"
            }`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {salvando ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : atual ? (
                atual.icone
              ) : null}
              <span className="truncate">{rotulo}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {OPCOES.map((o) => {
            const ehAtual = o.estado === selecionado;
            return (
              <DropdownMenuItem
                key={o.alvo}
                onSelect={() => onEscolher(o.alvo)}
                aria-label={ROTULO_ESTADO_MANUAL[o.estado] + (ehAtual ? " (selecionado)" : "")}
                className="gap-2 text-sm"
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${o.cor}`}>
                  {o.icone}
                </span>
                <span className={ehAtual ? "font-semibold" : ""}>
                  {ROTULO_ESTADO_MANUAL[o.estado]}
                </span>
                {ehAtual && <Check className="ml-auto h-4 w-4" aria-hidden="true" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {inicioPausa && <TempoPausa inicio={inicioPausa} className="h-8 shrink-0" />}
    </>
  );
}
