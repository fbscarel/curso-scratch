---
title: Aula 5 — Roteiro do professor
kind: doc
---

# Aula 5 — Pong: o placar e as regras

**Terça, 03/11 · 16h às 17h · Roteiro do professor**

<div class="box" markdown="1">
**Ao final da aula, cada criança consegue:**

1. fazer o jogo **acabar aos 7**: o bloco `fim_jogo (jogador)` mostra **Vitória do jogador 1** e **para tudo**;
2. explicar por que a fala precisa de `por (2) segundos` antes do `pare [todos v]` (o `pare` apaga os balões de fala);
3. fazer a bola **acelerar a cada rebatida**: `adicione (1) a [vx v]` no `se` da Raquete1 e `adicione (-1) a [vx v]` no `se` da Raquete2;
4. dizer por que é **+1 de um lado e -1 do outro**: o **sinal** do vx é que diz para onde a bola vai.
</div>

## Antes da aula

- ☐ No notebook: `cd ~/scratch && git pull` — as folhas desta aula vêm do repositório.
- ☐ Com a Sala no ar (se o notebook reiniciou: `cd ~/scratch/sala && just sala`), abra o painel. Em **Aulas**, confira que a **Aula 5 (03/11)** está cadastrada: sem ela, a ficha e os desafios não aparecem para a turma. Se faltar, cadastre agora.
- ☐ Ainda no painel, em **Aula atual**, suba como **Projeto da aula** o arquivo `~/scratch/aulas/projetos/Aula5-PongInicio.sb3` — o do **repositório**, nunca a cópia de trabalho do notebook.
- ☐ Em **Jogos**: **Um jogo** e, em **Jogo ativo**, o **Pong** (ou **Desligados**).
- ☐ Ligar os computadores (pendrive, "copiar para RAM").
- ☐ Projetor com `aula5-slides.pdf`; no notebook, deixe aberto `aulas/demos/Aula5-Pong-pronto.sb3`: é o Pong desta aula pronto, para mostrar.
- ☐ Imprimir a **Ficha 5** (12 + 3 extras, frente e verso) e a **folha de desafios** (`aula5-desafios.pdf`, 6 cópias).
- ☐ Deixar o quadro livre para dois desenhos: a bola indo e voltando, e o vx mudando de sinal.

## Cronograma

Cerca de **45 minutos úteis**, contando a partir do momento em que a turma está sentada com o computador ligado.

| Tempo | Atividade | Material |
|---|---|---|
| 0–7 min | Lembra? · o Projeto da aula: jogar em dupla | slides 1–3, Sala |
| 7–12 min | O jogo que já temos: ler o script da Bola | slide 4, `Aula5-PongInicio` |
| 12–15 min | Um pouco de história | slides 5–6 |
| 15–22 min | Como você programaria? · quadro | slides 7–8, quadro |
| 22–32 min | Programando: a vitória aos 7 | slides 9–10 |
| 32–40 min | Como a bola acelera | slides 11–12 |
| 40–45 min | Jogar, salvar e entregar | slides 13–14 e 17 |

## 1. Lembra? · o Projeto da aula (0–7 min)

Três perguntas rápidas (slide 2): *"O que é uma variável?"* (uma caixa com nome que guarda um número) · *"Bateu na parede de cima, o que acontece com o vy?"* (troca de sinal) · *"Que teclas movem a Raquete2?"* (as setas; a Raquete1 usa **W** e **S**).

Cada um abre o **Projeto da aula** (um clique no cartão da página da Sala; se o cartão só **baixar**: **Arquivo → Carregar do seu computador → Downloads**). Joguem **em dupla**, uns 4 minutos: um fica à esquerda com **W** e **S**, o outro à direita com as **setas**. O placar é automático: cada lado tem o seu mostrador.

<div class="teacher" markdown="1">
O arquivo é o Pong da turma **como ficou no fim do encontro passado**: cada lado marca gol, o saque sai do meio (`bola_centro`) e o `fim_jogo` já existe — mas só mostra o número do jogador. Os mostradores do placar aparecem com **11 × 1** até a bandeira verde zerar: é o que ficou salvo, não é erro.

O Pong de cada um continua em **Meus arquivos**: quem quiser abrir o seu depois pode, mas a aula é no Projeto da aula, igual à tela do projetor.
</div>

## 2. O jogo que já temos: ler a Bola (7–12 min) {style="break-before: page"}

No projetor, clique na **Bola** e role o script. Vamos ler juntos **antes** de mexer (slide 4):

<div class="cols" markdown="1">
<div style="zoom: 0.9" markdown="1">

**O saque — `bola_centro`** (em **Meus Blocos**):

```blocks
defina bola_centro
vá para x: (0) y: (0)
espere (2) segs.
mude [vx v] para (5)
mude [vy v] para (número aleatório entre (2) e (4))
```
</div>
<div markdown="1">

**O gol** — dentro do `sempre`, um `se` para cada lado: a bola passou de **x = 234**? `adicione (1) a [gols_1 v]`, toque o som **Oops** e **`bola_centro`**. Passou de **x = -234**? O mesmo, com **gols_2**.
</div>
</div>

**Pergunte:** *"O que faz o `bola_centro`?"* (põe a bola no meio, espera 2 segundos e dá a saída) · *"Quem conta os gols?"* (a **Bola**: é ela que vê quando passa do x = 234) · *"Por que o `vx` é só da Bola?"* Na lista de variáveis dele, `vx` e `vy` aparecem com **"só para este ator"**: cada ator pode ter a sua variável. A raquete não precisa dela — e assim ninguém mexe na bola sem querer.

**E o `fim_jogo`?** Ele já existe, lá em **Meus Blocos**, mas só diz `diga (jogador)`: quando alguém chega a 7, aparece o número **1** ou **2** e o jogo continua. *"É isso que vamos consertar hoje."*

## 3. Um pouco de história (12–15 min)

**Slide 5 — A Magnavox Odyssey (1972).** Em **1972**, a **Magnavox** vendeu o **Odyssey**, o **primeiro videogame de casa**: uma caixa que liga na TV. Ele foi criado por **Ralph Baer** e a equipe dele, numa empresa que fazia equipamentos para o exército. O Odyssey não tinha cartucho: os jogos vinham em **cartões** que entravam no aparelho, e a TV só sabia mostrar **pontos e uma linha**. O resto do cenário era um **plástico transparente** colado na tela! Entre os **28 jogos** havia um **tênis** — e foi esse tênis que inspirou o Pong da Atari.

**Slide 6 — O Home Pong (1975).** Em **1975**, a **Atari** levou o Pong do fliperama para a **sala de casa**: um aparelho que liga na TV, com dois controles de girar. Quem vendia era a **Sears**, uma loja de departamentos americana, no **Natal de 1975** — e venderam perto de **150 mil** aparelhos naquela temporada. Para muita gente, foi ali que os **videogames em casa** começaram.

<div class="teacher" markdown="1">
**Se perguntarem mais:** Baer teve a ideia em **agosto de 1966**, esperando um ônibus; com Bill Harrison e Bill Rusch fez **sete protótipos**, e o sétimo, o **"Brown Box"**, foi mostrado a várias fábricas até a Magnavox aceitar produzir, em janeiro de 1971. Vendeu **350 mil** até sair de linha, em 1975, e custava **US$ 99,95**. O controle não era joystick: era uma caixa com um botão e botões de girar.

No Home Pong, em **1974** o engenheiro da Atari **Harold Lee** propôs a versão de casa, e **Allan Alcorn** (o do Pong de fliperama) trabalhou com ele; o primeiro protótipo tinha **mais de cem fios**. As lojas de brinquedo recusaram ("caro demais") e a Atari foi atrás da **Sears**, que pediu **150 mil** unidades para o Natal — o dobro do que a Atari dizia conseguir fazer. Deu certo: foi o produto mais vendido da Sears naquele ano, e a Atari levou um prêmio de qualidade da loja.

**Cuidado com "o primeiro videogame":** o Odyssey foi o primeiro console **de casa** vendido; os primeiros videogames em si (*Tennis for Two*, de 1958, e *Spacewar!*, de 1962) já contamos na Aula 4. Diga "o primeiro **console de casa**". Fontes: os artigos *Magnavox Odyssey* (em inglês e em português) e *Pong* (em inglês e em português) da Wikipédia.
</div>

## 4. Como você programaria? · como acabar aos 7? (15–22 min)

**Pergunte** (slide 7): *"O jogo já conta os gols. Falta o quê para alguém ganhar?"* (o jogo **acabar**) · *"Quem deve avisar que alguém venceu?"* (a **Bola**, que é quem conta os gols) · *"E como parar o jogo inteiro?"*

No quadro, escreva as duas regras que **já estão** no arquivo:

```blocks
se <(gols_1) = (7)> então
  fim_jogo (1)
end
se <(gols_2) = (7)> então
  fim_jogo (2)
end
```

*"As chamadas existem. O que falta é o bloco `fim_jogo` fazer alguma coisa."*

**O balão que some** (slide 8). Desenhe um balão de fala e um `pare [todos v]` do lado. *"Se o `fim_jogo` só disser `diga [Vitória!]` e parar tudo, o que aparece?"* — **nada**! O `pare [todos v]` **apaga todos os balões de fala** na mesma hora: quando o jogo para, os balões somem junto. Por isso a fala vem com **`por (2) segundos`**: o Scratch **espera** os 2 segundos com o balão no ar e só **depois** para.

<div class="teacher" markdown="1">
**Dá para mostrar ao vivo:** no projetor, mude o `fim_jogo` para `diga [Vitória!]` + `pare [todos v]`, faça um gol e mostre a tela **sem** fala. Depois ponha o `por (2) segundos` de volta. (Faça isso no seu notebook, antes da aula, ou no projetor com o jogo pronto.)

A **Ficha 5** é para casa (ou para quem esperar ajuda). O exercício 3 é esta mesma conta de sinais, só que no papel.
</div>

## 5. Programando a vitória aos 7 (22–32 min)

Cada um, na **Bola**, na área de código: o chapéu rosa `defina fim_jogo (jogador)` está lá, com `diga (jogador)` logo embaixo. Troque esse `diga` pela fala nova — arraste o `jogador` **do chapéu** para dentro do `junte` — e encaixe o `pare [todos v]` embaixo dela:

```blocks
defina fim_jogo (jogador)
diga (junte [Vitória do jogador ] com (jogador)) por (2) segundos
pare [todos v]
```

As **chamadas não mudam**: `fim_jogo (1)` e `fim_jogo (2)` continuam nos dois `se` do começo do `sempre`.

**Pergunte:** *"Por que `junte`?"* (para escrever "Vitória do jogador " **grudado** com o número que vem no bloco) · *"De onde vem o 1?"* (do campo `jogador`: a chamada manda 1 ou 2).

**Confira:** faça gols até 7. A fala **Vitória do jogador 1** aparece e **tudo para** — a bola fica parada e o placar continua no palco. Bandeira verde: recomeça em **0 × 0**.

<div class="teacher" markdown="1">
**Os dois testes do 7 ficam onde estão**, no começo do `sempre`. Quando sai o 7º gol, a Bola ainda chama `bola_centro` (que espera 2 segundos e dá o saque) e só depois o `se <(gols_1) = (7)>` dispara: a fala aparece **logo depois do saque**. Isso está certo — não precisa mover nada.

**Se aos 32 minutos ainda houver gente no passo 1**, deixe o passo 2 para a próxima aula e mande quem acabou para os desafios: o que importa hoje é o jogo **acabar aos 7**.

Se a turma travar, mostre o jogo pronto no projetor: `aulas/demos/Aula5-Pong-pronto.sb3` tem exatamente estes dois passos.
</div>

<div class="teacher" markdown="1">
**Problemas comuns:** a fala **não aparece** (`pare [todos v]` logo depois do `diga`, sem o `por (2) segundos`: o `pare` apaga o balão) · a fala mostra **1** (o `diga` continua sendo `diga (jogador)`: falta o `junte`) · o jogo **não para** (o `pare` virou `pare [este script]`, que dentro do bloco só **sai do bloco**: o `sempre` da Bola continua) · o jogo acaba no **5** (o 7 foi trocado em só um dos dois `se`) · a fala aparece e some na hora (faltou o `por (2) segundos`).
</div>

## 6. Como a bola acelera (32–40 min)

**Pergunte** (slide 11): *"A bola sai com `vx = 5`. Como fazer ela ficar mais rápida a cada rebatida?"* (somar 1 na velocidade) · *"Depois que ela bate na Raquete1, o vx é positivo ou negativo?"* (positivo: ela está indo para a **direita**) · *"E depois da Raquete2?"* (negativo).

No quadro, desenhe a bola indo para a direita com **vx = 6** e, depois da rebatida, voltando com **vx = -6**. *"Se eu somar +1 nos dois lados, o que acontece quando ela vai para a esquerda?"* — -6 + 1 = **-5**: ela fica mais **lenta**! Por isso: **+1** do lado da Raquete1 e **-1** do lado da Raquete2.

**Passo 2 — a bola acelera** (slide 12). Na **Bola**, dentro dos dois `se` das raquetes, depois do `mude [vx v] para ((0) - (vx))`:

```blocks
se <<tocando em (Raquete1 v)?> e <(vx) < (0)>> então
  mude [vx v] para ((0) - (vx))
  adicione (1) a [vx v]
end
se <<tocando em (Raquete2 v)?> e <(vx) > (0)>> então
  mude [vx v] para ((0) - (vx))
  adicione (-1) a [vx v]
end
```

**Confira:** o mostrador do `vx` traz **5 → -6 → 7 → -8 → 9**: cada rebatida **troca o sinal** e o número **sem o sinal** cresce (5, 6, 7, 8, 9). O `vx` vem **escondido** no arquivo (só os dois placares aparecem): marque a caixinha do `vx` em **Variáveis**, no seu notebook e no projetor, para ele aparecer. A cada gol o `bola_centro` volta o vx para **5** (no Pong de verdade também era assim: a bola acelerava e, quando alguém errava, a velocidade voltava).

<div class="teacher" markdown="1">
**Pergunte de novo:** *"E se ninguém errar?"* — a bola acelera sem parar. Quando o vx chega a **24**, o passo da bola fica maior que a beirada da raquete e ela pode **atravessar**. Quem quiser resolver tem o cartão ⭐⭐ **limite de velocidade**.

**Problemas comuns:** **pôs o `adicione` na raquete** (`vx` só existe na Bola: no menu da Raquete1 ele nem aparece) · a bola não acelera (o `adicione` ficou fora do `se` da raquete) · a bola fica mais **lenta** indo para a esquerda (`adicione (1)` nos dois `se`) · o jogo voltou a mostrar `1` na fala (o `junte` sumiu do `fim_jogo`).
</div>

**Desafios** (quem terminar; slide 15):

<div class="cols" markdown="1">
<div markdown="1">
**⭐ Vence quem fizer 3.** Troque o 7 por 3 **nos dois** testes `= 7`.

**⭐ Som de vitória.** `toque o som (Clang v)` antes do `diga`, no `fim_jogo`.
</div>
<div markdown="1">
**⭐⭐ Limite de velocidade.** Depois de cada `adicione`, `se <(vx) > (15)> então mude [vx v] para (15)`, e o mesmo com -15.

**⭐⭐⭐ Jogador 2 é o computador.** A Raquete2 passa a seguir a bola sozinha (lógica do Pong da Sala).
</div>
</div>

<div class="teacher" markdown="1">
**Folha de desafios** (`aula5-desafios.pdf`, 8 cartões de ⭐ a ⭐⭐⭐): entregue para quem já viu o jogo **acabar aos 7**. A resposta do **Desafio extra** está na página do gabarito, no fim.

**Antes de entregar a folha**, mostre o **slide 16 — O segredo da raquete de 1972**: o cartão ⭐⭐ dos **segmentos** é o que mais chama a atenção, e o slide explica a ideia para a turma toda de uma vez.

**Respostas curtas:** *limite de velocidade* — depois de cada `adicione`, os dois `se` do 15 e do -15 (a partir de 24 a bola atravessa) · *saque para quem levou o gol* — no `se <(posição x) < (-234)>`, depois do `bola_centro`: `mude [vx v] para (-5)` · *reta final* — na Bola, depois dos `se` do 7: `se <<(gols_1) = (6)> ou <(gols_2) = (6)>> então mude para o cenário [Quadra v]` (se o seu jogo já está na Quadra, use o **Stars**) · *jogador 2 é o computador* — na Raquete2, no lugar dos dois `se` das teclas, `se <([vx v] de (Bola v)) > (0)> então` com os dois `se` do passo de 3 dentro; o limite de ±150 fica.
</div>

<div class="keep" markdown="1">

**⭐⭐⭐ Desafio extra — o computador pensa antes.** No Pong da Sala, o computador não é perfeito: ele **espera um instante** depois de cada rebatida antes de se mexer. Faça a Raquete2 esperar 0,2 segundos e depois perseguir a bola:

<div style="zoom: 0.76" markdown="1">

```blocks
quando @greenFlag for clicado
vá para x: (200) y: (0)
sempre
  espere até que <<([vx v] de (Bola v)) > (0)> e <não <([posição x v] de (Bola v)) = (0)>>>
  espere (0.2) segs.
  repita até que <<([vx v] de (Bola v)) < (0)> ou <([posição x v] de (Bola v)) = (0)>>
    se <(([posição y v] de (Bola v)) - (posição y)) > (3)> então
      adicione (3) a y
    end
    se <(([posição y v] de (Bola v)) - (posição y)) < (-3)> então
      adicione (-3) a y
    end
    se <(posição y) > (150)> então
      mude y para (150)
    end
    se <(posição y) < (-150)> então
      mude y para (-150)
    end
  end
end
```

</div>

Para a Raquete2, e **no bloco `de` escolha Bola primeiro**: só então o `vx` aparece no menu.

</div>


## 7. Jogar, salvar e entregar (40–45 min)

- **Jogar em dupla** (slide 13): **W** e **S** × **setas**; joguem até alguém chegar a **7** — a fala aparece e o jogo **para**. Bandeira verde: **0 × 0** de novo.
- **Salvar** (slide 14): **Arquivo → Salvar como...** → **Pong** → Salvar; depois **Entregar trabalho** (ou a página **Entregar** da Sala).
- Antes de desligarem: no painel da Sala, aba **Entregas**, confira que chegaram **12** trabalhos.
- **Perguntas finais** (slide 17): *"E se ninguém errar?"* (a bola acelera até atravessar a raquete) · *"Por que os 2 segundos?"* (o `pare` apaga os balões) · *"Por que +1 de um lado e -1 do outro?"* (o **sinal** do vx). **Próxima aula:** *"vamos continuar o Pong"*.

## Gabarito da Ficha 5 {style="break-before: page"}

<div class="cols" markdown="1">
<div markdown="1">
**1.** A bola saiu em **x = 235** (do lado direito): ponto do **Jogador 1**, o placar vai de 3 × 3 para **4 × 3**. Saiu em **x = -235**: ponto do **Jogador 2**, **3 × 4**. Com **vx = 5** ela vai para a **direita**; com **vx = -5**, para a **esquerda**.

**2.** 5 × 6 e o Jogador 2 faz o gol: **terminou** (5 × **7**) — aparece **Vitória do jogador 2** e o jogo para. 6 × 6 e o Jogador 1 faz o gol: **terminou** (7 × 6) — **Vitória do jogador 1**.

**3.** A sequência do vx numa jogada: **5 → -6 → 7 → -8 → 9**. A velocidade (o número sem o sinal) **aumenta**: 5, 6, 7, 8, 9.
</div>
<div markdown="1">
**4.** No `se` da **Raquete1**: `adicione (1) a [vx v]`. No da **Raquete2**: `adicione (-1) a [vx v]`. Depois da Raquete1 o vx é **positivo** e depois da Raquete2 é **negativo**: somar +1 nos dois faria a bola ficar mais lenta indo para a esquerda.

**5.** `diga (junte [Vitória do jogador ] com (jogador)) por (2) segundos` + `pare [todos v]`. O `por (2) segundos` é obrigatório porque o `pare [todos v]` **apaga os balões de fala** na hora: sem ele, nada aparece.
</div>
</div>

<div class="teacher" markdown="1">
**Desafio extra — por que o `x = 0`?** O `bola_centro` põe a bola **no meio** e o `vx` continua com o sinal que tinha antes do gol. Quando o **Jogador 1** marca (a bola saiu pelo lado direito), o vx segue **positivo** durante os 2 segundos em que a bola espera no centro: o `espere até que <(vx) > (0)>` sozinho já estaria valendo, e o computador contaria os 0,2 s **antes do saque** — reagindo cedo demais. Com `e <não <(posição x) = (0)>>`, ele só começa quando a bola **sai do meio**. E o `ou <(posição x) = (0)>` do `repita` faz o contrário: bola de volta ao meio, ele **solta** e recomeça a espera.
</div>

## Resposta do Desafio extra {style="break-before: page"}

O **computador pensa antes** é a Raquete2 toda:

<div style="zoom: 0.70" markdown="1">

```blocks
quando @greenFlag for clicado
vá para x: (200) y: (0)
sempre
  espere até que <<([vx v] de (Bola v)) > (0)> e <não <([posição x v] de (Bola v)) = (0)>>>
  espere (0.2) segs.
  repita até que <<([vx v] de (Bola v)) < (0)> ou <([posição x v] de (Bola v)) = (0)>>
    se <(([posição y v] de (Bola v)) - (posição y)) > (3)> então
      adicione (3) a y
    end
    se <(([posição y v] de (Bola v)) - (posição y)) < (-3)> então
      adicione (-3) a y
    end
    se <(posição y) > (150)> então
      mude y para (150)
    end
    se <(posição y) < (-150)> então
      mude y para (-150)
    end
  end
end
```

</div>

Por que cada pedaço:

- `espere até que <(vx) > (0) e (x da Bola) ≠ (0)>` — ele **só olha** quando a bola vem para o lado dele e **já saiu do meio**.
- `espere (0.2) segs.` — o atraso de reação: ele **pensa antes** de se mexer.
- `repita até que <(vx) < (0) ou (x da Bola) = (0)>` — persegue a bola enquanto ela vem; ela voltou (vx < 0) ou o ponto acabou? **Para**.
- o passo de **3** é menor que o seu **8**: o computador é mais devagar, então dá para ganhar dele.
