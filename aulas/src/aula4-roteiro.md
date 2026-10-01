---
title: Aula 4 — Roteiro do professor
kind: doc
---

# Aula 4 — Pong: a bola e as raquetes

**Sexta, 09/10 · 16h às 17h · Roteiro do professor**

<div class="box" markdown="1">
**Ao final da aula, cada criança consegue:**

1. fazer a bola andar sozinha com **duas variáveis**: **vx** (para os lados) e **vy** (para cima e para baixo);
2. fazer a bola **quicar**: bateu, a velocidade **troca de sinal** (`(0) - (vy)`);
3. mover uma raquete **sem engasgar**, com `sempre` + `se <tecla … pressionada?>`;
4. fazer a bola **rebater nas raquetes** e jogar **em dupla** no mesmo teclado.
</div>

## Antes da aula

- ☐ No notebook: `cd ~/scratch/sala && just sala pong`.
- ☐ Ligar os computadores (pendrive, "copiar para RAM").
- ☐ Projetor com `aula4-slides.pdf`; no notebook, deixe aberto `Aula5-PongInicio` (pasta `aulas/projetos/`): é o Pong desta aula pronto, para mostrar.
- ☐ Imprimir a **Ficha 4** (12 + 3 extras, frente e verso) e a **folha de desafios** (`aula4-desafios.pdf`, 6 cópias).
- ☐ Deixar o quadro livre para um plano cartesiano.

## Cronograma

Cerca de **45 minutos úteis**, contando a partir do momento em que a turma está sentada com o computador ligado.

| Tempo | Atividade | Material |
|---|---|---|
| 0–8 min | Lembra? · Sala e Pong | slides 1–3, Sala |
| 8–11 min | Um pouco de história | slides 4–5 |
| 11–18 min | Como você programaria? · quadro | slides 6–9, quadro |
| 18–40 min | Programando: a bola, as raquetes, a rebatida | slides 10–14, `Aula4-Pong` |
| 40–45 min | Salvar, entregar e jogar em dupla | slides 15 e 17 |

## 1. Lembra? · Sala e Pong (0–8 min)

Três perguntas rápidas (slide 2): *"O que é uma variável?"* (uma caixa com nome que guarda um número) · *"Para a fruta cair, o y aumenta ou diminui?"* (diminui) · *"Que bloco faz um sorteio?"* (`número aleatório`)

Cada um abre a **Sala** (favorito no Firefox), escolhe o nome e joga o **Pong** do dia contra o computador: **setas** (ou **W** e **S**) movem a raquete. Uns **4 minutos**. O placar do Pong é automático.

## 2. Um pouco de história (8–11 min)

**Slide 4 — Antes do Pong.** Em **1958**, o físico **William Higinbotham** montou o *Tennis for Two* para uma exposição: um jogo de **tênis** na telinha de um **osciloscópio** (um aparelho de laboratório), com dois controles de alumínio — o povo fazia fila para jogar! Em **1962**, **Steve Russell** e um grupo de amigos do **MIT** criaram o *Spacewar!*: duas naves duelando num computador enorme, o PDP-1. Os dois estão entre os **primeiros videogames** da história.

**Slide 5 — Pong (1972).** Em 1971, Nolan Bushnell e Ted Dabney fizeram o *Computer Space*, o primeiro fliperama de videogame **à venda** — mas ele não foi o sucesso que esperavam. Os dois fundaram a **Atari**, e **Allan Alcorn** criou o **Pong** como um **treino** (sem programa: era tudo circuito eletrônico!). A máquina de teste foi para um bar, o *Andy Capp's Tavern*. Dias depois, o dono chamou: *"a máquina quebrou!"* Alcorn abriu e descobriu o defeito: a **caixa de moedas estava cheia demais**! O Pong foi o **primeiro videogame de grande sucesso**. *"E hoje nós vamos programar o nosso!"*

<div class="teacher" markdown="1">
**Cuidado com "o primeiro videogame":** depende da definição. O *Tennis for Two* às vezes é chamado de primeiro; o *Spacewar!* foi o primeiro a rodar em vários computadores; o *Computer Space* foi o primeiro fliperama vendido; o Pong, o primeiro **sucesso**. Diga "um dos primeiros". Fontes: os artigos *Tennis for Two*, *Spacewar!*, *Computer Space* e *Pong* da Wikipédia.
</div>

## 3. Como você programaria? (11–18 min)

**Pergunte** (slide 6): *"Quais são os personagens do Pong? O que cada um faz?"* (duas raquetes que sobem e descem; uma bola que anda sozinha e quica) · *"Como a bola sabe para onde ir?"*

**A bola anda** (slide 7). No quadro, um plano cartesiano com a bola em (0, 0). A cada instante ela anda **5 para o lado** e **3 para cima**: marque (5, 3), (10, 6), (15, 9)… *"Esses dois números são a **velocidade** da bola. Vamos guardar cada um numa variável: **vx** (velocidade no x) e **vy** (velocidade no y)."*

**Bateu, virou!** (slide 8). Desenhe a bola subindo até a parede de cima. *"Ela vinha subindo com vy = 3. Bateu. E agora?"* (desce: **vy = -3**). Só o **sinal** muda! No Scratch: `mude [vy] para ((0) - (vy))`, porque 0 - 3 = -3, e 0 - (-3) = 3. **Pergunte:** *"E quando bate do lado, qual troca?"* (o **vx**)

**A raquete é uma parede que anda** (slide 9): bateu na raquete, troca o **vx**, igual à parede do lado.

<div class="teacher" markdown="1">
A **Ficha 4** é para casa (ou para quem esperar ajuda). O exercício 1 (onde a bola está a cada instante) é o que você acabou de fazer no quadro.
</div>

## 4. Programando o Pong (18–40 min)

Cada um abre `Aula4-Pong` (pasta **Aulas**): a quadra preta com a rede, **Raquete1** (esquerda), **Raquete2** (direita) e a **Bola**, sem nenhum bloco. Primeiro crie as variáveis **vx** e **vy** (**Variáveis → Criar uma Variável**, "Para todos os atores").

**Passo 1 — A bola sozinha quica nas 4 paredes** (slides 10–11, ~8 min). Clique na **Bola**:

<div class="cols" markdown="1">
<div markdown="1">
```blocks
quando @greenFlag for clicado
vá para x: (0) y: (0)
mude [vx v] para (5)
mude [vy v] para (número aleatório entre (2) e (4))
sempre
  adicione (vx) a x
  adicione (vy) a y
  se <(posição y) > (174)> então
    mude [vy v] para ((0) - (vy))
  end
  se <(posição y) < (-174)> então
    mude [vy v] para ((0) - (vy))
  end
  se <(posição x) > (234)> então
    mude [vx v] para ((0) - (vx))
  end
  se <(posição x) < (-234)> então
    mude [vx v] para ((0) - (vx))
  end
end
```
</div>
<div markdown="1">
Monte só o primeiro `se` com eles; depois faça uma cópia (botão direito → **Duplicar**) para a parede de baixo: troque o `>` por um `<` novo (de **Operadores**) e o 174 por **-174**. As paredes do lado são iguais, com `posição x`, **234** e **vx**.

**Pergunte:** *"Por que 174 e não 180?"* (a bola tem 12 de altura: o **meio** dela bate quando a borda já encostou) · *"Por que o vy é sorteado entre 2 e 4, e não entre 0 e 4?"* (com vy = 0 a bola iria reto para sempre, sem nunca bater em cima ou embaixo)

**Confira:** a bola **nunca para**. Se ela grudar numa parede, um sinal está trocado (`>` no lugar de `<`) ou falta o `(0) - …`.
</div>
</div>

**Passo 2 — As raquetes** (slides 12–13, ~7 min). Primeiro, **mostre no projetor** o jeito "da Aula 2" na Raquete1:

```blocks
quando a tecla [w v] for pressionada
adicione (8) a y
```

Segure o **W**: a raquete anda um pouco, **engasga** e depois continua. *"Num jogo isso não serve! Vamos perguntar o tempo todo se a tecla está apertada."* Apague esse script e monte com eles:

<div class="cols" markdown="1">
<div markdown="1">
```blocks
quando @greenFlag for clicado
vá para x: (-200) y: (0)
sempre
  se <tecla [w v] pressionada?> então
    adicione (8) a y
  end
  se <tecla [s v] pressionada?> então
    adicione (-8) a y
  end
end
```
</div>
<div markdown="1">
A **Raquete2** é igual: **arraste o script** até a Raquete2 na lista de atores (ele é copiado), e troque **x: 200**, **seta para cima** e **seta para baixo**.

**Pergunte:** *"Por que agora a raquete não engasga?"* (o `sempre` pergunta **o tempo todo** se a tecla está apertada; o bloco de evento espera o teclado repetir a tecla)
</div>
</div>

**Passo 3 — A bola rebate nas raquetes** (slide 14, ~7 min). Na **Bola**, mais dois `se` **dentro do sempre**:

```blocks
se <<tocando em (Raquete1 v)?> e <(vx) < (0)>> então
  mude [vx v] para ((0) - (vx))
end
se <<tocando em (Raquete2 v)?> e <(vx) > (0)>> então
  mude [vx v] para ((0) - (vx))
end
```

**Pergunte:** *"Por que o `e <(vx) < (0)>`?"* Deixe alguém tirar e jogar até a bola bater **na ponta** da raquete: ela **gruda** e treme, porque continua encostada e troca de sinal de novo a cada instante. Com o `e`, ela só rebate quando está **indo na direção** da raquete (vx < 0 = indo para a esquerda).

<div class="teacher" markdown="1">
A bola ainda **não sai** do jogo: ela quica nas paredes do lado também, e ninguém perde. É de propósito — **na próxima aula** as paredes do lado viram **gol**, com placar para cada jogador.

**Se aos 32 minutos ainda houver gente no passo 1**, faça o passo 2 só com a Raquete1 e o passo 3 só com o primeiro `se`: o jogo funciona como "paredão" para um jogador.

**Problemas comuns:** a bola não anda (as variáveis estão em zero: falta o `mude [vx] para (5)`, ou ele está dentro do `sempre`) · a bola sai do palco e some (`>` e `<` trocados) · a raquete anda para o lado errado (8 e -8 trocados) · a Raquete2 não mexe (o script ficou com as teclas W e S) · a bola atravessa a raquete (o `se` ficou fora do `sempre`).
</div>

**Desafios** (quem terminar; slide 16):

<div class="cols" markdown="1">
<div markdown="1">
**⭐ A raquete não foge.** Dentro do sempre: `se <(posição y) > (150)> então mude y para (150)`, e o mesmo para -150.

**⭐ Bola mais rápida.** `mude [vx] para (7)`.
</div>
<div markdown="1">
**⭐⭐ Contador de toques.** Variável **toques**: zera na bandeira, `adicione (1) a [toques]` nos `se` das raquetes.
</div>
</div>

<div class="keep" markdown="1">

**⭐⭐⭐ Desafio extra — squash, o Pong de um jogador só.** Apague a **Raquete2**. Agora a parede da direita é o "adversário" que sempre devolve. Mas a parede da **esquerda** não pode mais devolver: a bola passou da sua raquete, **perdeu**!

<div class="cols" markdown="1">
<div markdown="1">
Troque o último `se` das paredes por:

```blocks
se <(posição x) < (-234)> então
  diga [Perdeu!] por (2) segundos
  pare [todos v]
end
```
</div>
<div markdown="1">
Junte com o **contador de toques** e desafie a turma: *"Quantos toques você aguenta?"* **Pergunte:** *"E se fossem dois jogadores, o que mudaria?"* (cada lado perde quando a bola passa: é exatamente o que vamos fazer na Aula 5)
</div>
</div>

</div>

<div class="teacher" markdown="1">
**Folha de desafios** (`aula4-desafios.pdf`, 8 cartões de ⭐ a ⭐⭐⭐): entregue para quem já tem a bola rebatendo nas raquetes. **Respostas:** *saque para cima ou para baixo* — o `se` sorteia 1 ou 2; quando sai 1, o vy troca de sinal · *rastro* — a caneta desce depois do `vá para`, senão risca do lugar antigo até o centro · *obstáculo* (⭐⭐⭐) — a cópia (**Raquete3**) vem com o script da Raquete1: apague-o e ponha `sempre` + `deslize por (1) segs. até x: (0) y: (120)` e `deslize por (1) segs. até x: (0) y: (-120)`; na Bola, `se <<tocando em (Raquete3)?> e <(posição x) < (0)>> então mude [vx] para (-5)` e o espelho com `> (0)` e `5`. Quem fez a ⭐ "bola mais rápida" usa o próprio número (7 em vez de 5).
</div>

## 5. Salvar, entregar e jogar em dupla (40–45 min)

- **Salvar** (slide 15): **Arquivo → Salvar como...** → nome **Pong** → Salvar. Depois, o botão **Entregar trabalho** na área de trabalho (ou a página **Entregar** da Sala). **Importante:** na próxima aula vamos continuar este mesmo jogo!
- Antes de desligarem: no painel da Sala, aba **Entregas**, confira que chegaram **12** trabalhos.
- **Em dupla, num computador só:** quem fica à esquerda joga com **W** e **S**, quem fica à direita com as **setas**. Duas ou três duplas mostram no projetor.
- **Perguntas finais** (slide 17): *"O que acontece com o vy quando a bola bate em cima?"* (troca de sinal) · *"Por que a raquete não engasgou desta vez?"* (o `sempre` pergunta o tempo todo se a tecla está apertada)
- **Próxima aula:** *"O placar e as regras: quem fizer 5 pontos primeiro, ganha!"*

## Gabarito da Ficha 4 {style="break-before: page"}

<div class="cols" markdown="1">
<div markdown="1">
**1.** x: 0, 5, 10, **15, 20, 25** · y: 0, 3, 6, **9, 12, 15** · **a)** direita · **b)** subindo

**2.** vy = 4 → **-4** · vy = -2 → **2** · vx = 5 → **-5** · vx = -5 → **5**
</div>
<div markdown="1">
**3.** a) **vy** · b) **vy** · c) **vx** · d) **vx**

**4.** Raquete2: **seta para cima**, **seta para baixo** e **-8**

**5.** Desenho livre: o caminho faz um "V" deitado em cada batida.
</div>
</div>
