# ADR 0001: iniciar com monorepo modular

- Status: aceito
- Data: 2026-10-08

## Contexto

O produto possui muitos dominios e sera desenvolvido por varios times durante um
ano. Distribuir cada capacidade em um servico desde o primeiro dia adicionaria
custo operacional antes de os limites e volumes reais estarem validados.

## Decisao

Comecar com um monorepo e modulos de dominio isolados. Integracoes, persistencia
e transporte dependem do dominio, nunca o contrario. Capacidades com requisitos
proprios de escala ou disponibilidade poderao ser extraidas posteriormente.

## Consequencias

- desenvolvimento e testes locais mais simples;
- contratos e padroes compartilhados ficam centralizados;
- limites entre modulos precisam de revisao arquitetural continua;
- implantacoes independentes serao adicionadas somente quando justificadas.

