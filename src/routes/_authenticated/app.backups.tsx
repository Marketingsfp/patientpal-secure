import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HardDrive, Download, RefreshCw, PlayCircle, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import { supabase } from "@/integrations/supabase/client";
import { listarBackups, baixarBackupDoDia, dispararBackupAgora } from "@/lib/backups.functions";

export const Route = createFileRoute("/_authenticated/app/backups")({
  component: Page,
  head: () => ({ meta: [{ title: "Backups Diários — ClinicaOS" }] }),
});

interface DiaBackup { data: string; arquivos: number; bytes: number }
interface Execucao { id: string; data_ref: string; status: string; tabelas: number | null; arquivos: number | null; bytes: number | null; finalizado_em: string | null; erro: string | null }

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

function Page() {
  const { clinicaAtual } = useClinica();
  const isAdmin = clinicaAtual?.role === "admin";
  const podeEscrever = usePodeEscrever("auditoria");
  const [dias, setDias] = useState<DiaBackup[]>([]);
  const [execs, setExecs] = useState<Execucao[]>([]);
  const [loading, setLoading] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);

  const listar = useServerFn(listarBackups);
  const baixar = useServerFn(baixarBackupDoDia);
  const disparar = useServerFn(dispararBackupAgora);

  const carregar = async () => {
    if (!clinicaAtual?.clinica_id || !isAdmin) return;
    setLoading(true);
    try {
      const [d, ex] = await Promise.all([
        listar({ data: { clinica_id: clinicaAtual.clinica_id } }),
        supabase
          .from("backup_execucoes")
          .select("id, data_ref, status, tabelas, arquivos, bytes, finalizado_em, erro")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .order("data_ref", { ascending: false })
          .limit(30),
      ]);
      setDias(d);
      setExecs((ex.data ?? []) as Execucao[]);
    } catch (e) { mostrarErro(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clinicaAtual?.clinica_id]);

  const rodarAgora = async () => {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    setRodando(true);
    try {
      const r = await disparar({});
      if (r.status >= 200 && r.status < 300) toast.success("Backup iniciado");
      else toast.error(`Falha ao iniciar backup (${r.status})`);
      await carregar();
    } catch (e) { mostrarErro(e); }
    finally { setRodando(false); }
  };

  const baixarDia = async (data: string) => {
    if (!clinicaAtual?.clinica_id) return;
    setBaixando(data);
    try {
      const r = await baixar({ data: { clinica_id: clinicaAtual.clinica_id, data } });
      for (const u of r.urls) {
        if (!u.url) continue;
        const a = document.createElement("a");
        a.href = u.url;
        a.download = u.nome;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        await new Promise((res) => setTimeout(res, 250));
      }
      toast.success(`${r.urls.length} arquivo(s) enviados para download`);
    } catch (e) { mostrarErro(e); }
    finally { setBaixando(null); }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card className="p-6 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold">Acesso restrito</p>
            <p className="text-sm text-muted-foreground">Somente administradores da clínica podem visualizar e baixar backups diários.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <header className="flex items-center gap-3">
        <HardDrive className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Backups Diários</h1>
          <p className="text-sm text-muted-foreground">
            Dump automático de todas as tabelas às 03:00. Retenção: 30 dias. Baixe os CSVs para restaurar num Postgres local.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Recarregar
        </Button>
        {podeEscrever && (
          <Button size="sm" onClick={rodarAgora} disabled={rodando}>
            <PlayCircle className={`h-4 w-4 mr-2 ${rodando ? "animate-pulse" : ""}`} /> Rodar agora
          </Button>
        )}
      </header>

      <section>
        <h2 className="font-semibold mb-2">Dias disponíveis</h2>
        {dias.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Nenhum backup ainda. Clique em "Rodar agora" para gerar o primeiro.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dias.map((d) => (
              <Card key={d.data} className="p-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-mono font-medium">{d.data}</p>
                  <p className="text-xs text-muted-foreground">{d.arquivos} arquivo(s) · {fmtBytes(d.bytes)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => baixarDia(d.data)} disabled={baixando === d.data}>
                  <Download className="h-4 w-4 mr-2" />
                  {baixando === d.data ? "Baixando…" : "Baixar"}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-2">Últimas execuções</h2>
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Tabelas</th>
                <th className="text-right px-3 py-2">Arquivos</th>
                <th className="text-right px-3 py-2">Tamanho</th>
                <th className="text-left px-3 py-2">Finalizado em</th>
              </tr>
            </thead>
            <tbody>
              {execs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Sem execuções registradas.</td></tr>
              ) : execs.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2 font-mono">{e.data_ref}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${e.status === "concluido" ? "bg-emerald-100 text-emerald-700" : e.status === "erro" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{e.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{e.tabelas ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{e.arquivos ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{e.bytes ? fmtBytes(e.bytes) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {e.finalizado_em ? new Date(e.finalizado_em).toLocaleString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <Card className="p-4 bg-muted/30 text-sm">
        <p className="font-semibold mb-1">Como restaurar num Postgres local</p>
        <ol className="list-decimal ml-5 space-y-1 text-muted-foreground">
          <li>Baixe o backup do dia (todos os arquivos CSV).</li>
          <li>Rode o script <code className="bg-background px-1 rounded">scripts/restore-local.sh</code> apontando para seu Postgres local.</li>
          <li>Consulte <code className="bg-background px-1 rounded">docs/backup-local.md</code> para o passo a passo detalhado.</li>
        </ol>
      </Card>
    </div>
  );
}