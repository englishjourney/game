# EnglishJourney — Trilha de missões

Esta pasta reúne os documentos das novas missões. A sequência abaixo é o roteiro pedagógico de referência para a produção dos materiais; os registros antigos da tabela `missions` permanecem ativos até que os novos documentos sejam adicionados e a substituição seja feita.

## Progressão proposta

Cada etapa combina um campo de vocabulário com um objetivo gramatical. A trilha alterna foco lexical e gramatical sem tratar os assuntos como conteúdos isolados.

| Etapa | Tema e vocabulário | Foco gramatical / comunicativo |
|---|---|---|
| 01 | Days of the Week — dias da semana, sequência semanal e weekdays / weekend | Vocabulário básico de calendário e referência a dias |
| 02 | Months of the Year — meses do ano, números de 1 a 12 e sequência do calendário | Ordem dos meses e associação entre mês e número |
| 03 | Free time & hobbies — lazer, esportes e interesses | Simple present: perguntas, respostas curtas e frequência |
| 04 | Places in town — lugares da cidade e serviços | There is / there are e preposições de lugar |
| 05 | Food & meals — alimentos, bebidas e refeições | Countable / uncountable nouns, some / any |
| 06 | People & descriptions — personalidade, aparência e características | Adjectives, equatives e comparatives |
| 07 | Abilities & technology — habilidades, dispositivos e ações digitais | Can / can't e perguntas sobre habilidades |
| 08 | Home & actions — cômodos, móveis e tarefas domésticas | Present continuous e contraste com simple present |
| 09 | Travel & directions — transporte, lugares e deslocamento | Imperatives, prepositions of movement e instruções |
| 10 | Past experiences — eventos, atividades e experiências | Simple past: verbos regulares e marcadores de tempo |
| 11 | Stories & memories — acontecimentos, sentimentos e narrativa | Simple past: verbos irregulares, negativas e perguntas |
| 12 | Media, opinions & plans — mídia, opiniões e planos | Future with *going to*, *should* e conectores de opinião |

## Regras de progresso e recompensa

- Apenas as missões desta trilha podem registrar resultados na tabela `missions`.
- Os jogos de `otherGames/` são recreativos: podem manter pontuação local durante a partida, mas não registram missões nem alteram `users.score`.
- Uma primeira conclusão válida de missão concede **+2 estrelas** em `users.stars`.
- A recompensa é única por aluno e por missão. Uma conclusão ou tentativa já registrada em `done` ou `fail` não concede novamente as estrelas.
- A coluna `mission_score` define apenas a meta de pontuação dentro do jogo da missão; ela não é somada a `users.score`.
- Na missão 02, o jogo da memória contém 24 cartas (12 números e 12 meses), concede 10 pontos por par e exige encontrar os 12 pares; o resultado final é 120 pontos e a meta cadastrada é 100.
- As missões devem registrar o resultado usando `recordMissionResult()` de `components/config.js`, que chama a função transacional `record_mission_result` no Supabase.
- A função transacional impede recompensas duplicadas por reenvio ou chamadas simultâneas. O fluxo atual, porém, ainda usa a sessão legada armazenada no navegador; para impedir também chamadas manuais forjadas, a conclusão deverá ser validada por autenticação Supabase/Edge Function no servidor.

## Padrão de efeitos sonoros de resposta

- Toda questão, quiz ou desafio avaliativo de uma missão deve reproduzir um efeito sonoro ao responder.
- A função compartilhada fica em `components/feedback.js`: importe `playAnswerSound` e chame `playAnswerSound(true)` quando a resposta for correta e `playAnswerSound(false)` quando for incorreta.
- A mesma regra vale para jogos dentro das missões, como combinações, memória e desafios de pontuação: reproduza o efeito somente quando o resultado da tentativa for confirmado.
- O som é sintetizado localmente com Web Audio, sem depender de arquivos externos. A implementação deve ser reutilizada pelas próximas missões, sem criar efeitos isolados em cada página.

## Organização dos documentos

- Um documento por missão, com numeração no início do nome: `01-days-of-a-week`, `02-months-of-the-year` e assim por diante.
- Cada documento deve informar objetivo, vocabulário-alvo, explicação gramatical curta, exemplos contextualizados e atividade de aplicação.
- A dificuldade deve crescer de forma gradual: reconhecer e compreender, praticar com apoio e, por fim, aplicar em contexto.
- Os jogos de `otherGames/` ficam separados da trilha curricular e servem como atividades de diversão.

## Estado da migração

A interface da aba Missões já pode usar o mapa para mostrar progresso, missão atual, missões anteriores e etapas bloqueadas. Os links e conteúdos antigos da tabela `missions` não foram apagados nem substituídos nesta etapa.
