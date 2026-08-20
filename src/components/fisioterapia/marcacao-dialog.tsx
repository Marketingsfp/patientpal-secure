import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buscarProfissionaisFisio } from "@/lib/fisio-catalogo";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { TIPO_LABEL, type FisioTipo, type RegiaoCorporal } from "@/lib/fisio";

interface Props {
  open: boolean;
  onClose: () => void;
  clinicaId: string;
  pacienteId: string;
  regiao: RegiaoCorporal;
  userId: string | null;
  onSaved: () => void;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);

/**
 * Registro de uma queixa/achado numa região do mapa corporal.
 *
 * Cada gravação cria uma linha nova em `fisio_marcacoes` — nada é
 * sobrescrito. O mapa mostra sempre a marcação mais recente da região, mas o
 * histórico completo continua disponível na lista abaixo do mapa.
 */
export function MarcacaoDialog({
  open,
  onClose,
  clinicaId,
  pacienteId,
  regiao,
  userId,
  onSaved,
}: Props) {
  const [tipo, setTipo] = useState<FisioTipo>("dor");
  const [intensidade, setIntensidade] = useState(5);
  const [queixa, setQueixa] = useState("");
  const [tratamento, setTratamento] = useState("");
  const [data, setData] = useState(hojeISO());
  const [profissionalId, setProfissionalId] = useState<string>("");
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTipo("dor");
    setIntensidade(5);
    setQueixa("");
    setTratamento("");
    setData(hojeISO());
    setProfissionalId("");
  }, [open, regiao.codigo]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setProfissionais(await buscarProfissionaisFisio(clinicaId));
    })();
  }, [open, clinicaId]);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    const { error } = await supabase.from("fisio_marcacoes").insert({
      clinica_id: clinicaId,
      paciente_id: pacienteId,
      regiao: regiao.codigo,
      lado: regiao.lado,
      vista: regiao.vista,
      tipo,
      // Intensidade só faz sentido para queixa dolorosa; nos demais tipos
      // gravar 5 "por padrão" inventaria um dado clínico que ninguém informou.
      intensidade: tipo === "dor" ? intensidade : null,
      queixa: queixa.trim() || null,
      tratamento: tratamento.trim() || null,
      data,
      profissional_id: profissionalId || null,
      created_by: userId,
    });
    setSalvando(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    toast.success(`${regiao.label} registrada`);
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{regiao.label}</DialogTitle>
          <DialogDescription>
            Vista de {regiao.vista}. O registro entra no histórico da região sem apagar os
            anteriores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as FisioTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as FisioTipo[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          {tipo === "dor" && (
            <div>
              <Label>Intensidade da dor: {intensidade} / 10</Label>
              <Slider
                value={[intensidade]}
                onValueChange={(v) => setIntensidade(v[0] ?? 0)}
                min={0}
                max={10}
                step={1}
                className="mt-3"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>0 — sem dor</span>
                <span>10 — dor máxima</span>
              </div>
            </div>
          )}

          <div>
            <Label>Queixa do paciente</Label>
            <Textarea
              value={queixa}
              onChange={(e) => setQueixa(e.target.value)}
              rows={2}
              placeholder="ex.: dor ao elevar o braço acima da cabeça"
            />
          </div>

          <div>
            <Label>Conduta / tratamento</Label>
            <Textarea
              value={tratamento}
              onChange={(e) => setTratamento(e.target.value)}
              rows={2}
              placeholder="ex.: mobilização escapular, fortalecimento de manguito"
            />
          </div>

          <div>
            <Label>Profissional</Label>
            <Select
              value={profissionalId || "nenhum"}
              onValueChange={(v) => setProfissionalId(v === "nenhum" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Não informado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Não informado</SelectItem>
                {profissionais.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            <Save className="h-4 w-4 mr-2" />
            {salvando ? "Salvando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
