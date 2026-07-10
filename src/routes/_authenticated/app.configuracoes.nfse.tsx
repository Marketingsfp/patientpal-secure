import { createFileRoute } from "@tanstack/react-router";
import { Building2, FileStack } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";
import { ItemServicoPicker } from "@/components/nfse/item-servico-picker";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";

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
  usar_ambiente_nacional: boolean | null;
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
  usar_ambiente_nacional: boolean;
}

const REGIMES = [
  { v: "simples_nacional", l: "Simples Nacional" },
  { v: "lucro_presumido", l: "Lucro Presumido" },
  { v: "lucro_real", l: "Lucro Real" },
  { v: "mei", l: "MEI" },
];

function NfseConfigPage() {
  return (
    <div className="space-y-6">
      <ClinicaNfseModoCard />
<<<<<<< HEAD
      <SimpleCrud<Row, Form>
        table="nfse_emitentes"
        selectColumns="id, nome, cnpj, razao_social, nome_fantasia, inscricao_municipal, cep, logradouro, numero, complemento, bairro, municipio, uf, codigo_municipio, telefone, email, regime_tributario, optante_simples, item_lista_servico, codigo_tributario_municipio, codigo_cnae, aliquota_iss, descricao_servico_padrao, focus_ambiente, rps_serie, rps_proximo_numero, ativo, padrao, usar_ambiente_nacional"
        title="Emitentes NFS-e"
        subtitle="CNPJs cadastrados para emissão de notas fiscais via Focus NFe."
        icon={<Building2 className="h-6 w-6 text-primary" />}
        orderBy={{ column: "created_at", ascending: false }}
        dialogClassName="max-w-5xl w-[95vw]"
        columns={[
          {
            key: "nome",
            header: "Nome",
            render: (r) => <span className="font-medium">{r.nome}</span>,
          },
          { key: "cnpj", header: "CNPJ", className: "w-44", render: (r) => r.cnpj },
          { key: "mun", header: "Município", render: (r) => `${r.municipio}/${r.uf}` },
          {
            key: "iss",
            header: "ISS",
            className: "w-20 text-right",
            render: (r) => `${(Number(r.aliquota_iss) * 100).toFixed(2)}%`,
          },
          {
            key: "amb",
            header: "Ambiente",
            className: "w-28",
            render: (r) => (
              <span
                className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                  r.focus_ambiente === "producao"
                    ? "bg-green-500/10 text-green-700"
                    : "bg-amber-500/10 text-amber-700"
                }`}
              >
                {r.focus_ambiente}
              </span>
            ),
          },
          {
            key: "padrao",
            header: "Padrão",
            className: "w-20",
            render: (r) => (r.padrao ? "★" : ""),
          },
        ]}
        emptyForm={{
          nome: "",
          cnpj: "",
          razao_social: "",
          nome_fantasia: "",
          inscricao_municipal: "",
          cep: "",
          logradouro: "",
          numero: "",
          complemento: "",
          bairro: "",
          municipio: "",
          uf: "",
          codigo_municipio: "",
          telefone: "",
          email: "",
          regime_tributario: "simples_nacional",
          optante_simples: true,
          item_lista_servico: "0401",
          codigo_tributario_municipio: "",
          codigo_cnae: "",
          aliquota_iss: "0.02",
          descricao_servico_padrao: "",
          focus_ambiente: "producao",
          rps_serie: "1",
          rps_proximo_numero: "1",
          ativo: true,
          padrao: false,
          usar_ambiente_nacional: false,
        }}
        toForm={(r) => ({
          nome: r.nome,
          cnpj: r.cnpj,
          razao_social: r.razao_social,
          nome_fantasia: r.nome_fantasia ?? "",
          inscricao_municipal: r.inscricao_municipal,
          cep: r.cep ?? "",
          logradouro: r.logradouro ?? "",
          numero: r.numero ?? "",
          complemento: r.complemento ?? "",
          bairro: r.bairro ?? "",
          municipio: r.municipio,
          uf: r.uf,
          codigo_municipio: r.codigo_municipio,
          telefone: r.telefone ?? "",
          email: r.email ?? "",
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
          ativo: r.ativo,
          padrao: r.padrao,
          usar_ambiente_nacional: r.usar_ambiente_nacional ?? false,
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
          codigo_municipio: f.codigo_municipio.replace(/\D/g, ""),
          telefone: f.telefone || null,
          email: f.email || null,
          regime_tributario: f.regime_tributario,
          optante_simples: f.optante_simples,
          item_lista_servico: f.item_lista_servico.replace(/\D/g, ""),
          codigo_tributario_municipio: f.codigo_tributario_municipio.replace(/\D/g, "") || null,
          codigo_cnae: f.codigo_cnae.replace(/\D/g, "") || null,
          aliquota_iss: Number(f.aliquota_iss) || 0.02,
          descricao_servico_padrao: f.descricao_servico_padrao || null,
          focus_ambiente: f.focus_ambiente,
          rps_serie: f.rps_serie || "1",
          rps_proximo_numero: Number(f.rps_proximo_numero) || 1,
          ativo: f.ativo,
          padrao: f.padrao,
          usar_ambiente_nacional: f.usar_ambiente_nacional,
        })}
        validate={(f) => {
          if (!f.nome.trim()) return "Informe o apelido do emitente.";
          if (!f.cnpj.trim()) return "Informe o CNPJ.";
          if (!f.razao_social.trim()) return "Informe a razão social.";
          if (!f.inscricao_municipal.trim()) return "Informe a inscrição municipal.";
          if (!f.municipio.trim()) return "Informe o município.";
          if (!f.uf.trim()) return "Informe a UF.";
          if (!f.codigo_municipio.trim()) return "Informe o código IBGE do município (7 dígitos).";
          if (!/^\d{7}$/.test(f.codigo_municipio.replace(/\D/g, "")))
            return "O código IBGE do município deve ter 7 dígitos.";
          if (!f.cep.trim()) return "Informe o CEP do emitente.";
          if (!f.logradouro.trim()) return "Informe o logradouro.";
          if (!f.numero.trim()) return "Informe o número do endereço.";
          if (!f.bairro.trim()) return "Informe o bairro.";
          if (!f.item_lista_servico.trim()) return "Informe o código nacional do serviço.";
          if (
            f.codigo_tributario_municipio.trim() &&
            !/^\d{3}$/.test(f.codigo_tributario_municipio.replace(/\D/g, ""))
          ) {
            return "O Cód. Tributário Município deve ter 3 dígitos; código IBGE fica no campo Cód. IBGE Município.";
          }
          return null;
        }}
        renderForm={(f, set) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Apelido</Label>
                <Input
                  value={f.nome}
                  onChange={(e) => set({ ...f, nome: e.target.value })}
                  placeholder="Ex: Menino Jesus SJM"
                />
              </div>
              <div className="space-y-1">
                <Label>CNPJ</Label>
                <Input
                  value={f.cnpj}
                  onChange={(e) => set({ ...f, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
=======
    <SimpleCrud<Row, Form>
      table="nfse_emitentes"
      selectColumns="id, nome, cnpj, razao_social, nome_fantasia, inscricao_municipal, cep, logradouro, numero, complemento, bairro, municipio, uf, codigo_municipio, telefone, email, regime_tributario, optante_simples, item_lista_servico, codigo_tributario_municipio, codigo_cnae, aliquota_iss, descricao_servico_padrao, focus_ambiente, rps_serie, rps_proximo_numero, ativo, padrao, usar_ambiente_nacional"
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
        ativo: true, padrao: false, usar_ambiente_nacional: false,
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
        usar_ambiente_nacional: r.usar_ambiente_nacional ?? false,
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
        codigo_municipio: f.codigo_municipio.replace(/\D/g, ""),
        telefone: f.telefone || null,
        email: f.email || null,
        regime_tributario: f.regime_tributario,
        optante_simples: f.optante_simples,
        item_lista_servico: f.item_lista_servico.replace(/\D/g, ""),
        codigo_tributario_municipio: f.codigo_tributario_municipio.replace(/\D/g, "") || null,
        codigo_cnae: f.codigo_cnae.replace(/\D/g, "") || null,
        aliquota_iss: Number(f.aliquota_iss) || 0.02,
        descricao_servico_padrao: f.descricao_servico_padrao || null,
        focus_ambiente: f.focus_ambiente,
        rps_serie: f.rps_serie || "1",
        rps_proximo_numero: Number(f.rps_proximo_numero) || 1,
        ativo: f.ativo,
        padrao: f.padrao,
        usar_ambiente_nacional: f.usar_ambiente_nacional,
      })}
      validate={(f) => {
        if (!f.nome.trim()) return "Informe o apelido do emitente.";
        if (!f.cnpj.trim()) return "Informe o CNPJ.";
        if (!f.razao_social.trim()) return "Informe a razão social.";
        if (!f.inscricao_municipal.trim()) return "Informe a inscrição municipal.";
        if (!f.municipio.trim()) return "Informe o município.";
        if (!f.uf.trim()) return "Informe a UF.";
        if (!f.codigo_municipio.trim()) return "Informe o código IBGE do município (7 dígitos).";
        if (!/^\d{7}$/.test(f.codigo_municipio.replace(/\D/g, ""))) return "O código IBGE do município deve ter 7 dígitos.";
        if (!f.cep.trim()) return "Informe o CEP do emitente.";
        if (!f.logradouro.trim()) return "Informe o logradouro.";
        if (!f.numero.trim()) return "Informe o número do endereço.";
        if (!f.bairro.trim()) return "Informe o bairro.";
        if (!f.item_lista_servico.trim()) return "Informe o código nacional do serviço.";
        if (f.codigo_tributario_municipio.trim() && !/^\d{3}$/.test(f.codigo_tributario_municipio.replace(/\D/g, ""))) {
          return "O Cód. Tributário Município deve ter 3 dígitos; código IBGE fica no campo Cód. IBGE Município.";
        }
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Inscrição Municipal</Label><Input value={f.inscricao_municipal} onChange={(e) => set({ ...f, inscricao_municipal: e.target.value })} /></div>
            <div className="space-y-1"><Label>Município</Label><Input value={f.municipio} onChange={(e) => set({ ...f, municipio: e.target.value })} placeholder="São João de Meriti" /></div>
            <div className="space-y-1"><Label>UF</Label><Input maxLength={2} value={f.uf} onChange={(e) => set({ ...f, uf: e.target.value.toUpperCase() })} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Regime</Label>
                <Select value={f.regime_tributario} onValueChange={(v) => set({ ...f, regime_tributario: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REGIMES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Cód. nacional serviço (Lista Nacional NFS-e)</Label>
                <ItemServicoPicker
                  value={f.item_lista_servico}
                  onChange={(codigo) => set({ ...f, item_lista_servico: codigo })}
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Razão social</Label>
                <Input
                  value={f.razao_social}
                  onChange={(e) => set({ ...f, razao_social: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Nome fantasia</Label>
                <Input
                  value={f.nome_fantasia}
                  onChange={(e) => set({ ...f, nome_fantasia: e.target.value })}
                />
              </div>
            </div>
<<<<<<< HEAD
            <div className="grid grid-cols-3 gap-3">
=======
            <div className="space-y-1 mt-3"><Label>Descrição padrão do serviço</Label><Input value={f.descricao_servico_padrao} onChange={(e) => set({ ...f, descricao_servico_padrao: e.target.value })} placeholder="Serviços médicos prestados conforme LC 116/03" /></div>
          </div>

          <div className="pt-2 border-t">
            <h4 className="text-sm font-medium mb-2">Focus NFe</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
              <div className="space-y-1">
                <Label>Inscrição Municipal</Label>
                <Input
                  value={f.inscricao_municipal}
                  onChange={(e) => set({ ...f, inscricao_municipal: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Município</Label>
                <Input
                  value={f.municipio}
                  onChange={(e) => set({ ...f, municipio: e.target.value })}
                  placeholder="São João de Meriti"
                />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Input
                  maxLength={2}
                  value={f.uf}
                  onChange={(e) => set({ ...f, uf: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Cód. IBGE Município</Label>
                <Input
                  value={f.codigo_municipio}
                  onChange={(e) => set({ ...f, codigo_municipio: e.target.value })}
                  placeholder="3305109"
                />
              </div>
              <div className="space-y-1">
                <Label>CEP</Label>
                <Input value={f.cep} onChange={(e) => set({ ...f, cep: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={f.bairro} onChange={(e) => set({ ...f, bairro: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-[2fr_1fr_2fr] gap-3">
              <div className="space-y-1">
                <Label>Logradouro</Label>
                <Input
                  value={f.logradouro}
                  onChange={(e) => set({ ...f, logradouro: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Número</Label>
                <Input value={f.numero} onChange={(e) => set({ ...f, numero: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Complemento</Label>
                <Input
                  value={f.complemento}
                  onChange={(e) => set({ ...f, complemento: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input
                  value={f.telefone}
                  onChange={(e) => set({ ...f, telefone: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input value={f.email} onChange={(e) => set({ ...f, email: e.target.value })} />
              </div>
            </div>

            <div className="pt-2 border-t">
              <h4 className="text-sm font-medium mb-2">Tributação</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Regime</Label>
                  <Select
                    value={f.regime_tributario}
                    onValueChange={(v) => set({ ...f, regime_tributario: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIMES.map((r) => (
                        <SelectItem key={r.v} value={r.v}>
                          {r.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Cód. nacional serviço (Lista Nacional NFS-e)</Label>
                  <ItemServicoPicker
                    value={f.item_lista_servico}
                    onChange={(codigo) => set({ ...f, item_lista_servico: codigo })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Alíquota ISS (0–1)</Label>
                  <Input
                    value={f.aliquota_iss}
                    onChange={(e) => set({ ...f, aliquota_iss: e.target.value })}
                    placeholder="0.02"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="space-y-1">
                  <Label>Cód. Tributário Município</Label>
                  <Input
                    value={f.codigo_tributario_municipio}
                    onChange={(e) => set({ ...f, codigo_tributario_municipio: e.target.value })}
                    placeholder="3 dígitos, não IBGE"
                  />
                </div>
                <div className="space-y-1">
                  <Label>CNAE</Label>
                  <Input
                    value={f.codigo_cnae}
                    onChange={(e) => set({ ...f, codigo_cnae: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1 mt-3">
                <Label>Descrição padrão do serviço</Label>
                <Input
                  value={f.descricao_servico_padrao}
                  onChange={(e) => set({ ...f, descricao_servico_padrao: e.target.value })}
                  placeholder="Serviços médicos prestados conforme LC 116/03"
                />
              </div>
            </div>

            <div className="pt-2 border-t">
              <h4 className="text-sm font-medium mb-2">Focus NFe</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Ambiente</Label>
                  <Select
                    value={f.focus_ambiente}
                    onValueChange={(v) => set({ ...f, focus_ambiente: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="producao">Produção</SelectItem>
                      <SelectItem value="homologacao">Homologação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Série RPS</Label>
                  <Input
                    value={f.rps_serie}
                    onChange={(e) => set({ ...f, rps_serie: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Próx. nº RPS</Label>
                  <Input
                    value={f.rps_proximo_numero}
                    onChange={(e) => set({ ...f, rps_proximo_numero: e.target.value })}
                  />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm mt-3">
                <Switch
                  checked={f.usar_ambiente_nacional}
                  onCheckedChange={(v) => set({ ...f, usar_ambiente_nacional: v })}
                />
                <span>
                  Usar <strong>Ambiente Nacional NFS-e</strong> (endpoint <code>/v2/nfsen</code>)
                  <span className="block text-xs text-muted-foreground">
                    Ative para municípios que aderiram ao padrão nacional (ex.: São João de
                    Meriti/RJ). Caso contrário, será usado o endpoint municipal padrão do Focus.
                  </span>
                </span>
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                O certificado A1 (.pfx) já está cadastrado no Focus NFe. O token de produção fica
                salvo como segredo do servidor.
              </p>
            </div>

            <div className="flex items-center gap-6 pt-2 border-t">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={f.ativo} onCheckedChange={(v) => set({ ...f, ativo: v })} /> Ativo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={f.padrao} onCheckedChange={(v) => set({ ...f, padrao: v })} />{" "}
                Padrão
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={f.optante_simples}
                  onCheckedChange={(v) => set({ ...f, optante_simples: v })}
                />{" "}
                Optante Simples
              </label>
            </div>
          </div>
        )}
      />
    </div>
  );
}

function ClinicaNfseModoCard() {
  const { clinicaAtual } = useClinica();
  const [modo, setModo] = useState<"por_item" | "agrupada">("por_item");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clinicaAtual) return;
    setLoading(true);
    supabase
      .from("clinicas")
      .select("nfse_modo_emissao")
      .eq("id", clinicaAtual.clinica_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) mostrarErro(error);
        else if (data?.nfse_modo_emissao === "agrupada") setModo("agrupada");
        else setModo("por_item");
        setLoading(false);
      });
  }, [clinicaAtual]);

  const salvar = async (novo: "por_item" | "agrupada") => {
    if (!clinicaAtual) return;
    setSaving(true);
    const anterior = modo;
    setModo(novo);
    const { error } = await supabase
      .from("clinicas")
      .update({ nfse_modo_emissao: novo })
      .eq("id", clinicaAtual.clinica_id);
    setSaving(false);
    if (error) {
      setModo(anterior);
      mostrarErro(error);
      return;
    }
    toast.success(
      novo === "agrupada"
        ? "NFS-e agrupada por orçamento ativada."
        : "NFS-e emitida por item (comportamento padrão).",
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <FileStack className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold">Modo de emissão de NFS-e</h3>
          <p className="text-xs text-muted-foreground">
            Vale para toda a clínica. A regra é aplicada na emissão a partir do orçamento —
            comissão, repasse e financeiro continuam por atendimento.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => salvar("por_item")}
          className={`text-left rounded-md border p-3 transition ${
            modo === "por_item" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
          }`}
        >
          <div className="text-sm font-medium">Por item</div>
          <div className="text-xs text-muted-foreground">
            Uma NFS-e para cada procedimento pago. Comportamento padrão.
          </div>
        </button>
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => salvar("agrupada")}
          className={`text-left rounded-md border p-3 transition ${
            modo === "agrupada" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
          }`}
        >
          <div className="text-sm font-medium">Agrupada por orçamento</div>
          <div className="text-xs text-muted-foreground">
            Uma única NFS-e contendo todos os itens pagos do orçamento (ex.: Menino Jesus).
          </div>
        </button>
      </div>
    </div>
  );
}
