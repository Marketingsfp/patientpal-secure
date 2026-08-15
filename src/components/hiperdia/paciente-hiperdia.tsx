import { useCallback, useEffect, useState } from "react";
import { HeartPulse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HiperdiaForm } from "./hiperdia-form";

interface Props {
  pacienteId: string;
  clinicaId: string;
  /** Sem permissão de escrita, o botão de nova aferição fica desabilitado. */
  podeEscrever?: boolean;
}

interface Registro {
  id: string;
  data_registro: string;
  pressao_sistolica: number | null;
  pressao_diastolica: number | null;
  glicemia_jejum: number | null;
  glicemia_pos_prandial: number | null;
  peso: number | null;
  observacoes: string | null;
}

const COLUNAS =
  "id, data_registro, pressao_sistolica, pressao_diastolica, glicemia_jejum, glicemia_pos_prandial, peso, observacoes";

const fmtDataHora = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtPeso = (p: number | null) =>
  p === null ? "—" : `${Number(p).toFixed(2).replace(".", ",")} kg`;

type Faixa = "normal" | "atencao" | "alta";

const corFaixa: Record<Faixa, string> = {
  normal: "text-foreground",
  atencao: "text-amber-600 dark:text-amber-500 font-medium",
  alta: "text-red-600 dark:text-red-500 font-semibold",
};

/**
 * Faixas de referência apenas para leitura visual rápida do histórico.
 * Não é diagnóstico: uma aferição isolada não classifica o paciente, e a
 * decisão clínica é sempre do profissional.
 */
function faixaPressao(sis: number | null, dia: number | null): Faixa | null {
  if (sis === null || dia === null) return null;
  if (sis >= 140 || dia >= 90) return "alta";
  if (sis >= 130 || dia >= 85) return "atencao";
  return "normal";
}

function faixaJejum(v: number | null): Faixa | null {
  if (v === null) return null;
  if (v >= 126) return "alta";
  if (v >= 100) return "atencao";
  return "normal";
}

function faixaPos(v: number | null): Faixa | null {
  if (v === null) return null;
  if (v >= 200) return "alta";
  if (v >= 140) return "atencao";
  return "normal";
}

/** Minigráfico de linha da pressão sistólica, sem biblioteca externa. */
function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null;
  const w = 240;
  const h = 40;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const span = max - min || 1;
  const pontos = valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-10 w-[240px] max-w-full text-primary"
        role="img"
        aria-label={`Evolução da pressão sistólica: de ${valores[0]} a ${valores[valores.length - 1]} mmHg`}
        preserveAspectRatio="none"
      >
        <polyline
          points={pontos}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        sistólica {min}–{max} mmHg
      </span>
    </div>
  );
}

export function PacienteHiperdia({ pacienteId, clinicaId, podeEscrever = false }: Props) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    // `hiperdia_registros` ainda não está no types.ts gerado pelo Supabase CLI.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("hiperdia_registros" as any) as any)
      .select(COLUNAS)
      .eq("clinica_id", clinicaId)
      .eq("paciente_id", pacienteId)
      .order("data_registro", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    setRegistros((data ?? []) as Registro[]);
  }, [clinicaId, pacienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Do mais antigo para o mais recente, para o gráfico ler da esquerda p/ direita.
  const sistolicas = [...registros]
    .reverse()
    .map((r) => r.pressao_sistolica)
    .filter((v): v is number => v !== null);

  const ultima = registros[0] ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartPulse className="h-4 w-4 text-primary" /> Hiperdia — aferições
          {registros.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({registros.length})</span>
          )}
        </CardTitle>
        <HiperdiaForm
          pacienteId={pacienteId}
          clinicaId={clinicaId}
          onSaved={carregar}
          disabled={!podeEscrever}
        />
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando aferições…</p>
        ) : registros.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma aferição registrada para este paciente.
          </p>
        ) : (
          <>
            {ultima && (
              <div className="text-sm">
                <span className="text-muted-foreground">Última aferição:</span>{" "}
                <b>{fmtDataHora(ultima.data_registro)}</b>
                {ultima.pressao_sistolica !== null && (
                  <span className="ml-2">
                    PA{" "}
                    <b
                      className={
                        corFaixa[
                          faixaPressao(ultima.pressao_sistolica, ultima.pressao_diastolica) ??
                            "normal"
                        ]
                      }
                    >
                      {ultima.pressao_sistolica}/{ultima.pressao_diastolica}
                    </b>
                  </span>
                )}
              </div>
            )}

            <Sparkline valores={sistolicas} />

            <div className="-mx-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    <TableHead className="text-right whitespace-nowrap">PA (mmHg)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Jejum</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Pós-prandial</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Peso</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.map((r) => {
                    const fPa = faixaPressao(r.pressao_sistolica, r.pressao_diastolica);
                    const fJe = faixaJejum(r.glicemia_jejum);
                    const fPo = faixaPos(r.glicemia_pos_prandial);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {fmtDataHora(r.data_registro)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {r.pressao_sistolica === null ? (
                            "—"
                          ) : (
                            <span className={fPa ? corFaixa[fPa] : undefined}>
                              {r.pressao_sistolica}/{r.pressao_diastolica}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.glicemia_jejum === null ? (
                            "—"
                          ) : (
                            <span className={fJe ? corFaixa[fJe] : undefined}>
                              {r.glicemia_jejum}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.glicemia_pos_prandial === null ? (
                            "—"
                          ) : (
                            <span className={fPo ? corFaixa[fPo] : undefined}>
                              {r.glicemia_pos_prandial}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {fmtPeso(r.peso)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[24rem]">
                          {r.observacoes ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-muted-foreground">
              As cores são apenas referência visual (amarelo: atenção, vermelho: elevado) e não
              constituem diagnóstico.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
