---
title: Ficha 4 — Pong
kind: doc
---

# Ficha 4 — Pong: a bola e as raquetes 🏓

**Nome:** <span class="blank" style="--w:95mm"></span>

<div class="tight" markdown="1">

## 1. A bola anda

A bola começa no centro **(0, 0)**. A cada instante ela anda **vx = 5** para o lado e **vy = 3** para cima:

```blocks
adicione (vx) a x
adicione (vy) a y
```

Complete onde a bola está:

| Instante | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| **x** | 0 | 5 | 10 | | | |
| **y** | 0 | 3 | 6 | | | |

**a)** A bola está indo para a **direita** ou para a **esquerda**? <span class="blank" style="--w:35mm"></span>

**b)** Ela está **subindo** ou **descendo**? <span class="blank" style="--w:35mm"></span>

## 2. Bateu, virou!

Quando a bola bate numa parede, a velocidade **troca de sinal**: o positivo vira negativo, e o negativo vira positivo.

<div class="box center" markdown="1">
**vy = 3** ➡️ bateu em cima ➡️ **vy = -3** · · · **0 - 3 = -3**
</div>

Complete:

| Antes | Bateu em… | Depois |
|---|---|---|
| vy = 4 | cima | vy = |
| vy = -2 | baixo | vy = |
| vx = 5 | raquete da direita | vx = |
| vx = -5 | raquete da esquerda | vx = |

</div>

<div class="tight" markdown="1">

## 3. Qual velocidade troca? {style="break-before: page"}

Circule a velocidade que **troca de sinal** em cada batida:

<div class="cols" markdown="1">
<div markdown="1">
**a)** bateu **em cima** → &nbsp; **vx** &nbsp; ou &nbsp; **vy**

**b)** bateu **embaixo** → &nbsp; **vx** &nbsp; ou &nbsp; **vy**
</div>
<div markdown="1">
**c)** bateu na raquete **esquerda** → &nbsp; **vx** &nbsp; ou &nbsp; **vy**

**d)** bateu na raquete **direita** → &nbsp; **vx** &nbsp; ou &nbsp; **vy**
</div>
</div>

## 4. As teclas das raquetes

A **Raquete1** (esquerda) usa **W** e **S**. Complete a **Raquete2** (direita), que usa as **setas**:

<div class="cols" markdown="1">
<div markdown="1">
**Raquete1**

```blocks
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
**Raquete2**

```blocks
sempre
  se <tecla [ v] pressionada?> então
    adicione (8) a y
  end
  se <tecla [ v] pressionada?> então
    adicione () a y
  end
end
```
</div>
</div>

## 5. Desenhe a quadra

Desenhe a **rede**, as **duas raquetes** e o **caminho da bola**: ela sai do centro, bate **em cima**, bate numa **raquete** e volta.

<div class="draw-box" style="--h:62mm"></div>

**Como foi a aula?** <span class="faces">😀 &nbsp; 🙂 &nbsp; 😐 &nbsp; 🙁</span>

</div>
