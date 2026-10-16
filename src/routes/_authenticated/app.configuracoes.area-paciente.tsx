import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PatientSearchInput } from "@/components/patient-search-input";
import { mostrarErro } from "@/lib/traduzir-erro";
import { gerarCodigoTeste } from "@/lib/portal-paciente/portal-equipe.functions";

export const Route = createFileRoute("/_authenticated/app/configuracoes/area-paciente")({
  component: Pagina,
  head: () => ({ meta: [{ title: "Área do Paciente — ClinicaOS" }] }),
});

const EVENTO: Record<string, string> = {
  login_ok: "Entrou",
  login_falhou: "Código errado",
  logout: "Saiu",
  termo_aceito: "Aceitou o termo",
  codigo_enviado: "Código enviado",
  codigo_envio_indisponivel: "Código pedido (e-mail ainda não configurado)",
  codigo_recusado: "Pedido bloqueado (limite)",
  codigo_sem_email: "Pedido de código — cadastro sem e-mail",
  codigo_cpf_nao_encontrado: "Pedido de código — CPF não cadastrado",
  codigo_teste_gerado: "Código de teste gerado pela equipe",
  pendencia_cpf_repetido: "Bloqueado: CPF em mais de um cadastro",
  pendencia_menor: "Bloqueado: menor de idade",
  ver_agendamentos: "Viu agendamentos",
  ver_cadastro: "Viu cadastro",
  confirmou_agendamento: "Confirmou agendamento",
  cancelou_agendamento: "Cancelou agendamento",
  solicitou_alteracao: "Pediu atualização de cadastro",
};

function Pagina() {
  const { clinicaAtual, modoTodas } = useClinica();
  const clinicaId = modoTodas ? null : (clinicaAtual?.clinica_id ?? null);
  const qc = useQueryClient();
  const gerarFn = useServerFn(gerarCodigoTeste);

  const cfg = useQuery({
    queryKey: ["portal-config", clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_paciente_config")
        .select("ativo, cancelar_horas_min")
        .eq("clinica_id", clinicaId as string)
        .maybeSingle();
      if (error) throw error;
      return data ?? { ativo: false, cancelar_horas_min: 2 };
    },
  });
  const termo = useQuery({
    queryKey: ["portal-termo", clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("portal_termos")
        .select("id, versao, titulo, texto, rascunho_juridico, criado_em")
        .eq("clinica_id", clinicaId as string)
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
  const acessos = useQuery({
    queryKey: ["portal-acessos", clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data } = await supabase
        .from("portal_acessos")
        .select("id, evento, criado_em, pacientes:paciente_id(nome)")
        .eq("clinica_id", clinicaId as string)
        .order("criado_em", { ascending: false })
        .limit(50);
      return (data ?? []) as unknown as Array<{ id: string; evento: string; criado_em: string; pacientes: { nome: string } | null }>;
    },
  });

  const [horas, setHoras] = useState(2);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [rascunho, setRascunho] = useState(true);
  const [pacienteTeste, setPacienteTeste] = useState<{ id: string; nome: string } | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    if (cfg.data) setHoras(cfg.data.cancelar_horas_min);
  }, [cfg.data]);
  useEffect(() => {
    if (termo.data) {
      setTitulo(termo.data.titulo);
      setTexto(termo.data.texto);
      setRascunho(termo.data.rascunho_juridico);
    }
  }, [termo.data]);

  const salvarCfg = async (patch: { ativo?: boolean; cancelar_horas_min?: number }) => {
    if (!clinicaId) return;
    const { error } = await supabase
      .from("portal_paciente_config")
      .upsert({ clinica_id: clinicaId, ...cfg.data, ...patch, updated_at: new Date().toISOString() });
    if (error) return mostrarErro(error);
    toast.success("Salvo.");
    void qc.invalidateQueries({ queryKey: ["portal-config", clinicaId] });
  };

  const publicarTermo = async () => {
    if (!clinicaId || !titulo.trim() || !texto.trim()) return;
    const { error } = await supabase.from("portal_termos").insert({
      clinica_id: clinicaId,
      versao: (termo.data?.versao ?? 0) + 1,
      titulo: titulo.trim(),
      texto: texto.trim(),
      rascunho_juridico: rascunho,
    });
    if (error) return mostrarErro(error);
    toast.success("Nova versão publicada. Os pacientes vão aceitar de novo no próximo acesso.");
    void qc.invalidateQueries({ queryKey: ["portal-termo", clinicaId] });
  };

  const gerar = async () => {
    if (!clinicaId || !pacienteTeste) return;
    try {
      const r = await gerarFn({ data: { clinicaId, pacienteId: pacienteTeste.id } });
      setCodigo(r.codigo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar.");
    }
  };

  if (!clinicaId) return <p className="p-6 text-sm text-muted-foreground">Escolha uma unidade.</p>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Área do Paciente</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Funcionamento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={!!cfg.data?.ativo} onCheckedChange={(v) => void salvarCfg({ ativo: v })} />
            <span className="text-sm">Área do Paciente ligada nesta clínica</span>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="horas">Cancelamento pela internet até (horas antes)</Label>
              <Input id="horas" type="number" min={0} max={168} className="w-32" value={horas} onChange={(e) => setHoras(Number(e.target.value))} />
            </div>
            <Button variant="outline" onClick={() => void salvarCfg({ cancelar_horas_min: Math.max(0, Math.min(168, horas || 0)) })}>Salvar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Termo de uso e privacidade {termo.data && `(versão ${termo.data.versao})`}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <Textarea rows={14} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex items-center gap-3">
            <Switch checked={rascunho} onCheckedChange={setRascunho} />
            <span className="text-sm">Ainda é rascunho (aguarda revisão jurídica)</span>
          </div>
          <Button onClick={publicarTermo}>Publicar como nova versão</Button>
          <p className="text-xs text-muted-foreground">Versões antigas ficam guardadas; quem aceitou a anterior aceita a nova no próximo acesso.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Código de teste</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Enquanto o envio de e-mail não estiver configurado, gere aqui um código para um paciente (vale 10 minutos, uma vez). Fica registrado.
          </p>
          <PatientSearchInput
            clinicaIdsOverride={[clinicaId]}
            onSelect={(p) => { setPacienteTeste(p ? { id: p.id, nome: p.nome } : null); setCodigo(null); }}
          />
          {pacienteTeste && <p className="text-sm">Paciente: <b>{pacienteTeste.nome}</b></p>}
          <Button variant="outline" disabled={!pacienteTeste} onClick={gerar}>Gerar código</Button>
          {codigo && <p className="font-mono text-2xl tracking-widest">{codigo}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos acessos</CardTitle></CardHeader>
        <CardContent>
          {(acessos.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum acesso ainda.</p>}
          <ul className="divide-y text-sm">
            {(acessos.data ?? []).map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-1.5">
                <span>{EVENTO[a.evento] ?? a.evento}{a.pacientes?.nome ? ` — ${a.pacientes.nome}` : ""}</span>
                <span className="text-xs text-muted-foreground">{new Date(a.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
