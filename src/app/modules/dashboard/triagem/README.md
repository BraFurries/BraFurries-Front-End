# BraFurries — triagem de candidaturas e comprovantes

Esta fatia depende da [API #32](https://github.com/BraFurries/BraFurries-API/pull/32)
e da [Front #18](https://github.com/BraFurries/BraFurries-Front-End/pull/18).
Não é o motor de avaliação, votação ou publicação de resultados.

- `/painel/comunidades/:communityId/inscricoes` mantém histórico de **inscrições próprias**
  mesmo após o prazo de inscrição. O backend retorna apenas `publicStatus=RECEIVED`.
- `/painel/comunidades/:communityId/triagem` está disponível apenas a responsáveis
  da BraFurries com a capability `RECRUITMENT_REVIEW_APPLICATIONS`.
- Gestores de processos ou publicadores não ganham automaticamente acesso
  às candidaturas, pois essa permissão é independente.
- A fila usa descoberta restrita de processos, paginação com cursor
  e IDs fornecidos pela API. A tela só lê a primeira etapa de inscrição,
  respostas e status internos; não permite aprovar, reprovar, pontuar ou votar.
- Dados de triagem são eliminados do estado do componente quando há troca de
  Community ou perda de acesso. Respostas são interpoladas como texto Angular,
  não como HTML; dados recebidos da API não substituem autorização no backend.
- O candidato não recebe conteúdo privado da Staff, status interno nem gabarito.
- Tratamento de 403/404 sem retry automático de consultas restritas.

**Validação:** Karma/Chrome Headless focado em inscrição própria, autorização da
triagem, limpeza de estado e respostas, além do build Angular completo.
Nenhum deploy, merge ou alteração de banco foi realizado nesta PR.
