---
title: Aula 3 — Roteiro do professor
kind: doc
---

# Aula 3 — Pega-frutas: o nosso primeiro jogo

**Terça, 06/10 · 16h às 17h · Roteiro do professor**

<div class="box" markdown="1">
**Ao final da aula, cada criança consegue:**

1. fazer um ator **seguir o mouse** só para os lados: `vá para x: (posição x do mouse) y: (-150)`;
2. fazer um ator **cair** (o **y diminui**) e **voltar para o alto** num lugar **sorteado** (`número aleatório`);
3. saber o que é uma **variável**: uma **caixa com nome** que guarda um número (os **pontos**);
4. usar `se <tocando em …?> então` para **ganhar ponto** quando a fruta cai na tigela.
</div>

## Antes da aula

- ☐ No notebook: `cd ~/scratch/sala && just sala kaboom` e confira no painel (**Aulas**) que as Aulas 3 (06/10) e 4 (09/10) estão cadastradas.
- ☐ Ligar os computadores (pendrive, "copiar para RAM").
- ☐ Projetor com `aula3-slides.pdf`; no notebook, deixe aberto o jogo pronto `aulas/demos/Aula3-PegaFrutas-pronto.sb3` para mostrar.
- ☐ Imprimir a **Ficha 3** (12 + 3 extras, frente e verso) e a **folha de desafios** (`aula3-desafios.pdf`, 6 cópias).
- ☐ Deixar o quadro livre para desenhar o palco do jogo.

## Cronograma

São cerca de **45 minutos úteis**: os tempos abaixo contam a partir do momento em que a turma está sentada com o computador ligado.

| Tempo | Atividade | Material |
|---|---|---|
| 0–9 min | Lembra? · Sala e Kaboom! | slides 1–3, Sala |
| 9–12 min | Um pouco de história | slides 4–5 |
| 12–19 min | Como você programaria? · quadro | slides 6–9, quadro |
| 19–40 min | Programando o Pega-frutas | slides 10–13, `Aula3-PegaFrutas` |
| 40–45 min | Salvar, entregar e mostrar | slides 14 e 16 |

## 1. Lembra? · Sala e Kaboom! (0–9 min)

Enquanto os computadores terminam de ligar, três perguntas rápidas (slide 2): *"Onde o gato mora quando começa?"* (0, 0) · *"Andar para baixo é y positivo ou negativo?"* (negativo) · *"Qual é a regra de ouro do (x, y)?"* (primeiro o x, para o lado; depois o y, para cima ou para baixo).

Cada um abre o Firefox, clica no favorito **Sala**, escolhe o **nome** em *"Quem sou eu?"* e abre o **jogo do dia: Kaboom!** Teclas: **x** começa a rodada, **setas ← →** movem os baldes (também aparecem ao lado do jogo). Deixe jogar uns **5 minutos**.

<div class="teacher" markdown="1">
O placar do Kaboom! é automático: os pontos vão sozinhos para o **placar** quando a partida acaba (o último balde explode). Partida que ainda está no meio quando a turma para não conta — avise *"último minuto!"* antes de encerrar.
</div>

## 2. Um pouco de história (9–12 min)

**Slide 4 — Kaboom! (1981).** Feito pela **Activision** para o **Atari 2600**. O Bombardeiro Maluco solta bombas cada vez mais rápido, e o jogador pega com **baldes de água**. O controle era um **botão de girar** (o *paddle*): girando para um lado e para o outro, os baldes andam. Vendeu **mais de 1 milhão** de cartuchos. *"Vocês jogaram com as setas; em 1981 era girando um botão!"*

**Slide 5 — Quem fez?** Em **1979**, programadores que trabalhavam na **Atari** saíram e criaram a **Activision**: foi a **primeira** empresa a fazer jogos para o videogame de **outra** empresa. Eles achavam que o programador merecia aparecer, e o **nome de quem programou** vinha no manual. E quem fizesse muitos pontos podia mandar uma **foto da TV** pelo correio e ganhava um **emblema** de presente.

<div class="teacher" markdown="1">
**Se perguntarem:** o Kaboom! foi programado por **Larry Kaplan**, com **David Crane** desenhando os baldes e o bombardeiro. A ideia veio de um fliperama da Atari chamado *Avalanche* (1978), em que caíam pedras: o Kaplan não conseguiu fazer as pedras no Atari 2600 e trocou por um bombardeiro soltando bombas. Fontes: os artigos *Kaboom! (video game)* e *Activision* da Wikipédia.
</div>

## 3. Como você programaria? (12–19 min)

Mostre o jogo pronto no projetor (`Aula3-PegaFrutas-pronto`): a tigela segue o mouse e as frutas caem. **Pergunte** (slide 6): *"Se vocês fossem programar este jogo, quais são os personagens? O que cada um faz?"* Anote no quadro as respostas, nesta forma:

<div class="cols" markdown="1">
<div markdown="1">
**Tigela** 🥣

- fica sempre **embaixo**: y = **-150**;
- anda **para os lados** junto com o mouse: o x dela é o **x do mouse**.
</div>
<div markdown="1">
**Fruta** 🍎

- nasce no **alto** (y = **180**), num x **sorteado**;
- **cai**: o y **diminui** um pouco de cada vez;
- chegou lá embaixo? **volta para o alto**;
- caiu na tigela? **ganha ponto** e volta para o alto.
</div>
</div>

Desenhe o palco (um retângulo), a tigela embaixo com uma seta ⬅️➡️ e a fruta no alto com uma seta ⬇️. **Pergunte:**

- *"Para a fruta descer, o y aumenta ou diminui?"* (diminui: `adicione (-5) a y`, slide 8)
- *"Por que sortear o x entre -200 e 200, e não entre -240 e 240?"* (em 240 metade da fruta fica fora do palco — igual aos 4 cantos da Aula 2)

**A variável** (slide 9). Desenhe uma **caixa** com a etiqueta **pontos** e o número **0** dentro. Cada fruta pega: apague o número e escreva o próximo. *"Uma variável é uma caixa com nome que guarda um número. O jogo olha dentro da caixa para mostrar os pontos."*

<div class="teacher" markdown="1">
A **Ficha 3** é para casa (ou para quem esperar ajuda). O exercício 1 (a tabela da fruta caindo) pode ser feito no quadro, todos juntos, se sobrar um minuto aqui.
</div>

## 4. Programando o Pega-frutas (19–40 min)

Cada um abre `Aula3-PegaFrutas` (pasta **Aulas**): já tem o fundo, a **Tigela** e a **Fruta**, sem nenhum bloco. Vamos em **três passos**, e **cada passo tem que funcionar** antes do próximo: confira passando nas mesas.

**Passo 1 — A tigela segue o mouse** (slide 10, ~5 min). Clique na **Tigela** e monte:

```blocks
quando @greenFlag for clicado
sempre
  vá para x: (posição x do mouse) y: (-150)
end
```

O `posição x do mouse` fica em **Sensores**. **Pergunte:** *"E se eu tirar o `sempre`?"* (a tigela só vai uma vez para o mouse e para) · *"Por que o y é sempre -150?"* (a tigela não pode subir!)

**Passo 2 — A fruta cai e volta** (slide 11, ~7 min). Clique na **Fruta**:

```blocks
quando @greenFlag for clicado
vá para x: (número aleatório entre (-200) e (200)) y: (180)
sempre
  adicione (-5) a y
  se <(posição y) < (-170)> então
    vá para x: (número aleatório entre (-200) e (200)) y: (180)
  end
end
```

O `<( ) < ( )>` e o `número aleatório` ficam em **Operadores**; o `posição y`, em **Movimento** (lá embaixo).

<div class="teacher" markdown="1">
**Não troque o -170 por -180.** O Scratch não deixa um ator sair inteiro do palco: ele segura a fruta na borda de baixo, e algumas frutas nunca chegam a -180 — elas ficariam **presas lá embaixo** para sempre. Se alguém tiver a fruta parada no chão, é isso.
</div>

**Passo 3 — Os pontos** (slide 12, ~6 min). Em **Variáveis → Criar uma Variável**, nome **pontos**, deixe marcado **"Para todos os atores"** → OK. Aparece um mostrador no palco. Na **Fruta**, coloque `mude [pontos] para (0)` logo depois da bandeira e, **dentro do sempre**, um segundo `se`:

```blocks
se <tocando em (Tigela v)?> então
  adicione (1) a [pontos v]
  vá para x: (número aleatório entre (-200) e (200)) y: (180)
end
```

**Pergunte:** *"Por que a fruta precisa voltar para o alto depois do ponto?"* Deixe alguém tirar o `vá para` e testar: os pontos **disparam** (10, 20, 30…), porque a fruta continua encostada na tigela e o `sempre` conta de novo a cada instante.

**Passo 4 — Fruta surpresa** (slide 13, ~3 min). A Fruta tem **5 fantasias** (aba **Fantasias**). Depois de **cada** `vá para x: … y: (180)`:

```blocks
mude para a fantasia (número aleatório entre (1) e (5))
```

<div class="teacher" markdown="1">
**Se aos 30 minutos ainda houver gente no passo 2, pule o passo 4:** ele é o primeiro cartão ⭐⭐ da folha de desafios. Melhor todos com pontos funcionando do que metade com frutas surpresa.

**Problemas comuns:** a tigela não se mexe (faltou o `sempre`, ou o script está na Fruta) · a fruta cai uma vez só (o `adicione (-5) a y` está fora do `sempre`) · a fruta fica parada embaixo (veja o -170 acima) · os pontos disparam (faltou o `vá para` dentro do `se`) · a variável não aparece no menu (foi criada com outro nome).
</div>

**Desafios** (quem terminar; slide 15):

<div class="cols" markdown="1">
<div markdown="1">
**⭐ Fruta mais rápida.** Troque o `-5` por `-8` (ou `-15`).

**⭐ Pegou, tocou!** Dentro do `se <tocando em (Tigela)?>`: `toque o som (Pop)`.
</div>
<div markdown="1">
**⭐⭐ Três vidas.** Variável **vidas** começando em 3; perde uma dentro do `se <(posição y) < (-170)>` (a fruta caiu no chão); em 0, `diga [Fim de jogo!]` e `pare [todos]`.
</div>
</div>

<div class="keep" markdown="1">

**⭐⭐⭐ Desafio extra — o bombardeiro.** No Kaboom!, as bombas não aparecem do nada: o bombardeiro anda lá em cima e solta cada uma de onde está. Adicione o ator **Parrot** (o papagaio) e faça ele soltar as frutas.

<div class="cols" markdown="1">
<div markdown="1">
**No papagaio:**

```blocks
quando @greenFlag for clicado
sempre
  deslize por (1) segs. até x: (número aleatório entre (-200) e (200)) y: (150)
end
```
</div>
<div markdown="1">
**Na fruta**, troque **os três** `vá para x: (número aleatório …) y: (180)` por:

```blocks
vá para x: ([posição x v] de (Parrot v)) y: (150)
```

O `[posição x] de (Parrot)` está em **Sensores** (escolha o Parrot no menu da direita e depois "posição x"). **Pergunte:** *"Por que o papagaio usa `deslize` e não `vá para`?"* (com `vá para` ele pularia de um lado para o outro; com `deslize` dá para ver para onde ele vai e correr com a tigela)
</div>
</div>

</div>

<div class="teacher" markdown="1">
**Folha de desafios** (`aula3-desafios.pdf`, 8 cartões de ⭐ a ⭐⭐⭐): entregue para quem já tem os **pontos** funcionando. **Respostas dos ⭐⭐⭐:** *pedra* — o script copiado com `adicione (-1) a [pontos]` (ou `pare [todos]`) no `se <tocando em (Tigela)?>`; *cada vez mais rápido* — `mude [velocidade] para (5)` no começo, `adicione ((0) - (velocidade)) a y` no lugar do `adicione (-5) a y`, e `adicione (1) a [velocidade]` dentro do `se` da tigela. O `((0) - (velocidade))` volta na próxima aula, no Pong!
</div>

## 5. Salvar, entregar e mostrar (40–45 min)

- **Salvar** (slide 14): **Arquivo → Salvar como...** → nome **PegaFrutas** → Salvar. Depois, o botão **Entregar trabalho** na área de trabalho (ou a página **Entregar** da Sala).
- Antes de desligarem: no painel da Sala, aba **Entregas**, confira que chegaram **12** trabalhos. Quem não aparece, ajude a entregar.
- Uma ou duas crianças mostram o jogo no projetor: *"Quantos pontos você fez?"*
- **Perguntas finais** (slide 16): *"O que é uma variável?"* (uma caixa com nome que guarda um número) · *"Para a fruta cair, o y aumenta ou diminui?"*
- **Próxima aula:** *"Vamos programar o **Pong**, um dos videogames mais famosos da história — e jogar em dupla!"*

## Gabarito da Ficha 3 {style="break-before: page"}

<div class="cols" markdown="1">
<div markdown="1">
**1.** 180, 175, **170, 165, 160, 155** · **a)** y = **130** · **b)** descendo · **c)** a fruta **subiria** (y aumenta)

**2.** pontos = **3** · vidas = **1**

**3.** Tigela: y = **-150** · Fruta: y = **180**
</div>
<div markdown="1">
**4.** ganha um ponto: **D** · sorteia um número: **A** · encostou na tigela: **C** · onde o mouse está: **B**

**5.** Podem sair **1, 3 e 5** (o sorteio vai de 1 até 5, incluindo os dois). 0, 6 e 10 não.

**6.** Desenho livre.
</div>
</div>
