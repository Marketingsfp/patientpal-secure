import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { normalizarHostname } from "@/lib/clinica-acesso";
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/_authenticated/app/configuracoes/dominios")({
  component: Pagina,
  head: () => ({ meta: [{ title: "Domínios de acesso — ClinicaOS" }] }),
});

interface Dominio {
  id: string;
  hostname: string;
  ativo: boolean;
}

function Pagina() {
  const { clinicaAtual, modoTodas } = useClinica();
  const clinicaId = modoTodas ? null : (clinicaAtual?.clinica_id ?? null);
  const qc = useQueryClient();
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const chave = ["clinica-dominios", clinicaId];

  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinica_dominios")
        .select("id, hostname, ativo")
        .eq("clinica_id", clinicaId as string)
        .order("hostname");
      if (error) throw error;
      return (data ?? []) as Dominio[];
    },
  });

  const adicionar = async () => {
    const hostname = normalizarHostname(novo.replace(/^https?:\/\//i, "").split("/")[0]);
    if (!hostname || !clinicaId) return;
    setSalvando(true);
    const { error } = await supabase.from("clinica_dominios").insert({ clinica_id: clinicaId, hostname });
    setSalvando(false);
    if (error) return mostrarErro(error);
    setNovo("");
    toast.success("Endereço adicionado.");
    void qc.invalidateQueries({ queryKey: chave });
  };

  const alternar = async (d: Dominio, ativo: boolean) => {
    const { error } = await supabase.from("clinica_dominios").update({ ativo }).eq("id", d.id);
    if (error) return mostrarErro(error);
    void qc.invalidateQueries({ queryKey: chave });
  };

  const remover = async (d: Dominio) => {
    const { error } = await supabase.from("clinica_dominios").delete().eq("id", d.id);
    if (error) return mostrarErro(error);
    toast.success("Endereço removido.");
    void qc.invalidateQueries({ queryKey: chave });
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Domínios de acesso</h1>
        {clinicaAtual && !modoTodas && (
          <p className="text-base font-medium">Clínica: {clinicaAtual.clinica.nome}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Endereços próprios desta clínica (ex.: sistema.suaclinica.com.br). Quem entrar por eles vê
          o login com a marca da clínica e já cai nesta unidade, se tiver acesso a ela.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Importante: o endereço também precisa ser conectado em Project Settings → Domains do
          Lovable. Nenhum domínio pode ficar marcado como primário — senão todos os outros
          endereços passam a redirecionar para ele.
        </p>
      </div>
      {!clinicaId && (
        <p className="text-sm text-muted-foreground">Selecione uma clínica no seletor acima.</p>
      )}
      {clinicaId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereços cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {error && <p className="text-sm text-destructive">Não foi possível carregar.</p>}
            {data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum endereço cadastrado (ou você não é administrador desta clínica).
              </p>
            )}
            {data?.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-md border p-2">
                <span className="flex-1 font-mono text-sm">{d.hostname}</span>
                <span className="text-xs text-muted-foreground">{d.ativo ? "Ativo" : "Inativo"}</span>
                <Switch checked={d.ativo} onCheckedChange={(v) => void alternar(d, v)} />
                <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => void remover(d)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Input
                uppercase={false}
                placeholder="sistema.suaclinica.com.br"
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
              />
              <Button onClick={() => void adicionar()} disabled={salvando || !novo.trim()}>
                Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
