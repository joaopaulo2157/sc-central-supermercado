# Supermercado SC Central — V6 FINAL

Sistema web do **Supermercado SC Central**.

## Recursos principais

- Catálogo de produtos
- Produtos por unidade e por peso
- Carrinho
- Checkout via WhatsApp
- Painel administrativo
- Estoque e pedidos
- Clientes e relatórios
- Cupons e regiões de entrega
- PWA
- Importação de produtos por CSV
- Banco SQLite para desenvolvimento local

## Requisitos

- Node.js 22.5 ou superior

## Rodar localmente

```bash
npm start
```

Loja:

```text
http://localhost:3000/
```

Painel:

```text
http://localhost:3000/login.html
```

## Configuração

1. Copie `.env.example` para `.env`.
2. Configure usuário/senha administrativa e demais variáveis.
3. Nunca envie o arquivo `.env` para o GitHub.

## Validação

```bash
npm run check
```

O repositório possui GitHub Actions para validar automaticamente os arquivos JavaScript em pushes e pull requests.

## Segurança

- `.env` não é versionado.
- Banco SQLite local não é versionado.
- Uploads locais não são versionados.
- Troque a senha administrativa antes de publicar o sistema.

## Observação sobre hospedagem

O GitHub será usado como repositório e controle de versão. Como este projeto possui backend Node.js, **GitHub Pages sozinho não executa o servidor**. Uma hospedagem de backend poderá ser integrada posteriormente sem alterar a V6 FINAL.
