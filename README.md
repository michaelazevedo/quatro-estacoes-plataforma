# Quatro Estações

Plataforma integrada para a operação da sorveteria: site público, catálogo e painel de inteligência de custos.

## Executar localmente

O projeto é uma SPA sem dependências externas obrigatórias. Na pasta do projeto, execute:

```powershell
python -m http.server 4173
```

Abra `http://localhost:4173`.

## O que já está funcional

- Site público responsivo com catálogo, filtros e busca.
- Painel de gestão com visão geral, produtos, matérias-primas e custos.
- Cadastro de produtos e matérias-primas persistido no `localStorage`.
- Indicadores de estoque mínimo, margem e valor em estoque.
- Pesquisa de preços sob demanda com fluxo explícito de aprovação.
- Recalculo de produtos impactados quando um preço é aprovado.
- Simulação de alteração de custo sem alterar os dados salvos.
- Dados iniciais carregados de `data.json`.
- Funciona em GitHub Pages sem backend.

## Evolução planejada

As regras centrais estão concentradas em `app.js` e os dados iniciais usam IDs relacionados (`product.recipe[].material`). Na versão estática, novos cadastros são salvos no navegador com `localStorage`; o arquivo `data.json` funciona como carga inicial e não pode ser alterado pelo navegador publicado.

O próximo passo natural é substituir o repositório local por Supabase/PostgreSQL, mantendo o fluxo:

`matéria-prima → preço normalizado → ficha técnica → custo → margem → decisão`

Antes de conectar pesquisa real, configure um provider backend (por exemplo, uma Search API) e mantenha chaves apenas no servidor.
