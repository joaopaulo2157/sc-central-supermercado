# Deploy no Railway — SC Central V6 FINAL

A V6 foi preparada para usar um único diretório persistente:

```text
/app/storage
```

Dentro dele ficam:

```text
/app/storage/sc-central.sqlite
/app/storage/uploads/
```

Isso permite usar um único Railway Volume para banco e imagens.

## 1. Criar o projeto

No Railway:

1. New Project
2. Deploy from GitHub repo
3. Selecione `joaopaulo2157/sc-central-supermercado`
4. Selecione o serviço criado

O `Dockerfile` do repositório já está preparado.

## 2. Variáveis

Cadastre no serviço:

```text
HOST=0.0.0.0
SC_HTTPS=1
SC_SESSION_HOURS=8
SC_ADMIN_USER=admin
SC_ADMIN_PASSWORD=COLOQUE_UMA_SENHA_FORTE
SC_STORAGE_DIR=/app/storage
```

Não é necessário fixar `PORT` se o Railway já fornecer a variável. Se precisar, use:

```text
PORT=3000
```

Configure o WhatsApp posteriormente pelo painel/variáveis previstas na aplicação; não invente um número.

## 3. Volume persistente

Adicione **um volume** ao serviço com Mount Path:

```text
/app/storage
```

O banco SQLite e as imagens enviadas pelo painel passarão a sobreviver a redeploys/restarts.

## 4. Domínio

Em Settings > Networking, gere um domínio público do Railway.

## 5. Health check

Use:

```text
/api/health
```

O retorno esperado é JSON com:

```json
{"ok":true}
```

## 6. Primeiro acesso

Após o deploy:

- acesse `/` para a loja;
- acesse `/login.html` para o painel;
- troque/configure credenciais antes de uso real;
- configure WhatsApp, endereço, horários, taxas, regiões e imagens oficiais.

## 7. Auto-deploy

Mantenha o serviço ligado ao repositório GitHub. Novos pushes na branch configurada podem gerar novos deploys automaticamente.

## 8. Importante

Não use GitHub Pages para a aplicação completa: a V6 depende de Node.js, sessões, SQLite e uploads.

Faça backups do volume persistentemente, principalmente antes de mudanças estruturais.
