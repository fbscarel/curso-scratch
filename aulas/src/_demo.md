---
title: Demonstração — folha de atividades
kind: doc
---

# Aula 2 — O plano cartesiano

No Scratch, o palco é uma **grade de coordenadas**. O gato mora no meio dela:
quando ele está parado no centro, dizemos que ele está em `x: 0` e `y: 0`. 🐱🎯

O eixo **x** anda para os lados (esquerda ↔ direita) e o eixo **y** anda para
cima e para baixo. Cada passo do gato muda esses números. ➡️⬆️

## O palco e seus números

| O que é | Valor mínimo | Valor do meio | Valor máximo |
|---|---|---|---|
| posição **x** (horizontal) | -240 | 0 | 240 |
| posição **y** (vertical) | -180 | 0 | 180 |

<div class="cols box" markdown="1">

### Esquerda ↔ direita (x)

- números **negativos** ficam à esquerda
- números **positivos** ficam à direita
- `mude x para (100)` leva o gato para a direita

### Baixo ↕ cima (y)

- números **negativos** ficam embaixo
- números **positivos** ficam em cima
- `mude y para (100)` leva o gato para cima

</div>

## Os quatro blocos de hoje

```blocks
quando @greenFlag for clicado
mova (10) passos
diga [Olá, mundo!]
toque o som (Miau v)
```

## A grade do palco

<figure>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-260 -200 520 400" width="520" height="400" role="img" aria-label="Grade de coordenadas do palco do Scratch">
  <rect x="-240" y="-180" width="480" height="360" fill="#ffffff" stroke="#8a97a3" stroke-width="1.5"/>
  <line x1="-240" y1="-180" x2="-240" y2="180" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="-160" y1="-180" x2="-160" y2="180" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="-80" y1="-180" x2="-80" y2="180" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="80" y1="-180" x2="80" y2="180" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="160" y1="-180" x2="160" y2="180" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="240" y1="-180" x2="240" y2="180" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="-240" y1="-160" x2="240" y2="-160" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="-240" y1="-80" x2="240" y2="-80" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="-240" y1="80" x2="240" y2="80" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="-240" y1="160" x2="240" y2="160" stroke="#dfe5ea" stroke-width="1"/>
  <line x1="-240" y1="0" x2="240" y2="0" stroke="#0b6bb5" stroke-width="2"/>
  <line x1="0" y1="-180" x2="0" y2="180" stroke="#0b6bb5" stroke-width="2"/>
  <polygon points="240,0 230,-5 230,5" fill="#0b6bb5"/>
  <polygon points="0,-180 5,-170 -5,-170" fill="#0b6bb5"/>
  <text x="-240" y="16" font-size="15" fill="#5b6672" text-anchor="middle">-240</text>
  <text x="-160" y="16" font-size="15" fill="#5b6672" text-anchor="middle">-160</text>
  <text x="-80" y="16" font-size="15" fill="#5b6672" text-anchor="middle">-80</text>
  <text x="80" y="16" font-size="15" fill="#5b6672" text-anchor="middle">80</text>
  <text x="160" y="16" font-size="15" fill="#5b6672" text-anchor="middle">160</text>
  <text x="240" y="16" font-size="15" fill="#5b6672" text-anchor="middle">240</text>
  <text x="8" y="-155" font-size="15" fill="#5b6672">-160</text>
  <text x="8" y="-75" font-size="15" fill="#5b6672">-80</text>
  <text x="8" y="85" font-size="15" fill="#5b6672">80</text>
  <text x="8" y="165" font-size="15" fill="#5b6672">160</text>
  <text x="-8" y="16" font-size="15" fill="#5b6672" text-anchor="end">0</text>
  <text x="196" y="-8" font-size="15" fill="#0b6bb5" font-weight="bold">x</text>
  <text x="8" y="-166" font-size="15" fill="#0b6bb5" font-weight="bold">y</text>
  <circle cx="120" cy="80" r="7" fill="#e8a33d" stroke="#b45309" stroke-width="2"/>
  <text x="132" y="72" font-size="15" fill="#b45309">gato: x: 120 y: 80</text>
</svg>
<figcaption>O palco do Scratch: x vai de -240 a 240 e y vai de -180 a 180.</figcaption>
</figure>

<div class="teacher" markdown="1">
Peça para cada criança mover o gato com as **setas do teclado** e anotar os
valores de `posição x` e `posição y` na folha de baixo. Quem acertar onde fica
`x: 240 y: 180` (o canto de cima à direita) ganha um ponto extra. ⭐
</div>

<div class="pagebreak"></div>

# Para praticar

<div class="cols" markdown="1">

## Complete a frase

O gato está no canto de cima à esquerda quando
`x = ______` e `y = ______`.

</div>

<div class="write-lines" style="--n:4"></div>

## Desenhe o caminho do gato

Desenhe no quadro abaixo o caminho do gato saindo do centro (0, 0) até o canto
de baixo à direita (-240 → 240 e -180 → 180). ✏️

<div class="draw-box" style="--h:60mm"></div>

<p class="center small muted">Curso de Scratch — Santana/BA · folha de demonstração</p>
