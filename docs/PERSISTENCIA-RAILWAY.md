# Persistência do banco no Railway — SC Central V6 FINAL

A V6 usa SQLite. No Railway, o filesystem normal do container é efêmero.
Banco, cadastros, configurações, pedidos e imagens precisam ficar em um Railway Volume.

## Configuração obrigatória

No MESMO serviço/ambiente que executa o SC Central, adicione um Volume com:

```text
Mount Path: /app/storage
```

O Railway fornece automaticamente:

```text
RAILWAY_VOLUME_MOUNT_PATH=/app/storage
```

A V6 agora dá prioridade ao Volume real do Railway, mesmo que existam variáveis antigas
`SC_STORAGE_DIR`, `SC_DB_PATH` ou `SC_UPLOAD_DIR`.

## Como confirmar

Abra:

```text
https://SEU-DOMINIO/api/health
```

O resultado correto deve conter:

```json
{
  "storage": {
    "platform": "railway",
    "mode": "railway-volume",
    "persistent": true,
    "writable": true,
    "volumeMounted": true
  }
}
```

Se `persistent` ou `volumeMounted` estiverem `false`, o Volume não está ligado ao serviço/ambiente correto.

## Proteção adicionada

Sem Volume persistente no Railway, a V6 bloqueia gravações de configurações, cadastros,
usuários e pedidos e retorna:

```text
HTTP 503
PERSISTENT_STORAGE_REQUIRED
```

Assim o painel não informa sucesso para dados que seriam perdidos.

## Diagnóstico administrativo

Administrador autenticado:

```text
GET /api/admin/storage
```

Retorna caminho do banco, caminho do Volume, modo, capacidade de escrita, tamanhos dos
arquivos SQLite/WAL e contagens de registros.

Também existe:

```text
POST /api/admin/storage/checkpoint
```

para executar checkpoint do WAL antes de inspeções/backups.

## Teste final

1. Confirme `persistent: true`.
2. Altere uma configuração.
3. Cadastre um produto.
4. Atualize a página.
5. Reinicie/redeploy o Railway.
6. Confirme que os dados continuam cadastrados.
