/**
 * Tela "Numeração de Prontuário".
 *
 * Existe porque a clínica numera as pastas em dois lugares ao mesmo tempo: o
 * arquivo físico (e o sistema antigo, que continua rodando) e o contador do
 * sistema novo. O arquivo anda sem o sistema ficar sabendo, e quando os dois
 * divergem todo cadastro novo nasce com o número errado.
 *
 * Aqui a recepção informa qual foi a última pasta usada na estante e o contador
 * se realinha na hora, sem precisar de suporte nem de SQL. É a única porta de
 * entrada para esse ajuste: a tabela do contador fica trancada no banco e só as
 * funções `prontuario_sequencia_ver` / `prontuario_sequencia_ajustar` chegam
 * nela, conferindo o perfil de quem chamou.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/app/configuracoes/prontuario")({
  component: NumeracaoProntuarioPage,
  head: () => ({ meta: [{ title: "Numeração de Prontuário — ClinicaOS" }] }),
});

/** Perfis que podem ver e ajustar. A conferência de verdade está no banco. */
const PERFIS_COM_ACESSO = ["admin", "gestor", "supervisor", "recepcao"];

/** Formata 2438877 como "2.438.877", que é como a recepção lê na pasta. */
function formatar(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("pt-BR");
}

function NumeracaoProntuarioPage() {
  const { clinicaAtual, loading: loadingClinica } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id ?? null;
  const podeAjustar = PERFIS_COM_ACESSO.includes(clinicaAtual?.role ?? "");

  const [proximo, setProximo] = useState<number | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    const { data, error } = await (supabase as any).rpc("prontuario_sequencia_ver", {
      _clinica_id: clinicaId,
    });
    if (error) {
      toast.error("Não foi possível ler a numeração atual.");
      setProximo(null);
    } else {
      const linha = (data ?? [])[0];
      setProximo(linha ? Number(linha.proximo) : null);
      setAtualizadoEm(linha?.atualizado_em ?? null);
    }
    setCarregando(false);
  }, [clinicaId]);

  useEffect(() => {
    if (loadingClinica || !clinicaId) return;
    void carregar();
  }, [carregar, clinicaId, loadingClinica]);

  // Só dígitos: o número da pasta não tem ponto nem letra.
  const numeroDigitado = digitado.replace(/\D/g, "");
  const valido = numeroDigitado.length > 0 && numeroDigitado.length <= 7;

  async function ajustar() {
    if (!clinicaId || !valido) return;
    setSalvando(true);
    const { data, error } = await (supabase as any).rpc("prontuario_sequencia_ajustar", {
      _clinica_id: clinicaId,
      _ultima_pasta: Number(numeroDigitado),
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message ?? "Não foi possível ajustar a numeração.");
      return;
    }
    const linha = (data ?? [])[0];
    const novo = linha ? Number(linha.proximo) : null;
    const pulados = linha ? Number(linha.pulados) : 0;
    setProximo(novo);
    setAtualizadoEm(new Date().toISOString());
    setDigitado("");
    toast.success(
      pulados > 0
        ? `Pronto. O próximo cadastro receberá ${formatar(novo)} — ${pulados} ${
            pulados === 1 ? "número já estava" : "números já estavam"
          } em uso e ${pulados === 1 ? "foi pulado" : "foram pulados"}.`
        : `Pronto. O próximo cadastro receberá ${formatar(novo)}.`,
    );
  }

  if (loadingClinica || carregando) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!podeAjustar) {
    return (
      <div className="p-4 md:p-6 max-w-3xl">
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            Esta tela é da gestão e da recepção. Fale com o gestor da clínica se precisar ajustar a
            numeração de prontuário.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Numeração de Prontuário</h1>
        <p className="text-sm text-muted-foreground">
          Quando a recepção cadastra um paciente e deixa o campo de prontuário em branco, o sistema
          usa o número abaixo. Se o arquivo físico andou sem passar pelo sistema, é aqui que se
          acerta o ponteiro.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium text-muted-foreground">
            O próximo paciente sem número vai receber
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-7 w-7 text-muted-foreground" />
            <span className="text-4xl font-bold tabular-nums tracking-tight">
              {formatar(proximo)}
            </span>
          </div>
          {atualizadoEm && (
            <p className="text-xs text-muted-foreground">
              Última conferência: {new Date(atualizadoEm).toLocaleString("pt-BR")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Acertar pelo arquivo físico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ultima-pasta">Qual foi a última pasta usada na estante?</Label>
            <Input
              id="ultima-pasta"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 2438876"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              className="max-w-xs text-lg tabular-nums"
            />
            <p className="text-sm text-muted-foreground">
              Digite o número da <b>última pasta já usada</b>, não o da próxima. O sistema continua
              a partir dela e pula sozinho qualquer número que já pertença a algum paciente.
            </p>
          </div>

          <Button
            onClick={() => setConfirmando(true)}
            disabled={!valido || salvando}
            className="gap-2"
          >
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar numeração
          </Button>

          <p className="text-xs text-muted-foreground">
            Este ajuste não altera o número de nenhum paciente já cadastrado — muda só o próximo. A
            alteração fica registrada no histórico do sistema com o seu nome.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar a numeração?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Você informou que a última pasta usada na estante é a{" "}
                  <b>{formatar(numeroDigitado ? Number(numeroDigitado) : null)}</b>.
                </p>
                <p>
                  O próximo paciente cadastrado sem número vai receber o primeiro número livre
                  depois dela. Hoje o sistema está entregando {formatar(proximo)}.
                </p>
                <p className="text-muted-foreground">
                  Confira o número na estante antes de confirmar: se ele estiver errado, os próximos
                  cadastros nascem fora de ordem.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void ajustar()}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
