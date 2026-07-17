import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { useAuth } from "@/hooks/use-auth";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import { printOrcamento } from "@/lib/print-orcamento";
import { Button } from "@/components/ui/button";
import { OrcamentoCard, type OrcV2 } from "@/components/orcamentos-v2/orcamento-card";
import { OrcamentoDrawer } from "@/components/orcamentos-v2/orcamento-drawer";
import { ConversaoOrcamentoDialog } from "@/components/orcamentos/conversao-orcamento-dialog";
import { NovoOrcamentoOdontoDialog } from "./novo-orcamento-odonto-dialog";

interface Props {
  pacienteId: string;
  pacienteNome: string;
  pacienteTelefone: string | null;
  especialidadeOdontoId: string | null;
}

/**
 * Aba Orçamento dentro de /app/odontologia:
 * - lista orçamentos do paciente marcados com especialidade Odontologia
 * - permite criar um novo (com procedimentos filtrados à especialidade)
 * - reutiliza OrcamentoCard/Drawer e o diálogo de conversão do módulo v2
 */
export function OrcamentoTab({ pacienteId, pacienteNome, pacienteTelefone, especialidadeOdontoId }: Props) {
  const { clinicaAtual } = useClinica();
  const { user } = useAuth();
  const podeEscrever = usePodeEscrever("odontologia");
  const [list, setList] = useState<OrcV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [drawerOrc, setDrawerOrc] = useState<OrcV2 | null>(null);
  const [conversaoId, setConversaoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicaAtual || !especialidadeOdontoId || !pacienteId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orcamentos")
      .select("id, numero, paciente_id, paciente_nome, paciente_telefone, medico_nome, forma_pagamento, valor_total, status, created_at, categoria, validade_dias")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("paciente_id", pacienteId)
      .eq("especialidade_id", especialidadeOdontoId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { mostrarErro(error); setLoading(false); return; }
    const orcs = ((data ?? []) as unknown as OrcV2[]).map((o) => ({
      ...o,
      agendamentos_total: 0, agendamentos_realizados: 0,
      itens_total: 0, itens_consumidos: 0,
    }));
    if (orcs.length > 0) {
      const ids = orcs.map((o) => o.id);
      const [{ data: ags }, { data: itens }, { data: links }] = await Promise.all([
        supabase.from("agendamentos").select("orcamento_id, status").in("orcamento_id", ids).neq("status", "cancelado"),
        supabase.from("orcamento_itens").select("orcamento_id, quantidade").in("orcamento_id", ids),
        supabase.from("agendamento_orcamento_itens").select("orcamento_id, orcamento_item_id").in("orcamento_id", ids),
      ]);
      const tot = new Map<string, number>(); const real = new Map<string, number>();
      for (const a of (ags ?? []) as { orcamento_id: string; status: string }[]) {
        tot.set(a.orcamento_id, (tot.get(a.orcamento_id) ?? 0) + 1);
        if (a.status === "realizado") real.set(a.orcamento_id, (real.get(a.orcamento_id) ?? 0) + 1);
      }
      const totItens = new Map<string, number>();
      for (const it of (itens ?? []) as { orcamento_id: string; quantidade: number }[]) {
        totItens.set(it.orcamento_id, (totItens.get(it.orcamento_id) ?? 0) + Number(it.quantidade || 1));
      }
      const consumidos = new Map<string, Set<string>>();
      for (const l of (links ?? []) as { orcamento_id: string; orcamento_item_id: string }[]) {
        if (!consumidos.has(l.orcamento_id)) consumidos.set(l.orcamento_id, new Set());
        consumidos.get(l.orcamento_id)!.add(l.orcamento_item_id);
      }
      for (const o of orcs) {
        o.agendamentos_total = tot.get(o.id) ?? 0;
        o.agendamentos_realizados = real.get(o.id) ?? 0;
        o.itens_total = totItens.get(o.id) ?? 0;
        o.itens_consumidos = consumidos.get(o.id)?.size ?? 0;
      }
    }
    setList(orcs);
    setLoading(false);
  }, [clinicaAtual, especialidadeOdontoId, pacienteId]);

  useEffect(() => { void load(); }, [load]);

  const imprimir = async (id: string) => {
    if (!clinicaAtual) return;
    try { await printOrcamento(id, clinicaAtual.clinica_id); }
    catch (e) { toast.error((e as Error).message); }
  };

  const semEspecialidade = !especialidadeOdontoId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Orçamentos odontológicos</h2>
          <p className="text-xs text-muted-foreground">
            Apenas orçamentos deste paciente com procedimentos da especialidade Odontologia.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setNovoOpen(true)}
          disabled={!podeEscrever || semEspecialidade || !clinicaAtual}
          title={semEspecialidade ? "Especialidade Odontologia não encontrada" : undefined}
        >
          <Plus className="h-4 w-4 mr-1" /> Novo orçamento
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <div className="border rounded-md p-6 text-center text-sm text-muted-foreground">
          Nenhum orçamento odontológico para este paciente ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((o) => (
            <OrcamentoCard
              key={o.id}
              o={o}
              onOpen={() => setDrawerOrc(o)}
              onPrint={() => void imprimir(o.id)}
              onConverter={() => setConversaoId(o.id)}
            />
          ))}
        </div>
      )}

      <OrcamentoDrawer
        orc={drawerOrc}
        onClose={() => setDrawerOrc(null)}
        onPrint={(id) => void imprimir(id)}
        onConverter={(id) => setConversaoId(id)}
      />

      {conversaoId && (
        <ConversaoOrcamentoDialog
          open={!!conversaoId}
          onClose={() => setConversaoId(null)}
          orcamentoId={conversaoId}
          onChanged={() => void load()}
        />
      )}

      {novoOpen && clinicaAtual && especialidadeOdontoId && (
        <NovoOrcamentoOdontoDialog
          open={novoOpen}
          onClose={() => setNovoOpen(false)}
          clinicaId={clinicaAtual.clinica_id}
          pacienteId={pacienteId}
          pacienteNome={pacienteNome}
          pacienteTelefone={pacienteTelefone}
          especialidadeOdontoId={especialidadeOdontoId}
          userId={user?.id ?? null}
          onCreated={() => { setNovoOpen(false); void load(); }}
        />
      )}
    </div>
  );
}