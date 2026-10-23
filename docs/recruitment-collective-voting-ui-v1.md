# Recrutamento V1 — interface de votação coletiva (incremento)

## Responsabilidades e dependências

Este recorte adiciona UI ao motor privado da [API #37](https://github.com/BraFurries/BraFurries-API/pull/37) e à migration do [Database #17](https://github.com/BraFurries/BraFurries-Database/pull/17). Front não decide elegibilidade, não calcula decisões válidas e não interpreta votos para transição de etapas. Coddy não participa.

- **Editor da etapa**: permite `minimumVotes` (2–20), `tiePolicy` (`REJECT_ON_TIE` ou `MANAGER_OVERRIDE`) apenas quando `reviewMode=COLLECTIVE` e `decisionMode=AUTOMATIC_VOTE`. O backend usa versão congelada e optimistic `expectedRevision`. A publicação de processos com esta opção **continua bloqueada** na API até revisão end-to-end.
- **Triagem do avaliador**: depois de submeter parecer, consulta primeiro `GET /votes/availability` com acesso restrito ao próprio avaliador; somente etapas que aceitam votação exibem o formulário. Em seguida, permite consultar `GET /votes/mine` e enviar explicitamente `POST /votes/mine` com `APPROVE` ou `REJECT`. O avaliador nunca recebe placar nem votos de terceiros. O backend garante capacidade, designação, vínculo ativo, parecer prévio e voto único. A autorização de voto ainda é validada sob lock na API; o GET de disponibilidade apenas orienta o Front.
- **Mesa de decisões**: apenas após a consulta privilegiada dos pareceres, apresenta `GET /votes/tally` para etapas com decisão `AUTOMATIC_VOTE`. O gestor vê totais, quórum e política. A consolidação exige confirmação, estágio correto, pareceres mínimos e nenhuma resposta truncada no painel. Para `MANAGER_OVERRIDE`, exige justificativa de 10–1800 caracteres. `POST /votes/finalize` usa maioria no servidor; o gestor jamais pode sobrescrever a maioria com um resultado escolhido.
- **Pós-consolidação**: a UI limpa pareceres, placar e justificativa e atualiza a fila. Nenhum candidato vê resultado antes da futura publicação manual.

## Segurança e concorrência

- Todo request usa `communityId`, `applicationId` e `stageId` da instância selecionada, protegidos novamente pela API.
- Componentes descartam respostas antigas ao trocar de candidatura/Community ou serem destruídos.
- Confirmação visual não substitui autenticação, autorização, lock transacional ou constraint única.
- Falha HTTP 409 nunca é tratada como sucesso e exige reconsulta.
- Gabaritos, avaliações de outros membros e identidades de votantes não são exibidos na triagem.

## Gate e rollout

A feature permanece OFF. Nenhuma migração em produção, merge, deploy ou envio de voto real é feito nesta PR. Os testes são focados e o build é obrigatório; liberar a pré-publicação de processos com `AUTOMATIC_VOTE` exige revisão funcional integrada e demais fluxos da V1.
