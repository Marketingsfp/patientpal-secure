/**
 * FASE 4 — duas verificações DISTINTAS da homologação.
 *
 *  1. "Validar fonte e aderência do prompt" — publica a regra pelo caminho
 *     real num espaço isolado e checa se ela chegou ao modelo e foi cumprida
 *     na primeira resposta. NÃO aprova o atendimento inteiro.
 *  2. "Validar atendimento completo" — roda o fluxo normal e mostra, separado,
 *     o que o modelo produziu e o que sobrou depois das verificações.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  validarFonteEAderencia,
  validarAtendimentoCompleto,
} from "@/lib/nina/homologacao/verificacoes.functions";

function Sim({ v }: { v: boolean }) {
  return (
    <Badge variant={v ? "default" : "destructive"}>{v ? "sim" : "não"}</Badge>
  );
}

export function VerificacoesHomologacao() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const rodarFonte = useServerFn(validarFonteEAderencia);
  const rodarCompleto = useServerFn(validarAtendimentoCompleto);

  const [carregandoFonte, setCarregandoFonte] = useState(false);
  const [carregandoCompleto, setCarregandoCompleto] = useState(false);
  const [fonte, setFonte] = useState<any>(null);
  const [completo, setCompleto] = useState<any>(null);
  const [leadId, setLeadId] = useState("");
  const [texto, setTexto] = useState("Quanto custa a consulta?");

  async function executarFonte() {
    if (!clinicaId) return;
    setCarregandoFonte(true);
    try {
      setFonte(await rodarFonte({ data: { clinicaId } }));
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregandoFonte(false);
    }
  }

  async function executarCompleto() {
    if (!clinicaId || !leadId) {
      toast.error("Informe o lead de teste.");
      return;
    }
    setCarregandoCompleto(true);
    try {
      setCompleto(await rodarCompleto({ data: { clinicaId, leadId, texto } }));
    } catch (e) {
      mostrarErro(e);
    } finally {
      setCarregandoCompleto(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Validar fonte e aderência do prompt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Publica a regra de teste pelo caminho real, em um espaço isolado, e confere se
            ela chegou ao modelo e foi cumprida na primeira resposta. Não aprova o
            atendimento inteiro.
          </p>
          <Button onClick={executarFonte} disabled={carregandoFonte || !clinicaId}>
            {carregandoFonte ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Executar verificação de fonte
          </Button>

          {fonte ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{fonte.exercitado}</p>
              {fonte.resultados.map((r: any) => (
                <div key={r.parId} className="rounded-md border p-3 space-y-1">
                  <div className="font-medium">{r.parId}</div>
                  <div>Versão publicada usada: {r.versao ?? "—"} ({r.origemVersao})</div>
                  <div className="flex items-center gap-2">
                    Regra chegou ao modelo: <Sim v={r.regraChegouAoPayload} />
                  </div>
                  <div className="flex items-center gap-2">
                    Primeira resposta cumpriu: <Sim v={r.primeiraRespostaCumpriu} />
                  </div>
                  {r.erro ? <div className="text-destructive">Erro: {r.erro}</div> : null}
                  <div className="text-xs text-muted-foreground">{r.escopoDaProva}</div>
                </div>
              ))}
              <div className="rounded-md border p-3">
                Sessão nova sem a regra — marcador presente:{" "}
                <Sim v={fonte.retiradaDaRegra.marcadorNoPayload === false} />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlayCircle className="h-4 w-4" /> Validar atendimento completo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Roda o fluxo normal da homologação, com todas as verificações de sempre, e
            mostra separadamente o que o modelo produziu e o que foi entregue.
          </p>
          <div className="space-y-2">
            <Label htmlFor="verif-lead">Lead de teste</Label>
            <Input
              id="verif-lead"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              placeholder="ID do lead de teste"
            />
            <Label htmlFor="verif-texto">Mensagem</Label>
            <Input id="verif-texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <Button onClick={executarCompleto} disabled={carregandoCompleto || !clinicaId}>
            {carregandoCompleto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Executar atendimento completo
          </Button>

          {completo ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{completo.exercitado}</p>
              <div>Resultado do turno: <Badge>{completo.turno.resultado}</Badge></div>
              <div>Origem da resposta: {completo.turno.origemResposta ?? "não registrada"}</div>
              <div>
                Depois das verificações:{" "}
                {completo.turno.confianca?.decisao ?? "não registrada"}
                {completo.turno.confianca?.nivel ? ` (${completo.turno.confianca.nivel})` : ""}
              </div>
              <div>
                Intervenções:{" "}
                {completo.turno.intervencoes.length === 0
                  ? "nenhuma"
                  : completo.turno.intervencoes
                      .map((i: any) => `${i.etapa} (${i.motivo})`)
                      .join(", ")}
              </div>
              {completo.turno.lacunas.length > 0 ? (
                <div className="text-amber-600">
                  Sem registro de: {completo.turno.lacunas.join(", ")}
                </div>
              ) : null}
              {completo.reply ? (
                <div className="rounded-md border p-3 whitespace-pre-wrap">{completo.reply}</div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
