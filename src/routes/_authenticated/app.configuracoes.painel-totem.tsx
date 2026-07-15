import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Copy, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/app/configuracoes/painel-totem")({
  component: PainelTotemConfigPage,
  head: () => ({ meta: [{ title: "Painel & Totem — ClinicaOS" }] }),
});

type Row = { id: string; nome: string; token_publico: string | null };

function PainelTotemConfigPage() {
  const { memberships, loading: loadingMemberships } = useClinica();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotacionando, setRotacionando] = useState<string | null>(null);

  const clinicaIds = useMemo(
    () => memberships.map((m) => m.clinica_id),
    [memberships],
  );

  useEffect(() => {
    if (loadingMemberships) return;
    if (clinicaIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelado = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("clinicas")
        .select("id, nome, token_publico")
        .in("id", clinicaIds)
        .order("nome");
      if (cancelado) return;
      if (error) {
        toast.error("Não foi possível carregar as clínicas.");
        setRows([]);
      } else {
        setRows((data ?? []) as Row[]);
      }
      setLoading(false);
    })();
    return () => { cancelado = true; };
  }, [clinicaIds, loadingMemberships]);

  async function rotacionar(id: string) {
    setRotacionando(id);
    // Trigger BEFORE INSERT gera token novo automaticamente; para UPDATE,
    // precisamos forçar: setar NULL e depois reler.
    const { error: eNull } = await supabase
      .from("clinicas")
      .update({ token_publico: null })
      .eq("id", id);
    if (eNull) {
      toast.error("Não foi possível rotacionar o token. Verifique se você tem permissão de gestor.");
      setRotacionando(null);
      return;
    }
    // O trigger é BEFORE INSERT — para UPDATE geramos aqui um novo valor.
    const novo = novoToken();
    const { error: eSet } = await supabase
      .from("clinicas")
      .update({ token_publico: novo })
      .eq("id", id);
    if (eSet) {
      toast.error("Falha ao gravar o novo token.");
    } else {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, token_publico: novo } : r)));
      toast.success("Token rotacionado. O link antigo não funciona mais.");
    }
    setRotacionando(null);
  }

  if (loading || loadingMemberships) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Painel & Totem públicos</h1>
        <p className="text-sm text-muted-foreground">
          Cada clínica tem um token secreto que dá acesso ao painel de senhas e ao totem
          sem exigir login. Compartilhe apenas com os dispositivos de recepção. Se
          suspeitar que um link vazou, rotacione o token — o link antigo para de funcionar.
        </p>
      </header>

      {rows.length === 0 && (
        <Card><CardContent className="py-6 text-muted-foreground">Nenhuma clínica encontrada.</CardContent></Card>
      )}

      {rows.map((c) => (
        <ClinicaCard
          key={c.id}
          row={c}
          rotacionando={rotacionando === c.id}
          onRotacionar={() => rotacionar(c.id)}
        />
      ))}
    </div>
  );
}

function ClinicaCard({
  row, rotacionando, onRotacionar,
}: { row: Row; rotacionando: boolean; onRotacionar: () => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const token = row.token_publico ?? "";
  const painelUrl = token ? `${origin}/painel/t/${token}` : "";
  const totemUrl = token ? `${origin}/totem/t/${token}` : "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-lg">{row.nome}</CardTitle>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={rotacionando}>
              {rotacionando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Rotacionar token</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rotacionar token de {row.nome}?</AlertDialogTitle>
              <AlertDialogDescription>
                O link atual do painel e do totem <b>deixará de funcionar imediatamente</b>.
                Você precisará atualizar os links salvos nos dispositivos da recepção.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onRotacionar}>Rotacionar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>
      <CardContent>
        {!token ? (
          <div className="text-sm text-destructive">Token não gerado. Clique em "Rotacionar token".</div>
        ) : (
          <Tabs defaultValue="painel">
            <TabsList>
              <TabsTrigger value="painel">Painel</TabsTrigger>
              <TabsTrigger value="totem">Totem</TabsTrigger>
            </TabsList>
            <TabsContent value="painel">
              <LinkBlock url={painelUrl} />
            </TabsContent>
            <TabsContent value="totem">
              <LinkBlock url={totemUrl} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function LinkBlock({ url }: { url: string }) {
  const [qr, setQr] = useState<string>("");
  useEffect(() => {
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  return (
    <div className="pt-3 grid gap-4 md:grid-cols-[1fr_auto]">
      <div className="space-y-2 min-w-0">
        <Label className="text-xs text-muted-foreground">URL</Label>
        <div className="flex gap-2">
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link copiado.");
              } catch { toast.error("Não foi possível copiar."); }
            }}
            title="Copiar link"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button asChild variant="secondary" size="icon" title="Abrir em nova aba">
            <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
          </Button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        {qr ? <img src={qr} alt="QR Code" className="w-40 h-40 rounded border" /> : <div className="w-40 h-40 rounded border flex items-center justify-center text-xs text-muted-foreground">gerando…</div>}
        <span className="text-[10px] text-muted-foreground">Aponte a câmera</span>
      </div>
    </div>
  );
}

// base64url de 24 bytes, casado com o formato gerado pelo trigger no banco.
function novoToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin).replace(/\//g, "_").replace(/\+/g, "-").replace(/=+$/g, "");
}
