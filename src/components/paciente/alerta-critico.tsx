import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Sinalização vermelha de paciente com ocorrência crítica (processo judicial,
 * Procon, disputa em andamento).
 *
 * A tarja é auto-suficiente: recebe só o `pacienteId` e vai buscar o alerta
 * sozinha, agrupando os ids que aparecem no mesmo instante numa consulta só.
 * Foi feita assim porque a marca precisa aparecer em telas muito diferentes —
 * fila da recepção, fluxo, agenda, check-in, triagem, busca de pacientes — e
 * levar o dado a mão até cada uma delas significaria mexer no carregamento de
 * seis telas grandes, cada uma com o seu próprio jeito de montar os mapas de
 * paciente. O agrupamento é o mesmo truque de `@/components/paciente-nome`.
 *
 * O alerta NUNCA deve ser colocado em superfície pública (painel de senhas,
 * totem, tela de espera): ali o motivo ficaria visível para a sala de espera
 * inteira. Só telas internas, atrás de login.
 */

export type AlertaCriticoPaciente = {
  critico: boolean;
  motivo: string | null;
};

const SEM_ALERTA: AlertaCriticoPaciente = { critico: false, motivo: null };

// Cache global id -> alerta. Sobrevive à troca de tela, some no reload.
const cache = new Map<string, AlertaCriticoPaciente>();
// Ids ainda não resolvidos e quem está esperando cada um.
const pendentes = new Map<string, Array<(a: AlertaCriticoPaciente) => void>>();
let agendado: ReturnType<typeof setTimeout> | null = null;

function agendarBusca() {
  if (agendado) return;
  agendado = setTimeout(async () => {
    agendado = null;
    const ids = Array.from(pendentes.keys());
    if (ids.length === 0) return;
    const ouvintes = new Map(pendentes);
    pendentes.clear();
    const { data } = await supabase
      .from("pacientes")
      .select("id, alerta_critico, alerta_motivo")
      .in("id", ids);
    for (const linha of (data ?? []) as Array<{
      id: string;
      alerta_critico: boolean | null;
      alerta_motivo: string | null;
    }>) {
      const alerta: AlertaCriticoPaciente = {
        critico: linha.alerta_critico === true,
        motivo: linha.alerta_motivo ?? null,
      };
      cache.set(linha.id, alerta);
      for (const avisar of ouvintes.get(linha.id) ?? []) avisar(alerta);
      ouvintes.delete(linha.id);
    }
    // Ids que não voltaram (sem permissão, apagados) ficam sem alerta — a
    // ausência de resposta nunca pode virar uma tarja vermelha errada.
    for (const [id, avisos] of ouvintes) {
      cache.set(id, SEM_ALERTA);
      for (const avisar of avisos) avisar(SEM_ALERTA);
    }
  }, 40);
}

/**
 * Esquece o alerta guardado, para a próxima tela reler do banco.
 * Chame depois de salvar o cadastro do paciente.
 */
export function invalidarAlertaCritico(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
}

/** Grava o alerta já conhecido, evitando uma ida ao banco. */
export function cacheAlertaCritico(id: string, alerta: AlertaCriticoPaciente) {
  cache.set(id, alerta);
}

/** Alerta crítico de um paciente. Devolve "sem alerta" enquanto carrega. */
export function useAlertaCritico(id: string | null | undefined): AlertaCriticoPaciente {
  const [alerta, setAlerta] = useState<AlertaCriticoPaciente>(() =>
    id ? (cache.get(id) ?? SEM_ALERTA) : SEM_ALERTA,
  );
  useEffect(() => {
    if (!id) {
      setAlerta(SEM_ALERTA);
      return;
    }
    const guardado = cache.get(id);
    if (guardado !== undefined) {
      setAlerta(guardado);
      return;
    }
    let vivo = true;
    const lista = pendentes.get(id) ?? [];
    lista.push((a) => {
      if (vivo) setAlerta(a);
    });
    pendentes.set(id, lista);
    agendarBusca();
    return () => {
      vivo = false;
    };
  }, [id]);
  return alerta;
}

/**
 * Tarja vermelha ao lado do nome do paciente. Não renderiza nada para quem
 * não tem alerta, então pode ser colocada em qualquer lista sem condicional.
 *
 * O motivo aparece ao passar o mouse (ou ao focar pelo teclado). O balão abre
 * sem espera porque em tela de balcão qualquer atraso é lido como travamento.
 */
export function BadgeAlertaCritico({
  pacienteId,
  compact,
  className = "",
  rotulo = "ALERTA",
}: {
  pacienteId: string | null | undefined;
  compact?: boolean;
  className?: string;
  /** Texto dentro da tarja. Use "JUDICIAL" onde couber mais letras. */
  rotulo?: string;
}) {
  const { critico, motivo } = useAlertaCritico(pacienteId);
  if (!critico) return null;
  const texto = motivo ?? "Ocorrência crítica registrada pela supervisão.";
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            role="note"
            aria-label={`Alerta crítico: ${texto}`}
            className={`shrink-0 max-w-full overflow-hidden bg-red-600 text-white border border-red-700 tracking-wide inline-flex items-center gap-1 cursor-help ${
              compact
                ? "px-1.5 py-0.5 text-[10px] font-bold rounded"
                : "px-3 py-1 text-xs font-bold rounded-full"
            } ${className}`}
          >
            <AlertTriangle className={compact ? "h-2.5 w-2.5 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
            <span className="truncate">{rotulo}</span>
          </span>
        </TooltipTrigger>
        {/* `duration-0` zera a animação de entrada do balão. A Agenda é uma
            tela "seca" de propósito — a recepcionista precisa da resposta no
            mesmo instante do mouse — e o mesmo comportamento instantâneo não
            atrapalha nenhuma das outras telas onde a tarja aparece. */}
        <TooltipContent
          side="top"
          className="max-w-xs bg-red-600 text-white text-[12px] leading-snug duration-0"
        >
          <div className="font-bold uppercase tracking-wide">Alerta crítico</div>
          <div className="mt-0.5 whitespace-pre-wrap">{texto}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Faixa vermelha fixa no topo do prontuário/atendimento.
 *
 * Diferente da tarja, aqui o motivo fica escrito por extenso: o médico está
 * prestes a começar a consulta e não deveria precisar caçar um balão para
 * descobrir que existe processo em andamento.
 */
export function BannerAlertaCritico({
  pacienteId,
  className = "",
}: {
  pacienteId: string | null | undefined;
  className?: string;
}) {
  const { critico, motivo } = useAlertaCritico(pacienteId);
  if (!critico) return null;
  return (
    <div
      role="alert"
      className={`rounded-md border-2 border-red-600 bg-red-600/10 px-3 py-2.5 flex items-start gap-2 ${className}`}
    >
      <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[12px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">
          Atenção especial — ocorrência crítica
        </div>
        <div className="text-sm text-foreground whitespace-pre-wrap wrap-break-word">
          {motivo ?? "Ocorrência crítica registrada pela supervisão."}
        </div>
      </div>
    </div>
  );
}
