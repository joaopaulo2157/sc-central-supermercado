# SC Central — Railway + Supabase

## Arquitetura

```text
Navegador
   |
   v
Railway / Node.js
   |
   v
Supabase PostgreSQL + Storage
```

O Railway não armazena mais o banco SQLite.
Não é necessário Volume para banco nem para imagens novas.

## Variables no Railway

Cadastre:

```text
HOST=0.0.0.0
SC_HTTPS=1
SC_SESSION_HOURS=8

SUPABASE_URL=https://khxpudotthujmpmjbcci.supabase.co
SUPABASE_SECRET_KEY=SUA_CHAVE_SB_SECRET

SC_ADMIN_USER=admin
SC_ADMIN_PASSWORD=SUA_SENHA_FORTE
```

`SUPABASE_SECRET_KEY` deve existir somente no servidor.

A publishable key não substitui a service role/secret key para o backend,
porque as tabelas administrativas usam RLS e não permitem gravação pública.

## Antes do deploy

No SQL Editor do Supabase execute:

```text
SUPABASE_RPC_PEDIDOS.sql
```

Ele cria as duas operações transacionais responsáveis por:
- criar pedido;
- reservar estoque;
- atualizar cliente;
- cancelar/reativar pedidos;
- devolver/reservar estoque novamente.

## Depois do deploy

Abra:

```text
https://sccentral.up.railway.app/api/health
```

O esperado é:

```json
{
  "ok": true,
  "database": "PostgreSQL (Supabase)",
  "databaseProvider": "Supabase",
  "projectRef": "khxpudotthujmpmjbcci",
  "storage": {
    "platform": "supabase",
    "provider": "PostgreSQL",
    "persistent": true,
    "writable": true
  }
}
```

Depois teste:
1. login no painel;
2. alterar configuração;
3. cadastrar produto;
4. enviar imagem;
5. criar pedido;
6. reiniciar/redeploy Railway;
7. confirmar que os registros continuam no Supabase.


Compatibilidade: o backend também aceita SUPABASE_SERVICE_ROLE_KEY para chaves legadas.
