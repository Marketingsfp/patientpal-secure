/**
 * Uso de IA do Coach nos últimos 30 dias, por atendente.
 *
 * Cada chamada de análise, treino ou prova grava uma linha em `coach_uso_ia`,
 * com o tamanho consumido e o custo aproximado. Aqui a gestão vê quem está
 * usando e quanto, e o limite diário configurado para a clínica.
 */
import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Linha = {
  atendente: string | null;
  user_id: string;
  funcao: string;
  tokens_in: number;
  tokens_out: number;
  custo_estimado: number;
  created_at: string;
};

type Resumo = {
  nome: string;
  chamadas: number;
  custo: number;
  hoje: number;
};

export function UsoIA({ clinicaId }: { clinicaId: string | null }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [limites, setLimites] = useState<{ usuario: number; clinica: number }>({
    usuario: 60,
    clinica: 600,
  });

  useEffect(() => {
    let cancelado = false;
    if (!clinicaId) return;
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    void (async () => {
      const [uso, cfg] = await Promise.all([
        supabase
          .from("coach_uso_ia")
          .select("atendente,user_id,funcao,tokens_in,tokens_out,custo_estimado,created_at")
          .eq("clinica_id", clinicaId)
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(3000),
        supabase
          .from("coach_config_clinica")
          .select("limite_ia_usuario,limite_ia_clinica")
          .eq("clinica_id", clinicaId)
          .maybeSingle(),
      ]);
      if (cancelado) return;
      setLinhas((uso.data ?? []) as unknown as Linha[]);
      setLimites({
        usuario: Number(cfg.data?.limite_ia_usuario ?? 60) || 60,
        clinica: Number(cfg.data?.limite_ia_clinica ?? 600) || 600,
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [clinicaId]);

  const hojeStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const porPessoa = new Map<string, Resumo>();
  for (const l of linhas) {
    const nome = (l.atendente ?? "").trim() || "Sem nome";
    const atual = porPessoa.get(nome) ?? { nome, chamadas: 0, custo: 0, hoje: 0 };
    atual.chamadas += 1;
    atual.custo += Number(l.custo_estimado) || 0;
    const dia = new Date(l.created_at).toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
    if (dia === hojeStr) atual.hoje += 1;
    porPessoa.set(nome, atual);
  }
  const resumo = Array.from(porPessoa.values()).sort((a, b) => b.chamadas - a.chamadas);
  const totalHoje = resumo.reduce((s, r) => s + r.hoje, 0);

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Uso de IA (30 dias)</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          Hoje: {totalHoje}/{limites.clinica} da clínica · {limites.usuario} por pessoa
        </span>
      </div>
      {resumo.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum uso registrado neste período.</p>
      ) : (
        <ul className="divide-y">
          {resumo.map((r) => (
            <li key={r.nome} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.nome}</span>
              <span className="text-xs text-muted-foreground">hoje {r.hoje}</span>
              <span className="tabular-nums">{r.chamadas} usos</span>
              <span className="w-20 text-right tabular-nums text-xs text-muted-foreground">
                US$ {r.custo.toFixed(3)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
