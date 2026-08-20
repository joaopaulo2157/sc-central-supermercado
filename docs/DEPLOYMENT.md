# Deploy da V6 FINAL

## O que a hospedagem precisa oferecer

A aplicação precisa executar **Node.js 22.5+** ou um container Docker.

GitHub Pages não é suficiente porque a V6 possui:

- `server.js`;
- API HTTP;
- sessões;
- SQLite;
- uploads de arquivos.

## Variáveis de ambiente

Configure no provedor:

```text
PORT
HOST=0.0.0.0
SC_HTTPS=1
SC_SESSION_HOURS=8
SC_ADMIN_USER
SC_ADMIN_PASSWORD
SC_DB_PATH
SC_WEBHOOK_URL
SC_WEBHOOK_TOKEN
```

Não coloque segredos no GitHub.

## Persistência

A V6 grava dados em disco. Em provedores com filesystem efêmero, crie armazenamento persistente para:

```text
/app/data
/app/public/uploads
```

Se usar `SC_DB_PATH`, mantenha o arquivo dentro do volume persistente.

## Deploy com Docker

```bash
docker build -t sc-central-v6 .
docker run -d \
  --name sc-central-v6 \
  -p 3000:3000 \
  -e SC_ADMIN_USER=admin \
  -e SC_ADMIN_PASSWORD="UMA_SENHA_FORTE" \
  -v sc-central-data:/app/data \
  -v sc-central-uploads:/app/public/uploads \
  sc-central-v6
```

Com Compose, defina as variáveis no ambiente e execute:

```bash
docker compose up -d --build
```

## Reverse proxy e HTTPS

Em produção, exponha a aplicação atrás de HTTPS. Nginx, Caddy, Traefik ou o proxy gerenciado do provedor podem terminar TLS e encaminhar para a porta interna da aplicação.

Quando a conexão pública for HTTPS, configure:

```text
SC_HTTPS=1
```

Isso permite que o cookie de sessão use a flag `Secure`.

## Checklist antes de publicar

- [ ] trocar a senha administrativa;
- [ ] configurar WhatsApp oficial;
- [ ] confirmar endereço e horários;
- [ ] revisar taxas e regiões;
- [ ] substituir fotos de demonstração;
- [ ] configurar HTTPS;
- [ ] configurar volume persistente;
- [ ] configurar backups;
- [ ] executar `npm run check`;
- [ ] validar `/api/health`;
- [ ] testar compra real ponta a ponta;
- [ ] testar cancelamento e devolução de estoque.

## GitHub Actions

O workflow `.github/workflows/validate.yml` valida a aplicação antes de deploy. Um deploy automático pode ser conectado futuramente ao provedor escolhido sem criar uma nova versão principal.
