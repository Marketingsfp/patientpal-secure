import { expect, it } from "bun:test";
import { decidirFotos, PEDIR_NOVA_FOTO, type MensagemFoto } from "../fotos";
import { interpretarLeituraImagem, textoDaImagem } from "../leitura-imagem";
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
  for (const itens of [[], ["ECG", null], Array(16).fill("ECG"), ["x".repeat(81)]])
    expect(interpretarLeituraImagem(JSON.stringify({ tipo: "pedido_medico", itens })).tipo).toBe("ilegivel");
  expect(interpretarLeituraImagem('{"tipo":"ilegivel","itens":["talvez ECG"]}').tipo).toBe("ilegivel");
  expect(textoDaImagem({ tipo: "ilegivel" })).not.toContain("pedido médico com");
});
it("Jev recebe o texto lido na foto no histórico, não a marcação Imagem", () => {
  const h = montarHistoricoJev([{ id: "f", direction: "in", tipo: "image", body: "Imagem", transcricao: "Pedido de ECG", created_at: "2026-10-04T12:00:00Z" }]);
  expect(JSON.stringify(h)).toContain("Pedido de ECG");
});
