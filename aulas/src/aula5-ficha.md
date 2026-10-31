---
title: Ficha 5 — Pong
kind: doc
---

# Ficha 5 — Pong: o placar e as regras 🏆

**Nome:** <span class="blank" style="--w:95mm"></span>

<div class="tight" markdown="1">

## 1. De que lado é o gol?

O jogo confere onde a bola saiu do palco:

```blocks
se <(posição x) > (234)> então
  adicione (1) a [gols_1 v]
end
se <(posição x) < (-234)> então
  adicione (1) a [gols_2 v]
end
```

A bola saiu do palco e o placar estava **3 × 3**. Complete:

| A bola saiu em… | Ponto para | O placar fica |
|---|---|---|
| x = 235 | | |
| x = -235 | | |

**a)** Com **vx = 5**, a bola vai para a **direita** ou para a **esquerda**? <span class="blank" style="--w:30mm"></span>

**b)** E com **vx = -5**? <span class="blank" style="--w:30mm"></span>

## 2. A partida acaba?

O jogo termina quando **gols_1** ou **gols_2** chega a **7**. Complete:

| gols_1 | gols_2 | quem fez o gol | terminou? | o que aparece no palco |
|---|---|---|---|---|
| 0 | 0 | — | não | nada |
| 5 | 6 | Jogador 2 | | |
| 6 | 6 | Jogador 1 | | |
| 3 | 3 | Jogador 1 | não | 4 × 3, o jogo continua |

## 3. A jogada inteira {style="break-before: page"}

Cada rebatida **troca o sinal** e **soma 1** na velocidade. Complete a conta do **vx**:

| | saque | 1ª (Raquete2) | 2ª (Raquete1) | 3ª (Raquete2) | 4ª (Raquete1) |
|---|---|---|---|---|---|
| **vx** | 5 | -6 | 7 | | |

**a)** O número **sem o sinal** aumentou ou diminuiu? <span class="blank" style="--w:30mm"></span>

**b)** Depois de **qual** raquete o vx fica negativo? <span class="blank" style="--w:30mm"></span>

</div>

<div class="tight" markdown="1">

## 4. Qual `adicione` vai em cada `se`?

Na **Bola**, os dois `se` das raquetes precisam de um `adicione` cada. Escreva **1** ou **-1** dentro dos espaços:

<div class="cols" markdown="1">
<div markdown="1">

```blocks
se <<tocando em (Raquete1 v)?> e <(vx) < (0)>> então
  mude [vx v] para ((0) - (vx))
  adicione () a [vx v]
end
```
</div>
<div markdown="1">

```blocks
se <<tocando em (Raquete2 v)?> e <(vx) > (0)>> então
  mude [vx v] para ((0) - (vx))
  adicione () a [vx v]
end
```
</div>
</div>

**Por quê?** <span class="blank" style="--w:100mm"></span>

## 5. Complete o `fim_jogo`

```blocks
defina fim_jogo (jogador)
diga (junte [Vitória do jogador ] com ()) por () segundos
pare [ v]
```

**Por que não pode faltar o `por (2) segundos`?**

<div class="write-lines" style="--n:2"></div>

**Como foi a aula?** <span class="faces">😀 &nbsp; 🙂 &nbsp; 😐 &nbsp; 🙁</span>

</div>
