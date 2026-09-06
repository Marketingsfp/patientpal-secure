/**
 * Base de Conhecimentos → Informações da clínica → Horário de funcionamento.
 *
 * Fonte única do horário oficial: o calendário da Nina, agora com versões.
 * Rascunho não tem efeito nenhum; só a versão publicada é usada pela Nina e
 * pelas métricas. Publicar cria uma versão nova e preserva a anterior.
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import {
  DIAS_SEMANA,
  type DiaHorario,
  type Faixa,
  ehRetroativa,
  estadoDoDia,
  podePublicarRetroativo,
  validarDia,
  validarExcecao,
  validarVigencia,
} from "@/lib/nina/horario-funcionamento";
import {
  atualizarRascunhoHorario,
  criarRascunhoHorario,
  descartarRascunhoHorario,
  listarHorarioFuncionamento,
  publicarHorario,
  removerExcecaoHorario,
  salvarDiaHorario,
  salvarExcecaoHorario,
} from "@/lib/nina/horario-funcionamento.functions";

type Props = { clinicaId?: string; podeEditar: boolean };

type LinhaDia = { dia_semana: number; fechado: boolean; hora_inicio: string | null; hora_fim: string | null };

function agrupar(linhas: LinhaDia[]): Record<number, DiaHorario> {
  const mapa: Record<number, DiaHorario> = {};
  for (const l of linhas ?? []) {
    const d = Number(l.dia_semana);
    mapa[d] ??= { dia_semana: d, fechado: false, faixas: [] };
    if (l.fechado) mapa[d].fechado = true;
    else if (l.hora_inicio) mapa[d].faixas.push({ hora_inicio: l.hora_inicio, hora_fim: l.hora_fim ?? "" });
  }
  return mapa;
}

function resumoDia(d: DiaHorario | undefined) {
  if (!d) return "Não configurado";
  if (d.fechado) return "Fechado";
  if (!d.faixas.length) return "Não configurado";
  return d.faixas.map((f) => `${f.hora_inicio}–${f.hora_fim}`).join(", ");
}

export function HorarioFuncionamento({ clinicaId, podeEditar }: Props) {
  const qc = useQueryClient();
  const listar = useServerFn(listarHorarioFuncionamento);
  const criarRascunho = useServerFn(criarRascunhoHorario);
  const atualizarRascunho = useServerFn(atualizarRascunhoHorario);
  const descartarRascunho = useServerFn(descartarRascunhoHorario);
  const salvarDia = useServerFn(salvarDiaHorario);
  const salvarExc = useServerFn(salvarExcecaoHorario);
  const removerExc = useServerFn(removerExcecaoHorario);
  const publicar = useServerFn(publicarHorario);

  const { data, isLoading } = useQuery({
    queryKey: ["nina-horario", clinicaId],
    enabled: !!clinicaId,
    queryFn: () => listar({ data: { clinicaId: clinicaId! } }),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ["nina-horario", clinicaId] });

  const rascunho = (data as any)?.rascunho ?? null;
  const vigente = (data as any)?.vigente ?? null;
  const versoes: any[] = (data as any)?.versoes ?? [];
  const hoje: string = (data as any)?.hoje ?? new Date().toISOString().slice(0, 10);
  const role: string = (data as any)?.role ?? "";

  const [edicao, setEdicao] = useState<Record<number, DiaHorario>>({});
  const [vigenciaNova, setVigenciaNova] = useState<string>("");
  const [confirmarPub, setConfirmarPub] = useState(false);
  const [motivoRetro, setMotivoRetro] = useState("");
  const [conflitos, setConflitos] = useState<any[] | null>(null);

  const salvos = useMemo(() => agrupar(rascunho?.dias ?? []), [rascunho]);
  const oficiais = useMemo(() => agrupar(vigente?.dias ?? []), [vigente]);

  const dia = (n: number): DiaHorario => edicao[n] ?? salvos[n] ?? { dia_semana: n, fechado: false, faixas: [] };
  const alterar = (n: number, patch: Partial<DiaHorario>) => setEdicao((r) => ({ ...r, [n]: { ...dia(n), ...patch } }));

  const mCriar = useMutation({
    mutationFn: (copiar: boolean) =>
      criarRascunho({
        data: {
          clinicaId: clinicaId!,
          vigenciaInicio: vigenciaNova || hoje,
          copiarDaVersaoId: copiar ? (vigente?.id ?? null) : null,
        },
      }),
    onSuccess: () => {
      setEdicao({});
      invalidar();
      toast.success("Rascunho criado. Ele ainda não vale para a Nina nem para as métricas.");
    },
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível criar o rascunho.")),
  });

  const mVigencia = useMutation({
    mutationFn: (valor: string) =>
      atualizarRascunho({ data: { versaoId: rascunho!.id, vigenciaInicio: valor, observacao: rascunho?.observacao ?? null } }),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível atualizar a validade.")),
  });

  const mObs = useMutation({
    mutationFn: (valor: string) =>
      atualizarRascunho({ data: { versaoId: rascunho!.id, vigenciaInicio: rascunho!.vigencia_inicio, observacao: valor || null } }),
    onSuccess: invalidar,
  });

  const mDescartar = useMutation({
    mutationFn: () => descartarRascunho({ data: { versaoId: rascunho!.id } }),
    onSuccess: () => {
      setEdicao({});
      invalidar();
      toast.success("Rascunho descartado.");
    },
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível descartar.")),
  });

  const mSalvarDia = useMutation({
    mutationFn: (n: number) =>
      salvarDia({ data: { versaoId: rascunho!.id, diaSemana: n, fechado: dia(n).fechado, faixas: dia(n).faixas } }),
    onSuccess: (_r, n) => {
      setEdicao((r) => {
        const c = { ...r };
        delete c[n];
        return c;
      });
      invalidar();
      toast.success("Salvo no rascunho.");
    },
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível salvar.")),
  });

  const [exc, setExc] = useState({ data: "", tipo: "fechado" as "fechado" | "especial", ini: "", fim: "", desc: "" });

  const mSalvarExc = useMutation({
    mutationFn: () =>
      salvarExc({
        data: {
          versaoId: rascunho!.id,
          data: exc.data,
          tipo: exc.tipo,
          horaInicio: exc.tipo === "especial" ? exc.ini : null,
          horaFim: exc.tipo === "especial" ? exc.fim : null,
          descricao: exc.desc || null,
        },
      }),
    onSuccess: () => {
      setExc({ data: "", tipo: "fechado", ini: "", fim: "", desc: "" });
      invalidar();
      toast.success("Exceção cadastrada no rascunho.");
    },
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível salvar a exceção.")),
  });

  const mRemoverExc = useMutation({
    mutationFn: (id: string) => removerExc({ data: { versaoId: rascunho!.id, id } }),
    onSuccess: invalidar,
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível remover.")),
  });

  const mPublicar = useMutation({
    mutationFn: (confirmar: boolean) =>
      publicar({
        data: {
          versaoId: rascunho!.id,
          confirmarConflito: confirmar,
          motivoRetroativo: motivoRetro || null,
        },
      }),
    onSuccess: (r: any) => {
      if (r?.ok === false && r?.conflitos) {
        setConflitos(r.conflitos);
        return;
      }
      setConflitos(null);
      setConfirmarPub(false);
      setMotivoRetro("");
      setEdicao({});
      invalidar();
      toast.success(`Versão ${r?.versao ?? ""} publicada. A partir de agora é o horário oficial.`);
    },
    onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível publicar.")),
  });

  if (!clinicaId) return <p className="text-sm text-muted-foreground">Selecione uma clínica.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando horário…</p>;

  const vigenciaRascunho = rascunho?.vigencia_inicio ?? "";
  const errosVigencia = rascunho ? validarVigencia(vigenciaRascunho, null) : [];
  const retro = rascunho ? ehRetroativa(vigenciaRascunho, hoje) : false;
  const temDiaConfigurado = (rascunho?.dias ?? []).length > 0;
  const errosExc = exc.data
    ? validarExcecao({ data: exc.data, tipo: exc.tipo, hora_inicio: exc.ini || null, hora_fim: exc.fim || null })
    : [];
  const bloqueiaRetro = retro && (!podePublicarRetroativo(role) || motivoRetro.trim().length < 5);

  return (
    <div className="space-y-4">
      {/* -------- Versão oficial em vigor -------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horário oficial em vigor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            É o único horário usado pela Nina e pelas métricas. Fuso da operação:{" "}
            <strong>{(data as any)?.fuso ?? "America/Sao_Paulo"}</strong>.
          </p>
          {!vigente ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma versão publicada. Enquanto não houver, os atendimentos ficam como “não classificáveis” — o sistema
              não presume que a clínica estava aberta nem fechada.
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Versão {vigente.versao}</Badge>
                <span className="text-muted-foreground">
                  Vale a partir de {vigente.vigencia_inicio}
                  {vigente.vigencia_fim ? ` até ${vigente.vigencia_fim}` : ""} · publicada em{" "}
                  {String(vigente.publicado_em ?? "").slice(0, 10)}
                </span>
                {vigente.retroativa && <Badge variant="outline">Publicada com efeito retroativo</Badge>}
              </div>
              <ul className="grid gap-1 sm:grid-cols-2">
                {DIAS_SEMANA.map((nome, n) => (
                  <li key={nome} className="flex justify-between gap-2 rounded border px-2 py-1">
                    <span>{nome}</span>
                    <span className="text-muted-foreground">{resumoDia(oficiais[n])}</span>
                  </li>
                ))}
              </ul>
              {(vigente.excecoes ?? []).length > 0 && (
                <p className="text-muted-foreground">
                  Exceções nesta versão:{" "}
                  {(vigente.excecoes ?? [])
                    .map((e: any) => `${e.data} (${e.tipo === "fechado" ? "fechado" : `${e.hora_inicio}–${e.hora_fim}`})`)
                    .join(", ")}
                </p>
              )}
            </div>
          )}

          {podeEditar && !rascunho && (
            <div className="flex flex-wrap items-end gap-3 border-t pt-3">
              <div className="space-y-1">
                <Label htmlFor="nova-vigencia">Novo horário válido a partir de</Label>
                <Input
                  id="nova-vigencia"
                  type="date"
                  value={vigenciaNova || hoje}
                  onChange={(e) => setVigenciaNova(e.target.value)}
                />
              </div>
              <Button type="button" size="sm" disabled={mCriar.isPending} onClick={() => mCriar.mutate(!!vigente)}>
                {vigente ? "Criar rascunho a partir da versão atual" : "Criar rascunho"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* -------- Rascunho -------- */}
      {rascunho && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                Rascunho — versão {rascunho.versao}
                <Badge variant="secondary">Sem efeito até publicar</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Alterar este rascunho não muda nada no atendimento da Nina nem nas métricas. Um dia sem configuração não
                significa que a clínica estava fechada — para isso, marque “Fechado”.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="vigencia">Válido a partir de</Label>
                  <Input
                    id="vigencia"
                    type="date"
                    defaultValue={vigenciaRascunho}
                    disabled={!podeEditar}
                    onBlur={(e) => e.target.value !== vigenciaRascunho && mVigencia.mutate(e.target.value)}
                  />
                  {retro && (
                    <p className="text-sm text-muted-foreground">
                      Data no passado: a publicação será retroativa e afeta a classificação de atendimentos já ocorridos.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="obs-horario">Observações</Label>
                  <Textarea
                    id="obs-horario"
                    rows={2}
                    placeholder="Texto complementar (não substitui os horários abaixo)"
                    defaultValue={rascunho.observacao ?? ""}
                    disabled={!podeEditar}
                    onBlur={(e) => e.target.value !== (rascunho.observacao ?? "") && mObs.mutate(e.target.value)}
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
                  const alterado = !!edicao[n];
                  return (
                    <div key={nome} className="rounded-lg border p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{nome}</span>
                          <Badge
                            variant={estado === "aberto" ? "default" : estado === "fechado" ? "destructive" : "secondary"}
                          >
                            {estado === "aberto" ? "Aberto" : estado === "fechado" ? "Fechado" : "Não configurado"}
                          </Badge>
                          {alterado && <Badge variant="outline">Alteração não salva</Badge>}
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
                                  onChange={(e) =>
                                    alterar(n, {
                                      faixas: d.faixas.map((x, k) => (k === i ? { ...x, hora_inicio: e.target.value } : x)),
                                    })
                                  }
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
                                  onChange={(e) =>
                                    alterar(n, {
                                      faixas: d.faixas.map((x, k) => (k === i ? { ...x, hora_fim: e.target.value } : x)),
                                    })
                                  }
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
                          disabled={erros.length > 0 || mSalvarDia.isPending}
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
              <CardTitle className="text-base">Exceções por data (deste rascunho)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Uma data cadastrada aqui prevalece sobre a programação da semana. O sistema não deduz feriados: só vale o
                que estiver cadastrado.
              </p>
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
                {(rascunho.excecoes ?? []).length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">Nenhuma exceção cadastrada neste rascunho.</li>
                )}
                {(rascunho.excecoes ?? []).map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <span>
                      <strong>{e.data}</strong> —{" "}
                      {e.tipo === "fechado" ? "Fechado" : `Especial ${e.hora_inicio}–${e.hora_fim}`}
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

              {podeEditar && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    type="button"
                    disabled={!temDiaConfigurado || errosVigencia.length > 0}
                    onClick={() => {
                      setConflitos(null);
                      setConfirmarPub(true);
                    }}
                  >
                    Revisar e publicar
                  </Button>
                  <Button type="button" variant="outline" onClick={() => mDescartar.mutate()} disabled={mDescartar.isPending}>
                    Descartar rascunho
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* -------- Histórico de versões -------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de versões</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm text-muted-foreground">
            Um atendimento antigo continua sendo avaliado pela versão que valia na data dele.
          </p>
          <ul className="divide-y rounded-md border text-sm">
            {versoes.length === 0 && <li className="p-3 text-muted-foreground">Nenhuma versão ainda.</li>}
            {versoes.map((v: any) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={v.status === "publicado" ? "default" : v.status === "rascunho" ? "secondary" : "outline"}>
                    Versão {v.versao} · {v.status === "publicado" ? "Publicada" : v.status === "rascunho" ? "Rascunho" : "Substituída"}
                  </Badge>
                  <span className="text-muted-foreground">
                    Vale de {v.vigencia_inicio}
                    {v.vigencia_fim ? ` a ${v.vigencia_fim}` : " em diante"}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {v.publicado_em ? `Publicada em ${String(v.publicado_em).slice(0, 10)}` : "Ainda não publicada"}
                  {v.retroativa ? ` · retroativa: ${v.motivo_retroativo ?? ""}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* -------- Confirmação de publicação -------- */}
      <Dialog open={confirmarPub} onOpenChange={setConfirmarPub}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Publicar horário — versão {rascunho?.versao}</DialogTitle>
            <DialogDescription>
              Confira antes de publicar. Depois de publicada, esta versão vira o histórico oficial e não pode ser editada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p>
              <strong>Escopo:</strong> clínica selecionada{rascunho?.unidade_id ? " (unidade específica)" : " (todas as unidades)"} ·{" "}
              <strong>Fuso:</strong> {(data as any)?.fuso}
            </p>
            <p>
              <strong>Vale a partir de:</strong> {vigenciaRascunho} {retro && <Badge variant="outline">retroativa</Badge>}
            </p>
            <ul className="grid gap-1">
              {DIAS_SEMANA.map((nome, n) => (
                <li key={nome} className="flex justify-between gap-2 rounded border px-2 py-1">
                  <span>{nome}</span>
                  <span className="text-muted-foreground">{resumoDia(salvos[n])}</span>
                </li>
              ))}
            </ul>
            <p>
              <strong>Exceções:</strong>{" "}
              {(rascunho?.excecoes ?? []).length === 0
                ? "nenhuma"
                : (rascunho?.excecoes ?? [])
                    .map((e: any) => `${e.data} (${e.tipo === "fechado" ? "fechado" : `${e.hora_inicio}–${e.hora_fim}`})`)
                    .join(", ")}
            </p>

            {retro && (
              <div className="space-y-1 rounded border border-destructive/40 p-3">
                <p className="text-destructive">
                  Publicação retroativa: atendimentos já ocorridos a partir de {vigenciaRascunho} passarão a ser avaliados
                  por esta versão nas métricas.
                </p>
                {!podePublicarRetroativo(role) ? (
                  <p role="alert" className="text-destructive">
                    Somente administradores podem publicar com validade em data passada.
                  </p>
                ) : (
                  <>
                    <Label htmlFor="motivo-retro">Justificativa (obrigatória)</Label>
                    <Input
                      id="motivo-retro"
                      value={motivoRetro}
                      onChange={(e) => setMotivoRetro(e.target.value)}
                      placeholder="Por que este horário passa a valer em data passada?"
                    />
                  </>
                )}
              </div>
            )}

            {conflitos && conflitos.length > 0 && (
              <div className="space-y-1 rounded border border-destructive/40 p-3" role="alert">
                <p className="text-destructive">
                  Já existe horário oficial valendo neste período:{" "}
                  {conflitos.map((c: any) => `versão ${c.versao} (${c.vigencia_inicio}–${c.vigencia_fim ?? "em diante"})`).join(", ")}.
                </p>
                <p>Ao confirmar, a versão anterior passa a valer apenas até o dia anterior ao início desta. Nada é apagado.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmarPub(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={mPublicar.isPending || bloqueiaRetro}
              onClick={() => mPublicar.mutate(!!conflitos)}
            >
              {conflitos ? "Confirmar e encerrar a versão anterior" : "Publicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
