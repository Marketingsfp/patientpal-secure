import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CLASSE_BADGE,
  FAIXA_GLICEMIA,
  FAIXA_PA,
  classificarGlicemiaJejum,
  classificarGlicemiaPos,
  classificarPressao,
  formatarPA,
  numero,
  validarAfericao,
  type Classificacao,
} from "@/lib/hiperdia/afericao";
import { calcularImc, classificarImc } from "@/lib/triagem/sinais-vitais";

export interface HiperdiaRegistro {
  id: string;
  data_registro: string;
  pressao_sistolica: number | null;
  pressao_diastolica: number | null;
  glicemia_jejum: number | null;
  glicemia_pos_prandial: number | null;
  peso: number | null;
  observacoes: string | null;
}

interface Form {
  data_registro: string;
  pressao_sistolica: string;
  pressao_diastolica: string;
  glicemia_jejum: string;
  glicemia_pos_prandial: string;
  peso: string;
  observacoes: string;
}

const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const vazio = (): Form => ({
  data_registro: agoraLocal(),
  pressao_sistolica: "",
  pressao_diastolica: "",
  glicemia_jejum: "",
  glicemia_pos_prandial: "",
  peso: "",
  observacoes: "",
});

/**
 * As faixas clínicas e as travas de digitação moram em `@/lib/hiperdia/afericao`
 * — testadas lá, longe da tela. A classificação que ficava aqui dizia "Baixa"
 * para uma pressão digitada em cmHg (12/9 = 120/90 mmHg, hipertensão estágio 1).
 */
const num = numero;

/** Selo colorido de classificação, no mesmo padrão visual da triagem. */
function Badge({ c }: { c: Classificacao | null }) {
  if (!c) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${CLASSE_BADGE[c.tom]}`}
    >
      {c.label}
    </span>
  );
}

/** Só dígitos, no comprimento máximo da medida — máscara de digitação. */
const soDigitos = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

/** Mini gráfico de linha sem dependências externas. */
function Sparkline({
  valores,
  cor,
  titulo,
  unidade,
}: {
  valores: { x: string; y: number }[];
  cor: string;
  titulo: string;
  unidade: string;
}) {
  if (valores.length < 2) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground mt-2">Dados insuficientes para o gráfico.</p>
      </div>
    );
  }
  const ys = valores.map((v) => v.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const w = 220;
  const h = 56;
  const pontos = valores.map((v, i) => {
    const x = (i / (valores.length - 1)) * w;
    const y = h - ((v.y - min) / span) * (h - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const ultimo = valores[valores.length - 1];
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className="text-sm font-semibold tabular-nums">
          {ultimo.y}
          <span className="text-[11px] font-normal text-muted-foreground ml-1">{unidade}</span>
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 mt-1" preserveAspectRatio="none">
        <polyline
          points={pontos.join(" ")}
          fill="none"
          // `style` e não o atributo `stroke`: atributo de apresentação SVG não
          // resolve `var(--...)`, e a cor viria de um token do design system.
          style={{ stroke: cor }}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="text-[11px] text-muted-foreground">
        mín {min} · máx {max} · {valores.length} aferições
      </p>
    </div>
  );
}

export function HiperdiaPanel({
  pacienteId,
  clinicaId,
  readOnly,
}: {
  pacienteId: string;
  clinicaId: string;
  readOnly?: boolean;
}) {
  const [itens, setItens] = useState<HiperdiaRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(vazio);
  // Valor extremo porém possível: guarda a pergunta até o profissional confirmar.
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const [alturaCm, setAlturaCm] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!pacienteId || !clinicaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("hiperdia_registros")
      .select(
        "id, data_registro, pressao_sistolica, pressao_diastolica, glicemia_jejum, glicemia_pos_prandial, peso, observacoes",
      )
      .eq("clinica_id", clinicaId)
      .eq("paciente_id", pacienteId)
      .order("data_registro", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setItens((data ?? []) as HiperdiaRegistro[]);
  }, [pacienteId, clinicaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Altura do paciente para o IMC. O cadastro do paciente não guarda altura;
   * quem guarda é a triagem de enfermagem (`triagens_enfermagem.altura_cm`).
   * Usamos a triagem mais recente que tenha altura preenchida — altura de
   * adulto não muda de um mês para o outro. Sem triagem, o card de IMC
   * simplesmente não aparece.
   */
  useEffect(() => {
    let cancelado = false;
    const buscarAltura = async () => {
      if (!pacienteId || !clinicaId) return;
      const { data } = await supabase
        .from("triagens_enfermagem")
        .select("altura_cm")
        .eq("clinica_id", clinicaId)
        .eq("paciente_id", pacienteId)
        .not("altura_cm", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelado) setAlturaCm(data?.altura_cm != null ? Number(data.altura_cm) : null);
    };
    void buscarAltura();
    return () => {
      cancelado = true;
    };
  }, [pacienteId, clinicaId]);

  /** IMC de um peso qualquer, com a altura conhecida do paciente. */
  const imcDe = useCallback(
    (peso: number | string | null) => {
      if (alturaCm == null || peso === null || peso === "") return null;
      return calcularImc(String(peso), String(alturaCm));
    },
    [alturaCm],
  );

  const imcDigitado = useMemo(() => imcDe(form.peso), [imcDe, form.peso]);
  const imcDigitadoClasse = classificarImc(imcDigitado);

  const cronologico = useMemo(() => [...itens].reverse(), [itens]);
  const serie = (campo: keyof HiperdiaRegistro) =>
    cronologico
      .filter((r) => r[campo] != null)
      .map((r) => ({ x: r.data_registro, y: Number(r[campo]) }));

  /**
   * Passo 1: barra o que é erro de digitação e pergunta sobre o que é extremo
   * porém possível. Só depois disso a aferição vai para o banco — uma vez
   * gravada, ela é um fato clínico datado que nem quem digitou pode corrigir
   * (a policy de UPDATE é só do admin da clínica).
   */
  const conferirEsalvar = () => {
    if (readOnly) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const { erro, confirmar } = validarAfericao(form);
    if (erro) {
      toast.error(erro);
      return;
    }
    if (confirmar) {
      setConfirmacao(confirmar);
      return;
    }
    void salvar();
  };

  const salvar = async () => {
    setConfirmacao(null);
    const payload = {
      clinica_id: clinicaId,
      paciente_id: pacienteId,
      data_registro: new Date(form.data_registro).toISOString(),
      pressao_sistolica: num(form.pressao_sistolica),
      pressao_diastolica: num(form.pressao_diastolica),
      glicemia_jejum: num(form.glicemia_jejum),
      glicemia_pos_prandial: num(form.glicemia_pos_prandial),
      peso: num(form.peso),
      observacoes: form.observacoes.trim() || null,
    };
    setSaving(true);
    const { data, error } = await supabase.from("hiperdia_registros").insert(payload).select("id");
    setSaving(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Registro não foi salvo. Verifique suas permissões nesta clínica.");
      return;
    }
    toast.success("Aferição registrada.");
    setOpen(false);
    setForm(vazio());
    void carregar();
  };

  /**
   * Campo de medida inteira (pressão e glicemia). A máscara é de dígitos e
   * comprimento: não dá para digitar letra, vírgula nem um quarto dígito —
   * "900" ainda entra, e é a validação que o barra com a faixa na mensagem.
   * O selo ao lado classifica enquanto se digita, para o erro aparecer antes
   * de virar registro.
   */
  const campoMedida = (
    key: "pressao_sistolica" | "pressao_diastolica" | "glicemia_jejum" | "glicemia_pos_prandial",
    label: string,
    placeholder: string,
    classificar?: (v: number | null) => Classificacao | null,
  ) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 min-h-5">
        <Label>{label}</Label>
        {classificar && <Badge c={classificar(num(form[key]))} />}
      </div>
      <Input
        inputMode="numeric"
        maxLength={3}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: soDigitos(e.target.value, 3) })}
      />
    </div>
  );

  const campoNum = (key: keyof Form, label: string, placeholder: string, step?: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/15">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Hiperdia</h2>
            <p className="text-xs text-muted-foreground">
              Controle de hipertensão e diabetes do paciente.
            </p>
          </div>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            onClick={() => {
              setForm(vazio());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Nova aferição
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Sparkline
          titulo="Pressão sistólica"
          unidade="mmHg"
          cor="var(--primary)"
          valores={serie("pressao_sistolica")}
        />
        <Sparkline
          titulo="Pressão diastólica"
          unidade="mmHg"
          cor="var(--muted-foreground)"
          valores={serie("pressao_diastolica")}
        />
        <Sparkline
          titulo="Glicemia em jejum"
          unidade="mg/dL"
          cor="var(--primary)"
          valores={serie("glicemia_jejum")}
        />
        <Sparkline titulo="Peso" unidade="kg" cor="var(--primary)" valores={serie("peso")} />
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-[12px] uppercase tracking-wider">Data</TableHead>
              <TableHead className="text-[12px] uppercase tracking-wider">Pressão</TableHead>
              <TableHead className="text-[12px] uppercase tracking-wider">Glicemia jejum</TableHead>
              <TableHead className="text-[12px] uppercase tracking-wider">Glicemia pós</TableHead>
              <TableHead className="text-[12px] uppercase tracking-wider">Peso</TableHead>
              <TableHead className="text-[12px] uppercase tracking-wider">IMC</TableHead>
              <TableHead className="text-[12px] uppercase tracking-wider">Observações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  Nenhuma aferição registrada.
                </TableCell>
              </TableRow>
            ) : (
              itens.map((r) => {
                const imc = imcDe(r.peso);
                const imcClasse = classificarImc(imc);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(r.data_registro).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.pressao_sistolica != null && r.pressao_diastolica != null ? (
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="whitespace-nowrap">
                            {formatarPA(r.pressao_sistolica, r.pressao_diastolica)}
                          </span>
                          <Badge
                            c={classificarPressao(r.pressao_sistolica, r.pressao_diastolica)}
                          />
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.glicemia_jejum == null ? (
                        "—"
                      ) : (
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="whitespace-nowrap">{r.glicemia_jejum} mg/dL</span>
                          <Badge c={classificarGlicemiaJejum(r.glicemia_jejum)} />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {r.glicemia_pos_prandial == null ? (
                        "—"
                      ) : (
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="whitespace-nowrap">{r.glicemia_pos_prandial} mg/dL</span>
                          <Badge c={classificarGlicemiaPos(r.glicemia_pos_prandial)} />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">
                      {r.peso != null ? `${Number(r.peso).toFixed(2).replace(".", ",")} kg` : "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {imc == null ? (
                        "—"
                      ) : (
                        <span className="flex items-center gap-2 flex-wrap">
                          <span>{imc.toFixed(2).replace(".", ",")}</span>
                          {imcClasse && (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap ${imcClasse.classe}`}
                            >
                              {imcClasse.label}
                            </span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[16rem] truncate">
                      {r.observacoes ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Pressão em mmHg ({FAIXA_PA.sisMin}–{FAIXA_PA.sisMax} / {FAIXA_PA.diaMin}–{FAIXA_PA.diaMax})
        e glicemia em mg/dL ({FAIXA_GLICEMIA.min}–{FAIXA_GLICEMIA.max}). Valor fora dessas faixas
        não é aceito, para não gravar erro de digitação no histórico. Os selos são referência de
        leitura (SBC e Diretriz SBD 2025) e não constituem diagnóstico.
      </p>

      <AlertDialog open={!!confirmacao} onOpenChange={(o) => !o && setConfirmacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirme antes de gravar</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacao} A aferição não pode ser corrigida depois de gravada — só um
              administrador da clínica consegue alterá-la, e a alteração fica registrada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Voltar e revisar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void salvar();
              }}
            >
              {saving ? "Salvando…" : "Está correto, gravar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova aferição</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              conferirEsalvar();
            }}
          >
            <div className="space-y-1">
              <Label>Data e hora</Label>
              <Input
                type="datetime-local"
                value={form.data_registro}
                onChange={(e) => setForm({ ...form, data_registro: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {campoMedida("pressao_sistolica", "Pressão sistólica (mmHg)", "120")}
              {campoMedida("pressao_diastolica", "Pressão diastólica (mmHg)", "80")}
            </div>
            {/* A pressão é um par: o selo é um só, embaixo dos dois campos. */}
            <div className="flex items-center gap-2 min-h-6">
              <Badge
                c={classificarPressao(num(form.pressao_sistolica), num(form.pressao_diastolica))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {campoMedida(
                "glicemia_jejum",
                "Glicemia jejum (mg/dL)",
                "99",
                classificarGlicemiaJejum,
              )}
              {campoMedida(
                "glicemia_pos_prandial",
                "Glicemia pós-prandial (mg/dL)",
                "140",
                classificarGlicemiaPos,
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              {campoNum("peso", "Peso (kg)", "70,5", "0.01")}
              {/* IMC calculado com a altura da última triagem de enfermagem. */}
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2 text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  IMC {alturaCm != null && `· ${alturaCm} cm`}
                </div>
                {alturaCm == null ? (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Altura não registrada na triagem.
                  </p>
                ) : (
                  <>
                    <div className="text-xl font-bold tabular-nums">
                      {imcDigitado != null ? imcDigitado.toFixed(2).replace(".", ",") : "—"}
                    </div>
                    {imcDigitadoClasse && (
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] ${imcDigitadoClasse.classe}`}
                      >
                        {imcDigitadoClasse.label}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                maxLength={2000}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                A classificação nutricional (OMS/ABESO) já é calculada e registrada pelo sistema a
                partir do peso e da altura — não precisa ser descrita aqui.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
