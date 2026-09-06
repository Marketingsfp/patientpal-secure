/**
 * Base de Conhecimentos → Informações da clínica → Horário de funcionamento.
 *
 * Reutiliza o calendário existente da Nina. Distingue explicitamente:
 * aberto (faixas), fechado (declarado) e não configurado (ninguém preencheu).
 * Nenhum horário fictício é preenchido pelo sistema.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import {
  DIAS_SEMANA,
  type DiaHorario,
  type Faixa,
  estadoDoDia,
  validarDia,
  validarExcecao,
  validarVigencia,
} from "@/lib/nina/horario-funcionamento";
import {
  listarHorarioFuncionamento,
  removerExcecaoHorario,
  salvarDiaHorario,
  salvarExcecaoHorario,
} from "@/lib/nina/horario-funcionamento.functions";

const hoje = () => new Date().toISOString().slice(0, 10);

type Props = { clinicaId?: string; podeEditar: boolean };

export function HorarioFuncionamento({ clinicaId, podeEditar }: Props) {
  const qc = useQueryClient();
  const listar = useServerFn(listarHorarioFuncionamento);
  const salvarDia = useServerFn(salvarDiaHorario);
  const salvarExc = useServerFn(salvarExcecaoHorario);
  const removerExc = useServerFn(removerExcecaoHorario);

  const { data, isLoading } = useQuery({
    queryKey: ["nina-horario", clinicaId],
    enabled: !!clinicaId,
    queryFn: () => listar({ data: { clinicaId: clinicaId! } }),
  });

  const [rascunho, setRascunho] = useState<Record<number, DiaHorario>>({});
  const [vigencia, setVigencia] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");

  const vigenciaAtual = vigencia || (data?.dias?.[0]?.vigencia_inicio as string | undefined) || hoje();

  const salvos = useMemo(() => {
    const mapa: Record<number, DiaHorario> = {};
    for (const linha of data?.dias ?? []) {
      const d = Number((linha as any).dia_semana);
      mapa[d] ??= { dia_semana: d, fechado: false, faixas: [] };
      if ((linha as any).fechado) mapa[d].fechado = true;
      else if ((linha as any).hora_inicio)
        mapa[d].faixas.push({
          hora_inicio: (linha as any).hora_inicio,
          hora_fim: (linha as any).hora_fim,
        });
    }
    return mapa;
  }, [data]);

  const dia = (n: number): DiaHorario =>
    rascunho[n] ?? salvos[n] ?? { dia_semana: n, fechado: false, faixas: [] };

  const alterar = (n: number, patch: Partial<DiaHorario>) =>
    setRascunho((r) => ({ ...r, [n]: { ...dia(n), ...patch } }));

  const mSalvarDia = useMutation({
    mutationFn: (n: number) =>
      salvarDia({
        data: {
          clinicaId: clinicaId!,
          diaSemana: n,
          fechado: dia(n).fechado,
          faixas: dia(n).faixas,
          vigenciaInicio: vigenciaAtual,
          observacao: observacao || null,
        },
      }),
    onSuccess: (_r, n) => {
      setRascunho((r) => {
        const c = { ...r };
        delete c[n];
        return c;
      });
      qc.invalidateQueries({ queryKey: ["nina-horario", clinicaId] });
      toast.success("Horário salvo.");
    },
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível salvar.")),
  });

  /* ---------------- Exceções por data ---------------- */
  const [exc, setExc] = useState({ data: "", tipo: "fechado" as "fechado" | "especial", ini: "", fim: "", desc: "" });

  const mSalvarExc = useMutation({
    mutationFn: () =>
      salvarExc({
        data: {
          clinicaId: clinicaId!,
          data: exc.data,
          tipo: exc.tipo,
          horaInicio: exc.tipo === "especial" ? exc.ini : null,
          horaFim: exc.tipo === "especial" ? exc.fim : null,
          descricao: exc.desc || null,
        },
      }),
    onSuccess: () => {
      setExc({ data: "", tipo: "fechado", ini: "", fim: "", desc: "" });
      qc.invalidateQueries({ queryKey: ["nina-horario", clinicaId] });
      toast.success("Exceção cadastrada.");
    },
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível salvar a exceção.")),
  });

  const mRemoverExc = useMutation({
    mutationFn: (id: string) => removerExc({ data: { clinicaId: clinicaId!, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nina-horario", clinicaId] }),
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível remover.")),
  });

  if (!clinicaId) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando horário…</p>;

  const errosVigencia = validarVigencia(vigenciaAtual, null);
  const errosExc = exc.data
    ? validarExcecao({ data: exc.data, tipo: exc.tipo, hora_inicio: exc.ini || null, hora_fim: exc.fim || null })
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horário de funcionamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Vale para a clínica/unidade selecionada. Fuso horário da operação:{" "}
            <strong>{data?.fuso ?? "America/Sao_Paulo"}</strong>. Um dia sem configuração não significa que a clínica
            estava fechada — para isso, marque “Fechado”.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="vigencia">Válido a partir de</Label>
              <Input
                id="vigencia"
                type="date"
                value={vigenciaAtual}
                disabled={!podeEditar}
                onChange={(e) => setVigencia(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="obs-horario">Observações</Label>
              <Textarea
                id="obs-horario"
                rows={2}
                placeholder="Texto complementar (não substitui os horários acima)"
                value={observacao}
                disabled={!podeEditar}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
          </div>
          {errosVigencia.map((e) => (
            <p key={e} role="alert" className="text-sm text-destructive">
              {e}
            </p>
          ))}

          <div className="space-y-3">
            {DIAS_SEMANA.map((nome, n) => {
              const d = dia(n);
              const estado = estadoDoDia(salvos[n]);
              const erros = validarDia(d);
              const alterado = !!rascunho[n];
              return (
                <div key={nome} className="rounded-lg border p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{nome}</span>
                      <Badge variant={estado === "aberto" ? "default" : estado === "fechado" ? "destructive" : "secondary"}>
                        {estado === "aberto" ? "Aberto" : estado === "fechado" ? "Fechado" : "Não configurado"}
                      </Badge>
                      {alterado && <Badge variant="outline">Rascunho não salvo</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`fechado-${n}`} className="text-sm">
                        Fechado
                      </Label>
                      <Switch
                        id={`fechado-${n}`}
                        checked={d.fechado}
                        disabled={!podeEditar}
                        aria-label={`Marcar ${nome} como fechado`}
                        onCheckedChange={(v) => alterar(n, { fechado: v, faixas: v ? [] : d.faixas })}
                      />
                    </div>
                  </div>

                  {!d.fechado && (
                    <div className="space-y-2">
                      {d.faixas.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhuma faixa cadastrada para este dia.</p>
                      )}
                      {d.faixas.map((f: Faixa, i) => (
                        <div key={i} className="flex flex-wrap items-end gap-2">
                          <div className="space-y-1">
                            <Label htmlFor={`ini-${n}-${i}`} className="text-xs">
                              Início
                            </Label>
                            <Input
                              id={`ini-${n}-${i}`}
                              type="time"
                              className="w-32"
                              value={f.hora_inicio}
                              disabled={!podeEditar}
                              onChange={(e) => {
                                const faixas = d.faixas.map((x, k) =>
                                  k === i ? { ...x, hora_inicio: e.target.value } : x,
                                );
                                alterar(n, { faixas });
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`fim-${n}-${i}`} className="text-xs">
                              Fim
                            </Label>
                            <Input
                              id={`fim-${n}-${i}`}
                              type="time"
                              className="w-32"
                              value={f.hora_fim}
                              disabled={!podeEditar}
                              onChange={(e) => {
                                const faixas = d.faixas.map((x, k) => (k === i ? { ...x, hora_fim: e.target.value } : x));
                                alterar(n, { faixas });
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={!podeEditar}
                            aria-label={`Remover faixa ${i + 1} de ${nome}`}
                            onClick={() => alterar(n, { faixas: d.faixas.filter((_, k) => k !== i) })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!podeEditar || d.faixas.length >= 6}
                        onClick={() => alterar(n, { faixas: [...d.faixas, { hora_inicio: "", hora_fim: "" }] })}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Adicionar faixa
                      </Button>
                    </div>
                  )}

                  {erros.map((e) => (
                    <p key={e} role="alert" className="text-sm text-destructive">
                      {e}
                    </p>
                  ))}

                  {podeEditar && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={erros.length > 0 || errosVigencia.length > 0 || mSalvarDia.isPending}
                      onClick={() => mSalvarDia.mutate(n)}
                    >
                      Salvar {nome}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exceções por data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="exc-data">Data</Label>
              <Input
                id="exc-data"
                type="date"
                value={exc.data}
                disabled={!podeEditar}
                onChange={(e) => setExc({ ...exc, data: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exc-tipo">Tipo</Label>
              <select
                id="exc-tipo"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={exc.tipo}
                disabled={!podeEditar}
                onChange={(e) => setExc({ ...exc, tipo: e.target.value as "fechado" | "especial" })}
              >
                <option value="fechado">Fechado</option>
                <option value="especial">Funcionamento especial</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exc-ini">Início</Label>
              <Input
                id="exc-ini"
                type="time"
                value={exc.ini}
                disabled={!podeEditar || exc.tipo !== "especial"}
                onChange={(e) => setExc({ ...exc, ini: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exc-fim">Fim</Label>
              <Input
                id="exc-fim"
                type="time"
                value={exc.fim}
                disabled={!podeEditar || exc.tipo !== "especial"}
                onChange={(e) => setExc({ ...exc, fim: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="exc-desc">Descrição</Label>
            <Input
              id="exc-desc"
              value={exc.desc}
              placeholder="Ex.: feriado municipal"
              disabled={!podeEditar}
              onChange={(e) => setExc({ ...exc, desc: e.target.value })}
            />
          </div>
          {errosExc.map((e) => (
            <p key={e} role="alert" className="text-sm text-destructive">
              {e}
            </p>
          ))}
          {podeEditar && (
            <Button
              type="button"
              size="sm"
              disabled={!exc.data || errosExc.length > 0 || mSalvarExc.isPending}
              onClick={() => mSalvarExc.mutate()}
            >
              Cadastrar exceção
            </Button>
          )}

          <ul className="divide-y rounded-md border">
            {(data?.excecoes ?? []).length === 0 && (
              <li className="p-3 text-sm text-muted-foreground">Nenhuma exceção cadastrada.</li>
            )}
            {(data?.excecoes ?? []).map((e: any) => (
              <li key={e.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <strong>{e.data}</strong> — {e.tipo === "fechado" ? "Fechado" : `Especial ${e.hora_inicio}–${e.hora_fim}`}
                  {e.descricao ? ` · ${e.descricao}` : ""}
                </span>
                {podeEditar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover exceção de ${e.data}`}
                    onClick={() => mRemoverExc.mutate(e.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
