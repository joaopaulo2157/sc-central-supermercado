# SC Central — Arquitetura V6 Final

## Fluxo principal

`Navegador -> API Node.js -> SQLite -> Pedido -> Estoque -> WhatsApp`

O navegador nunca define o valor final do pedido. A API busca novamente produtos,
preços, cupons, taxa e estoque antes de gravar o pedido.

## Camadas

- `public/`: loja, painel, PWA e recursos estáticos.
- `server.js`: HTTP, API, pedidos, administração e arquivos.
- `src/db.js`: banco, seed e migrações.
- `src/security.js`: autenticação e sessão.
- `src/integrations.js`: webhooks opcionais para integrações futuras.
- `data/`: banco SQLite em execução normal.
- `legacy-v5/`: snapshot técnico anterior à consolidação.
- `legacy-v3/`: código histórico já preservado no projeto.

## Estratégia de CSS

A página não carrega mais uma cadeia de vários CSS de versões diferentes.

Loja carrega apenas:

`store-v6.css`

Painel carrega apenas:

`admin-v6.css`

Os arquivos anteriores foram mantidos para histórico e rastreabilidade.

## Integrações futuras

A V6 não depende de ERP/PDV específico. Isso é intencional. Quando o supermercado
informar qual sistema utiliza, a integração deve ser implementada como adaptador/webhook,
sem reescrever catálogo, checkout ou pedidos.

Possíveis integrações:

- ERP/PDV e sincronização de estoque/preço;
- WhatsApp Business Cloud API;
- gateway de pagamento;
- emissão fiscal;
- CRM/fidelidade;
- analytics;
- notificações push;
- marketplaces.

Essas integrações dependem de fornecedor, credenciais e regras comerciais reais e,
por isso, não devem ser simuladas como se estivessem prontas.
