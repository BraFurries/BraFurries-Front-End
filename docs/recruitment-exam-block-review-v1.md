# Revisão administrativa de bloqueios de provas

Na mesa de decisões da Staff, apenas em etapa objetiva corrente de candidatura em andamento,
o gestor pode abrir **Analisar possíveis bloqueios da prova**, consultar os sinais e
selecionar um BLOCKED ainda não reaberto.

A reabertura exige justificativa fundamentada de 20 a 2.000 caracteres
e confirmação explícita. A API impõe vínculo Community, capacidade
`RECRUITMENT_MANAGE_PROCESSES`, veto à própria candidatura, status atual,
limite de foco e unicidade da restauração.

Uma reabertura reinicia a MESMA tentativa com tempo integral renovado
(sem trocar número/ID). A UI não apaga o histórico nem recalcula
nota; não publica resultado. O candidato poderá retomar seu exame
na página de candidaturas pelo mecanismo já existente.

Eventos do navegador não comprovam má-fé. Gestores devem avaliar
especialmente falsos positivos por acessibilidade e sistema operacional.
A revisão só pode ocorrer antes da decisão definitiva da etapa.

A interface limpa dados confidenciais e ignora resultados HTTP antigos
ao trocar de Community/candidatura/etapa. Testes Jasmine incluídos.

Dependencies: Database #23, API companion (draft) e stacks anteriores.
`app.recruitment.enabled` continua OFF; nenhum merge/deploy autorizado.
