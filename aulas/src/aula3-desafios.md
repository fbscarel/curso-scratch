---
title: Desafios — Aula 3
kind: doc
---

# Desafios da Aula 3 ⭐

**Terminou tudo? Escolha um desafio!** Quando conseguir, marque ☐ e mostre para o professor.
&nbsp; ⭐ fácil · ⭐⭐ médio · ⭐⭐⭐ difícil

<div class="cols cards" markdown="1">

<div class="box" markdown="1">
### ⭐ Fruta mais rápida

Na **Fruta**, troque o número que faz ela cair:

```blocks
adicione (-8) a y
```

Ficou mais difícil? E com **-15**? Escolha a velocidade que deixa o jogo mais divertido.

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐ Pegou, tocou!

Na **Fruta**, dentro do `se <tocando em (Tigela)?>`, coloque:

```blocks
toque o som (Pop v)
```

Agora cada fruta pega faz barulho! Experimente outros sons da categoria **Som**.

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐ Tigela grande, tigela pequena

Na **Tigela**, coloque no começo do script:

```blocks
quando @greenFlag for clicado
defina o tamanho como (250) %
```

Ficou fácil? Agora tente **80**. Qual é o tamanho mais justo?

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐⭐ Fruta surpresa

A Fruta tem **5 fantasias** (veja a aba **Fantasias**). Coloque este bloco **logo depois de cada** `vá para x: … y: (180)`:

```blocks
mude para a fantasia (número aleatório entre (1) e (5))
```

Cada fruta nova é uma surpresa!

☐ Consegui!
</div>

</div>

## Mais desafios: ⭐⭐ e ⭐⭐⭐ {style="break-before: page"}

<div class="cols cards" markdown="1">
<div markdown="1">

<div class="box" markdown="1">
### ⭐⭐ Três vidas

Crie a variável **vidas**. No começo: `mude [vidas] para (3)`. Quando a fruta **cai no chão** (dentro do `se <(posição y) < (-170)>`), perca uma vida e confira:

```blocks
adicione (-1) a [vidas v]
se <(vidas) = (0)> então
  diga [Fim de jogo!] por (2) segundos
  pare [todos v]
end
```

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐⭐ Corrida de 30 segundos

Quantas frutas você pega em 30 segundos? Monte na **Tigela**:

```blocks
quando @greenFlag for clicado
espere (30) seg
pare [todos v]
```

O jogo para sozinho: quantos **pontos** você fez? **Dica:** em **Sensores**, marque ☑ o `cronômetro` para ver o tempo passando.

☐ Consegui!
</div>
</div>

<div markdown="1">

<div class="box" markdown="1">
### ⭐⭐⭐ Cuidado com a pedra!

Como no Kaboom!, nem tudo que cai é bom. Adicione o ator **Rocks** (a pedra).

**Dicas:**

- arraste o script da Fruta até a pedra: ele é **copiado**!
- na pedra, tocar na Tigela **tira** um ponto (ou acaba o jogo);
- faça a pedra cair num lugar diferente da fruta.

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐⭐⭐ Cada vez mais rápido

A cada fruta pega, a próxima cai mais rápido.

**Dicas:**

- crie a variável **velocidade**, começando em **5**;
- a fruta cai com `adicione ((0) - (velocidade)) a y`;
- quando pegar uma fruta: `adicione (1) a [velocidade]`.

Até quantos pontos você aguenta?

☐ Consegui!
</div>
</div>

</div>
