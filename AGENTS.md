# AGENTS.md

## Como trabalhar neste repositório

- Preserve a arquitetura existente: Angular 19, bootstrap por `AppModule`, NgModules por padrão, lazy loading por módulo nas áreas principais e componentes standalone apenas onde já existe esse padrão, especialmente em auth.
- Antes de alterar código, verifique `git status` e preserve alterações locais/WIP não relacionadas.
- Quando alterações forem solicitadas, trabalhe em feature branch. Nunca faça push direto para `main`.
- Nunca inicie ou dispare deploy de produção. Push em `main` dispara deploy de produção no Firebase.
- Não faça commit nem push sem pedido explícito do mantenedor.

## Código e organização

- Coloque consumo HTTP em `src/app/core/services`, usando `HttpClient`, `environment.apiBaseUrl`, `HttpParams` e tipos explícitos.
- Mantenha interfaces, models e DTOs em `src/app/shared/models` ou junto ao service somente quando esse já for o padrão local.
- Reutilize `SharedModule`, `WidgetsModule`, `DialogComponent`, `ButtonComponent`, `TableComponent` e `InputWrapperComponent` quando aplicável.
- Para páginas do dashboard/admin, siga os padrões existentes de `loading`, `errorMessage`, filtros simples, paginação, cards/tabelas Tailwind e feedback visual.
- Não introduza outro state management global sem necessidade clara; o projeto usa observables, subscriptions locais e `BehaviorSubject<ViewState<T>>` em telas mais complexas.

## Contratos HTTP e ecossistema BraFurries

- Não invente contratos de backend no frontend.
- Quando trabalhando no workspace BraFurries, consulte a implementação real da API antes de criar ou alterar DTOs HTTP no frontend.
- Se o contrato necessário ainda não existir, identifique a alteração necessária na API em vez de criar um contrato apenas no frontend.
- Coordene mudanças incompatíveis entre produtores e consumidores, preferindo compatibilidade retroativa quando possível.
- Alterações em contratos de funcionalidades integradas ao Coddy/bot Discord também devem ser verificadas no repositório correspondente.

## Autenticação, autorização e segurança

- Use `UserService`, `DashboardGuard`, `authTokenInterceptor` e `UserPermissionsService`; não crie storage/token paralelo.
- A sessão atual fica em `localStorage` na chave `logged_user`; o interceptor anexa `Authorization` quando há token.
- Não trate esconder botões no frontend como autorização suficiente. A API deve validar roles e permissões.
- Não exponha secrets, tokens, service accounts, caches Firebase ou valores privados em logs/documentação.
- Não execute fluxos que façam chamadas HTTP mutáveis contra ambientes reais sem confirmação explícita.

## Execução local e validação

- Prefira `npm run build` como validação padrão.
- `npm start` não deve ser usado como validação padrão, pois aponta para `production-api`.
- Iniciar o frontend pode fazê-lo conversar com serviços reais.
- Só inicie a aplicação quando solicitado explicitamente e depois de confirmar que o ambiente/API usado é seguro e não produtivo para operações mutáveis.
- O repositório não possui script de lint no `package.json`; não assuma que lint existe.

## Identidade visual

- Use os tokens e padrões existentes: fontes Amaranth/Archivo, Tailwind, SCSS global e cores `braDark`, `braPurple`, `braCyan`, `braYellow`, `braMagenta`.
- Não proponha nem implemente um novo design system sem pedido explícito.
- Componentes existentes devem ser preferidos à duplicação quando cobrirem o caso.

## Ficha administrativa de usuários WIP

- A ficha administrativa de usuários está em desenvolvimento e deve ser preservada até tarefa explícita de alteração.
- Métodos mockados no `AdminService`, interfaces TypeScript, dados hardcoded e ações da ficha de usuário não representam contratos definitivos da API.
- Não crie nem modifique backend exclusivamente para reproduzir esses mocks.
- Em workspace multi-repositório, verifique Coddy e API para determinar quais dados realmente existem e qual deve ser o contrato final.
