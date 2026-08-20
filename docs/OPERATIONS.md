# Operação, backup e recuperação

## Dados que precisam de backup

```text
data/
public/uploads/
```

O diretório `data/` contém o banco SQLite e `public/uploads/` contém imagens enviadas pelo painel.

## Estratégia recomendada

1. faça backup automático diário;
2. mantenha múltiplas cópias;
3. armazene uma cópia fora do servidor;
4. teste restauração periodicamente;
5. registre data e origem de cada backup.

## Backup manual seguro

Para uma cópia manual simples:

1. interrompa o processo Node.js;
2. copie o arquivo SQLite e a pasta de uploads;
3. reinicie o serviço;
4. valide `/api/health`.

Evite copiar apenas parte dos arquivos `sqlite`, `sqlite-wal` e `sqlite-shm` enquanto houver escrita ativa.

## Recuperação

1. pare a aplicação;
2. substitua o banco e uploads pelas cópias válidas;
3. confira permissões do filesystem;
4. inicie a aplicação;
5. valide login, catálogo, estoque e pedidos;
6. consulte `/api/health`.

## Monitoramento básico

A hospedagem deve monitorar:

```text
GET /api/health
```

Também é recomendável acompanhar:

- uso de disco;
- memória;
- reinicializações;
- status HTTP 5xx;
- crescimento do banco;
- falhas de backup.
