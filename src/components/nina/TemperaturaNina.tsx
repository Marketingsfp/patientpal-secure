import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mostrarErro } from "@/lib/traduzir-erro";
import { useAuth } from "@/hooks/use-auth";
import { carregarTemperaturaNina, salvarTemperaturaNina } from "@/lib/nina/temperatura.functions";
import { TEMPERATURA_PADRAO, temperaturaSchema } from "@/lib/nina/temperatura";

export function TemperaturaNina({ clinicaId }: { clinicaId: string }) {
  const carregar = useServerFn(carregarTemperaturaNina);
  const salvar = useServerFn(salvarTemperaturaNina);
  const cache = useQueryClient();
  const { session, loading: authLoading } = useAuth();
  const chave = ["nina-temperatura", clinicaId, session?.user.id];
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: chave,
    queryFn: () => carregar({ data: { clinicaId } }),
    staleTime: Infinity,
    enabled: !authLoading && !!session?.access_token,
  });
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const valor = rascunho ?? String(data?.temperatura ?? TEMPERATURA_PADRAO);
  const valido = valor.trim() !== "" && temperaturaSchema.safeParse(Number(valor)).success;
  const bloqueado = salvando || isFetching || !data?.podeEditar || !!error;

  async function aplicar() {
    if (bloqueado || !valido || !data) return;
    setSalvando(true);
    try {
      const resultado = await salvar({
        data: { clinicaId, temperatura: Number(valor), revisaoEsperada: data.revisao },
      });
      cache.setQueryData(chave, resultado);
      setRascunho(null);
      if (resultado.aviso) toast.warning(resultado.aviso);
      else toast.success("Temperatura salva para o WhatsApp e a homologação desta clínica.");
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card id="temperatura-nina">
      <CardHeader>
        <CardTitle className="text-base">Temperatura das respostas da Nina</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Controla a variação das respostas. O mesmo valor é usado no WhatsApp e na homologação
          desta clínica.
        </p>
        <p className="text-sm text-muted-foreground">
          Padrão recomendado: <strong>1,0</strong>. Reduzir a temperatura não garante respostas mais
          corretas e pode causar repetição no Gemini 3.{" "}
          <a
            href="https://ai.google.dev/gemini-api/docs/gemini-3#temperature"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Recomendação do Google
          </a>
        </p>
        {isPending ? (
          <p role="status" className="text-sm">
            Carregando configuração…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar a temperatura. Recarregue para conferir o valor atual.
          </p>
        ) : null}
        {data?.origem === "padrao_configuracao_invalida" ? (
          <p role="alert" className="text-sm text-destructive">
            A configuração salva é inválida. A Nina está usando o padrão 1,0.
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="temperatura-nina-valor">Temperatura (0 a 2)</Label>
            <Input
              id="temperatura-nina-valor"
              className="w-32"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={valor}
              disabled={bloqueado || isPending}
              onChange={(e) => setRascunho(e.target.value)}
              aria-invalid={!valido}
            />
          </div>
          {data?.podeEditar ? (
            <>
              <Button
                variant="outline"
                disabled={bloqueado}
                onClick={() => setRascunho(String(TEMPERATURA_PADRAO))}
              >
                Usar padrão 1,0
              </Button>
              <Button
                disabled={
                  bloqueado ||
                  !valido ||
                  (Number(valor) === data.temperatura &&
                    data.origem !== "padrao_configuracao_invalida")
                }
                onClick={() => void aplicar()}
              >
                {salvando ? "Salvando…" : "Salvar temperatura"}
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            disabled={salvando || isFetching}
            onClick={() => {
              setRascunho(null);
              void refetch();
            }}
          >
            Recarregar
          </Button>
        </div>
        {!valido ? (
          <p role="alert" className="text-sm text-destructive">
            Informe um número entre 0 e 2.
          </p>
        ) : null}
        {data ? (
          <p className="text-xs text-muted-foreground">
            Valor em uso: {data.temperatura.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}.{" "}
            {data.podeEditar
              ? "Ao salvar, o ajuste vale para as próximas chamadas ao modelo nos dois ambientes."
              : "Somente administradores podem alterar este valor."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
