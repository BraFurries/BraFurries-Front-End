# Recrutamento — provas do candidato e divulgação opcional da nota

## Entrega e autoridades

- Database PR #21: Flyway aditivo com `score_visibility` por etapa
  (`PRIVATE` padrão ou `AFTER_SUBMISSION`).
- API PR #42: a API decide elegibilidade, prazo, nota, gabarito e visibilidade.
- Front PR: editor administrativo de tentativas, nota de corte, BEST/LAST,
  prazo rígido/flexível e divulgação opcional; execução de prova pelo candidato
  em Minhas candidaturas.
- Coddy não participa. Community é tenant; UI não substitui autorização.

## O que significa mostrar a nota

- `PRIVATE` (padrão): o candidato só recebe confirmação de envio, sem nota.
- `AFTER_SUBMISSION`: cada envio validado recebe `earnedPoints`,
  `possiblePoints` e `percentage` da própria tentativa; existe também
  GET de histórico numérico exclusivo do candidato se a política permitir.
- **Nunca** incluir `passed`, `correctAnswers`, pontos por questão,
  resultado final do processo ou decisão administrativa no contrato do candidato.
- A nota de uma tentativa pode ser exibida antes do fim de outras tentativas,
  mas **não** implica aprovação na etapa/seleção; BEST/LAST ainda serão
  consolidados pelo gestor na API.
- Alterações à visibilidade exigem permissão administrativa, processo e versão
  DRAFT e revisão otimista. Uma versão publicada não pode ser reconfigurada.
- Publicação individual/em lote da seleção e recurso final permanecem pendentes.

## Runner

Cada cartão de candidatura consulta exclusivamente o exame corrente já
liberado (`AWAITING_CANDIDATE`) em sua Community. O candidato inicia ou
retoma pelo mesmo endpoint transacional, vê apenas alternativas sem gabarito,
cronômetro calculado por `expiresAt` fornecido pelo servidor, e envia
respostas somente após confirmação. O relógio da API/MariaDB governa todas
as verificações; o contador do navegador é orientativo.

A retomada preserva **a tentativa e o prazo**, não as respostas não enviadas:
autosave é trabalho futuro e a interface avisa. Após submissão, estado
sensível/cronômetro são descartados. Mudança de Community ou de candidatura
invalida callbacks antigos e limpa dados da anterior.

Em caso de erro 409, o Front não finge sucesso nem cria resultado local.
Se a Community não tiver recrutamento ativo, a UI não divulga estágios.

## Ainda não disponível

Autosave seguro de rascunho, cópia protegida apenas como dissuasão,
perda de foco e eventual bloqueio após três saídas, notificações,
publicação manual de resultado final, recursos.

Tudo em PRs draft; gate `app.recruitment.enabled` OFF.
Nenhuma migração, merge, deploy ou DML em produção.
