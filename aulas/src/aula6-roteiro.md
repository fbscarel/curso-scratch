---
title: Aula 6 — Roteiro do professor
kind: doc
---

# Aula 6 — Melodias: o computador toca música

**Sexta, 06/11 · 16h às 17h · Roteiro do professor**

<div class="box" markdown="1">
**Ao final da aula, cada criança consegue:**

1. dizer o nome das **sete notas** em português e em inglês (**dó = C** … **si = B**) e o que o número do lado significa (a **oitava**: C4 é o dó do meio);
2. contar uma **batida** em 4 tempos e copiar no **Compositor** uma melodia que ouviu no teclado;
3. **exportar** a música em **MP3** e salvar a partitura em **`.midi`**;
4. **importar** o MP3 no Scratch e fazer a bailarina **dançar no ritmo** (`espere (0.5) seg` = uma batida a 120 bpm).
</div>

## Antes da aula

- ☐ **Fones de ouvido em todos os computadores** e as **caixas de som no mudo**: com 12 músicas tocando ao mesmo tempo, ninguém ouve nada. As crianças trazem os seus (com fio); tenha 3 ou 4 sobressalentes.
- ☐ No notebook: `cd ~/scratch && git pull` — as folhas desta aula vêm do repositório.
- ☐ Com a Sala no ar (se o notebook reiniciou: `cd ~/scratch/sala && just sala`), abra o painel. Em **Aulas**, a Sala conta os **encontros** (um por dia de aula), não as aulas deste roteiro: confira que **hoje** tem uma linha. Se faltar, em **Adicionar aula** o número (o próximo encontro) e a data (hoje) já vêm preenchidos: clique **Adicionar**. A ficha e os desafios desta aula já aparecem para a turma em **Folhas**.
- ☐ Ainda no painel, em **Jogos**: **Um jogo** e, em **Jogo ativo**, o **Super Mario Bros.** — é o jogo dos primeiros 3 minutos. No placar dele a criança digita a pontuação que aparece no jogo: confira em **Entregas** quem anotou.
- ☐ Em **Aulas**, coluna **Música**, deixe a caixa **Batidas (Groovie)** **desmarcada** na linha de hoje: a telha entra na Aula 7.
- ☐ **Abra o `danielx.net/composer` num computador do laboratório, hoje, antes da aula**, e faça uma nota tocar e um MP3 sair (**Save/Load → Export to .wav or .mp3**): a aula depende da internet da escola e do site estar no ar. Na primeira vez o Firefox pergunta se o site pode usar os **dispositivos MIDI**: não é preciso — a resposta é **Não permitir**.
- ☐ Ligar os computadores (pendrive, "copiar para RAM"). Nos computadores novos o Firefox já tem o favorito **Compositor**; nos pendrives antigos, digite `danielx.net/composer` na barra de endereços.
- ☐ Projetor com `aula6-slides.pdf`; no notebook, deixe aberto `aulas/demos/Aula6-Melodias-pronto.sb3`: é a bailarina desta aula pronta, para mostrar.
- ☐ **Teclado Casio** ligado perto do projetor (ou na mesa do professor), com o som na caixa dele. Deixe o quadro livre para as sete notas.
- ☐ Imprimir a **Ficha 6** (12 + 3 extras, frente e verso) e a **folha de desafios** (`aula6-desafios.pdf`, 6 cópias).

<div class="teacher" markdown="1">
**Se der errado na hora:** internet fora do ar → **troque a ordem das aulas** e dê a **Aula 7** hoje, se a imagem nova (com o Hydrogen) já estiver nos pendrives. Se a imagem nova ainda não estiver pronta → dê esta aula com o favorito digitado à mão. Se as duas coisas falharem → a turma faz a melodia **com a extensão Música do Scratch** (o cartão ⭐⭐ "Teclado do Scratch" vira a atividade principal) ou a aula é adiada. O Compositor precisa só da internet da escola: a página, as fontes e os sons dele vêm do próprio site.
</div>

## Cronograma

Cerca de **45 minutos úteis**, contando a partir do momento em que a turma está sentada com o computador ligado.

| Tempo | Atividade | Material |
|---|---|---|
| 0–5 min | Lembra? · Sala e Super Mario Bros. | slides 1–3, Sala |
| 5–8 min | Um pouco de história | slides 4–5 |
| 8–17 min | Teoria no Casio: as notas, a batida, a melodia | slides 6–10, Casio, quadro |
| 17–20 min | O Compositor: a pauta e os botões | slides 11–13 |
| 20–32 min | Compor e ouvir | slides 14–15, Compositor |
| 32–35 min | Exportar o MP3 e salvar o `.midi` | slide 16, Compositor |
| 35–43 min | Scratch: importar o som e a bailarina no ritmo | slides 17–18, `Aula6-Melodias` |
| 43–45 min | Salvar, entregar e fechar | slides 19–21 |

## 1. Lembra? · Sala e Super Mario Bros. (0–5 min)

Três perguntas rápidas (slide 2): *"O que faz o bloco `pare [todos v]`?"* (para tudo — e **apaga os balões** de fala) · *"Por que a bola acelerava com +1 de um lado e -1 do outro?"* (o **sinal** do vx diz para onde ela vai) · *"Quem ganha o Pong?"* (quem chega a **7** primeiro).

Cada um abre a **Sala** (favorito no Firefox), escolhe o nome e joga o **Super Mario Bros.** do dia por uns **3 minutos**. Depois de jogar (slide 3), **pergunte** com o jogo ainda na tela:

- *"Como o computador toca essa música?"* (respostas: um CD, uma orquestra gravada, um arquivo…)
- *"Tem instrumento de verdade aí dentro?"* (não!)
- *"E a musiquinha muda quando o tempo está acabando?"* (fica mais rápida)

<div class="teacher" markdown="1">
Deixe a turma **chutar** antes de contar: a resposta (o console tem um **chip de som** com cinco "instrumentos" eletrônicos) vem no slide seguinte. O objetivo do dia é entender que música é **uma lista de notas com um tempo** — e que dá para escrever essa lista.
</div>

## 2. Um pouco de história (5–8 min)

**Slide 4 — O som do NES e Koji Kondo (1985).** O **Nintendo Entertainment System** (no Japão, *Famicom*, 1983) não tinha orquestra: tinha um **chip de som**, o **Ricoh 2A03**, com **cinco canais**: **duas ondas quadradas** (os "apitos" da melodia), **uma onda triangular** (o baixo), **um canal de ruído** (a percussão, os "tch") e **um canal de amostra** (um pedacinho de som gravado, que quase ninguém usava no começo). Quem escreveu a música do **Super Mario Bros.** (1985) foi **Koji Kondo**, o primeiro compositor contratado da Nintendo: ele fez **seis** músicas para o jogo, e a do primeiro fase — *Ground Theme*, em **dó maior** — foi a que deu mais trabalho, porque precisava combinar com o pulo do Mario e não atrapalhar os efeitos. Em **2023** ela entrou no **Registro Nacional de Gravações** dos Estados Unidos: foi a **primeira música de videogame** a entrar lá.

**Slide 5 — Mario Paint (1992).** Sete anos depois, a Nintendo lançou no **Super Nintendo** o **Mario Paint**, um programa de desenho que vinha com o **mouse** do console — e que tinha um **compositor de música**: você escolhia um **ícone** (o Mario era o piano, a estrela era o sino, a flor era o trompete) e **carimbava** a nota na **pauta**, com a **clave de sol**. Era simples de propósito: só **notas de um tempo**, no máximo **três notas por batida**, e **só as notas brancas** (dó maior) — **sem sustenidos nem bemóis**. Deu tão certo que virou moda: gente faz música no Mario Paint até hoje.

<div class="teacher" markdown="1">
**Fontes:** os artigos *Ricoh 2A03*, *Super Mario Bros. theme*, *Koji Kondo* e *Mario Paint* da Wikipédia em inglês; o de *Mario Paint* também existe em português. A musiquinha do Mario está em **dó maior** — a mesma escala da nossa aula — mas em **100 bpm**; a nossa vai ser em **120 bpm**.

**Se perguntarem mais:** o chip do NES também era o **processador** do console (um 6502 modificado); o canal de amostra tocava som **de 1 bit**, e por isso no começo quase todo jogo usava só quatro canais. Koji Kondo entrou na Nintendo em **1984** e o primeiro trabalho dele foi o som do *Punch-Out!!* de fliperama; ele também fez a música do *Zelda*. O Mario Paint vendeu mais de **2,3 milhões** de cópias e o compositor dele limitava a música a **24 compassos** em 4/4.

**Cuidado com "o primeiro":** o Mario Paint **não** inventou a ideia de compor clicando — só a deixou fácil para criança. Diga "um dos primeiros".
</div>

## 3. Teoria no Casio (8–17 min)

**Slide 6 — As sete notas.** Escreva no quadro, em duas colunas, e toque cada uma no Casio enquanto a turma canta o nome:

<div class="big center" markdown="1">
**dó ré mi fá sol lá si** · · · **C D E F G A B**
</div>

*"São **sete** notas, e elas se repetem. Em português a gente canta dó ré mi; no computador — e no Compositor, que é em inglês — elas aparecem como **C D E F G A B**."*

**Slide 7 — O número do lado.** Toque o **dó do meio** do teclado e diga: *"Este é o **dó 4**, ou **C4**. O 4 não é a nota: é a **oitava** — qual 'andar' do teclado ela está."* Toque o **dó acima** (C5) e o **dó abaixo** (C3): *"Quanto maior o número, mais **agudo**. O C4 é o dó que fica mais ou menos no meio."* Deixe a turma ouvir a diferença.

**Slide 8 — A batida.** Bata palmas num pulso firme e conte **1 2 3 4, 1 2 3 4**. *"Isso é a **batida**: o relógio da música. A gente conta de quatro em quatro porque quase toda música que vocês conhecem é assim — isso se chama **4/4**. E a **velocidade** da batida é o **tempo**: 120 batidas por minuto é o nosso (o mesmo do Compositor)."*

<div class="teacher" markdown="1">
Faça a turma contar junto, mais devagar (60) e mais rápido (120), sem instrumento nenhum. Em 120 bpm cada batida dura **meio segundo** — é esse número que vai virar o `espere (0.5) seg` do Scratch no fim da aula.
</div>

**Slide 9 — Uma melodia.** Toque no Casio a primeira frase de **"Brilha, brilha, estrelinha"** (domínio público) e cante com a turma:

<div class="big center" markdown="1">
**dó dó sol sol lá lá sol** · · · **fá fá mi mi ré ré dó**
</div>

*"Notas **uma depois da outra** = **melodia**. E olhem só: são só as notas brancas."* Repita deixando a turma cantar sozinha.

**Slide 10 — Um acorde.** Toque **dó, mi e sol juntos**: *"Três notas ao mesmo tempo formam um **acorde**. Este é o **acorde de dó maior** — e é o mais fácil de todos."* Mostre no quadro os dois que ficam para os desafios: **fá maior** = **fá lá dó** (F A C) e **sol maior** = **sol si ré** (G B D). Na **escala** de sol maior, o **fá vira fá♯** — no Compositor isso se faz clicando no **♯** antes de pôr a nota (a versão gratuita não tem armadura de clave). O **acorde** de sol maior é **sol si ré**: não tem fá, então não precisa de ♯.

<div class="teacher" markdown="1">
A **Ficha 6** é para casa (ou para quem esperar ajuda). Os exercícios 1 e 2 são exatamente o que você acabou de mostrar no quadro e no teclado.

**Se o Casio faltar:** cante a escala e a melodia com a turma e use o **Compositor no projetor** para tocar as notas (dá para ouvir pelo notebook, com a caixa de som).
</div>

## 4. O Compositor: a pauta e os botões (17–20 min)

Cada um abre o **Compositor** (favorito **Compositor** no Firefox; nos pendrives antigos, digite `danielx.net/composer`). Na primeira abertura o Firefox mostra um aviso comprido sobre **dispositivos MIDI**: clique em **Não permitir** (o site não precisa disso para tocar nem para exportar). A tela tem a **pauta** no meio (clave de sol em cima, clave de fá embaixo), os **instrumentos** em ícones na faixa de cima e os **botões** embaixo (slide 11).

**A pauta** (slide 12). No canto de cima à esquerda aparece o **nome da nota** embaixo do mouse: passe o mouse pela pauta e leia (*Note: C4*, *Note: G4*…). **Clique** numa linha ou num espaço para **pôr** a nota; **clique de novo** nela para **tirar**. O **dó 4** (C4) é o que fica na **linha extra logo abaixo** da pauta de cima — a mesma tecla que você tocou no Casio.

**Os botões** (slide 13). O Compositor é em inglês: o que a turma usa está na tabela.

| Na tela | Em português | Para que serve |
|---|---|---|
| **Play** | Tocar | toca a música do começo |
| **Go to Start** | Voltar ao começo | volta a bolinha para o início |
| **Tempo** | Andamento | **120** (batidas por minuto) |
| **Length** | Duração | quantas **batidas** tem a música: **64** = 32 segundos |
| **Undo** / **Redo** | Desfazer / Refazer | errou? desfaz |
| **Clear** | Limpar | apaga tudo (cuidado!) |
| **Save/Load** | Salvar/Abrir | salvar o `.midi` e exportar o MP3 |
| **Buy Now!** | Comprar | **não clique**: abre anúncios em cima da pauta |

<div class="teacher" markdown="1">
**A janela de compra** aparece de vez em quando (a cada 15 minutos) e cobre a pauta com um anúncio: **clique num lugar vazio da pauta para fechá-la**. Se a turma clicar em **Buy Now!**, aparece o mesmo tipo de anúncio — a mesma saída.

**Se a pauta parecer torta** (as notas não caem nas linhas): diminua e aumente a janela do Firefox uma vez; a pauta se acerta. Faça isso você, antes da aula, no computador do projetor.
</div>

## 5. Compor e ouvir (20–32 min)

**Passo 1 — Copie a melodia do Casio** (slide 14). Com o instrumento do **Mario** (o primeiro ícone) e o padrão **120 bpm / 4/4**, ponha a primeira frase de "Brilha, brilha, estrelinha" na pauta de cima: **dó dó sol sol lá lá sol** — as seis primeiras notas de **uma batida** cada e a última **segurando duas** (com o **Duration** em **2**): a frase tem **8 batidas**, ou seja, **dois compassos**.

<div class="cols" markdown="1">
<div markdown="1">
**Onde ficam** (na pauta de cima):

- **dó** (C4): na **linha extra** abaixo da pauta
- **sol** (G4): na **segunda linha** de baixo para cima
- **lá** (A4): no **espaço** logo acima dessa linha
- **fá** (F4): no **primeiro espaço**, de baixo para cima
- **mi** (E4): na **primeira linha** de baixo
- **ré** (D4): no **espaço** embaixo da primeira linha
</div>
<div markdown="1">
**Confira cada nota no canto** (Time / Beat / Note): antes de clicar, o nome tem que ser o da nota que você quer.

**A segunda frase** é **fá fá mi mi ré ré dó**, também com o último dó **segurando duas batidas** — as duas frases juntas dão **quatro compassos** (16 batidas, 8 segundos).

**Ouça:** ▶️ **Play**. Se estiver certo, dá para cantar junto.
</div>
</div>

**Passo 2 — A sua música** (slide 15). Cada um continua a partir do **quinto compasso**: invente **dezesseis** notas de uma batida (**quatro compassos**), usando as sete notas que aprendeu — a música fica com **oito compassos**. **Pergunte:** *"Quantas notas cabem num compasso 4/4?"* (quatro, se for uma por batida) · *"E se a sua música tiver 32 batidas, quantos segundos ela dura?"* (16 segundos, porque cada batida tem meio segundo).

<div class="teacher" markdown="1">
Deixe o **Length** em **32** (8 compassos = 16 segundos, o mesmo tamanho da batida da próxima aula) para quem vai continuar o projeto. Quem fizer mais comprida, aumenta o Length — só não pode passar dos **20 MB** do arquivo no fim (32 segundos de MP3 dá uns **0,5 MB**; nem chega perto).

**Problemas comuns:** a nota sai na oitava errada (é a linha extra **de baixo** para o dó 4, não a de cima) · a música toca com um instrumento esquisito (foi clicado outro ícone na faixa de cima: volte ao primeiro, o do Mario) · o **Play** não toca (o volume do computador está no mudo ou o fone não está plugado) · a nota não sai (a pauta está coberta pela janela de compra: clique num lugar vazio).
</div>

**Desafios** (quem terminar; slide 20):

<div class="cols" markdown="1">
<div markdown="1">
**⭐ A escala inteira.** Suba dó ré mi fá sol lá si dó, uma nota por batida, e toque.

**⭐ Mais devagar, mais rápido.** Troque o **Tempo**: 60 e 240. O que muda na música?
</div>
<div markdown="1">
**⭐⭐ Teclado do Scratch.** Com a extensão **Música**, cada tecla toca uma nota.

**⭐⭐⭐ Desafio extra — a sua música original.** No fim da página do gabarito.
</div>
</div>

## 6. Exportar o MP3 e salvar o `.midi` (32–35 min)

**Slide 16.** Duas saídas, e as duas vão ser entregues:

1. **O MP3** (para tocar): **Save/Load → Export to .wav or .mp3** → **File Name**: o seu nome (ex.: `brilha`) → **Format**: **mp3** → **Export**. O arquivo vai para a pasta **Downloads**.
2. **A partitura** (para continuar depois): **Save/Load → Save to disk** → **Title**: o mesmo nome → **OK**. Sai um arquivo **`.midi`** — é a "partitura" da música, que dá para abrir de novo com **Load from disk**.

<div class="teacher" markdown="1">
**Ponha o nome nos dois arquivos** (`brilha.mp3` e `brilha.midi`): é o nome do arquivo que vira o nome do **som** quando ele entra no Scratch. Sem nome, os dois saem como `song`.

A janela **Export** escreve o MP3 inteiro (as 32 batidas do **Length**, mesmo as vazias): por isso o arquivo tem sempre a mesma duração — é isso que faz a melodia e a batida **começarem juntas** na Aula 7.
</div>

## 7. Scratch: importar o som e a bailarina no ritmo (35–43 min)

Cada um abre a pasta **Aulas** na área de trabalho e o projeto **`Aula6-Melodias`**: o palco e a **Bailarina**, sem nenhum bloco.

**Passo 1 — O som entra na Bailarina** (slide 17). Clique na **Bailarina** → aba **Sons** → botão **Carregar som** → escolha o MP3 em **Downloads**. O som aparece na lista com o nome do arquivo (`brilha`).

**Passo 2 — Toca na bandeira verde** (slide 17):

```blocks
quando @greenFlag for clicado
toque o som (brilha v) até o fim
```

**Passo 3 — A bailarina dança na batida** (slide 18). Um **segundo** script, no mesmo ator:

```blocks
quando @greenFlag for clicado
sempre
  próxima fantasia
  espere (0.5) seg
end
```

**Pergunte:** *"Por que 0,5 e não 1?"* (cada batida a 120 bpm dura meio segundo; a bailarina troca de fantasia **uma vez por batida**) · *"E se eu quisesse duas trocas por batida?"* (0,25).

<div class="teacher" markdown="1">
**Confira:** bandeira verde → a música toca e a bailarina troca de roupa no ritmo. Pare com o botão vermelho: o som para junto.

**Problemas comuns:** não aparece som nenhum na lista (o **Carregar som** foi na Bailarina? tem que ser com ela selecionada) · o som toca mas a bailarina não mexe (o script da dança ficou em **outro** ator: arraste-o para a Bailarina) · a dança é mais rápida que a música (o `espere` está em **0.25**, ou o Tempo do Compositor não era 120) · o som não toca (volume do sistema, fone, ou o MP3 foi exportado com o Length **64** e a música tem um monte de silêncio no fim: tudo bem, é a batida da Aula 7 que vai casar com o começo).

Se a turma travar, mostre o projeto pronto: `aulas/demos/Aula6-Melodias-pronto.sb3`.
</div>

## 8. Salvar, entregar e fechar (43–45 min)

- **Salvar** (slide 19): **Arquivo → Salvar como...** → nome **Melodias** → Salvar.
- **Entregar trabalho** (o botão na área de trabalho, ou a página **Entregar** da Sala): **três arquivos** — o **`.sb3`**, o **MP3** e o **`.midi`**. Todos ficam em **Downloads** (o `.sb3` também).
- Antes de desligarem: no painel da Sala, aba **Entregas**, confira que cada um mandou os três.
- **Perguntas finais** (slide 21): *"Qual nota é o C4?"* (o dó do meio) · *"Quantas notas tem uma escala?"* (sete, e a oitava repete a primeira) · *"Quantos segundos tem uma batida a 120 bpm?"* (meio segundo)
- **Próxima aula (Batidas):** *"vamos fazer a **bateria** dessa música — e as duas vão tocar juntas no Scratch!"* As músicas ficam guardadas em **Meus arquivos**.

## Gabarito da Ficha 6 {style="break-before: page"}

<div class="cols" markdown="1">
<div markdown="1">
**1.** dó = **C** · ré = **D** · mi = **E** · fá = **F** · sol = **G** · lá = **A** · si = **B**. São **sete** notas; depois do si vem o **dó** de novo (mais agudo).

**2.** **C4** é o dó do **meio** do teclado; o **4** é a **oitava**. **C5** é mais **agudo** que C4 (uma oitava acima).

**3.** Em **4/4**: **quatro** batidas por compasso. A 120 bpm cada batida dura **0,5 s**; um compasso dura **2 s**; oito compassos duram **16 s**.

**4.** A escala de dó maior é **C D E F G A B** (dó ré mi fá sol lá si). Todas são teclas **brancas**.
</div>
<div markdown="1">
**5.** **dó maior → dó mi sol** (C E G) · **fá maior → fá lá dó** (F A C) · **sol maior → sol si ré** (G B D). Na **escala** de sol maior, o **fá vira fá♯** — o **acorde** de sol maior (**sol si ré**) não tem fá.

**6.** **Play** = tocar · **Tempo** = andamento (batidas por minuto) · **Save to disk** = salvar a partitura (`.midi`).

**7.** `toque o som (brilha v) até o fim` · `espere (0.5) seg` — **0,5 s** é uma batida a 120 bpm: a bailarina troca de fantasia uma vez por batida.

**8.** Desenho: **cinco linhas**; o **dó (C4)** na **linha extra** logo abaixo da pauta, o **sol (G4)** na **segunda linha** de baixo para cima.
</div>
</div>

<div class="teacher" markdown="1">
**Desafio extra — a sua música original.** A resposta é o caminho inteiro, na ordem: compor **8 compassos** com as sete notas → **Play** para conferir → **Save/Load → Export to .wav or .mp3**, nome e formato **mp3** → **Save/Load → Save to disk** para o `.midi` → no Scratch, **Carregar som** na Bailarina → os dois scripts (o som na bandeira e a dança com `espere (0.5) seg`) → **Salvar** e **Entregar trabalho** com os três arquivos. **O que avaliar:** a música tem **8 compassos** (Length 32), o MP3 e o `.midi` foram entregues com o mesmo nome, e a bailarina troca de fantasia **no ritmo**.
</div>

## Resposta do Desafio extra {style="break-before: page"}

**A sua música original** é a aula inteira, feita sozinho. A ordem:

1. **Compor:** com o primeiro instrumento, **8 compassos** de uma melodia sua — só as notas brancas (dó ré mi fá sol lá si), uma nota por batida ou algumas de **dois tempos** (mude o **Duration** antes de clicar).
2. **Conferir:** ▶️ **Play**; se alguma nota estiver na oitava errada, clique nela para tirar e ponha de novo na linha certa.
3. **Exportar:** **Save/Load → Export to .wav or .mp3**, **File Name** = o seu nome, **Format** = **mp3**; depois **Save to disk** com o mesmo nome para o `.midi`.
4. **No Scratch:** abra o **`Aula6-Melodias`**, clique na **Bailarina**, **Sons → Carregar som**, escolha o seu MP3, e monte os dois scripts:

<div class="cols" markdown="1">
<div markdown="1">
```blocks
quando @greenFlag for clicado
toque o som (minha-musica v) até o fim
```
</div>
<div markdown="1">
```blocks
quando @greenFlag for clicado
sempre
  próxima fantasia
  espere (0.5) seg
end
```
</div>
</div>

5. **Entregar:** **Arquivo → Salvar como...** → **Melodias** → **Entregar trabalho** com o `.sb3`, o MP3 e o `.midi`.

**Para ir além:** ponha uma **segunda nota junto** da primeira de cada compasso (clique na pauta de baixo, na mesma batida): a música ganha um **baixo**, como a mão esquerda do piano.
