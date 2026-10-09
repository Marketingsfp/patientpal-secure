import { expect, it } from "bun:test";
import { bloquearLinksRecebidos, protegerMensagemRecebida, LINK_BLOQUEADO } from "../links-entrada";

for (const url of [
  "https://exemplo.com/pedido?id=123",
  "http://exemplo.com",
  "www.exemplo.com.br",
  "exemplo.com.br/exame",
  "bit.ly/abc",
  "wa.me/5521999999999",
  "exemplo.xyz",
  "https://例子.中国/a",
  "https://[::1]/a",
  "ftp://arquivos.local/laudo",
  "file:///C:/arquivo",
  "javascript:alert(1)",
  "data:text/html,abc",
  "mailto:pessoa@exemplo.com",
  "192.168.1.1:8080/a",
  "https://usuario:senha@exemplo.com",
  "https://site.com/#abc",
  "hxxps://exemplo.com",
]) {
  it(`bloqueia ${url}`, () => {
    const saida = bloquearLinksRecebidos(`Veja ${url} para meu exame`);
    expect(saida).toContain(LINK_BLOQUEADO);
    expect(saida).not.toContain(url);
    expect(saida).toStartWith("Veja ");
    expect(saida).toEndWith(" para meu exame");
  });
}
for (const texto of [
  "Dr. Alex",
  "Dr.Alex",
  "USG abdome total",
  "R$ 150,00 e R$ 100.50",
  "04/10/2026 às 15:30",
  "pessoa@gmail.com",
  "21999998888",
  "Dose 0.5 ml",
  "Pedido médico em anexo",
  "Oi\nTudo bem?",
  "",
  LINK_BLOQUEADO,
]) {
  it(`preserva texto sem link: ${texto}`, () => expect(bloquearLinksRecebidos(texto)).toBe(texto));
}
it("preserva pontuação e bloqueia vários links e Markdown", () => {
  expect(bloquearLinksRecebidos("Veja https://site.com. Obrigado!")).toBe(
    `Veja ${LINK_BLOQUEADO}. Obrigado!`,
  );
  expect(bloquearLinksRecebidos("[exame](https://site.com/a) e outro.com")).toBe(
    `[exame](${LINK_BLOQUEADO}) e ${LINK_BLOQUEADO}`,
  );
});
it("bloqueio é idempotente e não muda o objeto original", () => {
  const entrada = {
    direction: "in",
    body: "Meu exame: www.exemplo.com",
    transcricao: "www.exemplo.com",
    media_url: "midias/clinica/arquivo.jpg",
    raw: { image: { id: "media-1", caption: "www.exemplo.com" }, urls: ["https://site.com"] },
  };
  const saida = protegerMensagemRecebida(entrada);
  expect(saida.body).toBe(`Meu exame: ${LINK_BLOQUEADO}`);
  expect(saida.transcricao).toBe(LINK_BLOQUEADO);
  expect(saida.raw.image.caption).toBe(LINK_BLOQUEADO);
  expect(saida.raw.urls).toEqual([LINK_BLOQUEADO]);
  expect(saida.media_url).toBe(entrada.media_url);
  expect(saida.raw.image.id).toBe("media-1");
  expect(entrada.body).toContain("www.exemplo.com");
  expect(protegerMensagemRecebida(saida)).toEqual(saida);
});
it("preserva links oficiais enviados pela equipe ou pela Nina", () => {
  const saida = { direction: "out", body: "https://clinica.com.br/local" };
  expect(protegerMensagemRecebida(saida)).toBe(saida);
});
