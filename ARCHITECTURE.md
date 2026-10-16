# ARCHITECTURE.md

## Propósito

Este repositório contém o frontend Angular do ecossistema BraFurries. Pelo código existente, a aplicação entrega:

- site público institucional da BraFurries;
- páginas públicas de regras, termos, privacidade, contestação e documentação;
- autenticação local e social;
- dashboard autenticado em `/painel`;
- visualização e gerenciamento de eventos/meets;
- convites públicos de transferência de evento;
- área administrativa em `/painel/admin`;
- uma ficha administrativa de usuários em desenvolvimento.

## Stack e versões

As versões estão declaradas em `package.json` e `.nvmrc`:

- Angular `^19.2`;
- Angular CLI `^19.2.5`;
- Angular Material/CDK `^19.2`;
- TypeScript `~5.7.2`;
- RxJS `~7.8.0`;
- Zone.js `~0.15.0`;
- Tailwind CSS `^3.4.17`;
- ngx-mask `^19.0.7`;
- Node `20.11.1` pela `.nvmrc`;
- npm `>=8.0.0` pelo campo `engines`.

O `tsconfig.json` habilita `strict`, `strictTemplates`, `strictInjectionParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch` e outras checagens estritas.

## Bootstrap

O entrypoint é `src/main.ts`, que executa:

```ts
platformBrowserDynamic().bootstrapModule(AppModule)
```

`src/app/app.module.ts` declara `AppComponent`, importa `BrowserModule`, `BrowserAnimationsModule`, `AppRoutingModule` e `CoreModule`, registra locale `pt-BR` e fornece `HttpClient` com o interceptor funcional `authTokenInterceptor`.

`src/app/app.component.html` contém o `router-outlet` raiz.

## Organização de pastas

Estrutura principal observada:

- `src/app/core`: guards, interceptors, services, models e layouts centrais;
- `src/app/shared`: shared module, material module, componentes reutilizáveis e models compartilhados;
- `src/app/widgets`: widgets de formulário, especialmente `InputWrapperComponent`;
- `src/app/modules/home`: área pública;
- `src/app/modules/auth`: rotas e componentes de autenticação;
- `src/app/modules/dashboard`: área autenticada;
- `src/app/modules/dashboard/eventos`: listagem, detalhe, formulário e gerenciamento de eventos;
- `src/app/modules/dashboard/admin`: área administrativa;
- `src/environments`: configuração de ambientes;
- `src/styles`: SCSS global, tokens, base, layout e componentes;
- `src/assets`: imagens e exemplos de design.

## Angular Modules e Standalone Components

O projeto é predominantemente baseado em NgModules.

Established Patterns:

- `AppModule`, `HomeModule`, `DashboardModule`, `EventosModule`, `AdminModule`, `SharedModule`, `WidgetsModule` e módulos de routing organizam a aplicação.
- A maioria dos componentes declara `standalone: false`.
- O `angular.json` configura schematics para gerar componentes, directives e pipes com `standalone: false`.

Exceção existente:

- As rotas de autenticação usam componentes standalone carregados por `loadComponent`: login, social-login, social-register, register, confirm-email, forgot-password e reset-password.

Essa combinação é um padrão híbrido real do código atual; não implica migração geral para standalone.

## Routing e lazy loading

`src/app/app-routing.module.ts` define:

- rotas públicas de auth importadas de `authRoutes`, protegidas com `DashboardGuard` em modo `publicOnly`;
- `/painel`, protegido com `DashboardGuard` em modo `authenticatedOnly`, carregando `DashboardModule` por `loadChildren`;
- rota raiz carregando `HomeModule` por `loadChildren`;
- wildcard redirecionando para `''`.

`DashboardModule` usa `BaseLayoutDashboardComponent` como layout autenticado e define filhos:

- `/painel`;
- `/painel/perfil`;
- `/painel/servidores`;
- `/painel/eventos`, lazy-loaded;
- `/painel/admin`, lazy-loaded.

`EventosModule` define:

- `/painel/eventos`;
- `/painel/eventos/gerenciar`;
- `/painel/eventos/novo`;
- `/painel/eventos/:id/editar`, com `isNumericGuard`;
- `/painel/eventos/:id`, com `isNumericGuard`.

`AdminModule` define:

- `/painel/admin/usuarios/:id`, rota WIP de ficha de usuário fora do layout de abas;
- layout `AdminComponent` com filhos `visao-geral`, `usuarios`, `parceiros`, `bot-coddy`, `metricas`, `avisos`.

## Guards

`DashboardGuard` implementa `CanActivate` e `CanLoad`.

- Em `publicOnly`, redireciona sessão válida para `/painel`.
- Em `authenticatedOnly`, permite sessão válida.
- Sem sessão válida, redireciona para `/login` com `returnUrl`.
- Usa `UserService.ensureValidSession()`, que tenta refresh quando o access token expirou.

`isNumericGuard` é um `CanMatchFn` que aceita somente segmentos numéricos para rotas de evento por ID.

## Interceptor HTTP

`authTokenInterceptor` é registrado em `AppModule` por `provideHttpClient(withInterceptors(...))`.

Comportamento:

- busca `accessToken` e `tokenType` em `UserService`;
- ignora requisições sem token;
- ignora caminhos públicos detectados como `/public` ou `/meta/locales`;
- adiciona header `Authorization: <tokenType> <token>`.

Não há interceptor global observado para tratamento de 401/403, retry, toast ou normalização de erros.

## Autenticação e sessão

`UserService` concentra login, cadastro, confirmação de e-mail, recuperação de senha, reset, login social, refresh, logout, dados de usuário e dashboard.

Sessão:

- chave `localStorage`: `logged_user`;
- estrutura interna: `user`, `accessToken`, `refreshToken`, `tokenType`, `expiresAt`;
- login/cadastro social gravam sessão com `setSession`;
- logout chama `/auth/logout` quando há refresh token e sempre limpa a sessão ao final;
- refresh chama `/auth/refresh` com `{ refresh_token }`;
- `getUserDetails()` atualiza o usuário em sessão quando possível e usa fallback para a sessão local em caso de erro.

Login social:

- `startSocialLogin(provider, returnUrl)` grava `social_login_return_url` em `sessionStorage`;
- redireciona para `${apiBaseUrl}/auth/oauth2/${provider}`;
- callback aceita tokens diretamente em query/hash ou troca `code` em `/auth/social-login`;
- callback também trata `registration_token` e `requires_registration`.

## Autorização e permissões

`User` possui `roles: string[]` e `permissions: string[]`.

`UserPermissionsService`:

- `isAdmin()` procura fragmento `admin`;
- `hasPermissionFragment()` normaliza roles/permissões removendo acentos e caracteres não alfanuméricos.

Uso observado:

- exibição do menu Administração no dashboard;
- controles admin/eventos;
- permissões de staff de evento como `mngagenda`, `editevent`, `mngstaff`.

Importante: esses controles influenciam UI e navegação. A autorização real precisa ser validada também pela API; esconder botões não é suficiente.

## Services e consumo da API

Services HTTP ficam em `src/app/core/services`.

Padrão consolidado:

```text
Route -> Component/Page -> Service -> HttpClient -> API
```

Os services montam endpoints manualmente com `environment.apiBaseUrl`, tipam respostas com interfaces TypeScript e retornam `Observable<T>`.

### UserService

Endpoints observados:

- `POST /auth/login`;
- `POST /auth/register`;
- `POST /auth/confirm-email`;
- `POST /auth/forgot-password`;
- `POST /auth/reset-password`;
- `POST /auth/social-register`;
- redirect para `/auth/oauth2/{provider}`;
- `POST /auth/social-login`;
- `POST /auth/logout`;
- `POST /auth/refresh`;
- `GET /user`;
- `GET /user/me/dashboard`;
- `GET /admin/users/reliability`.

`AuthResponse` aceita campos snake_case e camelCase para tokens e expiração.

### EventService

Endpoints observados:

- `GET /meta/locales`;
- `GET /events/availability` com `localeId`, `city`, `date`;
- `GET /events/minidash`;
- `GET /events/minidash/admin`;
- `GET /events/pending-approval`;
- `GET /events/partner`;
- `GET /events/common`;
- `GET /events/{eventId}`;
- `GET /events/{eventId}/staff`;
- `POST /events/{eventId}/staff`;
- `PATCH /events/{eventId}/staff/{userId}`;
- `DELETE /events/{eventId}/staff/{userId}`;
- `POST /events`;
- `PATCH /events/{eventId}`;
- `PATCH /events/{eventId}/schedule`;
- `PATCH /events/{eventId}/approve`;
- `PATCH /events/{eventId}/reject`;
- `POST /events/{eventId}/partner`;
- `DELETE /events/{eventId}/partner`;
- `DELETE /events/{eventId}`;
- `PUT /events/{eventId}/logo` com `FormData`;
- `DELETE /events/{eventId}/logo`;
- `POST /events/{eventId}/transfer-request`.

Filtros de eventos:

- `userId` é enviado como query `idUsuario`;
- `weekStart`;
- `month`;
- `page`;
- `size`.

Paginação de eventos usa:

```ts
items: T[];
page: number;
size: number;
totalItems: number;
totalPages: number;
hasNext: boolean;
hasPrevious: boolean;
```

### AdminService

Base URL:

```ts
private readonly baseUrl = `${environment.apiBaseUrl}/admin`;
```

Endpoints reais aparentes no service:

- `GET /admin/session`;
- `GET /admin/overview`;
- `GET /admin/metrics?period=...`;
- `GET /admin/bot/status`;
- `GET /admin/users`;
- `PATCH /admin/users/{id}/status`;
- `PATCH /admin/users/{id}/role`;
- `GET /admin/partners`;
- `POST /admin/partners`;
- `PATCH /admin/partners/{id}`;
- `PATCH /admin/partners/{id}/status`;
- `DELETE /admin/partners/{id}`;
- `GET /admin/announcements/config`;
- `POST /admin/announcements`, com JSON ou `FormData`.

Filtros admin:

- usuários: `page`, `pageSize`, `search`, `status`, `role`;
- parceiros: `status`, `category`;
- parâmetros vazios ou `undefined` são omitidos por `buildParams`.

Paginação de usuários admin usa:

```ts
items: AdminUserItem[];
pagination: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
```

Essa paginação difere da paginação de eventos.

### InviteService

Endpoints:

- `GET /invites/event-transfer/{token}`;
- `POST /invites/{token}/{accept|reject}`.

### DiscordService

Usa URL externa hardcoded:

```text
https://discord.com/api/v10/invites/brafurries?with_counts=true
```

## Models, interfaces e DTOs

Modelos compartilhados ficam principalmente em:

- `src/app/shared/models/user.ts`;
- `src/app/shared/models/api/auth/authResponse.ts`;
- `src/app/shared/models/api/dashboard/dashboardResponse.ts`;
- `src/app/shared/models/api/events/event.ts`;
- `src/app/shared/models/api/admin/admin.ts`;
- `src/app/shared/models/api/errors/error.ts`.

Também existem interfaces junto aos services, especialmente em `EventService` e `UserService`.

Não há geração automática de client HTTP ou schema OpenAPI no repositório. Os contratos são duplicados manualmente no frontend e precisam ser conferidos contra a API antes de alterações.

## Tratamento de erros HTTP

Padrões observados:

- componentes tratam erro localmente em `subscribe({ error })`;
- telas de auth leem `ApiErrorResponse.message` e `ApiErrorResponse.details`;
- várias telas usam `errorMessage`;
- eventos usam `hasError` e `ViewState<T>`;
- algumas operações ainda usam `alert()`;
- `UserService.logout()` captura erro e retorna `false`;
- `UserService.refreshToken()` limpa sessão em erro;
- `getUserDetails()` faz fallback para usuário em sessão.

Não há camada global única para erros HTTP.

## Loading, empty states e feedback

Padrões observados:

- flags locais como `isLoading`, `loading`, `isSubmitting`, `isProcessing`;
- `BehaviorSubject<ViewState<T>>` em telas de eventos;
- mensagens textuais de erro/loading no template;
- cards e tabelas com estados condicionais;
- dialogs por `MatDialog` para confirmação ou aviso em alguns fluxos.

Empty states existem em páginas de eventos e dashboards de forma localizada, não como componente global único.

## Formulários e validação

Reactive Forms são usados em:

- login;
- cadastro;
- social-register;
- forgot/reset password;
- formulário de evento;
- edição de agenda de evento;
- controles de staff/transferência em eventos.

Validações comuns:

- `Validators.required`;
- `Validators.email`;
- `Validators.requiredTrue`;
- `Validators.maxLength`.

Admin usa `FormsModule` e `ngModel` em filtros e telas simples.

`InputWrapperComponent` implementa `ControlValueAccessor` e suporta tipos como `text`, `longText`, `number`, `select`, `date`, `radio`, `checkbox`, `password` e `price`.

## Upload e download

Upload observado:

- logo de evento via `PUT /events/{id}/logo` com `FormData` contendo `file`;
- anúncios admin via `POST /admin/announcements` com `FormData` quando há imagem.

Preview local de logo usa `FileReader`.

Download/export observado:

- a ficha WIP de usuário contém botão visual de exportar log CSV, mas não há implementação HTTP real aparente.

## Cache e estado

Não há NgRx, Akita ou outro state management global observado.

Padrões usados:

- estado local em propriedades de componente;
- `BehaviorSubject<ViewState<T>>` em listagens/eventos;
- `combineLatest` para compor loading;
- cache local `Map` no formulário de evento para respostas de disponibilidade.

Não foram encontrados Angular signals (`signal`, `computed`, `effect`) no código analisado.

## RxJS

Operadores/padrões usados:

- `Observable<T>` como retorno dos services;
- `map`, `tap`, `switchMap`, `catchError`, `finalize`;
- `debounceTime`, `distinctUntilChanged`, `filter`;
- `combineLatest`, `merge`;
- `of`, `EMPTY`, `throwError`;
- `BehaviorSubject` para estado de view.

## Área pública

`HomeModule` contém:

- home;
- sobre-nos;
- termos de uso;
- privacidade;
- contestação;
- regras;
- documentação lazy-loaded;
- convite público de transferência de evento.

Páginas públicas usam `ExternalModule` para header/footer em várias rotas e `SeoService` para metatags.

## Dashboard autenticado

`BaseLayoutDashboardComponent` fornece:

- sidebar desktop;
- menu mobile;
- menu de usuário;
- logout com overlay;
- links para início, servidores, eventos e administração quando `isAdmin()`;
- `router-outlet` para as páginas internas.

O layout usa Tailwind, imagens do logo BraFurries e avatar gerado por `ui-avatars` quando necessário.

## Eventos

Eventos têm a implementação funcional mais detalhada do repositório:

- listagem geral com minidash, filtros por semana/mês e paginação;
- gerenciamento com visões para pendentes, parceiros e comuns;
- detalhe de evento com aprovação, parceria, edição de agenda, staff e transferência de titularidade;
- formulário de criação/edição com validações, disponibilidade, upload/remoção de logo e regras de permissão.

Permissões de evento:

- admin pode operar controles amplos;
- criador do evento tem permissões específicas;
- staff pode ter `mngagenda`, `editevent`, `mngstaff`;
- normalização remove acentos e caracteres não alfanuméricos.

## Área administrativa

Established Patterns:

- `AdminModule` é lazy-loaded em `/painel/admin`;
- `AdminComponent` cria cabeçalho, abas e `router-outlet`;
- páginas usam `AdminService`;
- estados locais `loading` e `errorMessage`;
- filtros com `ngModel`;
- tabelas/cards Tailwind;
- labels são mapeados em métodos TypeScript;
- paginação manual em usuários;
- upload opcional em avisos;
- botões de ação atualizam estado local após resposta HTTP.

Páginas:

- `visao-geral`: carrega `AdminOverview`, status de sistema/bot e atividades recentes;
- `usuarios`: lista usuários, busca por texto, filtra por status/role, pagina, altera status;
- `parceiros`: filtra por status/categoria e altera status;
- `bot-coddy`: carrega status do bot; lista módulos hardcoded no componente;
- `metricas`: carrega métricas por período;
- `avisos`: carrega config, seleciona destinos, envia anúncio com ou sem imagem.

Não há guard admin específico observado em `/painel/admin`; o acesso ao menu depende de `UserPermissionsService.isAdmin()`, mas a rota está sob o guard autenticado geral. A API deve impor autorização administrativa.

## Componentes compartilhados

`SharedModule` exporta:

- `MaterialModule`;
- `ReactiveFormsModule`;
- `RouterModule`;
- `ButtonComponent`;
- `TableComponent`.

Observação: `DialogComponent` é declarado, mas não exportado em `SharedModule`; ainda é usado via `MatDialog` por import direto no TypeScript.

`MaterialModule` importa/exporta um subconjunto do Angular Material, com vários módulos comentados. Usados/ativos incluem botões, checkbox, datepicker, dialog, form-field, icon, input, menu, radio, ripple, select, native date e ngx-mask.

## Styling e design system existente

O projeto usa:

- Tailwind CSS com `content: ['./src/**/*.{html,ts,scss}']`;
- SCSS global em `src/styles/main.scss`;
- Angular Material prebuilt theme `azure-blue.css`;
- fontes Google Amaranth e Archivo;
- tokens SCSS em `src/styles/abstracts/_variables.scss`;
- tokens Tailwind em `tailwind.config.js`.

Cores de marca:

- `braDark`: `#262626`;
- `braPurple`: `#8a3594`;
- `braCyan`: `#45bced`;
- `braYellow`: `#febf10`;
- `braMagenta`: `#ee4092`;
- `discord`: `#5865F2`.

SCSS também define variações darker/lighter das cores de marca e tons neutros.

Responsividade:

- Tailwind breakpoints como `md:`, `lg:`, `sm:`;
- sidebar mobile off-canvas no dashboard;
- tabelas com `overflow-x-auto`;
- grids responsivos em páginas de eventos/admin.

Não há design system formal separado. O que existe são tokens, componentes pequenos e padrões visuais aplicados diretamente nos templates.

## Ambientes e configuração

Arquivos:

- `src/environments/environment.common.ts`;
- `src/environments/environment.ts`;
- `src/environments/environment.production.ts`.

`environment.common.ts` contém links sociais públicos.

`environment.ts`:

```ts
production: false
apiBaseUrl: 'http://localhost:8080'
```

`environment.production.ts`:

```ts
production: true
apiBaseUrl: 'https://api.brafurries.com.br'
```

`angular.json` define file replacement para `production` e `production-api`, substituindo `environment.ts` por `environment.production.ts`.

Importante:

- `npm start` executa `ng serve --configuration production-api`;
- `start:production-api` também usa `production-api`;
- `start:local-api` usa `local-api`;
- iniciar o frontend pode fazê-lo conversar com serviços reais;
- uma configuração local não deve ser assumida como segura para operações mutáveis sem confirmação.

## Comandos

Scripts em `package.json`:

- `npm start`: `ng serve --configuration production-api`;
- `npm run start:local-api`: `ng serve --configuration local-api`;
- `npm run start:production-api`: `ng serve --configuration production-api`;
- `npm run build`: `ng build`;
- `npm run watch`: `ng build --watch --configuration development`;
- `npm test`: `ng test`.

Validação recomendada para agentes:

- preferir `npm run build`;
- não usar `npm start` como validação padrão;
- só iniciar a aplicação quando solicitado explicitamente e após confirmar ambiente/API seguro e não produtivo para mutações.

Não há script de lint no `package.json`.

## Testes

O projeto usa Karma/Jasmine pela configuração Angular padrão.

Arquivos `.spec.ts` existem para diversos componentes, guards e interceptor, mas a estratégia de testes é parcial e local por componente. Não há configuração e2e observada.

`npm test` inicia o runner Karma; para automação futura pode ser necessário configurar modo headless/não interativo antes de usar como validação contínua.

## Build, CI/CD e deploy

`firebase.json` configura Firebase Hosting:

- diretório público: `dist/brafurries-website/browser`;
- rewrite SPA de `**` para `/index.html`.

`.firebaserc` aponta o projeto default para `brafurries`.

GitHub Actions:

- workflow `.github/workflows/firebase-hosting-merge.yml`;
- dispara em push para `main`;
- usa Node da `.nvmrc`;
- roda `npm install` e `npm run build`;
- instala Firebase CLI;
- usa secret `FIREBASE_SERVICE_ACCOUNT_BRAFURRIES`;
- executa `firebase deploy --only hosting`.

Regras operacionais:

- nunca fazer push direto para `main`;
- push em `main` dispara deploy de produção no Firebase;
- agentes não devem iniciar ou disparar deploy de produção;
- trabalhar em feature branch quando alterações forem solicitadas.

## Secrets e configurações sensíveis

Não há secrets em `environment.ts` ou `environment.production.ts`, apenas URLs públicas e links sociais.

O workflow referencia secret do GitHub para service account Firebase. O valor não deve ser lido, impresso ou exposto.

Caches de Firebase e artefatos locais não devem ser usados como fonte de configuração sensível.

## Established Patterns

Use como referência principal para novas implementações:

- services HTTP em `core/services`;
- endpoints construídos com `environment.apiBaseUrl`;
- DTOs manuais explícitos;
- `HttpParams` para filtros e paginação;
- `FormData` para uploads;
- `DashboardGuard` para autenticação;
- `UserPermissionsService` para controles de UI baseados em roles/permissões;
- `AdminService` para endpoints administrativos;
- componentes declarados em NgModules, salvo rotas de auth standalone;
- Tailwind + SCSS com tokens BraFurries;
- layouts existentes de área pública, dashboard e admin;
- estados locais de loading/error;
- `BehaviorSubject<ViewState<T>>` nas listagens de eventos mais complexas;
- Reactive Forms em auth/eventos;
- `ngModel` em filtros e formulários simples do admin;
- `MatDialog`/`DialogComponent` para confirmações em fluxos já existentes.

## Work in Progress

### Ficha administrativa de usuários

O painel/ficha administrativa de usuários foi identificado pelo mantenedor como implementação local ainda não publicada em produção.

Arquivos relacionados incluem:

- `src/app/modules/dashboard/admin/pages/usuarios/gerenciamento/gerenciamento-usuario.component.ts`;
- `src/app/modules/dashboard/admin/pages/usuarios/gerenciamento/gerenciamento-usuario.component.html`;
- `src/app/modules/dashboard/admin/pages/usuarios/gerenciamento/gerenciamento-usuario.component.scss`;
- alterações em `AdminService`;
- alterações em `src/app/shared/models/api/admin/admin.ts`;
- exemplos em `src/assets/design-examples/membros/gerenciamento`.

Características WIP:

- rota `/painel/admin/usuarios/:id`;
- métodos mockados em `AdminService` usando `of(...).pipe(delay(...))`;
- interfaces TypeScript novas para hero, resumo, identidade, contextos, moderação, progressão, economia, VIP, formulários e auditoria;
- dados hardcoded como nomes, servidores, roles, histórico, XP, economia e formulários;
- muitas ações visuais sem persistência HTTP aparente, como salvar alterações, gerenciar cargos, ajustar XP, conceder item, gerenciar assinatura, forçar sync Discord e exportar CSV;
- UI extensa própria, com escolhas visuais que não devem ser tratadas isoladamente como design system canônico.

Regras para esse WIP:

- não usar essa ficha isoladamente para inferir novos padrões gerais;
- não tratar mocks, dados hardcoded, interfaces ou ações como contratos definitivos da API;
- não criar ou modificar backend exclusivamente para reproduzir esses mocks;
- preservar a implementação até tarefa explícita de alteração;
- em workspace multi-repositório, verificar Coddy e API para determinar quais dados realmente existem e qual deve ser o contrato final.

### Dependências cross-repository prováveis

A ficha WIP aparenta depender futuramente de dados vindos de:

- API principal;
- bot Discord/Coddy;
- possivelmente dados de comunidades/servidores, moderação, economia, VIP, formulários e auditoria.

Não é possível determinar com segurança apenas por este frontend quais desses contratos já existem no backend.

## Inconsistências conhecidas

- Uso híbrido de NgModules e standalone components.
- Paginação de eventos e paginação admin têm formatos diferentes.
- Alguns DTOs ficam em `shared/models/api`, outros são interfaces locais nos services.
- Tratamento de erro é local e inconsistente; algumas partes usam `errorMessage`, outras `hasError`, outras `alert`.
- Admin usa `ngModel`, enquanto auth/eventos usam Reactive Forms.
- `DialogComponent` é declarado no `SharedModule`, mas não exportado.
- `CoreModule` existe, mas está vazio.
- Algumas URLs externas estão hardcoded, como Discord invite e `ui-avatars`.
- Algumas páginas contêm dados hardcoded de UI, por exemplo módulos do bot em `AdminBotComponent`.
- Há comentários e exemplos de design em `src/assets/design-examples`, que devem ser tratados como referência de design/exploração, não necessariamente comportamento de produção.

## Informações não determinadas com segurança

- Contratos reais da API para a ficha administrativa WIP.
- Quais dados da ficha WIP pertencem à API, ao Coddy/bot Discord ou a outro serviço.
- Estratégia final de autorização administrativa no backend.
- Estratégia formal de versionamento de contratos API/frontend.
- Estratégia de lint, pois não há script de lint.
- Estratégia e2e, pois não há framework e2e configurado no repositório.
- Política Git completa além do risco concreto de deploy em push para `main`.
- Se ambientes locais apontam sempre para serviços seguros; isso não deve ser assumido.
