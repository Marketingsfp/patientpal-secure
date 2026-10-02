import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Mapa de calor da aba "Origem dos pacientes": cada bairro de fora de São
 * João de Meriti vira uma mancha com a força do número de atendimentos.
 *
 * Localização: o mapa procura no OpenStreetMap (Nominatim) só o NOME do
 * bairro e da cidade ("PAVUNA, RIO DE JANEIRO") — nunca nome, CPF ou CEP de
 * paciente. A resposta fica guardada no navegador, então cada bairro é
 * procurado uma vez só. Bairro que não é achado (ou "não informado") cai no
 * centro da cidade; cidade que também não é achada fica fora do mapa e é
 * contada no rodapé.
 *
 * Pin da clínica: latitude/longitude do cadastro da unidade (o mesmo do ponto
 * eletrônico); sem isso, procura o endereço da unidade.
 */

export type BairroMapa = {
  bairro: string | null;
  cidade: string;
  pacientes: number;
  atendimentos: number;
};

type Coord = { lat: number; lng: number };

const SEM_BAIRRO = "BAIRRO NAO INFORMADO";
/** Cidade-rótulo do banco para quem só tem CEP fora das faixas conhecidas. */
const CIDADE_SO_CEP = "OUTRA CIDADE (SO CEP)";

/** Caixa que cobre o estado do Rio — resposta fora dela é engano de homônimo. */
const VIEWBOX_RJ = "-44.9,-20.7,-40.9,-23.4";
/** Bairro achado a mais disso do centro da própria cidade é descartado. */
const DIST_MAX_BAIRRO_KM = 45;
const CACHE_KEY = "painel-origem-geo-v1";
/** Regra de uso do Nominatim: no máximo uma busca por segundo. */
const INTERVALO_MS = 1100;

const int = (n: number) => Number(n ?? 0).toLocaleString("pt-BR");
const titulo = (s: string) =>
  s.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

function lerCache(): Record<string, Coord | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function gravarCache(c: Record<string, Coord | null>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* navegador sem armazenamento: só procura de novo na próxima vez */
  }
}

/** O que o Nominatim chama de município — "COTIA" achado como bairro de
 *  Guapimirim, por exemplo, não serve de centro de cidade. */
const TIPOS_MUNICIPIO = new Set(["city", "town", "municipality", "village"]);

async function procurar(texto: string, soMunicipio: boolean): Promise<Coord | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br" +
    `&viewbox=${VIEWBOX_RJ}&bounded=1&accept-language=pt-BR&q=${encodeURIComponent(texto)}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const j = (await r.json()) as { lat: string; lon: string; addresstype?: string }[];
  if (!j[0]) return null;
  if (soMunicipio && !TIPOS_MUNICIPIO.has(j[0].addresstype ?? "")) return null;
  return { lat: Number(j[0].lat), lng: Number(j[0].lon) };
}

function distKm(a: Coord, b: Coord) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const chaveCidade = (cidade: string) => `c|${cidade}`;
const chaveBairro = (bairro: string, cidade: string) => `b|${bairro}|${cidade}`;

/** Lista do que precisa ser procurado: cidades primeiro (servem de reserva). */
function buscasNecessarias(bairros: BairroMapa[], extras: string[]) {
  const cidades = new Set<string>();
  const lista: { chave: string; texto: string }[] = [];
  for (const b of bairros) {
    if (b.cidade === CIDADE_SO_CEP) continue;
    cidades.add(b.cidade);
  }
  for (const c of cidades) lista.push({ chave: chaveCidade(c), texto: `${c}, RJ, Brasil` });
  for (const b of bairros) {
    if (b.cidade === CIDADE_SO_CEP || !b.bairro || b.bairro === SEM_BAIRRO) continue;
    lista.push({
      chave: chaveBairro(b.bairro, b.cidade),
      texto: `${b.bairro}, ${b.cidade}, RJ, Brasil`,
    });
  }
  for (const e of extras) lista.push({ chave: `e|${e}`, texto: e });
  return lista;
}

/** Procura no Nominatim o que ainda não está guardado, uma por vez. */
function useGeocodificacao(bairros: BairroMapa[], extras: string[]) {
  const [cache, setCache] = useState<Record<string, Coord | null>>(() =>
    typeof window === "undefined" ? {} : lerCache(),
  );
  const [falhou, setFalhou] = useState(false);
  const lista = useMemo(() => buscasNecessarias(bairros, extras), [bairros, extras]);
  const faltam = lista.filter((x) => !(x.chave in cache));

  useEffect(() => {
    if (faltam.length === 0) return;
    let vivo = true;
    (async () => {
      const atual = lerCache();
      for (const item of faltam) {
        if (!vivo) return;
        if (item.chave in atual) continue;
        try {
          atual[item.chave] = await procurar(item.texto, item.chave.startsWith("c|"));
        } catch {
          // Sem internet ou serviço fora do ar: não grava, tenta na próxima abertura.
          if (vivo) setFalhou(true);
          return;
        }
        gravarCache(atual);
        if (vivo) setCache({ ...atual });
        await new Promise((r) => setTimeout(r, INTERVALO_MS));
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista]);

  return { cache, pendentes: faltam.length, total: lista.length, falhou };
}

type Ponto = BairroMapa & Coord & { noCentroDaCidade: boolean };

export function MapaCalorOrigem({
  clinicaId,
  bairros,
  onAbrirBairro,
}: {
  clinicaId: string;
  /** Todos os bairros de fora (não só os 30 do ranking). */
  bairros: BairroMapa[];
  onAbrirBairro: (b: BairroMapa) => void;
}) {
  const [clinica, setClinica] = useState<{
    nome: string;
    pos: Coord | null;
    endereco: string | null;
  }>();

  useEffect(() => {
    let vivo = true;
    supabase
      .from("clinicas")
      .select("nome,latitude,longitude,endereco,cidade,estado")
      .eq("id", clinicaId)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo || !data) return;
        const temPos = data.latitude != null && data.longitude != null;
        setClinica({
          nome: data.nome,
          pos: temPos ? { lat: Number(data.latitude), lng: Number(data.longitude) } : null,
          endereco: temPos
            ? null
            : [data.endereco, data.cidade ?? "São João de Meriti", data.estado ?? "RJ", "Brasil"]
                .filter(Boolean)
                .join(", "),
        });
      });
    return () => {
      vivo = false;
    };
  }, [clinicaId]);

  const extras = useMemo(() => (clinica?.endereco ? [clinica.endereco] : []), [clinica?.endereco]);
  const { cache, pendentes, total, falhou } = useGeocodificacao(bairros, extras);

  const posClinica: Coord | null =
    clinica?.pos ??
    (clinica?.endereco ? cache[`e|${clinica.endereco}`] : undefined) ??
    cache[chaveCidade("SAO JOAO DE MERITI")] ??
    null;

  const { pontos, foraDoMapa } = useMemo(() => {
    const pontos: Ponto[] = [];
    let foraDoMapa = 0;
    for (const b of bairros) {
      const centro = cache[chaveCidade(b.cidade)] ?? null;
      const proprio =
        b.bairro && b.bairro !== SEM_BAIRRO
          ? (cache[chaveBairro(b.bairro, b.cidade)] ?? null)
          : null;
      // Cidade que não foi achada como município não entra, nem pelo bairro:
      // sem o centro dela não há como conferir se o bairro achado é o certo.
      const confiavel = !!proprio && !!centro && distKm(proprio, centro) <= DIST_MAX_BAIRRO_KM;
      const pos = confiavel ? proprio : centro;
      if (!pos) {
        if (b.cidade === CIDADE_SO_CEP || chaveCidade(b.cidade) in cache) foraDoMapa += b.pacientes;
        continue;
      }
      pontos.push({ ...b, ...pos, noCentroDaCidade: !confiavel });
    }
    return { pontos, foraDoMapa };
  }, [bairros, cache]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Mapa de calor (fora de São João de Meriti)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <MapaLeaflet
          pontos={pontos}
          clinica={posClinica}
          nomeClinica={clinica?.nome}
          onAbrir={onAbrirBairro}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Quanto mais vermelho, mais atendimentos. Passe o mouse num bairro para ver os números;
            clique para ver os pacientes. O pin azul é a clínica.
          </span>
          <span className="flex items-center gap-1.5">
            <span>menos</span>
            <span
              className="inline-block h-2 w-24 rounded"
              style={{
                background:
                  "linear-gradient(to right, #3b82f6, #22c55e, #facc15, #f97316, #dc2626)",
              }}
            />
            <span>mais</span>
          </span>
        </div>
        {pendentes > 0 && !falhou && (
          <p className="text-xs text-muted-foreground">
            Localizando os bairros no mapa ({int(total - pendentes)} de {int(total)})… Isso só
            acontece na primeira vez que cada bairro aparece.
          </p>
        )}
        {falhou && (
          <p className="text-xs text-muted-foreground">
            Não foi possível localizar todos os bairros agora (serviço de mapas sem resposta). Os
            que faltam aparecem na próxima vez que a aba for aberta.
          </p>
        )}
        {foraDoMapa > 0 && (
          <p className="text-xs text-muted-foreground">
            {int(foraDoMapa)} paciente(s) com cidade que o mapa não conseguiu localizar — eles
            continuam contados nos rankings abaixo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Centro inicial: entre a Zona Norte do Rio e a Baixada. */
const CENTRO_INICIAL: Coord = { lat: -22.8, lng: -43.35 };

function MapaLeaflet({
  pontos,
  clinica,
  nomeClinica,
  onAbrir,
}: {
  pontos: Ponto[];
  clinica: Coord | null;
  nomeClinica?: string;
  onAbrir: (b: BairroMapa) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<Leaflet.Map | null>(null);
  const libRef = useRef<typeof Leaflet | null>(null);
  const camadaRef = useRef<Leaflet.LayerGroup | null>(null);
  /** Depois que o usuário arrasta ou dá zoom, o mapa para de se reenquadrar. */
  const mexeuRef = useRef(false);
  const [pronto, setPronto] = useState(false);
  const onAbrirRef = useRef(onAbrir);
  onAbrirRef.current = onAbrir;

  // Leaflet mexe em `window` ao ser carregado: só importa no navegador.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof Leaflet }).L = L;
      await import("leaflet.heat");
      if (!vivo || !divRef.current) return;
      const mapa = L.map(divRef.current, { zoomControl: true, scrollWheelZoom: true }).setView(
        [CENTRO_INICIAL.lat, CENTRO_INICIAL.lng],
        11,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap",
      }).addTo(mapa);
      libRef.current = L;
      mapaRef.current = mapa;
      camadaRef.current = L.layerGroup().addTo(mapa);
      mapa.on("dragstart", () => (mexeuRef.current = true));
      divRef.current.addEventListener("wheel", () => (mexeuRef.current = true), { passive: true });
      setPronto(true);
    })();
    return () => {
      vivo = false;
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = libRef.current;
    const mapa = mapaRef.current;
    const camada = camadaRef.current;
    if (!pronto || !L || !mapa || !camada) return;
    camada.clearLayers();

    // Vários bairros no mesmo ponto (ex.: "não informado" no centro da cidade)
    // somam no calor; o máximo é o maior ponto para a escala ir até o vermelho.
    const max = Math.max(1, ...pontos.map((p) => p.atendimentos));
    const heat = (
      L as unknown as {
        heatLayer: (pts: [number, number, number][], o: object) => Leaflet.Layer;
      }
    ).heatLayer(
      pontos.map((p) => [p.lat, p.lng, p.atendimentos]),
      {
        radius: 35,
        blur: 25,
        max,
        minOpacity: 0.35,
        gradient: { 0.2: "#3b82f6", 0.4: "#22c55e", 0.6: "#facc15", 0.8: "#f97316", 1: "#dc2626" },
      },
    );
    camada.addLayer(heat);

    // Círculos invisíveis por cima das manchas: são eles que mostram o cartão
    // ao passar o mouse e abrem a lista ao clicar.
    for (const p of pontos) {
      const nomeBairro =
        p.bairro && p.bairro !== SEM_BAIRRO ? titulo(p.bairro) : "Bairro não informado";
      const alvo = L.circleMarker([p.lat, p.lng], {
        radius: 10 + Math.min(14, Math.sqrt(p.atendimentos) * 2),
        stroke: false,
        fillOpacity: 0,
      });
      alvo.bindTooltip(
        `<div style="font-size:12px;line-height:1.4">
          <div style="font-weight:600">${nomeBairro}</div>
          <div>${titulo(p.cidade)}</div>
          <div>${int(p.pacientes)} paciente(s) · ${int(p.atendimentos)} atendimento(s)</div>
          ${p.noCentroDaCidade && p.bairro && p.bairro !== SEM_BAIRRO ? '<div style="opacity:.7">posição aproximada (centro da cidade)</div>' : ""}
        </div>`,
        { direction: "top", sticky: true },
      );
      alvo.on("click", () => onAbrirRef.current(p));
      camada.addLayer(alvo);
    }

    if (clinica) {
      const pin = L.marker([clinica.lat, clinica.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:18px;height:18px;border-radius:9999px;background:#1d4ed8;border:3px solid #fff;box-shadow:0 0 0 2px #1d4ed8"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        zIndexOffset: 1000,
      });
      pin.bindTooltip(nomeClinica ?? "Clínica", { direction: "top", offset: [0, -10] });
      camada.addLayer(pin);
      // Anéis de 5, 10 e 20 km para ler a distância a olho.
      for (const km of [5, 10, 20]) {
        camada.addLayer(
          L.circle([clinica.lat, clinica.lng], {
            radius: km * 1000,
            color: "#1d4ed8",
            weight: 1,
            opacity: 0.5,
            dashArray: "4 6",
            fill: false,
            interactive: false,
          }),
        );
      }
    }

    // Enquadra conforme os bairros vão sendo localizados, até o usuário mexer.
    if (!mexeuRef.current && pontos.length > 0) {
      const ref = [...pontos.map((p) => [p.lat, p.lng] as [number, number])];
      if (clinica) ref.push([clinica.lat, clinica.lng]);
      mapa.fitBounds(L.latLngBounds(ref), { padding: [30, 30], maxZoom: 12 });
    }
  }, [pronto, pontos, clinica, nomeClinica]);

  return (
    <div ref={divRef} className="h-[460px] w-full overflow-hidden rounded-md border isolate" />
  );
}
