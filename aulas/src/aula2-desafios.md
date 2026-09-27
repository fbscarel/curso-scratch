---
title: Desafios — Aula 2
kind: doc
---

# Desafios da Aula 2 ⭐

**Terminou tudo? Escolha um desafio!** Quando conseguir, marque ☐ e mostre para o professor.
&nbsp; ⭐ fácil · ⭐⭐ médio · ⭐⭐⭐ difícil

<div class="cols cards" markdown="1">

<div class="box" markdown="1">
### ⭐ Onde está o gato?

Na categoria **Movimento**, lá embaixo, marque o quadradinho ☑ ao lado destes dois blocos:

```blocks
(posição x)

(posição y)
```

Os números aparecem no palco! Use as setas e leve o gato até:

(100, 50) ☐ &nbsp; (-150, 0) ☐ &nbsp; (0, -120) ☐
</div>

<div class="box" markdown="1">
### ⭐ De volta para casa

```blocks
quando a tecla [espaço v] for pressionada
vá para x: (0) y: (0)
```

Passeie com as setas e aperte **espaço**. Onde o gato foi parar?

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐ O gato olha para o lado certo

```blocks
quando a tecla [seta para direita v] for pressionada
aponte para a direção (90)
adicione (10) a x
```

Na seta **esquerda**, use a direção **-90**. O gato ficou de ponta-cabeça? Coloque isto no início:

```blocks
quando @greenFlag for clicado
defina o estilo de rotação para [esquerda-direita v]
```

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐⭐ O gato persegue o mouse

```blocks
quando @greenFlag for clicado
sempre
deslize por (0.5) segs. até (ponteiro do mouse v)
end
```

Troque **0.5** por **2**. E por **0.1**? O que mudou?

☐ Consegui!
</div>

</div>

## Mais desafios: ⭐⭐ e ⭐⭐⭐ {style="break-before: page"}

<div class="cols cards" markdown="1">
<div markdown="1">

<div class="box" markdown="1">
### ⭐⭐ Pegue a estrela!

Adicione o ator **Star** (botão redondo com o **gatinho**, embaixo à direita). Clique na estrela e monte:

```blocks
quando @greenFlag for clicado
sempre
se <tocando em (Ator1 v)?> então
vá para (posição aleatória v)
end
end
```

Agora pegue a estrela com as setas!

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐⭐ Desenhe com as setas

Clique no botão azul **no canto de baixo, à esquerda** e escolha **Caneta**. Monte no gato:

```blocks
quando @greenFlag for clicado
apague tudo
vá para x: (0) y: (0)
use a caneta
```

Agora use as setas: o gato desenha! Escreva a primeira letra do seu nome.

☐ Consegui!
</div>
</div>

<div markdown="1">

<div class="box" markdown="1">
### ⭐⭐⭐ Um quadrado de coordenadas

```blocks
quando @greenFlag for clicado
apague tudo
vá para x: (-100) y: (-100)
use a caneta
vá para x: (100) y: (-100)
```

**Complete o quadrado:** leve o gato até (100,&nbsp;100), depois (-100,&nbsp;100) e volte para (-100,&nbsp;-100).

Depois: a **casa** do exercício 4 da Ficha 2! Multiplique por 40: A&nbsp;(-3,&nbsp;-3) vira (-120,&nbsp;-120).

☐ Consegui!
</div>

<div class="box" markdown="1">
### ⭐⭐⭐ Quadrado e triângulo

```blocks
quando @greenFlag for clicado
apague tudo
use a caneta
repita (4) vezes
mova (100) passos
gire @turnRight (90) graus
end
```

Troque o **4** e o **90** para desenhar um **triângulo**. **Dica:** a volta inteira tem **360** graus.

☐ Consegui!
</div>
</div>

</div>
