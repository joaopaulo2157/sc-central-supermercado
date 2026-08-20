# Organização do repositório

## Branch principal

`main` é a base estável da V6 FINAL.

## Pastas

- `.github/` — automações e padrões de contribuição;
- `public/` — aplicação pública e painel;
- `src/` — persistência, segurança e integrações;
- `data/` — persistência local;
- `docs/` — documentação operacional;
- `legacy-v3/` e `legacy-v5/` — histórico preservado.

## Arquivos de infraestrutura

- `Dockerfile` — imagem de produção;
- `compose.yaml` — execução local/container com volumes;
- `.dockerignore` — reduz contexto do build;
- `.editorconfig` — padroniza edição;
- `.gitattributes` — padroniza finais de linha;
- `.gitignore` — bloqueia segredos e dados locais.

## Política de versões

Correções de layout, fonte, bugs, banners, novos campos e pequenas funcionalidades continuam sendo alterações da **V6 FINAL**.

Uma nova versão principal só deve ser criada diante de mudança arquitetural ampla.
