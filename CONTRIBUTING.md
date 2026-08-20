# Contribuindo com a V6 FINAL

A estratégia do projeto é evoluir a mesma **V6 FINAL** para correções e melhorias incrementais.

## Antes de alterar

1. Atualize a branch `main`.
2. Crie uma branch curta quando a mudança for relevante:
   - `fix/nome-do-problema`
   - `feat/nome-da-melhoria`
   - `docs/nome-da-documentacao`
3. Não remova funcionalidades existentes sem uma decisão explícita.

## Validação obrigatória

```bash
npm run check
```

Teste também o fluxo afetado na loja ou no painel.

## Commits

Use mensagens curtas e claras:

```text
fix: corrige cálculo de frete
feat: adiciona filtro de estoque
docs: atualiza guia de deploy
chore: melhora pipeline do GitHub
```

## Pull Requests

O PR deve informar:

- o que mudou;
- por que mudou;
- como foi testado;
- riscos ou migrações;
- screenshots quando a alteração for visual.

Nunca envie credenciais, `.env`, banco local ou dados reais de clientes.
