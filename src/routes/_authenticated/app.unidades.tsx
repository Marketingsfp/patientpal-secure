import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Pencil, Building2, CheckCircle2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { colunaNaoExiste } from "@/lib/pix/chave-clinica";

export const Route = createFileRoute("/_authenticated/app/unidades")({
  component: UnidadesPage,
  head: () => ({ meta: [{ title: "Unidades — ClinicaOS" }] }),
});

function UnidadesPage() {
  return (
    <div className="space-y-4 max-w-full">
      <div className="flex items-center gap-3">
        <MapPin className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Unidades</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre suas unidades com endereço e geolocalização para bater ponto.
          </p>
        </div>
      </div>

      <ClinicasTab />
    </div>
  );
}

/* ============================== Clínicas ============================== */

function ClinicasTab() {
  const { user } = useAuth();
  const { memberships, refresh, setClinicaAtual, clinicaAtual } = useClinica();
  const podeEscrever = usePodeEscrever("unidades");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /**
   * Os campos de PIX só aparecem depois que a atualização do banco que os
   * cria for aplicada. Enquanto isso a tela continua salvando o resto
   * normalmente — incluir uma coluna inexistente no update derrubaria o
   * cadastro inteiro da clínica.
   */
  const [pixDisponivel, setPixDisponivel] = useState(true);
  const [form, setForm] = useState({
    nome: "",
    cnpj: "",
    endereco: "",
    cidade: "",
    estado: "",
    cep: "",
    telefone: "",
    latitude: "",
    longitude: "",
    raio_metros: "200",
    ativo: true,
    pix_chave: "",
    pix_beneficiario: "",
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({
      nome: "",
      cnpj: "",
      endereco: "",
      cidade: "",
      estado: "",
      cep: "",
      telefone: "",
      latitude: "",
      longitude: "",
      raio_metros: "200",
      ativo: true,
      pix_chave: "",
      pix_beneficiario: "",
    });
  };
  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const selectClinica = (id: string) => {
    setClinicaAtual(id);
    toast.success("Clínica selecionada");
  };

  const openEdit = async (id: string) => {
    setLoading(true);
    const COLUNAS_BASE =
      "nome, cnpj, endereco, cidade, estado, cep, telefone, latitude, longitude, raio_metros, ativo";
    // Tenta com os campos de PIX; se o banco ainda não tem essas colunas,
    // repete sem elas e esconde a seção em vez de quebrar a tela.
    let { data, error } = (await supabase
      .from("clinicas")
      .select(`${COLUNAS_BASE}, pix_chave, pix_beneficiario` as never)
      .eq("id", id)
      .single()) as unknown as {
      data: Record<string, unknown> | null;
      error: { code?: string; message?: string } | null;
    };
    let temPix = true;
    if (error && colunaNaoExiste(error)) {
      temPix = false;
      const repetida = (await supabase
        .from("clinicas")
        .select(COLUNAS_BASE)
        .eq("id", id)
        .single()) as unknown as {
        data: Record<string, unknown> | null;
        error: { code?: string; message?: string } | null;
      };
      data = repetida.data;
      error = repetida.error;
    }
    setPixDisponivel(temPix);
    setLoading(false);
    if (error || !data) {
      mostrarErro(error);
      return;
    }
    setEditingId(id);
    const txt = (v: unknown) => (typeof v === "string" ? v : "");
    setForm({
      nome: txt(data.nome),
      cnpj: txt(data.cnpj),
      endereco: txt(data.endereco),
      cidade: txt(data.cidade),
      estado: txt(data.estado),
      cep: txt(data.cep),
      telefone: txt(data.telefone),
      latitude: data.latitude != null ? String(data.latitude) : "",
      longitude: data.longitude != null ? String(data.longitude) : "",
      raio_metros: data.raio_metros != null ? String(data.raio_metros) : "200",
      ativo: data.ativo == null ? true : Boolean(data.ativo),
      pix_chave: txt(data.pix_chave),
      pix_beneficiario: txt(data.pix_beneficiario),
    });
    setOpen(true);
  };

  async function usarMinhaLocalizacao() {
    if (!navigator.geolocation) {
      toast.error("Geolocalização indisponível");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setForm((f) => ({
          ...f,
          latitude: p.coords.latitude.toString(),
          longitude: p.coords.longitude.toString(),
        })),
      () => toast.error("Não foi possível obter localização"),
    );
  }

  const extras = () => ({
    endereco: form.endereco.trim() || null,
    cep: form.cep.trim() || null,
    latitude: form.latitude ? Number(form.latitude) : null,
    longitude: form.longitude ? Number(form.longitude) : null,
    raio_metros: form.raio_metros ? Number(form.raio_metros) : 200,
    ativo: form.ativo,
  });

  /**
   * Grava a chave PIX num update separado, e só quando as colunas existem.
   *
   * Vai à parte do update principal por dois motivos: mandar uma coluna
   * inexistente faria o Postgres recusar o cadastro inteiro da clínica, e os
   * tipos gerados do Supabase ainda não conhecem essas colunas — o `as never`
   * fica confinado aqui em vez de desligar a checagem de todos os campos.
   * Some quando os tipos forem regerados depois da migration.
   */
  const salvarPix = async (clinicaId: string) => {
    if (!pixDisponivel) return;
    const { error } = await supabase
      .from("clinicas")
      .update({
        pix_chave: form.pix_chave.trim() || null,
        pix_beneficiario: form.pix_beneficiario.trim() || null,
      } as never)
      .eq("id", clinicaId);
    // O resto da clínica já foi salvo; avisa sem derrubar o que deu certo.
    if (error) toast.error("Clínica salva, mas a chave PIX não foi gravada.");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!podeEscrever) {
      toast.error("Você não tem permissão de edição neste módulo.");
      return;
    }
    if (!user) return;
    setLoading(true);
    if (editingId) {
      const { error } = await supabase
        .from("clinicas")
        .update({
          nome: form.nome.trim(),
          cnpj: form.cnpj.trim() || null,
          telefone: form.telefone.trim() || null,
          cidade: form.cidade.trim() || null,
          estado: form.estado.trim() || null,
          ...extras(),
        })
        .eq("id", editingId);
      if (error) {
        setLoading(false);
        mostrarErro(error);
        return;
      }
      await salvarPix(editingId);
      setLoading(false);
      toast.success("Clínica atualizada!");
      setOpen(false);
      resetForm();
      await refresh();
      return;
    }
    const { data: clinicaId, error } = await supabase.rpc("criar_clinica_com_admin", {
      _nome: form.nome.trim(),
      _cnpj: form.cnpj.trim() || undefined,
      _telefone: form.telefone.trim() || undefined,
      _cidade: form.cidade.trim() || undefined,
      _estado: form.estado.trim() || undefined,
    });
    if (error || !clinicaId) {
      mostrarErro(error);
      return;
    }
    // Persist extra fields (endereco, cep, geo, ativo) right after creation.
    const { error: updErr } = await supabase
      .from("clinicas")
      .update(extras())
      .eq("id", clinicaId as unknown as string);
    if (updErr) {
      setLoading(false);
      mostrarErro(updErr);
      return;
    }
    await salvarPix(clinicaId as unknown as string);
    setLoading(false);
    toast.success("Clínica criada!");
    setOpen(false);
    resetForm();
    await refresh();
    setClinicaAtual(clinicaId as unknown as string);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {podeEscrever && (
          <Dialog
            open={open}
            onOpenChange={(n) => {
              setOpen(n);
              if (!n) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" /> Nova unidade
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar unidade" : "Nova unidade"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    required
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>CNPJ</Label>
                    <Input
                      value={form.cnpj}
                      onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={form.telefone}
                      onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input
                    value={form.endereco}
                    onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input
                      value={form.cidade}
                      onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>UF</Label>
                    <Input
                      maxLength={2}
                      value={form.estado}
                      onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input
                      value={form.cep}
                      onChange={(e) => setForm({ ...form, cep: e.target.value })}
                    />
                  </div>
                </div>
                {pixDisponivel ? (
                  <div className="border-t pt-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-primary" />
                      <Label>Recebimento por PIX</Label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Usada para gerar o QR Code de cobrança das mensalidades do Cartão Benefícios.
                      O dinheiro cai direto na conta desta chave — confira antes de salvar.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Chave PIX</Label>
                        <Input
                          placeholder="CNPJ, e-mail, telefone ou chave aleatória"
                          value={form.pix_chave}
                          onChange={(e) => setForm({ ...form, pix_chave: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Nome de quem recebe (opcional)</Label>
                        <Input
                          maxLength={25}
                          placeholder={form.nome.slice(0, 25) || "Nome da clínica"}
                          value={form.pix_beneficiario}
                          onChange={(e) => setForm({ ...form, pix_beneficiario: e.target.value })}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Até 25 letras, como aparece no aplicativo de quem paga. Em branco, usa o
                          nome da clínica.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Geolocalização (para bater ponto)</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={usarMinhaLocalizacao}
                    >
                      Usar minha localização
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Latitude</Label>
                      <Input
                        value={form.latitude}
                        onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Longitude</Label>
                      <Input
                        value={form.longitude}
                        onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Raio (m)</Label>
                      <Input
                        type="number"
                        value={form.raio_metros}
                        onChange={(e) => setForm({ ...form, raio_metros: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  />
                  Ativa
                </label>
                <DialogFooter>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Salvando..." : editingId ? "Salvar" : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {memberships.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma unidade ainda. Clique em <strong>Nova unidade</strong> para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {memberships.map((m) => {
            const ativa = clinicaAtual?.clinica_id === m.clinica_id;
            return (
              <Card key={m.id} className="transition-shadow hover:shadow-md">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{m.clinica.nome}</h3>
                      {(m.clinica.cidade || m.clinica.estado) && (
                        <p className="text-sm text-muted-foreground truncate">
                          {[m.clinica.cidade, m.clinica.estado].filter(Boolean).join(" / ")}
                        </p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {m.role}
                        </Badge>
                        {ativa && <Badge>Atual</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex gap-2">
                    <Button
                      className="flex-1"
                      variant="secondary"
                      onClick={() => selectClinica(m.clinica_id)}
                      disabled={ativa}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Selecionar
                    </Button>
                    {podeEscrever && (
                      <Button
                        variant="outline"
                        onClick={() => openEdit(m.clinica_id)}
                        disabled={loading}
                      >
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
