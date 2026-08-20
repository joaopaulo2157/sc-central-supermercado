# Política de Segurança

## Versão suportada

A versão mantida atualmente é a **V6 FINAL**.

## Como relatar uma vulnerabilidade

Não publique senhas, tokens, cookies, chaves ou detalhes exploráveis em uma Issue pública.

Prefira o recurso **Security / Report a vulnerability** do GitHub, quando habilitado no repositório. Se esse recurso não estiver disponível, entre em contato de forma privada com o responsável pelo repositório.

Inclua:

- componente afetado;
- passos mínimos para reprodução;
- impacto observado;
- ambiente utilizado;
- sugestão de correção, se houver.

## Práticas obrigatórias

- nunca versionar `.env`;
- nunca versionar banco de produção;
- trocar credenciais padrão;
- usar HTTPS em produção;
- limitar acesso ao painel;
- manter backups;
- revisar logs sem expor dados sensíveis;
- manter Node.js atualizado dentro da linha suportada pelo projeto.
