import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { preverImportacaoCompleta, aplicarImportacaoCompleta } from "@/lib/nina/catalogo-sincronizacao.functions";

type Previa = Awaited<ReturnType<typeof preverImportacaoCompleta>>;
type Resultado = Awaited<ReturnType<typeof aplicarImportacaoCompleta>>;
export function ImportacaoCompleta({ clinicaId, onConcluido }: { clinicaId: string; onConcluido: () => void }) {
  const prever = useServerFn(preverImportacaoCompleta);
  const aplicar = useServerFn(aplicarImportacaoCompleta);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [progresso, setProgresso] = useState(0);
  async function conferir() {
    setOcupado(true); setErro(""); setPrevia(null); setResultado(null); setConfirmado(false);
    try { setPrevia(await prever({ data: { clinicaId } })); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  }
  return <>
    <Button variant="outline" onClick={() => { setAberto(true); void conferir(); }}>Sincronizar toda a base com Clínica OS</Button>
    <Dialog open={aberto} onOpenChange={v => { if (!ocupado) setAberto(v); }}>
      <DialogContent data-os-zap="true" className="oszap-base-dialog" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Sincronizar toda a base</DialogTitle></DialogHeader>
        <p>Inclui médicos, consultas, exames e procedimentos. Cria os registros ausentes e atualiza os correspondentes. Médicos inativos ou ocultos, procedimentos inativos e consultas sem médico vinculado ficam como rascunho.</p>
        <p className="text-sm text-muted-foreground">Os novos registros disponíveis ao paciente serão publicados após sua confirmação. Registros em revisão, arquivados ou com vínculo ambíguo serão sinalizados para conferência. A fonte usada pela Nina permanece a selecionada na base.</p>
        {ocupado && <p role="status">{previa ? `Sincronizando: ${progresso} registros processados. Aguarde a conclusão…` : "Conferindo todos os cadastros…"}</p>}
        {erro && <p role="alert" className="text-destructive">{erro}</p>}
        {previa && !resultado && <>
          <p className="font-medium">Clínica OS: {previa.resumo.medicos} médicos. Base atual: {previa.resumo.profissionais} registros de consultas/profissionais e {previa.resumo.servicos} exames/procedimentos.</p>
          <p>{previa.resumo.criar} novos · {previa.resumo.atualizar} atualizações · {previa.resumo.iguais} já iguais · {previa.resumo.revisar} para revisão · {previa.resumo.rascunhos} rascunhos</p>
          <div className="max-h-80 overflow-y-auto space-y-2" aria-label="Prévia da sincronização completa">
            {previa.itens.map(i => <details key={`${i.tipo}:${i.fonteId}`} className="rounded border p-2">
              <summary>{i.nome} — {i.acao} · {i.status === "RASCUNHO" ? "Rascunho" : i.status === "ARQUIVADO" ? "Arquivado" : "Publicado"}</summary>
              {i.motivo && <p>{i.motivo}</p>}
              {i.mudancas.map((m, n) => <div key={`${m.campo}:${n}`} className="my-2 text-sm whitespace-pre-wrap break-words"><strong>{m.campo}</strong><p>Antes: {m.antes}</p><p>Depois: {m.depois}</p></div>)}
            </details>)}
          </div>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmado} disabled={ocupado} onChange={e => setConfirmado(e.target.checked)} />Conferi a prévia e autorizo criar e atualizar os registros indicados.</label>
          <Button disabled={!confirmado || ocupado || !(previa.resumo.criar + previa.resumo.atualizar)} onClick={async () => {
            setOcupado(true); setErro(""); setProgresso(0);
            const pendentes = previa.itens.filter(i => i.acao === "criar" || i.acao === "atualizar");
            const final: Resultado = { total: previa.itens.length, processados: 0,
              resultados: previa.itens.filter(i => i.acao === "igual" || i.acao === "revisar").map(i => ({ nome: i.nome, acao: i.acao, ok: i.acao === "igual", motivo: i.motivo })) };
            final.processados = final.resultados.length;
            try {
              for (let de = 0; de < pendentes.length; de += 50) {
                const r = await aplicar({ data: { clinicaId, assinatura: previa.assinatura,
                  alvos: pendentes.slice(de, de + 50).map(i => ({ tipo: i.tipo, fonteId: i.fonteId, assinatura: i.assinatura })) } });
                final.resultados.push(...r.resultados); final.processados += r.processados; setProgresso(final.processados);
                if (r.processados < r.total || r.resultados.some(i => !i.ok)) break;
              }
            } catch (e) { setErro(`${(e as Error).message} Se a conexão caiu, confira novamente: alguns registros podem ter sido salvos.`); }
            finally { setResultado(final); setPrevia(null); setConfirmado(false); setOcupado(false); onConcluido(); }
          }}>Confirmar e sincronizar toda a base</Button>
        </>}
        {resultado && <div role="status">
          <p>{resultado.resultados.filter(r => r.ok && r.acao !== "igual").length} registros criados ou atualizados. {resultado.resultados.filter(r => r.acao === "igual").length} já estavam iguais.</p>
          {resultado.processados < resultado.total && <p>A execução foi interrompida. {resultado.total - resultado.processados} registros ainda não foram processados. Gere nova prévia para continuar.</p>}
          {resultado.resultados.filter(r => !r.ok).map((r, n) => <p key={n}>{r.nome}: {r.motivo}</p>)}
        </div>}
        <Button variant="outline" disabled={ocupado} onClick={() => void conferir()}>Conferir novamente</Button>
      </DialogContent>
    </Dialog>
  </>;
}
