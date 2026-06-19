import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Emitente = { id: string; nome: string; cnpj: string; razao_social: string | null };

/**
 * Hook que pergunta qual emitente NFS-e usar antes de emitir.
 * - Se houver 1 só ativo, retorna direto sem abrir diálogo.
 * - Se houver vários, abre um modal de escolha.
 * - Se não houver nenhum, resolve com null.
 */
export function usePickEmitente() {
  const { clinicaAtual } = useClinica();
  const [emitentes, setEmitentes] = useState<Emitente[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  useEffect(() => {
    if (!clinicaAtual?.clinica_id) { setEmitentes([]); return; }
    void supabase
      .from("nfse_emitentes")
      .select("id, nome, cnpj, razao_social")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("ativo", true)
      .order("padrao", { ascending: false })
      .order("nome", { ascending: true })
      .then(({ data }) => setEmitentes((data ?? []) as Emitente[]));
  }, [clinicaAtual?.clinica_id]);

  const pick = useCallback(async (): Promise<string | null> => {
    let list = emitentes;
    if (!list.length && clinicaAtual?.clinica_id) {
      // Busca ao vivo caso o useEffect ainda não tenha populado o estado.
      const { data } = await supabase
        .from("nfse_emitentes")
        .select("id, nome, cnpj, razao_social, padrao")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true)
        .order("padrao", { ascending: false })
        .order("nome", { ascending: true });
      list = (data ?? []) as Emitente[];
      setEmitentes(list);
    }
    if (!list.length) return null;
    if (list.length === 1) return list[0].id;
    return new Promise<string | null>((resolve) => {
      const padrao = list.find((e) => (e as Emitente & { padrao?: boolean }).padrao)?.id ?? list[0].id;
      setSelected(padrao);
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, [emitentes, clinicaAtual?.clinica_id]);

  const confirm = () => {
    const r = resolverRef.current; resolverRef.current = null;
    setOpen(false);
    r?.(selected || null);
  };
  const cancel = () => {
    const r = resolverRef.current; resolverRef.current = null;
    setOpen(false);
    r?.(null);
  };

  const dialog = (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Em qual empresa emitir a NFS-e?</DialogTitle>
          <DialogDescription>Selecione o emitente (CNPJ) que assinará esta nota fiscal.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Emitente</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {emitentes.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome} — {e.cnpj}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cancel}>Cancelar</Button>
          <Button onClick={confirm} disabled={!selected}>Emitir nesta empresa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { pick, dialog, hasEmitentes: emitentes.length > 0 };
}