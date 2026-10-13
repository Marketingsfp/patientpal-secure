/**
 * "Processar em lote": fila persistida no banco (tel_fila_analise).
 * Fechar a aba interrompe, mas nada se perde — a fila fica guardada.
 * Nada de telefone ou texto de conversa passa por aqui.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  enfileirarAnalises,
  estadoFilaAnalise,
  processarLoteAnalise,
} from "@/lib/coach/telefonia.functions";

type Estado = Awaited<ReturnType<typeof estadoFilaAnalise>>;

const ROTULOS: Record<string, string> = {
  pendente: "Pendentes",
  transcrito: "Transcritas (aguardando análise)",
  analisado: "Analisadas",
  sem_gravacao: "Sem gravação",
  erro: "Com erro",
};

export function ProcessarLoteLigacoes({
  clinicaId,
  start,
  end,
  aoAvancar,
}: {
  clinicaId: string | null;
  start: string;
  end: string;
  aoAvancar?: () => void;
}) {
  const fnEnfileirar = useServerFn(enfileirarAnalises);
  const fnEstado = useServerFn(estadoFilaAnalise);
  const fnProcessar = useServerFn(processarLoteAnalise);

  const [estado, setEstado] = useState<Estado | null>(null);
  const [incluirFeitas, setIncluirFeitas] = useState(false);
  const [enfileirando, setEnfileirando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const parar = useRef(false);

  const atualizar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      setEstado(await fnEstado({ data: { clinicaId } }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler a fila.");
    }
  }, [clinicaId, fnEstado]);

  useEffect(() => {
    void atualizar();
  }, [atualizar]);

  async function enfileirar() {
    if (!clinicaId) return;
    setEnfileirando(true);
    setErro(null);
    try {
      const r = await fnEnfileirar({ data: { clinicaId, start, end, incluirFeitas } });
      setMsg(
        `${r.enfileiradas} novas na fila (${r.jaAnalisadas} já analisadas, ${r.jaTranscritas} já transcritas no período). Total na fila: ${r.totalNaFila}.`,
      );
      await atualizar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enfileirar.");
    } finally {
      setEnfileirando(false);
    }
  }

  async function processar() {
    if (!clinicaId) return;
    parar.current = false;
    setRodando(true);
    setErro(null);
    let rodada = 0;
    let tot = { analisados: 0, semGravacao: 0, erros: 0 };
    try {
      for (;;) {
        rodada++;
        setMsg(`Rodada ${rodada} em andamento…`);
        const r = await fnProcessar({ data: { clinicaId, maximo: 3 } });
        tot = {
          analisados: tot.analisados + r.analisados,
          semGravacao: tot.semGravacao + r.semGravacao,
          erros: tot.erros + r.erros,
        };
        await atualizar();
        aoAvancar?.();
        const base = `Rodada ${rodada}: ${tot.analisados} analisadas, ${tot.semGravacao} sem gravação, ${tot.erros} com erro nesta sessão. Faltam ${r.aindaPendentes}.`;
        if (r.pausadoPorCota) {
          setMsg(`${base} Cota de IA esgotada por hoje. O que já foi processado está guardado — é só continuar amanhã.`);
          break;
        }
        if (r.aviso) {
          setMsg(`${base} ${r.aviso}`);
          break;
        }
        if (r.aindaPendentes === 0) {
          setMsg(`${base} Fila concluída.`);
          break;
        }
        if (parar.current) {
          setMsg(`${base} Parado.`);
          break;
        }
        if (r.processados === 0) {
          // Itens restantes aguardando a Sufficit ou em outra aba: espera um pouco.
          setMsg(`${base} Aguardando a Sufficit terminar algumas transcrições…`);
          await new Promise((ok) => setTimeout(ok, 30_000));
          if (parar.current) {
            setMsg(`${base} Parado.`);
            break;
          }
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "A rodada falhou. Clique em Processar para retomar.");
    } finally {
      setRodando(false);
    }
  }

  const c = estado?.contagem;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Processar em lote</h2>
        <p className="text-sm text-muted-foreground">
          Transcreve e analisa as ligações atendidas do período, algumas por rodada. Fechar a aba interrompe o
          processamento, mas nada se perde: ao voltar, é só clicar em Processar para continuar de onde parou.
        </p>
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="outline" onClick={() => void enfileirar()} disabled={!clinicaId || enfileirando || rodando}>
            {enfileirando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enfileirar período
          </Button>
          <div className="flex items-center gap-2">
            <Checkbox id="lote-feitas" checked={incluirFeitas} onCheckedChange={(v) => setIncluirFeitas(v === true)} />
            <Label htmlFor="lote-feitas" className="text-sm font-normal">
              incluir também as ligações que a clínica fez
            </Label>
          </div>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(ROTULOS).map(([k, r]) => (
            <div key={k} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{r}</div>
              <div className="text-2xl font-semibold">{c ? c[k as keyof typeof c] : "—"}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {estado
            ? `IA hoje — você: ${estado.cota.restaUsuario} de ${estado.cota.limiteUsuario} · clínica: ${estado.cota.restaClinica} de ${estado.cota.limiteClinica}`
            : "Cota de IA indisponível"}
        </div>

        <div className="flex gap-2">
          <Button onClick={() => void processar()} disabled={!clinicaId || rodando || enfileirando}>
            {rodando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Processar
          </Button>
          <Button variant="outline" onClick={() => (parar.current = true)} disabled={!rodando}>
            Parar
          </Button>
        </div>
        {msg ? <p className="text-sm">{msg}</p> : null}
        {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
      </div>
    </section>
  );
}
