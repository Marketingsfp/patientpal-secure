import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapaCorporal } from "@/components/fisioterapia/mapa-corporal";
import { MarcacaoDialog } from "@/components/fisioterapia/marcacao-dialog";
import {
  TIPO_LABEL,
  marcacaoLabel,
  type FisioTipo,
  type FisioVista,
  type RegiaoCorporal,
} from "@/lib/fisio";
import { formatDatePura } from "@/lib/date-utils";

interface Props {
  pacienteId: string;
  clinicaId: string;
  userId: string | null;
  readOnly?: boolean;
}

interface Marcacao {
  id: string;
  regiao: string;
  lado: string;
  vista: FisioVista;
  tipo: FisioTipo;
  intensidade: number | null;
  queixa: string | null;
  tratamento: string | null;
  data: string;
}

interface Avaliacao {
  id: string;
  queixa_principal: string | null;
  historia: string | null;
  diagnostico_funcional: string | null;
  objetivos: string | null;
  plano_tratamento: string | null;
  observacoes: string | null;
}

type CampoAvaliacao = Exclude<keyof Avaliacao, "id">;

const CAMPOS: Array<{ campo: CampoAvaliacao; titulo: string }> = [
  { campo: "queixa_principal", titulo: "Queixa principal" },
  { campo: "historia", titulo: "História da lesão" },
  { campo: "diagnostico_funcional", titulo: "Diagnóstico funcional" },
  { campo: "objetivos", titulo: "Objetivos do tratamento" },
  { campo: "plano_tratamento", titulo: "Plano de tratamento" },
  { campo: "observacoes", titulo: "Observações" },
];

const SELECT_AVALIACAO =
  "id,queixa_principal,historia,diagnostico_funcional,objetivos,plano_tratamento,observacoes";

export function AvaliacaoFisioTab({ pacienteId, clinicaId, userId, readOnly = false }: Props) {
  const [vista, setVista] = useState<FisioVista>("frente");
  const [marcacoes, setMarcacoes] = useState<Marcacao[]>([]);
  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [dialogRegiao, setDialogRegiao] = useState<RegiaoCorporal | null>(null);

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteId, clinicaId]);

  async function carregar() {
    const [{ data: m }, { data: a }] = await Promise.all([
      supabase
        .from("fisio_marcacoes")
        .select("id,regiao,lado,vista,tipo,intensidade,queixa,tratamento,data")
        .eq("paciente_id", pacienteId)
        .eq("clinica_id", clinicaId)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("fisio_avaliacoes")
        .select(SELECT_AVALIACAO)
        .eq("paciente_id", pacienteId)
        .eq("clinica_id", clinicaId)
        .maybeSingle(),
    ]);
    setMarcacoes((m as unknown as Marcacao[]) ?? []);
    setAvaliacao((a as Avaliacao) ?? null);
  }

  // Só as marcações da vista atual pintam o desenho: uma queixa lombar não
  // deve acender nada na vista de frente.
  const daVista = useMemo(() => marcacoes.filter((m) => m.vista === vista), [marcacoes, vista]);

  // Marcação mais recente de cada região — `marcacoes` já vem ordenado do mais
  // novo para o mais antigo, então o primeiro de cada código é o que vale.
  const marcado = useMemo(() => {
    const m: Record<string, FisioTipo> = {};
    for (const r of daVista) if (!(r.regiao in m)) m[r.regiao] = r.tipo;
    return m;
  }, [daVista]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of daVista) c[r.regiao] = (c[r.regiao] ?? 0) + 1;
    return c;
  }, [daVista]);

  const historico = useMemo(
    () => (selecionada ? daVista.filter((m) => m.regiao === selecionada) : []),
    [selecionada, daVista],
  );

  async function salvarCampo(campo: CampoAvaliacao, valor: string) {
    if (readOnly) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    const patch = { [campo]: valor } as Partial<Record<CampoAvaliacao, string>>;
    if (avaliacao) {
      const { error } = await supabase
        .from("fisio_avaliacoes")
        .update({ ...patch, ultima_atualizacao_por: userId })
        .eq("id", avaliacao.id);
      if (error) {
        mostrarErro(error);
        return;
      }
      setAvaliacao({ ...avaliacao, [campo]: valor });
      return;
    }
    const { data, error } = await supabase
      .from("fisio_avaliacoes")
      .insert({
        clinica_id: clinicaId,
        paciente_id: pacienteId,
        ultima_atualizacao_por: userId,
        ...patch,
      })
      .select(SELECT_AVALIACAO)
      .maybeSingle();
    if (error) {
      mostrarErro(error);
      return;
    }
    setAvaliacao((data as Avaliacao) ?? null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Mapa corporal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <MapaCorporal
            vista={vista}
            onVistaChange={(v) => {
              setVista(v);
              setSelecionada(null);
            }}
            marcado={marcado}
            contagem={contagem}
            selecionada={selecionada}
            onClickRegiao={(r) => {
              setSelecionada(r.codigo);
              if (!readOnly) setDialogRegiao(r);
            }}
          />
          <p className="text-xs text-muted-foreground text-center">
            {readOnly
              ? "Clique numa região para ver o histórico dela."
              : "Clique numa região do corpo para registrar a queixa e a conduta."}
          </p>

          {selecionada &&
            (historico.length > 0 ? (
              <div className="border rounded-md p-3 space-y-2">
                <p className="text-sm font-medium">
                  Histórico — {marcacaoLabel(selecionada, vista, "")}
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Data</TableHead>
                      <TableHead className="w-40">Tipo</TableHead>
                      <TableHead className="w-16">Dor</TableHead>
                      <TableHead>Queixa</TableHead>
                      <TableHead>Conduta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell>{formatDatePura(h.data)}</TableCell>
                        <TableCell>{TIPO_LABEL[h.tipo]}</TableCell>
                        <TableCell className="font-mono">
                          {h.intensidade === null ? "—" : `${h.intensidade}/10`}
                        </TableCell>
                        <TableCell className="text-sm">{h.queixa ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {h.tratamento ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                Nenhum registro nesta região ainda.
              </p>
            ))}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {CAMPOS.map(({ campo, titulo }) => (
          <Card key={campo}>
            <CardHeader>
              <CardTitle className="text-base">{titulo}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                // `key` força o Textarea a reassumir o valor do banco quando a
                // avaliação termina de carregar — sem isso o defaultValue
                // ficaria preso na string vazia do primeiro render.
                key={`${avaliacao?.id ?? "novo"}-${campo}`}
                defaultValue={avaliacao?.[campo] ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (avaliacao?.[campo] ?? ""))
                    void salvarCampo(campo, e.target.value);
                }}
                rows={3}
                disabled={readOnly}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {dialogRegiao && (
        <MarcacaoDialog
          open={!!dialogRegiao}
          onClose={() => setDialogRegiao(null)}
          clinicaId={clinicaId}
          pacienteId={pacienteId}
          regiao={dialogRegiao}
          userId={userId}
          onSaved={() => void carregar()}
        />
      )}
    </div>
  );
}
