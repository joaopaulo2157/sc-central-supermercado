# Supermercado SC Central — V6 FINAL

[![Validar SC Central V6](https://github.com/joaopaulo2157/sc-central-supermercado/actions/workflows/validate.yml/badge.svg)](https://github.com/joaopaulo2157/sc-central-supermercado/actions/workflows/validate.yml)
![Node.js](https://img.shields.io/badge/Node.js-22.5%2B-339933?logo=node.js&logoColor=white)
![Status](https://img.shields.io/badge/status-V6%20FINAL-0b5ed7)

Sistema web do **Supermercado SC Central** com catálogo, produtos por unidade e peso, carrinho, checkout via WhatsApp, painel administrativo, estoque, pedidos, clientes, relatórios e PWA.

## Recursos

- catálogo de produtos com imagens;
- venda por unidade e por peso;
- categorias e subcategorias;
- preços, promoções e estoque;
- carrinho persistente;
- entrega ou retirada;
- regiões, taxas e pedido mínimo;
- cupons;
- checkout organizado via WhatsApp;
- histórico de pedidos e status;
- reserva/devolução de estoque;
- clientes e relatórios;
- usuários e permissões;
- auditoria;
- importação CSV;
- upload de imagens;
- PWA / Service Worker;
- API HTTP própria;
- SQLite para desenvolvimento e servidor único.

## Stack

- Node.js 22.5+
- HTML5 / CSS3 / JavaScript
- `node:http`
- `node:sqlite`
- PWA / Service Worker
- GitHub Actions
- Docker opcional

## Estrutura

```text
sc-central-supermercado/
├── .github/            # CI, CODEOWNERS e templates
├── data/               # SQLite local; banco não é versionado
├── docs/               # deploy, operação e organização
├── public/             # loja, painel, assets e PWA
├── src/                # banco, segurança e integrações
├── legacy-v3/          # histórico preservado
├── legacy-v5/          # histórico preservado
├── Dockerfile
├── compose.yaml
├── server.js
└── package.json
```

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

Modo de desenvolvimento:

```bash
npm run dev
```

## Variáveis de ambiente

O arquivo `.env.example` documenta as variáveis aceitas. O servidor lê `process.env`; portanto, em produção configure as variáveis diretamente na plataforma de hospedagem ou no ambiente do processo.

Principais variáveis:

```text
PORT
HOST
SC_HTTPS
SC_SESSION_HOURS
SC_ADMIN_USER
SC_ADMIN_PASSWORD
SC_DB_PATH
SC_WEBHOOK_URL
SC_WEBHOOK_TOKEN
```

Nunca versione `.env`, tokens ou senhas reais.

## Validação

```bash
npm run check
```

O GitHub Actions executa automaticamente:

1. validação de sintaxe;
2. inicialização do servidor;
3. teste do endpoint `/api/health`.

## Docker

```bash
docker build -t sc-central-v6 .
docker run -p 3000:3000 \
  -v sc-central-data:/app/data \
  -v sc-central-uploads:/app/public/uploads \
  sc-central-v6
```

Ou:

```bash
docker compose up -d --build
```

Antes do deploy, consulte [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Persistência

Como a aplicação usa SQLite e uploads locais, uma hospedagem com filesystem efêmero precisa de armazenamento persistente para:

```text
/app/data
/app/public/uploads
```

Sem isso, banco e imagens podem ser perdidos em um redeploy.

## Segurança

- `.env` não é versionado;
- banco local não é versionado;
- uploads locais não são versionados;
- altere a senha administrativa antes da publicação;
- use HTTPS em produção;
- mantenha backups de banco e uploads;
- não publique vulnerabilidades em Issues públicas.

Consulte [`SECURITY.md`](SECURITY.md).

## GitHub Pages

**GitHub Pages não executa a aplicação completa**, pois a V6 possui backend Node.js e banco de dados. O GitHub é usado para versionamento, revisão e CI. Para colocar a loja online, use uma hospedagem com suporte a Node.js ou containers.

## Documentação

- [`ARQUITETURA-V6-FINAL.md`](ARQUITETURA-V6-FINAL.md)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/RAILWAY.md`](docs/RAILWAY.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`docs/REPOSITORY.md`](docs/REPOSITORY.md)
- [`SECURITY.md`](SECURITY.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`CHANGELOG-V6-FINAL.txt`](CHANGELOG-V6-FINAL.txt)
- [`MODELO-IMPORTACAO-PRODUTOS.csv`](MODELO-IMPORTACAO-PRODUTOS.csv)

## Fluxo recomendado

```text
alteração
  ↓
npm run check
  ↓
commit
  ↓
push / pull request
  ↓
GitHub Actions
  ↓
deploy
```

Repositório oficial: https://github.com/joaopaulo2157/sc-central-supermercado

A base principal continua sendo a **V6 FINAL**.
