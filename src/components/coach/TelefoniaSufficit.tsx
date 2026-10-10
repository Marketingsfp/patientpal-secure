/**
 * Diagnóstico da telefonia Sufficit (Coach).
 *
 * ATENÇÃO — DADO DE PACIENTE: a amostra de chamadas traz telefone de paciente.
 * Ela fica só na memória desta tela (estado do React), visível apenas para
 * quem tem acesso de escrita no Coach, e some ao recarregar. NÃO gravar em
 * tabela, localStorage, log nem console.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PhoneCall, Activity, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmDialog } from "@/lib/confirm";
import {
  amostrarChamadasTelefonia,
  estadoConfigTelefonia,
  estadoSegredoTelefonia,
  removerTokenTelefonia,
  salvarTokenTelefonia,
  testarConexaoTelefonia,
} from "@/lib/coach/telefonia.functions";

type Teste = Awaited<ReturnType<typeof testarConexaoTelefonia>>;
type Amostra = Awaited<ReturnType<typeof amostrarChamadasTelefonia>>;

const ROTULOS: Record<string, string> = {
  sufficit_api_base: "Endereço da API",
  sufficit_api_token: "Token de acesso",
  sufficit_object_id: "Identificador da central",
};

type EstadoConfig = Awaited<ReturnType<typeof estadoConfigTelefonia>>;

export function TelefoniaSufficit({
  clinicaId,
  clinicaNome,
}: {
  clinicaId: string | null;
  clinicaNome: string | null;
}) {
  const nomeClinica = clinicaNome?.trim() || "clínica selecionada";
  const lerConfig = useServerFn(estadoConfigTelefonia);
  const [cfg, setCfg] = useState<EstadoConfig | null>(null);
  const [salvoEm, setSalvoEm] = useState<{ quando: string; clinica: string } | null>(null);
  const testar = useServerFn(testarConexaoTelefonia);
  const amostrar = useServerFn(amostrarChamadasTelefonia);
  const [teste, setTeste] = useState<Teste | null>(null);
  const [amostra, setAmostra] = useState<Amostra | null>(null);
  const [carregando, setCarregando] = useState<"teste" | "amostra" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Token: o valor só existe no campo até salvar; o servidor nunca o devolve.
  const lerEstado = useServerFn(estadoSegredoTelefonia);
  const salvarToken = useServerFn(salvarTokenTelefonia);
  const removerToken = useServerFn(removerTokenTelefonia);
  const [token, setToken] = useState("");
  const [estadoToken, setEstadoToken] = useState<{
    configurado: boolean;
    atualizadoEm: string | null;
  } | null>(null);
  const [salvandoToken, setSalvandoToken] = useState(false);
  const [erroToken, setErroToken] = useState<string | null>(null);

  const recarregarConfig = (id: string) =>
    lerConfig({ data: { clinicaId: id } })
      .then(setCfg)
      .catch(() => setCfg(null));

  useEffect(() => {
    // Troca de clínica: nada do estado anterior pode ficar na tela.
    setCfg(null);
    setEstadoToken(null);
    setSalvoEm(null);
    setTeste(null);
    setAmostra(null);
    setToken("");
    setErroToken(null);
    if (!clinicaId) return;
    void recarregarConfig(clinicaId);
    lerEstado({ data: { clinicaId, chave: "sufficit_api_token" } })
      .then(setEstadoToken)
      .catch((e) => setErroToken((e as Error)?.message || "Falha ao ler o estado do token."));
  }, [clinicaId, lerEstado]);

  async function onSalvarToken() {
    if (!clinicaId || !token.trim()) return;
    const destino = nomeClinica;
    const ok = await confirmDialog({
      title: "Confirmar clínica",
      description: `Salvar o token da Sufficit na clínica ${destino}?`,
    });
    if (!ok) return;
    const valor = token;
    setToken(""); // limpa o campo na hora
    setErroToken(null);
    setSalvandoToken(true);
    try {
      setEstadoToken(
        await salvarToken({ data: { clinicaId, chave: "sufficit_api_token", valor } }),
      );
      setSalvoEm({ quando: new Date().toISOString(), clinica: destino });
      void recarregarConfig(clinicaId);
    } catch {
      setErroToken("Não foi possível salvar o token. Tente novamente.");
    } finally {
      setSalvandoToken(false);
    }
  }

  async function onRemoverToken() {
    if (!clinicaId) return;
    const ok = await confirmDialog({
      title: "Remover token da Sufficit?",
      description: "A conexão com a telefonia deixa de funcionar até um novo token ser salvo.",
    });
    if (!ok) return;
    setErroToken(null);
    setSalvandoToken(true);
    try {
      setEstadoToken(await removerToken({ data: { clinicaId, chave: "sufficit_api_token" } }));
      setSalvoEm(null);
      void recarregarConfig(clinicaId);
    } catch {
      setErroToken("Não foi possível remover o token. Tente novamente.");
    } finally {
      setSalvandoToken(false);
    }
  }

  async function rodar(tipo: "teste" | "amostra") {
    if (!clinicaId) return;
    setErro(null);
    setCarregando(tipo);
    try {
      if (tipo === "teste") setTeste(await testar({ data: { clinicaId } }));
      else setAmostra(await amostrar({ data: { clinicaId } }));
    } catch (e) {
      setErro((e as Error)?.message || "Falha inesperada.");
    } finally {
      setCarregando(null);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <PhoneCall className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Telefonia (Sufficit) — diagnóstico</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Só testa a conexão e mostra uma amostra crua. Nada é gravado; a amostra some ao recarregar.
      </p>

      <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Configuração da telefonia — lendo e gravando em
        </div>
        <div className="text-lg font-bold">{nomeClinica}</div>
      </div>

      {cfg && (
        <div className="space-y-2 text-sm">
          <ul className="space-y-1">
            {Object.entries(cfg.config).map(([k, presente]) => (
              <li key={k}>
                {ROTULOS[k] ?? k}:{" "}
                <span className={presente ? "text-primary" : "text-destructive"}>
                  {presente ? "presente" : "ausente"}
                </span>
              </li>
            ))}
          </ul>
          {(() => {
            const v = Object.values(cfg.config);
            const algumas = v.some(Boolean) && v.some((x) => !x);
            return algumas ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                A configuração da telefonia está pela metade em {nomeClinica}: só parte das chaves
                está cadastrada aqui. As três chaves (endereço da API, token e identificador da
                central) precisam estar na mesma clínica — confira se alguma foi gravada em outra
                clínica por engano.
              </div>
            ) : null;
          })()}
          {cfg.outras.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Há chaves desta integração cadastradas também em:{" "}
              {cfg.outras
                .map((o) => `${o.nome} (${o.chaves.map((c) => ROTULOS[c] ?? c).join(", ")})`)
                .join("; ")}
              .
            </p>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-lg border p-4">
        <Label htmlFor="sufficit-token">Token de API da Sufficit (Bearer)</Label>
        <Input
          id="sufficit-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={!clinicaId || salvandoToken}
        />
        <p className="text-xs text-muted-foreground">
          O token é gravado no servidor e não volta mais para a tela.
        </p>
        <p className="text-sm">
          {estadoToken === null
            ? "Verificando…"
            : estadoToken.configurado
              ? `Token configurado${
                  estadoToken.atualizadoEm
                    ? ` · atualizado em ${new Date(estadoToken.atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                    : ""
                }`
              : "Token ausente"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void onSalvarToken()}
            disabled={!clinicaId || salvandoToken || !token.trim()}
          >
            {salvandoToken && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar token
          </Button>
          <Button
            variant="outline"
            onClick={() => void onRemoverToken()}
            disabled={!clinicaId || salvandoToken || !estadoToken?.configurado}
          >
            Remover token
          </Button>
        </div>
        {salvoEm && (
          <p className="text-sm text-primary">
            Token salvo em{" "}
            {new Date(salvoEm.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} na
            clínica {salvoEm.clinica}.
          </p>
        )}
        {erroToken && <p className="text-sm text-destructive">{erroToken}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void rodar("teste")} disabled={!clinicaId || !!carregando}>
          {carregando === "teste" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Activity className="mr-2 h-4 w-4" />
          )}
          Testar conexão
        </Button>
        <Button
          variant="outline"
          onClick={() => void rodar("amostra")}
          disabled={!clinicaId || !!carregando}
        >
          {carregando === "amostra" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <List className="mr-2 h-4 w-4" />
          )}
          Ver amostra (5 chamadas)
        </Button>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {teste && (
        <div className="space-y-2 text-sm">
          <div className="font-medium">Configuração</div>
          <ul className="space-y-1">
            {Object.entries(teste.config).map(([k, presente]) => (
              <li key={k}>
                {ROTULOS[k] ?? k} (<code className="text-xs">{k}</code>):{" "}
                <span className={presente ? "text-primary" : "text-destructive"}>
                  {presente ? "presente" : "ausente"}
                </span>
              </li>
            ))}
          </ul>
          <div className="font-medium">Teste de vida (/health)</div>
          {teste.ping.ok ? (
            <p>
              HTTP {teste.ping.status} em {teste.ping.tempoMs} ms
            </p>
          ) : (
            <p className="text-destructive">{teste.ping.erro}</p>
          )}
        </div>
      )}

      {amostra && (
        <div className="space-y-2 text-sm">
          <div className="font-medium">Amostra de chamadas</div>
          {amostra.ok ? (
            <>
              <p>
                HTTP {amostra.status} · {amostra.contentType ?? "sem content-type"} ·{" "}
                {amostra.tempoMs} ms{amostra.truncado ? " · corpo truncado em 4000 caracteres" : ""}
              </p>
              <p>
                Campos do primeiro registro:{" "}
                {amostra.camposPrimeiroRegistro?.length
                  ? amostra.camposPrimeiroRegistro.join(", ")
                  : "não identificados (resposta não é JSON ou não tem registro)"}
              </p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
                {amostra.corpoCru || "(corpo vazio)"}
              </pre>
            </>
          ) : (
            <p className="text-destructive">
              {amostra.erro}
              {amostra.status ? ` (HTTP ${amostra.status})` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
