import { createFileRoute } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/configuracoes/nfse")({
  component: NfseConfigPage,
  head: () => ({ meta: [{ title: "Configuração NFS-e — ClinicaOS" }] }),
});

interface Row {
  id: string;
  nome: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  inscricao_municipal: string;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string;
  uf: string;
  codigo_municipio: string;
  telefone: string | null;
  email: string | null;
  regime_tributario: string | null;
  optante_simples: boolean | null;
  item_lista_servico: string;
  codigo_tributario_municipio: string | null;
  codigo_cnae: string | null;
  aliquota_iss: number;
  descricao_servico_padrao: string | null;
  focus_ambiente: string;
  rps_serie: string | null;
  rps_proximo_numero: number | null;
  ativo: boolean;
  padrao: boolean;
}

interface Form {
  nome: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_municipal: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigo_municipio: string;
  telefone: string;
  email: string;
  regime_tributario: string;
  optante_simples: boolean;
  item_lista_servico: string;
  codigo_tributario_municipio: string;
  codigo_cnae: string;
  aliquota_iss: string;
  descricao_servico_padrao: string;
  focus_ambiente: string;
  rps_serie: string;
  rps_proximo_numero: string;
  ativo: boolean;
  padrao: boolean;
}

const REGIMES = [
  { v: "simples_nacional", l: "Simples Nacional" },
  { v: "lucro_presumido", l: "Lucro Presumido" },
  { v: "lucro_real", l: "Lucro Real" },
  { v: "mei", l: "MEI" },
];

function NfseConfigPage() {
  return (
    <SimpleCrud<Row, Form>
      table="nfse_emitentes"
      selectColumns="id, nome, cnpj, razao_social, nome_fantasia, inscricao_municipal, cep, logradouro, numero, complemento, bairro, municipio, uf, codigo_municipio, telefone, email, regime_tributario, optante_simples, item_lista_servico, codigo_tributario_municipio, codigo_cnae, aliquota_iss, descricao_servico_padrao, focus_ambiente, rps_serie, rps_proximo_numero, ativo, padrao"
      title="Emitentes NFS-e"
      subtitle="CNPJs cadastrados para emissão de notas fiscais via Focus NFe."
      icon={<Building2 className="h-6 w-6 text-primary" />}
      orderBy={{ column: "created_at", ascending: false }}
      dialogClassName="max-w-5xl w-[95vw]"
      columns={[
        { key: "nome", header: "Nome", render: (r) => <span className="font-medium">{r.nome}</span> },
        { key: "cnpj", header: "CNPJ", className: "w-44", render: (r) => r.cnpj },
        { key: "mun", header: "Município", render: (r) => `${r.municipio}/${r.uf}` },
        { key: "iss", header: "ISS", className: "w-20 text-right", render: (r) => `${(Number(r.aliquota_iss) * 100).toFixed(2)}%` },
        {
          key: "amb",
          header: "Ambiente",
          className: "w-28",
          render: (r) => (
            <span
              className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                r.focus_ambiente === "producao" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"
              }`}
            >
              {r.focus_ambiente}
            </span>
          ),
        },
        { key: "padrao", header: "Padrão", className: "w-20", render: (r) => (r.padrao ? "★" : "") },
      ]}
      emptyForm={{
        nome: "", cnpj: "", razao_social: "", nome_fantasia: "",
        inscricao_municipal: "", cep: "", logradouro: "", numero: "",
        complemento: "", bairro: "", municipio: "", uf: "",
        codigo_municipio: "", telefone: "", email: "",
        regime_tributario: "simples_nacional", optante_simples: true,
        item_lista_servico: "0401", codigo_tributario_municipio: "",
        codigo_cnae: "", aliquota_iss: "0.02", descricao_servico_padrao: "",
        focus_ambiente: "producao", rps_serie: "1", rps_proximo_numero: "1",
        ativo: true, padrao: false,
      }}
      toForm={(r) => ({
        nome: r.nome, cnpj: r.cnpj, razao_social: r.razao_social,
        nome_fantasia: r.nome_fantasia ?? "",
        inscricao_municipal: r.inscricao_municipal,
        cep: r.cep ?? "", logradouro: r.logradouro ?? "", numero: r.numero ?? "",
        complemento: r.complemento ?? "", bairro: r.bairro ?? "",
        municipio: r.municipio, uf: r.uf,
        codigo_municipio: r.codigo_municipio,
        telefone: r.telefone ?? "", email: r.email ?? "",
        regime_tributario: r.regime_tributario ?? "simples_nacional",
        optante_simples: r.optante_simples ?? true,
        item_lista_servico: r.item_lista_servico,
        codigo_tributario_municipio: r.codigo_tributario_municipio ?? "",
        codigo_cnae: r.codigo_cnae ?? "",
        aliquota_iss: String(r.aliquota_iss),
        descricao_servico_padrao: r.descricao_servico_padrao ?? "",
        focus_ambiente: r.focus_ambiente,
        rps_serie: r.rps_serie ?? "1",
        rps_proximo_numero: String(r.rps_proximo_numero ?? 1),
        ativo: r.ativo, padrao: r.padrao,
      })}
      toPayload={(f) => ({
        nome: f.nome,
        cnpj: f.cnpj,
        razao_social: f.razao_social,
        nome_fantasia: f.nome_fantasia || null,
        inscricao_municipal: f.inscricao_municipal,
        cep: f.cep,
        logradouro: f.logradouro,
        numero: f.numero,
        complemento: f.complemento || null,
        bairro: f.bairro,
        municipio: f.municipio,
        uf: f.uf.toUpperCase(),
        codigo_municipio: f.codigo_municipio,
        telefone: f.telefone || null,
        email: f.email || null,
        regime_tributario: f.regime_tributario,
        optante_simples: f.optante_simples,
        item_lista_servico: f.item_lista_servico,
        codigo_tributario_municipio: f.codigo_tributario_municipio || null,
        codigo_cnae: f.codigo_cnae || null,
        aliquota_iss: Number(f.aliquota_iss) || 0.02,
        descricao_servico_padrao: f.descricao_servico_padrao || null,
        focus_ambiente: f.focus_ambiente,
        rps_serie: f.rps_serie || "1",
        rps_proximo_numero: Number(f.rps_proximo_numero) || 1,
        ativo: f.ativo,
        padrao: f.padrao,
      })}
      validate={(f) => {
        if (!f.nome.trim()) return "Informe o apelido do emitente.";
        if (!f.cnpj.trim()) return "Informe o CNPJ.";
        if (!f.razao_social.trim()) return "Informe a razão social.";
        if (!f.inscricao_municipal.trim()) return "Informe a inscrição municipal.";
        if (!f.municipio.trim()) return "Informe o município.";
        if (!f.uf.trim()) return "Informe a UF.";
        if (!f.codigo_municipio.trim()) return "Informe o código IBGE do município (7 dígitos).";
        if (!f.cep.trim()) return "Informe o CEP do emitente.";
        if (!f.logradouro.trim()) return "Informe o logradouro.";
        if (!f.numero.trim()) return "Informe o número do endereço.";
        if (!f.bairro.trim()) return "Informe o bairro.";
        return null;
      }}
      renderForm={(f, set) => (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Apelido</Label><Input value={f.nome} onChange={(e) => set({ ...f, nome: e.target.value })} placeholder="Ex: Menino Jesus SJM" /></div>
            <div className="space-y-1"><Label>CNPJ</Label><Input value={f.cnpj} onChange={(e) => set({ ...f, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Razão social</Label><Input value={f.razao_social} onChange={(e) => set({ ...f, razao_social: e.target.value })} /></div>
            <div className="space-y-1"><Label>Nome fantasia</Label><Input value={f.nome_fantasia} onChange={(e) => set({ ...f, nome_fantasia: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Inscrição Municipal</Label><Input value={f.inscricao_municipal} onChange={(e) => set({ ...f, inscricao_municipal: e.target.value })} /></div>
            <div className="space-y-1"><Label>Município</Label><Input value={f.municipio} onChange={(e) => set({ ...f, municipio: e.target.value })} placeholder="São João de Meriti" /></div>
            <div className="space-y-1"><Label>UF</Label><Input maxLength={2} value={f.uf} onChange={(e) => set({ ...f, uf: e.target.value.toUpperCase() })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Cód. IBGE Município</Label><Input value={f.codigo_municipio} onChange={(e) => set({ ...f, codigo_municipio: e.target.value })} placeholder="3305109" /></div>
            <div className="space-y-1"><Label>CEP</Label><Input value={f.cep} onChange={(e) => set({ ...f, cep: e.target.value })} /></div>
            <div className="space-y-1"><Label>Bairro</Label><Input value={f.bairro} onChange={(e) => set({ ...f, bairro: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-[2fr_1fr_2fr] gap-3">
            <div className="space-y-1"><Label>Logradouro</Label><Input value={f.logradouro} onChange={(e) => set({ ...f, logradouro: e.target.value })} /></div>
            <div className="space-y-1"><Label>Número</Label><Input value={f.numero} onChange={(e) => set({ ...f, numero: e.target.value })} /></div>
            <div className="space-y-1"><Label>Complemento</Label><Input value={f.complemento} onChange={(e) => set({ ...f, complemento: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Telefone</Label><Input value={f.telefone} onChange={(e) => set({ ...f, telefone: e.target.value })} /></div>
            <div className="space-y-1"><Label>E-mail</Label><Input value={f.email} onChange={(e) => set({ ...f, email: e.target.value })} /></div>
          </div>

          <div className="pt-2 border-t">
            <h4 className="text-sm font-medium mb-2">Tributação</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Regime</Label>
                <Select value={f.regime_tributario} onValueChange={(v) => set({ ...f, regime_tributario: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REGIMES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Item LC 116</Label><Input value={f.item_lista_servico} onChange={(e) => set({ ...f, item_lista_servico: e.target.value })} placeholder="0401" /></div>
              <div className="space-y-1"><Label>Alíquota ISS (0–1)</Label><Input value={f.aliquota_iss} onChange={(e) => set({ ...f, aliquota_iss: e.target.value })} placeholder="0.02" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="space-y-1"><Label>Cód. Tributário Município</Label><Input value={f.codigo_tributario_municipio} onChange={(e) => set({ ...f, codigo_tributario_municipio: e.target.value })} /></div>
              <div className="space-y-1"><Label>CNAE</Label><Input value={f.codigo_cnae} onChange={(e) => set({ ...f, codigo_cnae: e.target.value })} /></div>
            </div>
            <div className="space-y-1 mt-3"><Label>Descrição padrão do serviço</Label><Input value={f.descricao_servico_padrao} onChange={(e) => set({ ...f, descricao_servico_padrao: e.target.value })} placeholder="Serviços médicos prestados conforme LC 116/03" /></div>
          </div>

          <div className="pt-2 border-t">
            <h4 className="text-sm font-medium mb-2">Focus NFe</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Ambiente</Label>
                <Select value={f.focus_ambiente} onValueChange={(v) => set({ ...f, focus_ambiente: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producao">Produção</SelectItem>
                    <SelectItem value="homologacao">Homologação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Série RPS</Label><Input value={f.rps_serie} onChange={(e) => set({ ...f, rps_serie: e.target.value })} /></div>
              <div className="space-y-1"><Label>Próx. nº RPS</Label><Input value={f.rps_proximo_numero} onChange={(e) => set({ ...f, rps_proximo_numero: e.target.value })} /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              O certificado A1 (.pfx) já está cadastrado no Focus NFe. O token de produção fica salvo como segredo do servidor.
            </p>
          </div>

          <div className="flex items-center gap-6 pt-2 border-t">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.ativo} onCheckedChange={(v) => set({ ...f, ativo: v })} /> Ativo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.padrao} onCheckedChange={(v) => set({ ...f, padrao: v })} /> Padrão
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={f.optante_simples} onCheckedChange={(v) => set({ ...f, optante_simples: v })} /> Optante Simples
            </label>
          </div>
        </div>
      )}
    />
  );
}