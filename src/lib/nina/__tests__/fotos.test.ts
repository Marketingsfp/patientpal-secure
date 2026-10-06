import { expect, it } from "bun:test";
import { decidirFotos, PEDIR_NOVA_FOTO, FALHA_TECNICA_FOTO, apresentarRespostaDeFoto, leituraSalvaDaFoto, type MensagemFoto } from "../fotos";
import { interpretarLeituraImagem, textoDaImagem, MAX_ITENS_IMAGEM } from "../leitura-imagem";
import { montarHistoricoJev } from "../jev-contexto";
const foto = (id: string, segundo: number, tipo = "ilegivel"): MensagemFoto => ({
  id, created_at: `2026-10-04T12:00:${String(segundo).padStart(2, "0")}Z`, direction: "in", tipo: "image",
  raw: { nina_leitura_imagem: tipo === "pedido_medico" ? { tipo, itens: ["ECG"] } : { tipo } },
});
const pedido: MensagemFoto = { ...foto("pedido", 10), tipo: "text", direction: "out", body: PEDIR_NOVA_FOTO, status: "sent", enviada_por: "nina", raw: null };
it("primeira foto e duas fotos do mesmo lote pedem somente uma nova tentativa", () => {
  expect(decidirFotos([foto("a", 1)], []).acao).toBe("nova_foto");
  expect(decidirFotos([foto("a", 1), foto("b", 2)], [pedido]).acao).toBe("nova_foto");
});
it("nova foto ilegível após pedido entregue encaminha; repetição da primeira não conta", () => {
  expect(decidirFotos([foto("b", 20)], [foto("a", 1), pedido]).acao).toBe("encaminhar");
  expect(decidirFotos([foto("a", 1)], [foto("a", 1), pedido]).acao).toBe("nova_foto");
});
it("pedido não enviado ou escrito por humano não consome tentativa", () => {
  for (const alteracao of [{ status: "failed" }, { status: "pending" }, { enviada_por: "atendente" }])
    expect(decidirFotos([foto("b", 20)], [{ ...pedido, ...alteracao }]).acao).toBe("nova_foto");
});
it("leitura bem-sucedida encerra a pendência, e outra foto começa nova tentativa", () => {
  expect(decidirFotos([foto("b", 20, "pedido_medico")], [pedido]).acao).toBe("continuar");
  expect(decidirFotos([foto("c", 30)], [pedido, foto("b", 20, "pedido_medico")]).acao).toBe("nova_foto");
});
it("resultado ou receita de remédio vai à equipe; texto nunca é contado como foto", () => {
  expect(decidirFotos([foto("b", 20, "outro")], []).acao).toBe("encaminhar");
  expect(decidirFotos([foto("b", 20, "receita_remedio")], []).acao).toBe("encaminhar");
  expect(decidirFotos([{ ...foto("b", 20), tipo: "text" }], [pedido]).acao).toBe("continuar");
});
it("leitura parcial ou inválida não libera nomes presumidos", () => {
  for (const itens of [[], ["ECG", null], ["x".repeat(81)]])
    expect(interpretarLeituraImagem(JSON.stringify({ tipo: "pedido_medico", itens })).tipo).toBe("ilegivel");
  expect(interpretarLeituraImagem('{"tipo":"ilegivel","itens":["talvez ECG"]}').tipo).toBe("ilegivel");
  expect(textoDaImagem({ tipo: "ilegivel" })).not.toContain("pedido médico com");
});
it("preserva os 19 exames do pedido fotografado, sem confundir quantidade com ilegibilidade", () => {
  const itens = ["Hemograma completo", "Uréia", "Creatinina", "Sódio", "Potássio", "Lipidograma completo",
    "Hepatograma completo", "Glicemia jejum", "Hemoglobina glicada", "Vitamina B12", "Ácido fólico",
    "25 hidroxi vitamina D", "TSH", "T4 livre", "Ferro", "Ferritina", "Transferrina", "VDRL", "VHS"];
  const leitura = interpretarLeituraImagem(JSON.stringify({ tipo: "pedido_medico", itens }));
  expect(leitura).toEqual({ tipo: "pedido_medico", itens });
  expect(leituraSalvaDaFoto({ nina_leitura_imagem: leitura })).toEqual(leitura);
  expect(textoDaImagem(leitura)).toContain("VDRL; VHS");
});
it("limite de carga e JSON inválido são falhas técnicas, não foto borrada", () => {
  expect(interpretarLeituraImagem(JSON.stringify({ tipo: "pedido_medico", itens: Array(MAX_ITENS_IMAGEM + 1).fill("ECG") })))
    .toEqual({ tipo: "falha_tecnica", motivo: "limite_itens" });
  expect(interpretarLeituraImagem("JSON inválido")).toEqual({ tipo: "falha_tecnica", motivo: "resposta_invalida" });
  const falha = { ...foto("f", 20), raw: { nina_leitura_imagem: { tipo: "falha_tecnica", motivo: "provedor" } } };
  expect(decidirFotos([falha], [pedido]).acao).toBe("falha_tecnica");
  expect(decidirFotos([foto("nova", 30)], [{ ...pedido, body: FALHA_TECNICA_FOTO }]).acao).toBe("nova_foto");
});
it("apresentação usa identidade publicada e mantém reconhecimento da segunda tentativa", () => {
  const texto = apresentarRespostaDeFoto(PEDIR_NOVA_FOTO, true, { assistente: "Ana", estabelecimento: "Clínica Exemplo" });
  expect(texto).toStartWith("Olá! Me chamo Ana, atendente virtual da Clínica Exemplo.");
  expect(decidirFotos([foto("b", 20)], [{ ...pedido, body: texto }]).acao).toBe("encaminhar");
  expect(apresentarRespostaDeFoto(PEDIR_NOVA_FOTO, false, null)).toBe(PEDIR_NOVA_FOTO);
  expect(apresentarRespostaDeFoto("", true, null)).toBe("");
});
it("Jev recebe o texto lido na foto no histórico, não a marcação Imagem", () => {
  const h = montarHistoricoJev([{ id: "f", direction: "in", tipo: "image", body: "Imagem", transcricao: "Pedido de ECG", created_at: "2026-10-04T12:00:00Z" }]);
  expect(JSON.stringify(h)).toContain("Pedido de ECG");
});
