/**
 * Linha do tempo do prontuário do paciente.
 *
 * Mostra TODOS os prontuários do paciente que o usuário pode ver (o banco
 * decide pelas regras de acesso), de qualquer médico, inclusive os importados
 * do sistema antigo. Usada na ficha do paciente e na tela do médico.
 *
 * Após salvar um prontuário, chame `invalidarLinhaDoTempo(queryClient, id)`
 * para a lista se atualizar na hora.
 */
import { useMemo, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const chaveLinhaDoTempo = (pacienteId: string) => ["prontuario-linha-do-tempo", pacienteId];

export function invalidarLinhaDoTempo(qc: QueryClient, pacienteId: string) {
  return qc.invalidateQueries({ queryKey: chaveLinhaDoTempo(pacienteId) });
}

type Item = {
  id: string;
  data: string;
  medico: string | null;
  procedimento: string | null;
  especialidade: string | null;
  importado: boolean;
  queixa_principal: string | null;
  historia_doenca: string | null;
  exame_fisico: string | null;
  hipotese_diagnostica: string | null;
  conduta: string | null;
  prescricao: string | null;
  observacoes: string | null;
};

const SEM_ESPECIALIDADE = "__sem__";

/** "CONSULTA (PEDIATRIA)" → "PEDIATRIA". */
function especialidadeDoNome(proc: string | null): string | null {
  const m = /\(([^()]+)\)\s*$/.exec(proc ?? "");
  return m?.[1]?.trim() || null;
}

async function carregar(pacienteId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("prontuarios")
    .select(
      "id, data, medico_id, agendamento_id, queixa_principal, historia_doenca, exame_fisico, hipotese_diagnostica, conduta, prescricao, observacoes",
    )
    .eq("paciente_id", pacienteId)
    .order("data", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const linhas = data ?? [];

  const medIds = [...new Set(linhas.map((l) => l.medico_id).filter(Boolean))] as string[];
  const agIds = [...new Set(linhas.map((l) => l.agendamento_id).filter(Boolean))] as string[];

  const [meds, ags] = await Promise.all([
    medIds.length
      ? supabase.from("medicos").select("id, nome").in("id", medIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    agIds.length
      ? supabase
          .from("agendamentos")
          .select("id, procedimento, especialidade_id, especialidades(nome)")
          .in("id", agIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const nomeMed = new Map((meds.data ?? []).map((m) => [m.id, m.nome]));
  const agMap = new Map(((ags.data ?? []) as any[]).map((a) => [a.id, a]));

  return linhas.map((l) => {
    const ag = l.agendamento_id ? agMap.get(l.agendamento_id) : null;
    const procedimento: string | null = ag?.procedimento ?? null;
    const especialidade: string | null =
      ag?.especialidades?.nome ?? especialidadeDoNome(procedimento) ?? null;
    return {
      id: l.id,
      data: l.data,
      medico: l.medico_id ? (nomeMed.get(l.medico_id) ?? null) : null,
      procedimento,
      especialidade,
      importado: (l.observacoes ?? "").startsWith("[IMPORTADO DO SISTEMA ANTIGO"),
      queixa_principal: l.queixa_principal,
      historia_doenca: l.historia_doenca,
      exame_fisico: l.exame_fisico,
      hipotese_diagnostica: l.hipotese_diagnostica,
      conduta: l.conduta,
      prescricao: l.prescricao,
      observacoes: l.observacoes,
    };
  });
}

const CAMPOS: Array<[keyof Item, string]> = [
  ["queixa_principal", "Queixa principal"],
  ["historia_doenca", "Evolução / história"],
  ["exame_fisico", "Exame físico"],
  ["hipotese_diagnostica", "Hipótese diagnóstica"],
  ["conduta", "Conduta"],
  ["prescricao", "Prescrição"],
];

export function LinhaDoTempoProntuario({ pacienteId }: { pacienteId: string }) {
  const q = useQuery({
    queryKey: chaveLinhaDoTempo(pacienteId),
    queryFn: () => carregar(pacienteId),
    enabled: !!pacienteId,
  });
  const itens = q.data ?? [];

  const anos = useMemo(
    () => [...new Set(itens.map((i) => new Date(i.data).getFullYear()))].sort((a, b) => b - a),
    [itens],
  );
  const [ano, setAno] = useState<number | null>(null); // null = todos
  const [esp, setEsp] = useState<string>("todas");
  const [extras, setExtras] = useState(false);

  const especialidades = useMemo(
    () => [...new Set(itens.map((i) => i.especialidade).filter(Boolean))].sort() as string[],
    [itens],
  );

  const visiveis = itens.filter((i) => {
    if (ano !== null && new Date(i.data).getFullYear() !== ano) return false;
    if (esp === "todas") return true;
    if (esp === SEM_ESPECIALIDADE) return !i.especialidade;
    return i.especialidade === esp;
  });

  const idxAno = ano === null ? -1 : anos.indexOf(ano);
  // ‹ vai para o ano anterior (mais antigo), › para o mais recente.
  const anterior = () => {
    if (!anos.length) return;
    setAno(idxAno === -1 ? anos[0]! : (anos[Math.min(idxAno + 1, anos.length - 1)] ?? null));
  };
  const proximo = () => {
    if (idxAno <= 0) setAno(null);
    else setAno(anos[idxAno - 1] ?? null);
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando prontuários…</p>;
  if (q.error)
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar o histórico de prontuários.
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={anterior} aria-label="Ano anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-24 text-center text-sm font-medium">
            {ano ?? "Todos os anos"}
          </span>
          <Button variant="outline" size="icon" onClick={proximo} aria-label="Próximo ano">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Select value={esp} onValueChange={setEsp}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as especialidades</SelectItem>
            {especialidades.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
            <SelectItem value={SEM_ESPECIALIDADE}>Sem especialidade</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox id="extras-pront" checked={extras} onCheckedChange={(v) => setExtras(!!v)} />
          <Label htmlFor="extras-pront">Exibir informações extras</Label>
        </div>
        <span className="text-xs text-muted-foreground">
          {visiveis.length} de {itens.length} registro(s)
        </span>
      </div>

      {visiveis.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum prontuário neste filtro.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-6">
          {visiveis.map((i) => {
            const d = new Date(i.data);
            const preenchidos = CAMPOS.filter(([k]) => (i[k] as string | null)?.trim());
            return (
              <li key={i.id} className="relative">
                <span className="absolute -left-[31px] top-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <FileText className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
                <Card>
                  <CardContent className="space-y-2 p-4 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">
                        {d.toLocaleDateString("pt-BR")}{" "}
                        <span className="font-normal text-muted-foreground">
                          {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                      {i.importado && (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Importado do sistema antigo
                        </span>
                      )}
                    </div>
                    <p>
                      <span className="text-muted-foreground">Procedimento realizado: </span>
                      {[i.especialidade, i.procedimento].filter(Boolean).join(" > ") || "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Realizado por: </span>
                      {i.medico ?? "—"}
                    </p>
                    <div>
                      <p className="text-muted-foreground">Descrição do procedimento realizado:</p>
                      {preenchidos.length === 0 ? (
                        <p className="italic text-muted-foreground">Prontuário não cadastrado.</p>
                      ) : extras ? (
                        <div className="mt-1 space-y-1">
                          {preenchidos.map(([k, rot]) => (
                            <p key={k} className="whitespace-pre-wrap">
                              <span className="font-medium">{rot}: </span>
                              {i[k] as string}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap">
                          {(i.historia_doenca || i.queixa_principal || (preenchidos[0] && (i[preenchidos[0][0]] as string))) ?? ""}
                        </p>
                      )}
                    </div>
                    {extras && i.observacoes?.trim() && (
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                        Observações: {i.observacoes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
