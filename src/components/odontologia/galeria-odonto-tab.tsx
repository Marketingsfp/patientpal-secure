import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ImageIcon, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDatePura } from "@/lib/date-utils";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  listarOdontoImagens,
  urlsAssinadas,
  CATEGORIA_LABEL,
  type OdontoImagem,
  type OdontoImagemCategoria,
} from "@/lib/odonto-imagens";
import { UploadImagemDialog } from "./upload-imagem-dialog";
import { VisualizarImagemDialog } from "./visualizar-imagem-dialog";

interface Props {
  clinicaId: string;
  pacienteId: string;
  criadoPor: string | null;
  readOnly?: boolean;
  denteFiltro?: number | null;
  onDenteFiltroChange?: (d: number | null) => void;
}

export function GaleriaOdontoTab({
  clinicaId,
  pacienteId,
  criadoPor,
  readOnly,
  denteFiltro,
  onDenteFiltroChange,
}: Props) {
  const [imagens, setImagens] = useState<OdontoImagem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selecionada, setSelecionada] = useState<OdontoImagem | null>(null);
  const [filtroCat, setFiltroCat] = useState<"todas" | OdontoImagemCategoria>("todas");
  const [filtroDente, setFiltroDente] = useState<string>("");

  useEffect(() => {
    if (denteFiltro && String(denteFiltro) !== filtroDente) setFiltroDente(String(denteFiltro));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denteFiltro]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const rows = await listarOdontoImagens(clinicaId, pacienteId);
      setImagens(rows);
      const paths = rows.filter((r) => /^image\//i.test(r.mime_type)).map((r) => r.storage_path);
      const map = await urlsAssinadas(paths);
      setUrls(map);
    } catch (e) {
      mostrarErro(e, "Falha ao carregar galeria");
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, pacienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtradas = useMemo(() => {
    const denteN = parseInt(filtroDente, 10);
    return imagens.filter((im) => {
      if (filtroCat !== "todas" && im.categoria !== filtroCat) return false;
      if (Number.isFinite(denteN) && denteN > 0 && !im.dentes.includes(denteN)) return false;
      return true;
    });
  }, [imagens, filtroCat, filtroDente]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <Label className="flex items-center gap-1 text-xs">
            <Filter className="h-3 w-3" /> Categoria
          </Label>
          <Select
            value={filtroCat}
            onValueChange={(v) => setFiltroCat(v as "todas" | OdontoImagemCategoria)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {(Object.keys(CATEGORIA_LABEL) as OdontoImagemCategoria[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORIA_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-32">
          <Label className="text-xs">Dente</Label>
          <Input
            placeholder="ex.: 11"
            value={filtroDente}
            onChange={(e) => {
              setFiltroDente(e.target.value);
              const n = parseInt(e.target.value, 10);
              onDenteFiltroChange?.(Number.isFinite(n) && n > 0 ? n : null);
            }}
          />
        </div>
        {(filtroCat !== "todas" || filtroDente) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFiltroCat("todas");
              setFiltroDente("");
              onDenteFiltroChange?.(null);
            }}
          >
            Limpar filtros
          </Button>
        )}
        <div className="flex-1" />
        {!readOnly && (
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova imagem
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {imagens.length === 0
                  ? "Nenhuma imagem cadastrada."
                  : "Nenhuma imagem corresponde ao filtro."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtradas.map((im) => {
                const src = urls[im.storage_path];
                const ehImg = /^image\//i.test(im.mime_type);
                return (
                  <button
                    key={im.id}
                    type="button"
                    onClick={() => setSelecionada(im)}
                    className="group relative bg-muted/40 rounded-md overflow-hidden border hover:border-primary transition text-left"
                  >
                    <div className="aspect-square flex items-center justify-center bg-black/5">
                      {ehImg && src ? (
                        <img
                          src={src}
                          alt={im.descricao ?? ""}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                    <div className="p-2 text-xs">
                      <div className="font-medium truncate">{CATEGORIA_LABEL[im.categoria]}</div>
                      <div className="text-muted-foreground">
                        {formatDatePura(im.data_exame)}
                        {im.dentes.length > 0 && (
                          <span className="ml-1 font-mono">· {im.dentes.join(",")}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <UploadImagemDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        clinicaId={clinicaId}
        pacienteId={pacienteId}
        criadoPor={criadoPor}
        onUploaded={() => void carregar()}
        denteSugerido={denteFiltro ?? null}
      />

      <VisualizarImagemDialog
        open={!!selecionada}
        onClose={() => setSelecionada(null)}
        imagem={selecionada}
        onChanged={() => void carregar()}
        readOnly={readOnly}
      />
    </div>
  );
}