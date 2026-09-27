---
title: Demonstração — slides
kind: slides
---

---slide--- title-slide

# Curso de Scratch

## Aula 2 — O plano cartesiano 🐱

---slide---

## Onde está o gato?

- O palco é uma **grade**: x de -240 a 240, y de -180 a 180
- `x` negativo = **esquerda** · `x` positivo = **direita**
- `y` negativo = **embaixo** · `y` positivo = **em cima**
- O centro do palco é `x: 0 y: 0` — é ali que o gato começa

<div class="box" markdown="1">
O comando `vá para x: () y: ()` coloca o ator exatamente no ponto que você
escolher. Tente `x: 0 y: 0` para voltar ao centro!
</div>

---slide---

## Vamos programar!

```blocks
quando @greenFlag for clicado
vá para x: (0) y: (0)
sempre
  mova (10) passos
  se <tocando em (borda v)?> então
    diga [Ai! A borda!] por (2) segundos
    vá para x: (0) y: (0)
  end
end
```
