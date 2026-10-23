# Provas — controles opcionais de navegador

Integra o editor de rascunhos com `maxFocusLosses: null | 1..10` e
`blockCopy: boolean`. Off por padrão, configurados individualmente
por etapa objetiva. Política é validada e congelada pela API.

Durante a tentativa:
- `window.blur` e `document.visibilitychange` (hidden) detectam
  período fora da tela. Um mesmo ciclo é contado uma única vez no Front
  e cada evento usa UUID único na API para idempotência.
- Um sinal pendente não permite o envio até sincronizar; pode-se tentar
  reenviar sem trocar o UUID. A conexão deve estar disponível.
- Se a API retorna `BLOCKED`, apaga respostas da memória e impede
  novos envios. Após recarregar, `currentExams` confirma `blocked`.
- Se `blockCopy`, seleção de texto, copy, cut e menu de contexto são
  limitados somente à área da prova; eventos sem texto copiado.
- Limite de foco e contagem são mostrados ao candidato antes e durante
  a prova. O bloqueio não publica automaticamente o resultado.

**Limites importantes:** o navegador não é fonte confiável de verdade.
Extensões, scripts e fluxos do sistema podem ocultar/alterar eventos;
quando o usuário alterna de aba, a transmissão pode ser suspensa. Não
impede fotos, capturas, outro dispositivo nem IA. Ações legítimas
(tecnologias assistivas, seletor de arquivos, permissões, notificações)
podem causar `blur`; operação e processo precisam prever contestação.

Não confundir este recorte com autosave (ainda inexistente). Respostas
não submetidas continuam perdidas num reload. Eventos também não
persistem no cliente além da sessão atual.

As PRs continuam draft e o recruitment feature gate desligado.
