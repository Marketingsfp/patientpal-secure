import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, LogIn, LogOut, Coffee, MapPin } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { formatDateTime, formatHora } from "@/lib/date-utils";

export const Route = createFileRoute("/_authenticated/app/hr-ponto")({
  component: PontoPage,
  head: () => ({ meta: [{ title: "Bater ponto — ClinicaOS" }] }),
});

interface Ponto {
  id: string; tipo: string; marcado_em: string;
  latitude: number | null; longitude: number | null;
  unidade_id: string | null; dentro_raio: boolean | null;
}

interface Unidade {
  id: string; nome: string; latitude: number | null; longitude: number | null; raio_metros: number | null;
}

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  intervalo_inicio: "Início do intervalo",
  intervalo_fim: "Fim do intervalo",
};

function distanciaMetros(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(la2 - la1);
  const dLon = toRad(lo2 - lo1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function PontoPage() {
  const { clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("hr-ponto");
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [marcando, setMarcando] = useState(false);

  async function load() {
    if (!clinicaAtual) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [p, u] = await Promise.all([
      supabase.from("hr_pontos").select("id,tipo,marcado_em,latitude,longitude,unidade_id,dentro_raio")
        .eq("clinica_id", clinicaAtual.clinica_id).eq("user_id", user.id)
        .order("marcado_em", { ascending: false }).limit(30),
      supabase.from("unidades").select("id,nome,latitude,longitude,raio_metros")
        .eq("clinica_id", clinicaAtual.clinica_id).eq("ativo", true),
    ]);
    if (p.error) mostrarErro(p.error);
    setPontos((p.data ?? []) as Ponto[]);
    setUnidades((u.data ?? []) as Unidade[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [clinicaAtual?.clinica_id]);

  async function bater(tipo: string) {
    if (!podeEscrever) { toast.error("Você não tem permissão de edição neste módulo."); return; }
    if (!clinicaAtual) return;
    setMarcando(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMarcando(false); return; }

    let latitude: number | null = null;
    let longitude: number | null = null;
    let unidade_id: string | null = null;
    let dentro_raio: boolean | null = null;

    if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
        );
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        for (const u of unidades) {
          if (u.latitude && u.longitude) {
            const d = distanciaMetros(latitude, longitude, u.latitude, u.longitude);
            const raio = u.raio_metros ?? 200;
            if (d <= raio) { unidade_id = u.id; dentro_raio = true; break; }
          }
        }
        if (unidade_id === null && unidades.length > 0) dentro_raio = false;
      } catch {
        toast.warning("Não foi possível obter localização — ponto será registrado sem GPS");
      }
    }

    const { error } = await supabase.from("hr_pontos").insert({
      clinica_id: clinicaAtual.clinica_id,
      user_id: user.id,
      tipo,
      latitude,
      longitude,
      unidade_id,
      dentro_raio,
    });
    setMarcando(false);
    if (error) { mostrarErro(error); return; }
    toast.success(`${TIPO_LABEL[tipo]} registrada`);
    void load();
  }

  const agora = new Date();

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Clock className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Bater ponto</h1>
          <p className="text-sm text-muted-foreground">Registre sua entrada, intervalos e saída.</p>
        </div>
      </div>

      <Card className="p-6 text-center">
        <div className="text-5xl font-bold tabular-nums">
          {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
        <div className="text-sm text-muted-foreground mt-1">{formatDateTime(agora).split(" ")[0]}</div>
        {podeEscrever && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-6">
            <Button onClick={() => bater("entrada")} disabled={marcando}><LogIn className="h-4 w-4 mr-1" /> Entrada</Button>
            <Button variant="outline" onClick={() => bater("intervalo_inicio")} disabled={marcando}><Coffee className="h-4 w-4 mr-1" /> Início intervalo</Button>
            <Button variant="outline" onClick={() => bater("intervalo_fim")} disabled={marcando}><Coffee className="h-4 w-4 mr-1" /> Fim intervalo</Button>
            <Button variant="destructive" onClick={() => bater("saida")} disabled={marcando}><LogOut className="h-4 w-4 mr-1" /> Saída</Button>
          </div>
        )}
        {unidades.length === 0 && (
          <p className="text-xs text-muted-foreground mt-3">Cadastre unidades com geolocalização para validar a presença.</p>
        )}
      </Card>

      <Card>
        <div className="p-3 border-b font-semibold">Últimas marcações</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Data/Hora</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-40">Localização</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : pontos.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Nenhuma marcação ainda.</TableCell></TableRow>
            ) : pontos.map(p => (
              <TableRow key={p.id}>
                <TableCell className="text-sm">{formatDateTime(p.marcado_em)}</TableCell>
                <TableCell>{TIPO_LABEL[p.tipo] ?? p.tipo}</TableCell>
                <TableCell>
                  {p.dentro_raio === true ? (
                    <Badge variant="default"><MapPin className="h-3 w-3 mr-1" />{unidades.find(u => u.id === p.unidade_id)?.nome ?? "Na unidade"}</Badge>
                  ) : p.dentro_raio === false ? (
                    <Badge variant="destructive"><MapPin className="h-3 w-3 mr-1" />Fora do raio</Badge>
                  ) : p.latitude ? (
                    <Badge variant="secondary"><MapPin className="h-3 w-3 mr-1" />Sem unidade</Badge>
                  ) : (
                    <Badge variant="outline">Sem GPS</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
