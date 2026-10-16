# Follow-up do polling de logs administrativos

Após a PR #17, o painel usa exclusivamente `nextSequence` como cursor consumido.
`latestSequence` continua representando o head, inclusive quando há páginas
pendentes. Cada ciclo de auto-refresh (5 segundos quando habilitado) consome uma
página; não há catch-up em loop nem campo `hasMore`.

A carga inicial e cada página disponível adotam o `nextSequence` da API. Uma
página sem matching também pode avançar esse cursor. Respostas `unavailable`
preservam os registros e um cursor incremental existente. Se não há cursor, o
próximo ciclo tenta uma carga completa. Erros HTTP liberam o guard via `finalize`.

`cursorExpired` descarta o cursor e provoca full reload. A troca de filtro cancela
a subscription anterior, limpa os registros e o cursor, e inicia nova carga.
Uma resposta cancelada não pode substituir o filtro atual. A subscription de logs,
o timer de polling e o scroll pendente são cancelados no destroy.

O scroll da carga inicial é agendado para depois da atualização do DOM. No
incremental, só acompanha automaticamente quando o leitor está perto do fim;
caso contrário, mantém o botão de novos logs. Entradas sem sequence usam o índice
como fallback do trackBy. O estado operacional vem somente de `/bot/status`.

```text
npm run test:admin-logs
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
```

`test:admin-logs` usa um tsconfig restrito aos testes do painel e do service para
permitir validar o contrato mesmo com erros preexistentes em specs de outras
funcionalidades. Isso não substitui nem declara sucesso da suíte geral.

O novo contrato deve estar disponível no Discord e na API antes deste consumidor.
Sem `nextSequence`, o painel permanece sem cursor e tenta full load no próximo
ciclo. O ring buffer e o painel são limitados a 1000 registros; atrasos longos ou
produção contínua acima da capacidade de consumo podem causar overflow, detectado
pelo cursor expirado. A ressincronização recupera a visão recente, não o histórico
que já foi descartado.
