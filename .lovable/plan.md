## Situação

- No preview do Lovable, a gratuidade da Marleide para **Eletrocardiograma (ECG)** já está saindo corretamente.
- Então não parece ser mais problema de regra ou código no ambiente atual.
- O que falta é levar essa versão para o site publicado.

## Plano

1. Publicar a versão atual do projeto.
2. Depois da publicação, testar no site publicado o mesmo fluxo:
   - Agenda;
   - paciente Marleide;
   - contrato 20261906;
   - serviço Eletrocardiograma;
   - cobrança deve reconhecer a gratuidade.
3. Se no publicado ainda sair com desconto de 10%, aí investigar cache/versão publicada ou diferença de ambiente.

## Impacto

- **Tipo de pedido:** publicação/ambiente.
- **Clínica:** Policlínica Menino Jesus, pois o caso testado é dela.
- **Código:** não precisa alterar agora.
- **Banco/regras do Cartão Consulta:** não vou alterar valores nem regras manualmente por prompt.

## Validação esperada

Depois de publicar, o comportamento do site publicado deve ficar igual ao preview: ECG da Marleide saindo com gratuidade quando aplicável.