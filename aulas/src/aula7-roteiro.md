---
title: Aula 7 — Roteiro do professor
kind: doc
---

# Aula 7 — Batidas: a bateria da sua música

**Terça, 10/11 · 16h às 17h · Roteiro do professor**

<div class="box" markdown="1">
**Ao final da aula, cada criança consegue:**

1. abrir o **próprio** projeto da Aula 6 em **Meus arquivos** e explicar por que a melodia e a batida **começam juntas** (mesmo **andamento**, mesmo **compasso**, mesmo **começo**);
2. desenhar uma **batida** no Hydrogen — **bumbo**, **caixa** e **chimbal** — num **padrão** e **enfileirar** os padrões na **canção**;
3. **exportar** a batida em **MP3** e salvar a música no arquivo **`.h2song`**;
4. colocar a batida na **Bateria** e fazer as duas músicas tocarem **juntas** na bandeira verde.
</div>

## Antes da aula

- ☐ **Fones de ouvido em todos os computadores** e as **caixas de som no mudo** (as crianças trazem os seus, com fio; 3 ou 4 sobressalentes).
- ☐ No notebook: `cd ~/scratch && git pull` — as folhas desta aula vêm do repositório.
- ☐ Com a Sala no ar (se o notebook reiniciou: `cd ~/scratch/sala && just sala`), abra o painel. Em **Aulas**, a Sala conta os **encontros** (um por dia de aula), não as aulas deste roteiro: confira que **hoje** tem uma linha. Se faltar, em **Adicionar aula** o número (o próximo encontro) e a data (hoje) já vêm preenchidos: clique **Adicionar**.
- ☐ Na mesma tela, coluna **Música**, marque a caixa **Batidas (Groovie)** na **linha de hoje** (a da data de hoje, não a "Aula 7"): a turma passa a ver a telha **Batidas** (a linha "Monte uma batida") na página da Sala. Ela **não** depende do jogo do dia. Se a aula de batidas continuar no encontro seguinte, marque a linha dele também.
- ☐ Em **Jogos**, escolha **Desligados**: hoje não tem jogo, a aula é de música.
- ☐ Confira que os computadores estão com a **imagem nova**: com um **clique com o botão direito no fundo da tela** aparece o atalho **Batidas (Hydrogen)** (entre **Navegador (Firefox)** e **Entregar trabalho**). Abra-o num computador do laboratório: a música **Batidas-1.h2song** (em **Músicas**) tem que abrir com o kit **TR808EmulationKit**, **120** BPM, **4/4** e os quatro padrões **vazios**, sem nenhum aviso para fechar.
- ☐ Projetor com `aula7-slides.pdf`; no notebook, deixe aberto `aulas/demos/Aula7-Batidas-pronto.sb3`.
- ☐ Imprimir a **Ficha 7** (12 + 3 extras, frente e verso) e a **folha de desafios** (`aula7-desafios.pdf`, 6 cópias).
- ☐ Deixar o quadro livre para uma grade de **4 colunas** (os tempos) e **3 linhas** (os instrumentos).

<div class="teacher" markdown="1">
**Se der errado na hora:** a imagem nova não chegou aos computadores → **dê a Aula 6 primeiro** (o Compositor só precisa de um favorito, que pode ser digitado à mão) e a Aula 7 fica para o encontro seguinte. As duas coisas fora → a aula de hoje é de Scratch e a música fica para depois. **Nunca** troque o Hydrogen por outra ferramenta: o arquivo `.h2song` é o que a turma entrega e o que a Aula 7 continua.
</div>

## Cronograma

Cerca de **45 minutos úteis**, contando a partir do momento em que a turma está sentada com o computador ligado.

| Tempo | Atividade | Material |
|---|---|---|
| 0–5 min | Lembra? · o seu projeto da Aula 6 | slides 1–3, Sala |
| 5–8 min | A telha **Batidas**: uma batucada rápida | slide 4, Sala |
| 8–11 min | Um pouco de história | slides 5–6 |
| 11–15 min | A bateria: quem toca em cada tempo | slide 7, quadro |
| 15–31 min | Hydrogen: a base, a variação, a virada e a canção | slides 8–13, Hydrogen |
| 31–35 min | Exportar o MP3 e salvar o `.h2song` | slide 14, Hydrogen |
| 35–43 min | Scratch: a batida na Bateria, as duas juntas | slides 15–16, o projeto |
| 43–45 min | Salvar, entregar e fechar | slides 17–19 |

## 1. Lembra? · o seu projeto da Aula 6 (0–5 min)

Três perguntas rápidas (slide 2): *"Quantas notas tem a escala e depois do si vem qual?"* (sete; vem o **dó** de novo) · *"O que é o C4?"* (o dó do **meio**, na **oitava** 4) · *"Quanto dura uma batida a 120 bpm?"* (**0,5 segundo**).

Cada um abre a **Sala** → **Meus arquivos** → o seu projeto da Aula 6 (o nome que ele deu: **Melodias**). Na Sala ele aparece sob o **encontro** daquele dia, que é o **primeiro da lista** (por exemplo "Aula 12"): **não** é o grupo "Aula 6", que guarda o Pong de outubro. **Quem faltou na Aula 6** abre o projeto **`Aula7-Batidas`** da pasta **Aulas** e importa a melodia que tiver. Aperte a **bandeira verde**: a música toca e a bailarina dança. *"Hoje essa música vai ganhar uma **bateria** — e as duas vão tocar juntas."*

<div class="teacher" markdown="1">
Os projetos de **Meus arquivos** são os `.sb3` que a turma entregou na Aula 6 (a Sala guarda uma cópia por criança e por aula). Quem não entregou ou mudou de computador continua do **`Aula7-Batidas`** — por isso ele existe: é o mesmo palco, com a **Bailarina** e a **Bateria**, sem som nenhum.

**Fique de olho:** é aqui que se vê se a Aula 6 funcionou. Quem abrir o projeto e a música **não** tocar, provavelmente entregou o `.sb3` sem o som: peça o MP3 de novo e importe com a turma.
</div>

## 2. A telha Batidas: uma batucada rápida (5–8 min)

Na **Sala**, a telha **Batidas** abre uma mesa de DJ com **amostras de bateria**. Cada criança clica nas células da grade e ouve a batida **na hora**; no canto, escolhe outros sons (há **mais de 150**). Nada é entregue: é só **explorar** e **escutar** (slide 4).

**Pergunte:** *"Que instrumentos vocês reconhecem?"* (bumbo, caixa, chimbal, palmas, congas…) · *"A batida é sempre igual ou muda?"*.

<div class="teacher" markdown="1">
Peça que **escutem** de fone: 12 caixas de som tocando batidas diferentes viram um caos. Três ou quatro minutos bastam — o objetivo é só apresentar a ideia de **grade de batida** antes de abrir o Hydrogen, onde a mesma grade vai ser **salva** e **entregue**.
</div>

## 3. Um pouco de história (8–11 min)

**Slide 5 — A caixa de ritmos TR-808 (1980).** Em **1980**, a **Roland** lançou a **TR-808**, uma "caixa de ritmos": uma máquina com **botões e uma grade** onde se **programa** a batida, em vez de usar as batidas prontas que vinham nos órgãos eletrônicos. Os sons dela **não** eram gravações: eram **feitos na hora** com circuitos (som **analógico**). ela **não vendeu bem** — os produtores queriam bateria de verdade — e a Roland parou depois de umas **12 mil** unidades. Só que o **bumbo** dela, grave e comprido, virou a marca do **hip-hop** e da música eletrônica: "Planet Rock", de Afrika Bambaataa, e "Sexual Healing", de Marvin Gaye, usaram a 808. Hoje ela é usada em **mais discos de sucesso do que qualquer outra bateria eletrônica**.

**Slide 6 — Amostras (samples).** Uma **amostra** é um **pedacinho de som gravado** que a gente reutiliza: um bumbo, uma palma, um trecho de disco. A palavra nasceu no fim dos anos **1970**, com o **Fairlight CMI**, um instrumento caríssimo que gravava e tocava sons curtos. Nos anos **1980**, com máquinas como o **SP-1200** e o **MPC** (mais baratas), o hip-hop passou a ser feito **recortando** trechos de discos antigos. Hoje quase toda música que vocês ouvem tem amostras — e é por isso que as nossas batidas usam **sons livres**: os do Hydrogen são de kit aberto e os da telha **Batidas** são **CC0** (pode usar sem pedir licença).

<div class="teacher" markdown="1">
**Fontes:** os artigos *Roland TR-808* e *Sampling (music)* da Wikipédia em inglês (o da 808 também existe em português). **Se perguntarem mais:** a 808 foi feita entre 1980 e 1983; o time era chefiado por **Tadao Kikumoto**; **TR** quer dizer *transistor rhythm*, e o nome completo é *Rhythm Composer*. O SP-1200 é de **1987**; o **MPC60**, de **1988**, foi desenhado por **Roger Linn**. O *Endtroducing*, do **DJ Shadow** (**1996**), é apontado como o primeiro **álbum** feito **só** de amostras.

**Cuidado:** "bateria eletrônica" não é a mesma coisa que **bateria de verdade amplificada**. A 808 é uma **caixa de ritmos** — uma máquina que **toca sozinha** o que foi programado.
</div>

## 4. A bateria: quem toca em cada tempo (11–15 min)

No quadro, desenhe a grade (slide 7):

<div class="cols" markdown="1">
<div markdown="1">
| | **1** | **2** | **3** | **4** |
|---|---|---|---|---|
| **Bumbo** | ● | | ● | |
| **Caixa** | | ● | | ● |
| **Chimbal** | ● | ● | ● | ● |
</div>
<div markdown="1">
Conte **1 2 3 4** batendo palmas e peça os sons:

- **bumbo** = "**tum**" (grave) nos tempos **1** e **3**
- **caixa** = "**tá**" (seco) nos tempos **2** e **4**
- **chimbal** = "**tch**" (fininho) em **todos**
</div>
</div>

*"Isso é a **batida de rock** — uma **grade** de quatro colunas. Cada coluna é um tempo, cada linha é um instrumento, e a bolinha quer dizer 'toca aqui'."*

**Pergunte:** *"Se eu puser o bumbo também no 2 e no 4, o que muda?"* (a batida fica mais "cheia"; é o cartão ⭐ "bumbo e caixa trocados") · *"E se o chimbal tocar duas vezes em cada tempo?"* (fica mais rápida — são **colcheias**).

<div class="teacher" markdown="1">
Faça a turma **bater na mesa**: um grupo é o bumbo (tum nos 1 e 3), outro é a caixa (tá nos 2 e 4), outro é o chimbal (tch em todos). Depois troquem. Funciona melhor que qualquer explicação: a **grade** do Hydrogen é exatamente isso que eles acabaram de fazer com as mãos.

A **Ficha 7** é para casa (ou para quem esperar ajuda); os exercícios 1 e 3 são essa mesma grade no papel.
</div>

## 5. Hydrogen: a base, a variação, a virada e a canção (15–31 min)

Cada um abre o **Batidas (Hydrogen)** (clique com o botão direito no fundo da tela). O programa abre já com a música **Batidas-1.h2song** (o título aparece na barra da janela): kit **TR808EmulationKit**, **120** BPM, **4/4** e os quatro padrões **vazios** já enfileirados uma vez na **canção** — são **4 compassos**, **8 segundos** (slide 8).

**A tela** (slide 9): em cima, os menus (**Projeto**, **Drumkits**, **Instrumentos**…) e o **andamento** (o campo com **120**); no meio, a **lista de padrões** (**Padrão 1** a **Padrão 4**) e a **grade**; embaixo, as **linhas dos instrumentos** (**Bumbo**, **Caixa 1**, **Chimbal fechado**…) e o **Tamanho** do padrão. No alto da grade, os dois botões que dizem em que **modo** você está: **Padrão** ou **Canção**.

<div class="teacher" markdown="1">
**A grade do padrão** tem **uma coluna por tempo** (a resolução é **1/4**: cada coluna é um tempo, e os números **1, 2, 3, 4** no alto são os **tempos** do compasso 4/4). **Clique numa célula** da linha do instrumento para **pôr** a batida ali; **clique de novo** para **tirar**. Aperte **▶** (o botão do transporte, no alto) para ouvir em **loop**; o mesmo botão vira **parar**.
</div>

**Passo 1 — O bumbo** (slide 10). Com o **Padrão 1** escolhido na lista, clique nas colunas **1** e **3** da linha **Bumbo**: *"tum … tum …"*.

**Passo 2 — A caixa** (slide 11). **Ainda no Padrão 1**, clique a **Caixa 1** nas colunas **2** e **4**: *"tum tá tum tá"*.

**Passo 3 — O chimbal** (slide 12). **No mesmo Padrão 1**, ponha o **Chimbal fechado** — ou o **Chimbal com pedal**, o da figura — em **todas** as colunas: *"tch tch tch tch"*. **Agora o Padrão 1 é uma batida inteira** — bumbo, caixa e chimbal tocando juntos.

**Passo 4 — A variação** (slide 13). No **Padrão 2**, refaça a batida do Padrão 1 e **acrescente o bumbo nos tempos 2 e 4**: é a **variação**, que deixa a música mais cheia. No **Padrão 4**, ponha a **Caixa 1** em **todos** os tempos: essa é a **virada**, que toca **uma vez**, no fim.

**Passo 5 — A canção** (slide 13). Aperte **Canção** (o botão ao lado de **Padrão**): a tela passa a mostrar o **editor de canção**, com **uma linha por padrão** à esquerda (**Padrão 1** a **Padrão 4**) e uma **régua de compassos** em cima. Um **clique** na célula da linha **Padrão N** no compasso **M** **põe** o Padrão N naquele compasso; **clique de novo** **tira**. O padrão que entra é o da **linha** em que você clica — não precisa escolher nada na lista.

O template já vem com os quatro padrões enfileirados: **apague a fila** (**botão direito → Selecionar tudo**, **botão direito → Remover**) e monte a nossa, com **oito** compassos: **Padrão 1** nos compassos **1, 2, 4, 5 e 6**, **Padrão 2** no **3** e no **7**, **Padrão 4** no **8** — a ordem **1 · 1 · 2 · 1 · 1 · 1 · 2 · 4**. Para a canção chegar ao oitavo compasso, **clique mais à direita**: ela cresce e os compassos que ficarem vazios são **silêncio**. Aperte **▶** e ouça.

<div class="teacher" markdown="1">
**Como enfileirar (conferido no Hydrogen):** no **editor de canção** cada **linha** é um padrão e cada **coluna** é um compasso (a régua do alto marca **1, 5, 9**…; um compasso é uma coluna estreita). **Clique** na célula = **põe** o padrão **daquela linha** naquele compasso; **clique de novo** = **tira**. Não é preciso selecionar o padrão na lista nem arrastar: o que vale é a **linha**. **Mais compassos:** clique mais à direita e a canção cresce (os compassos pulados ficam **vazios**, em silêncio). **Apagar tudo:** **botão direito → Selecionar tudo**, **botão direito → Remover** — o menu é *Cortar / Copiar / Colar / Remover / Selecionar tudo / Limpar seleção*.

**Problemas comuns:** o ▶ não toca (a saída de áudio está no computador errado: opções de áudio do Hydrogen; o fone está plugado?) · o padrão fica sempre repetindo (você está no modo **Padrão**: aperte **Canção**) · o chimbal sai no instrumento errado (a linha clicada é a do instrumento; confira o nome à esquerda) · a batida tem um tempo a mais (o **Tamanho** do padrão mudou: volte para **4/4** e 4 batidas) · a canção tem um compasso **vazio** no meio (pulei uma coluna: clique na célula que falta) · o bloco aparece no compasso errado (a coluna é o **compasso**, não o tempo).
</div>

## 6. Exportar o MP3 e salvar o `.h2song` (31–35 min)

**Slide 14.** Duas saídas, as duas vão ser entregues:

1. **O MP3** (para tocar no Scratch): **Projeto → Exportar Canção** → o campo **Formato** já vem com **MP3** (se não vier, escolha) → **Exportar**. O arquivo sai na pasta **Músicas**, com o nome que está no campo **Exportar diretório** (troque para `batida-<seu-nome>.mp3` e **não** mude a pasta).
2. **A música do Hydrogen** (para continuar depois): **Projeto → Salvar Como...** → escolha a pasta **Músicas** e o nome que você quiser (ex.: `batida-da-ana`) → **Salvar**. O arquivo **`.h2song`** fica em **Músicas**.

<div class="teacher" markdown="1">
**O nome do MP3 vira o nome do som no Scratch**: se o `Batidas-1.mp3` for exportado assim, o som na Bateria vai se chamar `Batidas-1`. Deixe que cada um troque o nome no campo **Exportar diretório** (`.../batida-da-ana.mp3`) — fica mais fácil de achar em **Meus arquivos** na próxima aula.

**O `.h2song` guarda tudo:** os padrões, a ordem na canção, o kit e o andamento. Reabrir é **Projeto → Abrir**.
</div>

## 7. Scratch: a batida na Bateria, as duas juntas (35–43 min)

**Primeiro, a Bateria** (slide 15). Quem está com o **próprio** projeto da Aula 6 só tem a **Bailarina**: clique em **Escolher um Ator** (embaixo à direita), procure **Drum Kit** na **Biblioteca** e clique nele; depois **renomeie** o ator para **Bateria** (clique no nome dele, na lista de atores, e escreva por cima). A melodia e os scripts da Bailarina **não mudam**.

Agora clique na **Bateria** → aba **Sons** → **Carregar som** → escolha o MP3 da batida (a pasta é a que estava no campo **Exportar diretório**).

**Slide 15 — toca na bandeira verde:**

```blocks
quando @greenFlag for clicado
toque o som (Batidas-1 v) até o fim
```

A **Bailarina** já tem o script dela (o som da melodia e a dança). Aperte a **bandeira verde** (slide 16): *"as duas músicas começam no mesmo instante, no mesmo andamento e no mesmo compasso — então elas **casam**."*

**Pergunte:** *"E se a batida fosse mais rápida que a melodia?"* (não casaria: o **andamento** é que manda) · *"E se a batida tivesse 4 compassos e a melodia 8?"* (a batida acabaria no meio; por isso montamos **oito** compassos).

<div class="teacher" markdown="1">
**Confira:** bandeira verde → melodia + bateria juntas, bailarina dançando. Se a batida entrar **atrasada**, veja o `espere` da bailarina (tem que ser `espere (0.5) seg`) e se o andamento do Hydrogen é **120** — um dos dois está fora do tempo.

**Problemas comuns:** só a melodia toca (o som foi carregado na Bailarina em vez da Bateria) · a batida toca sozinha (o script ficou sem o `toque o som … até o fim`, ou com `toque o som` sem o "até o fim": aí ele dispara e o script segue) · a batida sai duas vezes (o script foi copiado para os dois atores) · não acha o MP3 (não está em **Downloads**: o Hydrogen salva na pasta do campo **Exportar diretório**, e o `.h2song` em **Músicas**).

Se a turma travar, mostre o projeto pronto: `aulas/demos/Aula7-Batidas-pronto.sb3`.
</div>

**Desafios** (quem terminar; slide 18):

<div class="cols" markdown="1">
<div markdown="1">
**⭐ Trocar o kit.** **Drumkits** → **GMRockKit**: a mesma batida com som de bateria de rock.

**⭐ Mais devagar.** Troque o **120** por **90** no andamento.
</div>
<div markdown="1">
**⭐⭐ A canção de 16 compassos.** Enfileire 16 padrões, com uma **virada** no fim.

**⭐⭐⭐ Desafio extra — a sua batida original.** No fim da página do gabarito.
</div>
</div>

## 8. Salvar, entregar e fechar (43–45 min)

- **Salvar** (slide 17): **Arquivo → Salvar como...** → nome **Batidas** → Salvar.
- **Entregar trabalho** (o botão na área de trabalho, ou a página **Entregar** da Sala): **três arquivos** — o **`.sb3`**, o **MP3** da batida e o **`.h2song`**.
- Antes de desligarem: no painel da Sala, aba **Entregas**, confira que chegaram os três de cada um (a Sala aceita `.sb3`, `.mp3` e `.h2song`).
- **Perguntas finais** (slide 19): *"Por que as duas músicas casam?"* (mesmo andamento, mesmo compasso, mesmo começo) · *"Qual a diferença entre **padrão** e **canção**?"* (um compasso × muitos compassos em ordem) · *"O que é uma amostra?"* (um pedaço de som gravado que a gente reutiliza)
- **Próxima aula:** o **projeto livre** — cada um inventa o seu, com tudo o que aprendeu no ano.

## Gabarito da Ficha 7 {style="break-before: page"}

<div class="cols" markdown="1">
<div markdown="1">
**1.** **Bumbo → tempos 1 e 3** · **Caixa → tempos 2 e 4** · **Chimbal → todos os tempos**. a) o **bumbo** (é o som mais grave). b) o **chimbal** (o mais fino).

**2.** a) **8** compassos. b) **16 segundos** (2 s por compasso). c) **do mesmo tamanho** — só assim as duas começam e terminam juntas.

**3.** Desenho livre; a **batida 1** é a da aula (bumbo 1 e 3, caixa 2 e 4, chimbal em todos).
</div>
<div markdown="1">
**4.** **Padrão** = um compasso · **Canção** = muitos compassos em ordem · **Tamanho** = quantas batidas tem o padrão · **Exportar Canção** = sai o MP3. a) **Padrão**. b) **Canção**.

**5.** `toque o som (Batidas-1 v) até o fim`. As duas começam juntas porque as **duas bandeiras verdes** disparam no mesmo instante e as músicas têm o mesmo **andamento** (120 bpm), o mesmo **compasso** (4/4) e o mesmo **começo** (o primeiro tempo).

**6.** Desenho livre: 4 colunas × 3 linhas.
</div>
</div>

<div class="teacher" markdown="1">
**Desafio extra — a sua batida original.** Resposta: criar **padrões próprios** (a base, a variação e a virada da aula servem de ponto de partida, mas os tempos mudam) → escolher o padrão na lista e desenhar na grade → **Canção** e enfileirar **16** compassos (com a **virada** — o Padrão 4 — no último) → **Projeto → Exportar Canção**, **Formato MP3** → **Projeto → Salvar Como...** para o `.h2song` → no Scratch, **Carregar som** na **Bateria**, `quando @greenFlag for clicado` + `toque o som (…) até o fim` → **Salvar** e **Entregar trabalho** com os três arquivos. **O que avaliar:** a batida tem **bumbo, caixa e chimbal** com papéis diferentes, a canção tem **16 compassos**, e o MP3 e o `.h2song` foram entregues.
</div>

## Resposta do Desafio extra {style="break-before: page"}

**A sua batida original** é a Aula 7 inteira, feita sozinho. A ordem:

1. **Os padrões:** no Hydrogen, desenhe no **Padrão 1** a **batida inteira** (bumbo em 1 e 3, caixa em 2 e 4, chimbal em todas as colunas). No **Padrão 2**, a **variação** (a mesma batida com o bumbo também em 2 e 4). No **Padrão 4**, a **virada**: caixa em todos os tempos do último compasso.
2. **A canção:** aperte **Canção** e enfileire **16** compassos na linha do tempo — por exemplo **1 1 2 1** repetido **quatro vezes**, trocando o último 1 pela **virada**: **1 1 2 4**.
3. **Ouvir:** **▶** e confira se a batida "anda" (não pode ter um compasso vazio no meio).
4. **Exportar:** **Projeto → Exportar Canção**, **Formato** = **MP3**, **Exportar**.
5. **Salvar:** **Projeto → Salvar Como...** → **`batida-<seu-nome>`** → **Salvar** (o `.h2song` vai para **Músicas**).
6. **No Scratch:** abra o seu projeto, clique na **Bateria**, **Sons → Carregar som**, escolha o MP3, e monte:

```blocks
quando @greenFlag for clicado
toque o som (batida-da-ana v) até o fim
```

7. **Entregar:** **Arquivo → Salvar como...** → **Batidas** → **Entregar trabalho** com o `.sb3`, o MP3 e o `.h2song`.

**Para ir além:** troque o bumbo e a caixa de lugar **no mesmo padrão** (o cartão ⭐ **Bumbo e caixa trocados**) e ouça a diferença — o "peso" da batida muda de lugar. Depois faça a **Bateria** dançar junto: ela tem **duas fantasias**, então dá para usar `próxima fantasia` + `espere (0.5) seg` nela também.
