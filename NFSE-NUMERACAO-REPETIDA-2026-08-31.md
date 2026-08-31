# NFS-e recusada por "numeração repetida" (E0014) — 31/08/2026

Diagnóstico feito em 31/08/2026 nos dados de produção. **Somente leitura.**

---

## Resumo em uma frase

Quando **duas recepcionistas clicam em emitir no mesmo segundo**, as duas notas
saem com o **mesmo número de DPS**: a prefeitura aceita a primeira e recusa a
segunda com E0014 — "esse número já existe".

---

## 1. A prova

Cada uma das três recusas de hoje tem uma nota **bem-sucedida no mesmo segundo,
com o mesmo número**, emitida por outra pessoa:

| Segundo | Nº DPS | Quem ganhou | Quem perdeu |
|---------|-------:|-------------|-------------|
| 15:48:49 | 8540 | SUELLEN — nota 9755 (JOSE DERINALDO) | NICOLE — ADRIANA PAULA, recusada |
| 16:26:21 | 8606 | NICOLE — nota 9821 (STEFANI DUARTE) | SUELLEN — SULAMITA, recusada |
| 16:31:47 | 8620 | EDNALDA — nota 9835 (DIMARA LUCIA) | NICOLE — ELIAS CONCEICAO, recusada |

Não é a mesma pessoa clicando duas vezes (isso é o outro problema, o da nota
duplicada 9831/9832). São **pessoas diferentes, no mesmo segundo**.

## 2. Por que acontece

O próximo número da nota fica guardado num contador do emitente
(`nfse_emitentes.rps_proximo_numero`). Para reservar o número, o sistema hoje
faz duas operações separadas:

1. **lê** o contador (por exemplo, 8540);
2. **grava** o contador + 1 (8541).

Entre a leitura e a gravação existe uma fresta de tempo. Se a segunda emissão
lê o contador nessa fresta, ela lê **8540 também** — e as duas mandam a mesma
DPS 8540 para a prefeitura. A que chega primeiro fica; a outra é recusada.

Com 250 notas por dia e três recepcionistas emitindo ao mesmo tempo, essa
fresta é atingida algumas vezes ao dia. Hoje foram três.

## 3. Por que a repescagem automática não salvou

O sistema já tem uma repescagem: se a prefeitura devolve E0014, ele soma 1 ao
número e tenta de novo, até 10 vezes. Ela não disparou nestes três casos porque
**a recusa não chegou a tempo**.

O Ambiente Nacional é assíncrono: o envio responde na hora apenas
"processando"; o resultado real só sai numa segunda consulta. O sistema espera
por até 12 segundos e, se ainda não houver resposta, segue em frente. Nesses
três casos a resposta demorou mais que isso — a recusa foi descoberta depois,
pela consulta automática de status, quando a repescagem já tinha terminado.

Por isso as três notas ficaram paradas com erro, em vez de serem reemitidas
sozinhas com o número seguinte.

## 4. Correção aplicada

**O número passou a ser reservado em uma operação só, dentro do banco.** Em vez
de ler e depois gravar, o sistema grava condicionalmente: "aumente o contador de
8540 para 8541 **somente se ele ainda estiver em 8540**". Quem chega depois não
casa a condição, não grava nada, relê o contador e leva o 8541. Duas emissões
simultâneas nunca mais recebem o mesmo número — a fresta deixou de existir. Quem
decide o empate é o banco, então isso vale mesmo se as duas emissões caírem em
servidores diferentes.

Resolvido **dentro do código**, sem mexer na estrutura do banco e sem migração
para rodar à mão no SQL editor.

Mais duas coisas entraram junto:

- **O contador nunca mais anda para trás.** A repescagem do E0014 sobe o número
  tentativa a tentativa e, no fim, gravava onde parou — o que podia desfazer o
  avanço de uma emissão paralela que já tinha ido mais longe, fazendo os números
  colidirem de novo. Agora essa gravação só vale quando de fato adianta.
- **O Reenviar também reserva o número.** Ele não reservava nada: um reenvio
  disparado enquanto a recepção emitia uma nota nova saía com o mesmo número
  dela e voltava recusado pelo mesmo erro que estava tentando resolver.

Arquivos: [nfse-numeracao.ts](src/lib/nfse-numeracao.ts) (a regra, com testes
que simulam duas e dez emissões disputando o mesmo número) e
[nfse.functions.ts](src/lib/nfse.functions.ts) (emissão e reenvio).
Verificação de tipos limpa, 475 testes passando.

### O que ficou de fora (de propósito)

Quando a resposta da prefeitura demora mais que os 12 segundos de espera, a
recusa chega depois e a repescagem automática já acabou — a nota fica parada
com erro esperando alguém clicar em Reenviar. Fazer o sistema reemitir sozinho
nesse caso é mexer em emissão automática de documento fiscal sem ninguém
clicando, então preferi não fazer isso por conta própria. Com a fresta fechada,
esse cenário fica muito mais raro: ele dependia justamente da colisão de
número.

## 5. O que fazer com as 3 notas paradas agora

Elas não têm nada de errado nos dados — só pegaram um número já usado. Basta
**Reenviar** em Financeiro › Notas Fiscais: o reenvio usa o contador atual, que
já passou desses números.

| Paciente | Valor |
|----------|------:|
| ADRIANA PAULA DOS SANTOS | 110,00 |
| SULAMITA BARBOSA DO NASCIMENTO | 110,00 |
| ELIAS CONCEICAO FERREIRA | 130,00 |
