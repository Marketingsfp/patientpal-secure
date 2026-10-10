/**
 * Diagnóstico da telefonia Sufficit (Coach).
 *
 * ATENÇÃO — DADO DE PACIENTE: a amostra de chamadas traz telefone de paciente.
 * Ela fica só na memória desta tela (estado do React), visível apenas para
 * quem tem acesso de escrita no Coach, e some ao recarregar. NÃO gravar em
 * tabela, localStorage, log nem console.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PhoneCall, Activity, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { amostrarChamadasTelefonia, testarConexaoTelefonia } from "@/lib/coach/telefonia.functions";

type Teste = Awaited<ReturnType<typeof testarConexaoTelefonia>>;
type Amostra = Awaited<ReturnType<typeof amostrarChamadasTelefonia>>;

const ROTULOS: Record<string, string> = {
  sufficit_api_base: "Endereço da API",
  sufficit_api_token: "Token de acesso",
  sufficit_object_id: "Identificador da central",
};

export function TelefoniaSufficit({ clinicaId }: { clinicaId: string | null }) {
  const testar = useServerFn(testarConexaoTelefonia);
  const amostrar = useServerFn(amostrarChamadasTelefonia);
  const [teste, setTeste] = useState<Teste | null>(null);
  const [amostra, setAmostra] = useState<Amostra | null>(null);
  const [carregando, setCarregando] = useState<"teste" | "amostra" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

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
