# Autosave da prova — V1

- O formulário só habilita entradas após `GET /draft` restaurar a última versão autorizada do candidato para Community, candidatura, etapa e tentativa.
- `ngModelChange` agenda `PUT /draft` após 1,2 segundo de inatividade e envia `expectedRevision`. Ao sair do foco, tenta disparar imediatamente alterações ainda não persistidas.
- Falha transitória mantém as respostas em memória, mostra estado não salvo e opção de retry. `409` de outra aba ou tentativa encerrada **não** atualiza automaticamente a revisão, evitando sobrescrever a versão nova.
- O envio definitivo usa o snapshot completo em `POST /submit`, sem aguardar o debounce: pontuação e decisão não dependem do rascunho.
- Sem armazenamento local das respostas, sem garantias de salvar digitação imediatamente antes de desligamento brusco/offline. O candidato deve observar o estado de salvamento exibido.
- Tentativa bloqueada, expirada, mudança de Community e logout/saída da tela limpam o estado local da prova.
- Depende de API #45, Database #24, drafts anteriores; feature gate permanece OFF, sem merge/deploy.
