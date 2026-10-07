// Janela que abre ao clicar num cartão do Dashboard operacional.
//
// • Todos os cartões: a lista das fichas que formam o número do cartão
//   (horário, paciente, procedimento, profissional, situação). Usa os dados
//   que o painel já carregou, então abre na hora e acompanha a atualização.
// • "Agendados hoje", só para a supervisão: quantos desses agendamentos cada
//   atendente marcou. A conta é a da função `rel_marcacoes_por_atendente`
//   (Relatórios → Marcações por atendente), filtrada no dia de hoje, para o
//   painel e o relatório nunca darem números diferentes. Quem não é da
//   supervisão vê só a lista de pacientes — a própria função recusa a
//   consulta; esconder a aba aqui é só para não oferecer o que vai falhar.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  formatarPercentual,
  montarRelatorio,
  type LinhaMarcacoes,
} from "@/lib/relatorios/marcacoes-por-atendente";
import {
  ehBloqueio,
  somarPorAtendente,
  TITULO_CARTAO,
  type CartaoDia,
} from "@/lib/painel/cards-do-dia";

export type FichaDia = {
  id: string;
  paciente_nome: string | null;
  paciente_id?: string | null;
  inicio: string | null;
  status: string;
  fluxo_etapa: string | null;
  procedimento: string | null;
  medico_id?: string | null;
};

const ETAPA_LABEL: Record<string, string> = {
  aguardando_recepcao: "Aguardando chegada",
  recepcao: "Na recepção",
  caixa: "No caixa",
  triagem: "Em triagem",
  atendimento: "Em atendimento",
  exame: "Em exame",
  finalizado: "Finalizado",
};

const STATUS_LABEL: Record<string, string> = {
  cancelado: "Cancelado",
  faltou: "Faltou",
  realizado: "Atendido",
};

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";

function situacao(f: FichaDia): string {
  if (STATUS_LABEL[f.status]) return STATUS_LABEL[f.status];
  if (ehBloqueio(f)) return "Bloqueio";
  return ETAPA_LABEL[f.fluxo_etapa ?? "aguardando_recepcao"] ?? f.fluxo_etapa ?? "—";
}

export function DetalheCartaoDia({
  cartao,
  onClose,
  fichas,
  medicoNome,
  dia,
  clinicaIds,
  ehSupervisor,
}: {
  cartao: CartaoDia | null;
  onClose: () => void;
  /** Fichas do cartão aberto — as mesmas que formam o número dele. */
  fichas: FichaDia[];
  medicoNome: Map<string, string>;
  dia: string;
  clinicaIds: string[];
  ehSupervisor: boolean;
}) {
  const porAtendente = cartao === "agendados" && ehSupervisor;
  return (
    <Dialog open={cartao !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{cartao ? TITULO_CARTAO[cartao] : ""}</DialogTitle>
          <DialogDescription>
            {fichas.length.toLocaleString("pt-BR")} {fichas.length === 1 ? "ficha" : "fichas"} em{" "}
            {dia.split("-").reverse().join("/")}
          </DialogDescription>
        </DialogHeader>
        {cartao &&
          (porAtendente ? (
            <Tabs defaultValue="atendente" className="flex flex-col min-h-0 flex-1">
              <TabsList className="self-start">
                <TabsTrigger value="atendente">Por atendente</TabsTrigger>
                <TabsTrigger value="pacientes">Pacientes</TabsTrigger>
              </TabsList>
              <TabsContent value="atendente" className="min-h-0 flex-1 overflow-y-auto mt-3">
                <PorAtendente fichas={fichas} dia={dia} clinicaIds={clinicaIds} />
              </TabsContent>
              <TabsContent value="pacientes" className="min-h-0 flex-1 flex flex-col mt-3">
                <ListaFichas fichas={fichas} medicoNome={medicoNome} />
              </TabsContent>
            </Tabs>
          ) : (
            <ListaFichas fichas={fichas} medicoNome={medicoNome} />
          ))}
      </DialogContent>
    </Dialog>
  );
}

function ListaFichas({
  fichas,
  medicoNome,
}: {
  fichas: FichaDia[];
  medicoNome: Map<string, string>;
}) {
  const [busca, setBusca] = useState("");
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return fichas;
    return fichas.filter((f) =>
      [f.paciente_nome, f.procedimento, f.medico_id ? medicoNome.get(f.medico_id) : null]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(t)),
    );
  }, [fichas, busca, medicoNome]);

  if (fichas.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">Nenhuma ficha neste cartão agora.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-h-0 flex-1">
      {fichas.length > 8 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente, procedimento ou profissional"
            className="pl-8 h-9"
          />
        </div>
      )}
      <ul className="divide-y divide-slate-100 overflow-y-auto min-h-0 flex-1 rounded-lg border border-slate-100">
        {visiveis.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-3 py-2">
            <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400 w-11 shrink-0">
              {hhmm(f.inicio)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-800 truncate">
                {f.paciente_nome ?? "Paciente"}
              </div>
              <div className="text-[12px] text-slate-500 truncate">
                {[f.procedimento, f.medico_id ? medicoNome.get(f.medico_id) : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </div>
            </div>
            <Badge variant="secondary" className="text-[11px] shrink-0">
              {situacao(f)}
            </Badge>
          </li>
        ))}
        {visiveis.length === 0 && (
          <li className="py-6 text-center text-sm text-slate-500">
            Nada encontrado para "{busca}".
          </li>
        )}
      </ul>
    </div>
  );
}

function PorAtendente({
  fichas,
  dia,
  clinicaIds,
}: {
  fichas: FichaDia[];
  dia: string;
  clinicaIds: string[];
}) {
  const q = useQuery({
    queryKey: ["painel-marcacoes-por-atendente", clinicaIds.join("|"), dia],
    staleTime: 30_000,
    queryFn: async () => {
      const listas = await Promise.all(
        clinicaIds.map(async (id) => {
          const { data, error } = await supabase.rpc(
            "rel_marcacoes_por_atendente" as never,
            { _clinica_id: id, _atend_ini: dia, _atend_fim: dia } as never,
          );
          if (error) throw error;
          return (data ?? []) as unknown as LinhaMarcacoes[];
        }),
      );
      return somarPorAtendente(listas);
    },
    retry: false,
  });

  const relatorio = useMemo(() => montarRelatorio(q.data ?? []), [q.data]);
  const bloqueios = useMemo(() => fichas.filter(ehBloqueio).length, [fichas]);

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  if (q.error) {
    const e = q.error as { code?: string; message?: string };
    const semPermissao = e.code === "42501" || /permiss/i.test(e.message ?? "");
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        {semPermissao
          ? "A contagem por atendente é restrita à supervisão em uma das unidades selecionadas."
          : "Não foi possível carregar a contagem por atendente agora. Tente de novo em instantes."}
      </p>
    );
  }

  const total = fichas.length;
  // Diferença residual só aparece se a agenda mudou entre o painel e esta consulta.
  const diferenca = total - relatorio.total - bloqueios;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        Dos <strong className="tabular-nums">{total.toLocaleString("pt-BR")}</strong> agendamentos
        de hoje, quem marcou cada um:
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-100">
            <th className="text-left font-semibold py-1.5">Atendente</th>
            <th className="text-right font-semibold py-1.5 w-20">Qtd</th>
            <th className="text-right font-semibold py-1.5 w-20">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {relatorio.linhas.map((l) => (
            <tr
              key={l.usuarioId ?? l.nome}
              className={cn(l.ehLinhaTecnica && "text-slate-500 italic")}
            >
              <td className="py-1.5 truncate">{l.nome}</td>
              <td className="py-1.5 text-right tabular-nums font-medium">{l.qtd}</td>
              <td className="py-1.5 text-right tabular-nums">
                {formatarPercentual(total > 0 ? (100 * l.qtd) / total : 0)}
              </td>
            </tr>
          ))}
          {bloqueios > 0 && (
            <tr className="text-slate-500 italic">
              <td className="py-1.5">Bloqueios de agenda</td>
              <td className="py-1.5 text-right tabular-nums font-medium">{bloqueios}</td>
              <td className="py-1.5 text-right tabular-nums">
                {formatarPercentual((100 * bloqueios) / total)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {diferenca !== 0 && (
        <p className="text-[12px] text-slate-500">
          A agenda mudou enquanto a janela abria ({Math.abs(diferenca)}{" "}
          {Math.abs(diferenca) === 1 ? "ficha" : "fichas"} de diferença). Feche e abra de novo para
          atualizar.
        </p>
      )}
      <p className="text-[12px] text-slate-500">
        Mesma conta de Relatórios → Marcações por atendente: cada agendamento conta para quem fez a
        marcação mais recente.
      </p>
    </div>
  );
}
