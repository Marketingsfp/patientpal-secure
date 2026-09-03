/**
 * Botão "Tabela de Preços" das telas de Odontologia.
 *
 * A dentista consulta o catálogo em papel na bancada durante o atendimento,
 * então o caminho tem que ser curto: um clique abre a janela, ela confere o
 * que vai na folha e manda imprimir (ou salvar em PDF pelo próprio diálogo do
 * navegador) ou baixar em Excel.
 *
 * A lista de convênios é montada na hora e só mostra os que realmente mudam
 * algum preço — imprimir uma coluna inteira repetindo o particular só gasta
 * papel e confunde na hora de ler.
 */

import { useEffect, useState } from "react";
import { Tag, Printer, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { getTabelaValores, type ConvenioTabelaRef } from "@/lib/agenda/refs-cache";
import {
  cabecalhosDaTabela,
  conveniosQueMudamPreco,
  linhasDaEspecialidade,
  linhasDeTexto,
  linhasParaPlanilha,
  type LinhaPreco,
} from "@/lib/tabela-valores/tabela-precos-especialidade";
import { imprimirFolhaDePrecos } from "@/lib/print-tabela-precos";
import { exportarRelatorioXlsx, type ColunaXlsx } from "@/lib/exportar-xlsx";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  /** Id da especialidade Odontologia; sem ele o botão fica desabilitado. */
  especialidadeId: string | null;
}

const hoje = () => new Date().toLocaleDateString("pt-BR");

export function TabelaPrecosOdontoButton({ especialidadeId }: Props) {
  const { clinicaAtual } = useClinica();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaPreco[]>([]);
  const [convenios, setConvenios] = useState<ConvenioTabelaRef[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const clinicaId = clinicaAtual?.clinica_id;

  useEffect(() => {
    if (!aberto || !clinicaId || !especialidadeId) return;
    let cancelado = false;
    setCarregando(true);
    getTabelaValores(clinicaId)
      .then((dados) => {
        if (cancelado) return;
        const l = linhasDaEspecialidade(dados, especialidadeId);
        const c = conveniosQueMudamPreco(l, dados.convenios);
        setLinhas(l);
        setConvenios(c);
        setMarcados(new Set(c.map((x) => x.id)));
      })
      .catch((e) => {
        if (!cancelado) mostrarErro(e);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [aberto, clinicaId, especialidadeId]);

  const escolhidos = convenios.filter((c) => marcados.has(c.id));
  const cabecalhos = cabecalhosDaTabela(escolhidos);

  const contexto = () => [
    `Clínica: ${clinicaAtual?.clinica.nome ?? "—"}`,
    "Especialidade: Odontologia",
    `${linhas.length} procedimento(s) ativos · emitida em ${hoje()}`,
  ];

  const imprimir = () => {
    if (!linhas.length) return;
    const ok = imprimirFolhaDePrecos({
      titulo: "Tabela de Preços — Odontologia",
      contexto: contexto(),
      cabecalhos,
      linhas: linhasDeTexto(linhas, escolhidos),
    });
    if (!ok) toast.error("O bloqueador de pop-up impediu a impressão.");
  };

  const baixarExcel = () => {
    if (!linhas.length) return;
    const colunas: ColunaXlsx[] = cabecalhos.map((rotulo, i) =>
      i === 0 ? { rotulo, tipo: "texto", largura: 46 } : { rotulo, tipo: "moeda", largura: 16 },
    );
    void exportarRelatorioXlsx({
      arquivo: `tabela-precos-odontologia-${new Date().toISOString().slice(0, 10)}`,
      aba: "Preços Odontologia",
      cabecalho: ["Tabela de Preços — Odontologia", ...contexto()],
      colunas,
      linhas: linhasParaPlanilha(linhas, escolhidos),
    }).catch((e) => toast.error((e as Error).message));
  };

  const alternar = (id: string) => {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
        disabled={!especialidadeId || !clinicaId}
        title={
          !especialidadeId
            ? "Especialidade Odontologia não encontrada"
            : "Tabela de preços da odontologia"
        }
      >
        <Tag className="h-4 w-4 mr-1" /> Tabela de Preços (PDF / Excel)
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tabela de Preços — Odontologia</DialogTitle>
            <DialogDescription>
              Catálogo dos procedimentos ativos da especialidade, com o preço particular e o de cada
              convênio. Imprima em A4 (ou salve em PDF pelo diálogo do navegador) para consultar na
              bancada.
            </DialogDescription>
          </DialogHeader>

          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando o catálogo…</p>
          ) : linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum procedimento ativo vinculado à especialidade Odontologia. O vínculo é feito em
              Cadastros › Serviços.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="font-medium">{linhas.length}</span> procedimento(s) ativos. A folha
                sempre traz o preço particular em dinheiro e em cartão/Pix.
              </p>
              {convenios.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">
                    Convênios a incluir na folha
                  </Label>
                  {convenios.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={marcados.has(c.id)}
                        onCheckedChange={() => alternar(c.id)}
                      />
                      {c.nome}
                    </label>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Só aparecem os convênios que mudam algum preço da odontologia.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={baixarExcel} disabled={!linhas.length}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Baixar Excel
            </Button>
            <Button onClick={imprimir} disabled={!linhas.length}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir / PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
