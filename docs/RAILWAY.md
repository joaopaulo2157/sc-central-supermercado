# Railway — configuração final do SC Central V6 FINAL

O repositório já contém `railway.json` e `Dockerfile`.

O Railway deverá usar automaticamente:

- Dockerfile como builder;
- `/api/health` como health check;
- timeout de health check de 300 segundos;
- restart `ON_FAILURE`;
- até 10 tentativas de restart.

## 1. Criar projeto

No Railway:

1. `New Project`
2. `Deploy from GitHub repo`
3. Escolha `joaopaulo2157/sc-central-supermercado`
4. Aguarde o primeiro build

## 2. Variáveis obrigatórias

No serviço > `Variables`, cadastre:

```text
SC_ADMIN_USER=admin
SC_ADMIN_PASSWORD=UMA_SENHA_FORTE
```

Opcionalmente:

```text
SC_SESSION_HOURS=8
```

Você não precisa cadastrar `PORT`: Railway fornece essa variável.

Você também não precisa cadastrar `SC_HTTPS`: a aplicação reconhece automaticamente o ambiente Railway e marca o cookie de sessão como seguro.

## 3. Volume persistente

Adicione um Railway Volume ao mesmo serviço.

Use Mount Path:

```text
/app/storage
```

O Railway injeta automaticamente:

```text
RAILWAY_VOLUME_MOUNT_PATH=/app/storage
```

A V6 utiliza essa variável automaticamente.

O conteúdo persistente ficará assim:

```text
/app/storage/
├── sc-central.sqlite
└── uploads/
```

Não configure outro volume para esta versão.

## 4. Domínio público

No serviço:

`Settings` → `Networking` → `Generate Domain`

Depois disso a loja ficará disponível no domínio fornecido pelo Railway.

Painel:

```text
https://SEU-DOMINIO/login.html
```

Health check:

```text
https://SEU-DOMINIO/api/health
```

## 5. GitHub Auto Deploy

Mantenha a branch de produção como `main`.

Quando houver push em `main`, o serviço conectado ao GitHub poderá disparar um novo deploy automaticamente.

## 6. Segurança antes de uso real

Antes de divulgar:

- use uma senha administrativa forte;
- configure o número oficial do WhatsApp;
- confira regiões/taxas/pedido mínimo;
- troque imagens demonstrativas pelas oficiais;
- teste pedido completo;
- mantenha backup do volume.

## 7. Importante

GitHub Pages não é usado para executar a aplicação completa. O site público deve apontar para o domínio do Railway (ou para um domínio próprio conectado ao Railway).

## Verificação obrigatória de persistência

Depois de conectar o Volume e redeployar, abra `/api/health` e confirme:

```text
persistent: true
volumeMounted: true
writable: true
```

Consulte `docs/PERSISTENCIA-RAILWAY.md`.
