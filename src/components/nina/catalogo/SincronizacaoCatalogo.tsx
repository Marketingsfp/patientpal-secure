import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  opcoesSincronizacaoManual,
  mapearCatalogoComJev,
  preverSincronizacaoManual,
  aplicarSincronizacaoManual,
} from "@/lib/nina/catalogo-sincronizacao.functions";
import type {
  OpcaoSincronizacao,
  PreviaSincronizacao,
  RegistroSincronizacao,
  TipoSincronizacao,
} from "@/lib/nina/catalogo-sincronizacao";

/** Montado com key por clínica/tipo: não reaproveita prévias entre contextos. */
export function SincronizacaoCatalogo({
  clinicaId,
  tipo,
  itens,
  onSincronizado,
}: {
  clinicaId: string;
  tipo: TipoSincronizacao;
  itens: RegistroSincronizacao[];
  onSincronizado: () => Promise<void>;
}) {
  const opcoesFn = useServerFn(opcoesSincronizacaoManual);
  const mapearFn = useServerFn(mapearCatalogoComJev);
  const preverFn = useServerFn(preverSincronizacaoManual);
  const aplicarFn = useServerFn(aplicarSincronizacaoManual);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const trava = useRef(false);
  const versao = useRef(0);
  useEffect(
    () => () => {
      versao.current++;
    },
    [],
  );
  const [id, setId] = useState("");
  const [fonteId, setFonteId] = useState("");
  const [opcoes, setOpcoes] = useState<OpcaoSincronizacao[]>([]);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [previa, setPrevia] = useState<PreviaSincronizacao | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const registro = itens.find((i) => i.id === id);
  const origem = opcoes.find((o) => o.id === fonteId);
  const bloqueio =
    registro?.rascunho != null
      ? "Resolva as alterações em revisão deste registro antes de sincronizar."
      : registro?.estrutura?.abrangencia === "grupo"
        ? "Este cadastro é um grupo. A sincronização exige um registro individual por médico ou procedimento."
        : "";

  async function executar(rotulo: string, fn: (vigente: () => boolean) => Promise<void>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(rotulo);
    setErro("");
    const v = versao.current;
    try {
      await fn(() => versao.current === v);
    } catch (e) {
      if (versao.current === v)
        setErro(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      trava.current = false;
      if (versao.current === v) setOcupado("");
    }
  }
  function limparPrevia() {
    setPrevia(null);
    setConfirmado(false);
    setErro("");
    setAviso("");
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setAberto(true);
          setId("");
          setFonteId("");
          limparPrevia();
          setOpcoes([]);
          void executar("Lendo cadastros…", async (vigente) => {
            const r = await opcoesFn({ data: { clinicaId, tipo } });
            if (vigente()) setOpcoes(r);
          });
        }}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Sincronizar com Clínica OS
      </Button>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          if (trava.current) return;
          if (!v) {
            versao.current++;
            limparPrevia();
          }
          setAberto(v);
        }}
      >
        <DialogContent
          data-os-zap="true"
          className="oszap-base-dialog"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>
              Sincronização manual ·{" "}
              {tipo === "servico" ? "Exames e procedimentos" : "Consultas e profissionais"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Atualize um registro por vez. O Jev sugere o vínculo e você confere antes de copiar. As
            próximas mudanças do Clínica OS só chegarão aqui quando você sincronizar novamente.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="min-w-0 space-y-2" aria-label="Registro da base de conhecimento">
              <h4 className="font-medium">1. Registro da base de conhecimento</h4>
              <SearchableSelect
                options={itens
                  .filter((i) => i.status !== "ARQUIVADO")
                  .map((i) => ({ value: i.id, label: `${i.nome} · ${i.id.slice(0, 8)}` }))}
                value={id}
                disabled={!!ocupado}
                placeholder="Escolha o registro que deseja atualizar"
                onChange={(v) => {
                  setId(v);
                  limparPrevia();
                  const item = itens.find((i) => i.id === v);
                  setFonteId(item?.[tipo === "servico" ? "procedimento_id" : "medico_id"] ?? "");
                }}
              />
              <Button
                variant="outline"
                disabled={!id || !!ocupado || !!bloqueio || !opcoes.length}
                onClick={() => {
                  limparPrevia();
                  void executar("Jev está comparando os cadastros…", async (vigente) => {
                    const r = await mapearFn({ data: { clinicaId, tipo, id } });
                    if (!vigente()) return;
                    setFonteId(r.sugestao?.id ?? "");
                    setAviso(
                      r.sugestao
                        ? `Sugestão do Jev: ${r.sugestao.nome}. Avaliou ${r.avaliados} de ${r.total} cadastros. Confira a correspondência; a sugestão não é uma confirmação.`
                        : `O Jev não encontrou correspondência segura entre os ${r.avaliados} candidatos avaliados, de ${r.total} cadastros. Você pode pesquisar a origem manualmente.`,
                    );
                  });
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Sugerir vínculo com Jev
              </Button>
              <p className="text-xs text-muted-foreground">
                O botão do Jev faz uma consulta de IA cobrada. A sincronização dos dados não usa IA.
              </p>
            </section>
            <section className="min-w-0 space-y-2" aria-label="Origem no Clínica OS">
              <h4 className="font-medium">2. Cadastro correspondente no Clínica OS</h4>
              <SearchableSelect
                options={opcoes.map((o) => ({
                  value: o.id,
                  label: `${o.nome} · ${o.id.slice(0, 8)}${o.detalhe ? ` · ${o.detalhe}` : ""}`,
                }))}
                value={fonteId}
                disabled={!id || !!ocupado || !!bloqueio}
                placeholder="Aceite a sugestão ou pesquise o cadastro"
                onChange={(v) => {
                  setFonteId(v);
                  limparPrevia();
                }}
              />
              {fonteId && !origem && (
                <p role="alert" className="text-sm text-destructive">
                  O vínculo salvo não está entre os cadastros disponíveis. Confira se foi inativado
                  ou alterado na origem.
                </p>
              )}
              {origem && (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {origem.nome}
                  <br />
                  {origem.detalhe}
                  <br />
                  <span className="text-xs text-muted-foreground">Identificador: {origem.id}</span>
                </p>
              )}
              <Button
                disabled={!id || !origem || !!ocupado || !!bloqueio}
                onClick={() => {
                  setPrevia(null);
                  setConfirmado(false);
                  void executar("Conferindo dados da origem…", async (vigente) => {
                    const p = await preverFn({ data: { clinicaId, tipo, id, fonteId } });
                    if (vigente()) setPrevia(p);
                  });
                }}
              >
                Conferir antes de sincronizar
              </Button>
            </section>
          </div>
          {bloqueio && (
            <p role="alert" className="text-sm text-amber-600 dark:text-amber-300">
              {bloqueio}
            </p>
          )}
          {aviso && (
            <p role="status" className="rounded-md border p-3 text-sm">
              {aviso}
            </p>
          )}
          {ocupado && (
            <p role="status" className="text-sm">
              {ocupado}
            </p>
          )}
          {erro && (
            <p role="alert" className="text-sm text-destructive whitespace-pre-wrap">
              {erro}
            </p>
          )}
          {previa && (
            <section className="space-y-3">
              <h4 className="font-semibold">3. Confira as alterações</h4>
              <p className="text-sm">
                As informações públicas serão substituídas pelos dados disponíveis na origem. Campos
                ausentes ficarão como não informados. Variações revisadas e nota interna serão
                preservadas. Horários são habituais, não vagas disponíveis.
              </p>
              {!previa.mudancas.length && (
                <p className="text-sm">
                  Os campos exibidos já correspondem à origem. O vínculo será confirmado.
                </p>
              )}
              {previa.mudancas.map((m) => (
                <div key={m.campo} className="rounded-md border p-3 space-y-2">
                  <h5 className="font-medium">{m.campo}</h5>
                  <div className="grid gap-3 md:grid-cols-2 text-sm">
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Na base</p>
                      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.antes}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-primary">Após sincronizar</p>
                      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.depois}</p>
                    </div>
                  </div>
                </div>
              ))}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmado}
                  disabled={!!ocupado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                />
                Confirmei que é o mesmo médico ou procedimento, revisei os campos e que as variações
                preservadas continuam válidas.
              </label>
              <Button
                disabled={!confirmado || !!ocupado}
                onClick={() =>
                  void executar("Sincronizando…", async (vigente) => {
                    const r = await aplicarFn({
                      data: {
                        clinicaId,
                        tipo,
                        id: previa.id,
                        fonteId: previa.fonteId,
                        assinatura: previa.assinatura,
                        esperadoUpdatedAt: previa.esperadoUpdatedAt,
                      },
                    });
                    if (!vigente()) return;
                    setPrevia(null);
                    setConfirmado(false);
                    setAberto(false);
                    toast.success(
                      `Registro sincronizado. ${r.status === "PUBLICADO" ? "Publicado na base." : "Mantido como rascunho."}`,
                    );
                    await onSincronizado();
                  })
                }
              >
                Confirmar e sincronizar este registro
              </Button>
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            Sem atualização automática. Este recurso atualiza apenas a base editorial e não ativa
            sua consulta pela Nina.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
