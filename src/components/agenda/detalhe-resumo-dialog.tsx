// Detalhamento de um contador do "Resumo do dia": quem está por trás do
// número, com a situação de pagamento e o Checkup Rosa.
//
// Busca o dia INTEIRO da clínica, e não só o profissional filtrado: o pacote
// Checkup Rosa junta profissionais diferentes (gineco, ultrassom, mamografia)
// e só dá para reconhecê-lo olhando todas as fichas da paciente. A LISTA
// depois respeita o profissional escolhido, igual ao número da barra.
//
// Não mostra valor em dinheiro — só Pago / Pendente.
//
// `duration-0`: a tela de Agendas é seca de propósito (sem transição/fade).

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ehLivre } from "@/lib/agenda/resumo-do-dia";
import { checkupRosaVigente } from "@/lib/agenda/checkup-rosa";
import {
  ROTULO_CATEGORIA,
  ROTULO_FINANCEIRO,
  idsCheckupRosa,
  linhasDaCategoria,
  situacaoFinanceira,
  type CategoriaResumo,
  type LinhaDetalhe,
  type SituacaoFinanceira,
} from "@/lib/agenda/detalhe-resumo";
import { exportarRelatorioXlsx } from "@/lib/exportar-xlsx";

export type MedicoDetalhe = { id: string; nome: string; especialidade_nome?: string | null };

type Props = {
  categoria: CategoriaResumo | null;
  onFechar: () => void;
  clinicaId: string;
  dataRef: string;
  filtroMedico: string;
  medicos: MedicoDetalhe[];
  /** Abre a ficha do agendamento na Agenda. */
  onAbrirFicha?: (agendamentoId: string) => void;
};

const STATUS_PT: Record<string, string> = {
  agendado: "Aguardando",
  confirmado: "Presente",
  em_atendimento: "Em atendimento",
  realizado: "Atendido",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

const COR_FINANCEIRO: Record<SituacaoFinanceira, string> = {
  pago: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pendente: "bg-rose-50 text-rose-700 border-rose-200",
  convenio: "bg-sky-50 text-sky-700 border-sky-200",
  sem_faturamento: "bg-slate-100 text-slate-600 border-slate-200",
  externo: "bg-violet-50 text-violet-700 border-violet-200",
  nao_se_aplica: "border-transparent text-slate-400",
};

type FiltroFin = "todos" | "pago" | "pendente";

type Linha = {
  id: string;
  hora: string;
  inicio: string;
  livre: boolean;
  paciente: string;
  profissional: string;
  especialidade: string;
  status: string;
  fin: SituacaoFinanceira;
  rosa: boolean;
};

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function DetalheResumoDialog({
  categoria,
  onFechar,
  clinicaId,
  dataRef,
  filtroMedico,
  medicos,
  onAbrirFicha,
}: Props) {
  const aberto = categoria !== null;
  const [filtroFin, setFiltroFin] = useState<FiltroFin>("todos");
  const [soRosa, setSoRosa] = useState(false);
  const campanha = checkupRosaVigente(dataRef);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["agenda-resumo-detalhe", clinicaId, dataRef],
    enabled: aberto,
    staleTime: 0,
    queryFn: async () => {
      // Mesmo recorte de horário da barra do resumo.
      const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
      const fim = new Date(`${dataRef}T23:59:59`).toISOString();
      const { data: ags, error } = await supabase
        .from("agendamentos")
        .select(
          "id,inicio,status,paciente_nome,paciente_id,medico_id,agenda_id,procedimento,tipo_atendimento,data_pagamento,origem_externa,sem_faturamento",
        )
        .eq("clinica_id", clinicaId)
        .gte("inicio", inicio)
        .lte("inicio", fim)
        .range(0, 9999);
      if (error) throw error;
      const linhas = (ags ?? []) as unknown as LinhaDetalhe[];
      // Pago = receita confirmada ligada à ficha (mesma consulta da Agenda),
      // em lotes para não estourar o limite de URL.
      const ids = linhas.filter((a) => !ehLivre(a.paciente_nome)).map((a) => a.id);
      const pagos = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: pg, error: pgErr } = await supabase
          .from("fin_lancamentos")
          .select("agendamento_id")
          .eq("clinica_id", clinicaId)
          .eq("tipo", "receita")
          .eq("status", "confirmado")
          .in("agendamento_id", ids.slice(i, i + 200));
        if (pgErr) throw pgErr;
        for (const r of (pg ?? []) as Array<{ agendamento_id: string | null }>)
          if (r.agendamento_id) pagos.add(r.agendamento_id);
      }
      return { linhas, pagos };
    },
  });

  const medicoPorId = useMemo(() => new Map(medicos.map((m) => [m.id, m])), [medicos]);

  const todas: Linha[] = useMemo(() => {
    if (!data || !categoria) return [];
    const rosa = campanha
      ? idsCheckupRosa(data.linhas, (id) =>
          id ? (medicoPorId.get(id)?.especialidade_nome ?? null) : null,
        )
      : new Set<string>();
    const doProfissional =
      filtroMedico === "todos"
        ? data.linhas
        : data.linhas.filter((a) => a.medico_id === filtroMedico);
    return linhasDaCategoria(doProfissional, categoria)
      .map((a) => {
        const m = a.medico_id ? medicoPorId.get(a.medico_id) : undefined;
        const livre = ehLivre(a.paciente_nome);
        return {
          id: a.id,
          inicio: a.inicio,
          hora: fmtHora(a.inicio),
          livre,
          paciente: livre ? "— horário livre —" : (a.paciente_nome ?? "").trim(),
          profissional: m?.nome ?? "Sem profissional",
          especialidade: m?.especialidade_nome ?? "",
          status: livre ? "Livre" : (STATUS_PT[a.status ?? ""] ?? a.status ?? "—"),
          fin: situacaoFinanceira(a, data.pagos),
          rosa: rosa.has(a.id),
        };
      })
      .sort(
        (x, y) =>
          x.inicio.localeCompare(y.inicio) || x.profissional.localeCompare(y.profissional, "pt-BR"),
      );
  }, [data, categoria, filtroMedico, medicoPorId, campanha]);

  const visiveis = useMemo(
    () =>
      todas.filter((l) => (filtroFin === "todos" || l.fin === filtroFin) && (!soRosa || l.rosa)),
    [todas, filtroFin, soRosa],
  );

  const totais = useMemo(() => {
    const t = { pago: 0, pendente: 0, convenio: 0, sem_faturamento: 0, externo: 0, rosa: 0 };
    for (const l of todas) {
      if (l.fin !== "nao_se_aplica") t[l.fin] += 1;
      if (l.rosa) t.rosa += 1;
    }
    return t;
  }, [todas]);

  if (!categoria) return null;
  const rotulo = ROTULO_CATEGORIA[categoria];
  const dataBR = dataRef.split("-").reverse().join("/");
  const quem =
    filtroMedico === "todos"
      ? "Todos os profissionais"
      : (medicoPorId.get(filtroMedico)?.nome ?? "Profissional");
  const filtrosAtivos = [
    filtroFin !== "todos" ? ROTULO_FINANCEIRO[filtroFin] : null,
    soRosa ? "Checkup Rosa" : null,
  ].filter(Boolean);
  const tituloArquivo = `${rotulo} ${dataBR}${filtrosAtivos.length ? ` (${filtrosAtivos.join(", ")})` : ""}`;
  const cabecalhos = [
    "Horário",
    "Paciente",
    "Profissional",
    "Especialidade",
    "Situação",
    "Financeiro",
    ...(campanha ? ["Campanha"] : []),
  ];
  const celulas = (l: Linha) => [
    l.hora,
    l.paciente,
    l.profissional,
    l.especialidade,
    l.status,
    ROTULO_FINANCEIRO[l.fin],
    ...(campanha ? [l.rosa ? "Checkup Rosa" : ""] : []),
  ];
  const linhaTotais =
    `Total de ${rotulo.toLowerCase()}: ${todas.length} · Pago: ${totais.pago} · Pendente: ${totais.pendente}` +
    (totais.convenio ? ` · Convênio: ${totais.convenio}` : "") +
    (totais.sem_faturamento ? ` · Sem faturamento: ${totais.sem_faturamento}` : "") +
    (campanha ? ` · Checkup Rosa: ${totais.rosa}` : "");

  const exportarExcel = async () => {
    try {
      await exportarRelatorioXlsx({
        arquivo: `Agenda - ${tituloArquivo.replace(/\//g, "-")}`,
        aba: rotulo,
        cabecalho: [`Resumo do dia — ${rotulo}`, `${dataBR} · ${quem}`, linhaTotais],
        colunas: cabecalhos.map((c) => ({ rotulo: c })),
        linhas: visiveis.map(celulas),
      });
    } catch {
      toast.error("Não foi possível gerar o Excel.");
    }
  };

  const imprimir = () => {
    const w = window.open("", "_blank", "width=1000,height=700");
    if (!w) {
      toast.error("O navegador bloqueou a janela de impressão. Libere pop-ups para este site.");
      return;
    }
    const th = cabecalhos.map((c) => `<th>${esc(c)}</th>`).join("");
    const tr = visiveis
      .map(
        (l) =>
          `<tr>${celulas(l)
            .map((c) => `<td>${esc(c)}</td>`)
            .join("")}</tr>`,
      )
      .join("");
    w.document
      .write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(tituloArquivo)}</title>
<style>
@page{size:A4 portrait;margin:12mm}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111}
h1{font-size:15px;margin:0 0 2px}
.sub{color:#444;margin-bottom:2px}
.tot{font-weight:bold;margin:6px 0 8px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}
th{background:#eee}
tr{page-break-inside:avoid}
</style></head><body>
<h1>Resumo do dia — ${esc(rotulo)}</h1>
<div class="sub">${esc(dataBR)} · ${esc(quem)}${filtrosAtivos.length ? ` · Filtro: ${esc(filtrosAtivos.join(", "))}` : ""}</div>
<div class="tot">${esc(linhaTotais)}</div>
<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`);
    w.document.close();
  };

  const chip = (ativo: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-semibold ${
      ativo
        ? "border-primary bg-primary text-primary-foreground"
        : "border-slate-200 bg-card text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) {
          setFiltroFin("todos");
          setSoRosa(false);
          onFechar();
        }
      }}
    >
      <DialogContent className="max-w-5xl duration-0">
        <DialogHeader>
          <DialogTitle>{rotulo}</DialogTitle>
          <DialogDescription>
            {dataBR} · {quem}
            {categoria === "encaixes" &&
              " · Mostra as duas fichas de cada horário dividido (a original e a encaixada)."}
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            Não foi possível carregar a lista agora. Feche e abra de novo para tentar outra vez.
          </div>
        ) : isLoading || !data ? (
          <div className="py-6 text-center text-[13px] text-slate-500">Carregando as fichas…</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[13px]">
              <span className="rounded-md bg-slate-100 px-2.5 py-1 font-semibold text-slate-800">
                Total de {rotulo.toLowerCase()}: {todas.length}
              </span>
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                Pago: {totais.pago}
              </span>
              <span className="rounded-md bg-rose-50 px-2.5 py-1 font-semibold text-rose-700">
                Pendente: {totais.pendente}
              </span>
              {totais.convenio > 0 && (
                <span className="rounded-md bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                  Convênio: {totais.convenio}
                </span>
              )}
              {totais.sem_faturamento > 0 && (
                <span className="rounded-md bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                  Sem faturamento: {totais.sem_faturamento}
                </span>
              )}
              {campanha && (
                <span className="rounded-md bg-pink-50 px-2.5 py-1 font-semibold text-pink-700">
                  🎀 Checkup Rosa: {totais.rosa}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(["todos", "pago", "pendente"] as FiltroFin[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltroFin(f)}
                    className={chip(filtroFin === f)}
                  >
                    {f === "todos" ? "Todos" : ROTULO_FINANCEIRO[f]}
                  </button>
                ))}
                {campanha && (
                  <button
                    type="button"
                    aria-pressed={soRosa}
                    onClick={() => setSoRosa((v) => !v)}
                    title="Pacientes cujas marcações do dia formam um pacote Checkup Rosa"
                    className={
                      soRosa
                        ? "rounded-full border border-pink-600 bg-pink-600 px-2.5 py-1 text-xs font-semibold text-white"
                        : "rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-xs font-semibold text-pink-700 hover:bg-pink-100"
                    }
                  >
                    🎀 Só Checkup Rosa
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void exportarExcel()}
                  disabled={visiveis.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-card px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> Excel
                </button>
                <button
                  type="button"
                  onClick={imprimir}
                  disabled={visiveis.length === 0}
                  title="Abre a impressão — escolha “Salvar como PDF” para gerar o arquivo"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-card px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Printer className="h-3.5 w-3.5" /> PDF / Imprimir
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2.5 py-2">Horário</th>
                    <th className="px-2.5 py-2">Paciente</th>
                    <th className="px-2.5 py-2">Profissional</th>
                    <th className="px-2.5 py-2">Situação</th>
                    <th className="px-2.5 py-2">Financeiro</th>
                    {campanha && <th className="px-2.5 py-2">Campanha</th>}
                    {onAbrirFicha && <th className="px-2.5 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                        Nenhuma ficha neste filtro.
                      </td>
                    </tr>
                  ) : (
                    visiveis.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold tabular-nums text-slate-800">
                          {l.hora}
                        </td>
                        <td
                          className={`px-2.5 py-1.5 uppercase ${
                            l.livre ? "text-slate-400" : "font-semibold text-slate-700"
                          }`}
                        >
                          {l.paciente}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <div className="font-semibold text-slate-800">{l.profissional}</div>
                          {l.especialidade && (
                            <div className="text-[11px] uppercase text-slate-500">
                              {l.especialidade}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-slate-700">
                          {l.status}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <span
                            className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-bold ${COR_FINANCEIRO[l.fin]}`}
                          >
                            {ROTULO_FINANCEIRO[l.fin]}
                          </span>
                        </td>
                        {campanha && (
                          <td className="whitespace-nowrap px-2.5 py-1.5">
                            {l.rosa && (
                              <span className="rounded-md bg-pink-50 px-2 py-0.5 text-[11px] font-bold text-pink-700">
                                🎀 Checkup Rosa
                              </span>
                            )}
                          </td>
                        )}
                        {onAbrirFicha && (
                          <td className="px-2.5 py-1.5 text-right">
                            {!l.livre && (
                              <button
                                type="button"
                                onClick={() => onAbrirFicha(l.id)}
                                title="Abrir a ficha do agendamento"
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <ExternalLink className="h-3 w-3" /> Ficha
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {campanha && (
              <p className="text-[11px] leading-snug text-slate-500">
                Checkup Rosa: paciente cujas marcações do dia formam um dos quatro pacotes. O
                sistema não grava se o pacote foi aplicado na cobrança.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
