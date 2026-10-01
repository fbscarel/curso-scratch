---
title: Desafios — Aula 4
kind: doc
---

# Desafios da Aula 4 ⭐

**Terminou tudo? Escolha um desafio!** Quando conseguir, marque ☐ e mostre para o professor.
&nbsp; ⭐ fácil · ⭐⭐ médio · ⭐⭐⭐ difícil

<div class="cols cards" markdown="1">

<div class="box" markdown="1">
### ⭐ A raquete não foge

A raquete some lá em cima? Coloque **dentro do sempre** da Raquete1:

```blocks
se <(posição y) > (150)> então
  mude y para (150)
end
```

Faça o mesmo para **baixo** (-150). E na Raquete2!

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐ Raquete turbo

Nas raquetes, troque o **8** e o **-8** por números maiores:

```blocks
adicione (12) a y
```

Rápido demais? Ache o número que deixa o jogo mais gostoso.

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐ Bateu, tocou!

Na **Bola**, dentro dos dois `se` das raquetes, coloque:

```blocks
toque o som (Pop v)
```

Agora toda rebatida faz barulho!

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐ Bola mais rápida

Na **Bola**, troque a velocidade do saque:

```blocks
mude [vx v] para (7)
```

E com **9**? Quem ainda consegue rebater?

☐ Consegui!
</div>

</div>

## Mais desafios: ⭐⭐ e ⭐⭐⭐ {style="break-before: page"}

<div class="cols cards" markdown="1">
<div markdown="1">

<div class="box" markdown="1">
### ⭐⭐ Contador de toques

Crie a variável **toques**. Na bandeira: `mude [toques] para (0)`. Nos `se` das raquetes:

```blocks
adicione (1) a [toques v]
```

Jogue em dupla: quantos toques vocês conseguem sem errar?

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐⭐ Saque para cima ou para baixo

A bola sempre sai subindo. Logo depois do `mude [vy] para …`:

```blocks
se <(número aleatório entre (1) e (2)) = (1)> então
  mude [vy v] para ((0) - (vy))
end
```

Metade das vezes ela sai descendo!

☐ Consegui!
</div>
</div>

<div markdown="1">

<div class="box" markdown="1">
### ⭐⭐ O rastro da bola

Adicione a extensão **Caneta** (botão azul, embaixo à esquerda). Na **Bola**, depois do `vá para x: (0) y: (0)`:

```blocks
apague tudo
use a caneta
```

A bola desenha o caminho dela! Veja as batidas virando "V".

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐⭐⭐ Um obstáculo no meio

Clique com o botão direito na Raquete1 → **duplicar**. A cópia vem com o script da Raquete1: **apague-o**. Leve a cópia para o meio (x = 0) e faça ela subir e descer sozinha.

**Dicas:**

- ela anda com `deslize` dentro de um `sempre`;
- na Bola: tocou no obstáculo **e** está à esquerda (x < 0)? `mude [vx] para (-5)`. À direita? `mude [vx] para (5)`. (Bola mais rápida? Use o número dela.)

☐ Consegui!
</div>
</div>

</div>
