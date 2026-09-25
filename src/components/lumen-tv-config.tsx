import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { obterLumenConfig, salvarLumenConfig, testarLumen } from "@/lib/lumen-tv.functions";

type Envio = {
  id: string;
  codigo: string | null;
  enviadoEm: string;
  status: number | null;
  erro: string | null;
};

/** Configuração das TVs da recepção (LUMEN) de uma clínica. */
export function LumenTvConfig({ clinicaId }: { clinicaId: string }) {
  const obter = useServerFn(obterLumenConfig);
  const salvar = useServerFn(salvarLumenConfig);
  const testar = useServerFn(testarLumen);
  const [carregando, setCarregando] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);
  const [url, setUrl] = useState("https://display-mate.lovable.app/api/public/calls");
  const [token, setToken] = useState("");
  const [tokenFim, setTokenFim] = useState<string | null>(null);
  const [pairCodes, setPairCodes] = useState("");
  const [enviarNome, setEnviarNome] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await obter({ data: { clinicaId } });
      if (r.config) {
        setUrl(r.config.url);
        setTokenFim(r.config.tokenFim);
        setPairCodes(r.config.pairCodes.join(", "));
        setEnviarNome(r.config.enviarNome);
        setAtivo(r.config.ativo);
      }
      setEnvios(r.envios);
      setSemAcesso(false);
    } catch {
      setSemAcesso(true);
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, obter]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (semAcesso)
    return (
      <p className="text-sm text-muted-foreground">
        Apenas quem administra a clínica pode ver esta configuração.
      </p>
    );

  const onSalvar = async () => {
    setSalvando(true);
    try {
      await salvar({
        data: {
          clinicaId,
          url,
          token: token || undefined,
          pairCodes: pairCodes
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          enviarNome,
          ativo,
        },
      });
      setToken("");
      toast.success("Configuração das TVs salva.");
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const onTestar = async () => {
    setTestando(true);
    setResultado(null);
    try {
      const r = await testar({ data: { clinicaId } });
      setResultado(`HTTP ${r.status || "—"}: ${r.resposta}`);
    } catch (e) {
      setResultado((e as Error).message);
    } finally {
      setTestando(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-muted-foreground">
        Quando uma senha é chamada, ela é enviada para as TVs da recepção (LUMEN). Se o envio
        falhar, a senha continua funcionando normalmente.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Endereço</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Token</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              tokenFim ? `Salvo: ••••${tokenFim} (deixe vazio para manter)` : "Cole o token"
            }
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label>Códigos de pareamento das TVs</Label>
          <Input
            value={pairCodes}
            onChange={(e) => setPairCodes(e.target.value)}
            placeholder="Vazio = todas as TVs da clínica"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={ativo} onCheckedChange={setAtivo} id="lumen-ativo" />
        <Label htmlFor="lumen-ativo">Ativo</Label>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Switch checked={enviarNome} onCheckedChange={setEnviarNome} id="lumen-nome" />
          <Label htmlFor="lumen-nome">Enviar nome do paciente</Label>
        </div>
        <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span>
            A TV fica na sala de espera. Ligar esta opção mostra o{" "}
            <b>nome do paciente para todos os presentes</b>. O padrão é desligado: só a senha e o
            guichê aparecem.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onSalvar} disabled={salvando}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
        </Button>
        <Button variant="outline" onClick={onTestar} disabled={testando || !tokenFim}>
          {testando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Enviar chamada de teste
        </Button>
      </div>
      {resultado && (
        <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{resultado}</pre>
      )}
      <div>
        <h4 className="mb-2 text-sm font-semibold">Últimos envios</h4>
        {envios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum envio ainda.</p>
        ) : (
          <ul className="divide-y rounded border text-sm">
            {envios.map((e) => (
              <li key={e.id} className="flex justify-between gap-2 px-3 py-1.5">
                <span className="font-mono">{e.codigo}</span>
                <span className="text-muted-foreground">
                  {new Date(e.enviadoEm).toLocaleString("pt-BR")}
                </span>
                <span className={e.status === 200 ? "text-primary" : "text-destructive"}>
                  {e.status ? `HTTP ${e.status}` : (e.erro ?? "aguardando")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
