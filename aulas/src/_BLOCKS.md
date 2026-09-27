---
title: Como escrever as apostilas (blocos e layout)
kind: doc
---

# Como escrever as apostilas

Guia interno do curso: **como escrever blocos do Scratch** e **quais classes de
layout usar**. Os arquivos ficam em `src/`, um documento por arquivo `.md`.

<div class="box" markdown="1">

Toda apostila começa com um cabeçalho simples, separado por `---`:

```
---
title: Aula 2 — O plano cartesiano
kind: doc
---
```

`kind: doc` gera uma folha **A4 em pé**. `kind: slides` gera uma
apresentação **16:9**, um slide por página.

</div>

## Classes de layout

Use as classes dentro de `<div>` no meio do Markdown. Quando o conteúdo de
dentro for Markdown normal (títulos, listas, `**negrito**`), escreva
`markdown="1"` na tag.

| Classe | Como usar | O que faz |
|---|---|---|
| `.box` | `<div class="box" markdown="1"> … </div>` | Caixa azul com borda: avisos, instruções, resumos. |
| `.teacher` | `<div class="teacher" markdown="1"> … </div>` | Caixa âmbar pontilhada, com o rótulo "Para o professor". |
| `.cols` | `<div class="cols" markdown="1"> … </div>` | Duas colunas (o texto flui da esquerda para a direita). Pode combinar: `class="cols box"`. |
| `.write-lines` | `<div class="write-lines" style="--n:4"></div>` | 4 linhas pautadas para escrever à mão. `--n` = quantidade de linhas. |
| `.draw-box` | `<div class="draw-box" style="--h:60mm"></div>` | Espaço em branco com borda pontilhada para desenhar. `--h` = altura (padrão `45mm`). |
| `.pagebreak` | `<div class="pagebreak"></div>` | Força a próxima parte a começar em outra página. |
| `.small` | `<p class="small"> … </p>` | Texto menor (rodapés, observações). |
| `.big` | `<p class="big"> … </p>` | Texto maior (destaques). |
| `.center` | `<p class="center"> … </p>` | Centralizado. |
| `.muted` | `<p class="muted"> … </p>` | Cinza, mais discreto. |
| `.keep` | `<div class="keep" markdown="1"> … </div>` | Não deixa o conteúdo ser cortado entre duas páginas. |
| `.title-slide` | `---slide--- title-slide` | Só em slides: capa centralizada, letra grande. |
| `.full` | `<img class="full" src="img/palco.svg">` | Imagem ocupando a largura inteira da coluna. |
| `.cards` | `<div class="cols cards" markdown="1"> … </div>` | Cartões de desafio: cada cartão é um `.box`, com margens menores. Se um cartão pular de página, separe as colunas em dois `<div markdown="1">`. |

Exemplo de uma folha com caixa, colunas e linhas para escrever:

```
<div class="box" markdown="1">
## Missão
Leve o gato até o canto de cima à direita.
</div>

<div class="cols" markdown="1">
Escreva o que você descobriu sobre o eixo **x** …

Escreva o que você descobriu sobre o eixo **y** …
</div>

<div class="write-lines" style="--n:3"></div>
```

### Slides

Nos arquivos com `kind: slides`, uma linha `---slide---` começa um slide novo.
Para o slide de capa, escreva as classes depois do separador:

```
---slide--- title-slide

# Curso de Scratch

## Aula 2 — O plano cartesiano
```

Os slides são 16:9 (297 mm × 167 mm) e usam letra grande, para projetor. Um
slide cabe confortavelmente uma lista de 4 ou 5 itens, ou um roteiro de até
**8 blocos**. Se o roteiro for maior, divida em dois slides.

## Imagens

Salve os arquivos em `src/img/` (SVG ou PNG) e chame pelo caminho relativo:
`![](img/plano-casa.svg)`. O `render.py` copia a pasta `src/img/` para
`build/img/` na hora de gerar o PDF.

# Como escrever blocos do Scratch

Escreva os blocos em um bloco de código marcado com `blocks` (três crases e a
palavra `blocks`). O `render.py` troca esse trecho pela figura dos blocos do
Scratch 3 **em português**, igual à tela do TurboWarp que as crianças usam.

    ```blocks
    quando @greenFlag for clicado
    mova (10) passos
    diga [Olá, mundo!]
    toque o som (Miau v)
    ```

### Regras da linguagem

- **uma linha = um bloco**, na ordem em que eles se encaixam;
- blocos de dentro (dentro de `sempre`, `repita`, `se`) entram com **2 espaços**
  de recuo e fecham com `end`;
- linha em branco separa dois roteiros diferentes;
- tipos de espaço:

| Como escrever | O que aparece |
|---|---|
| `(10)` | campo redondo de número |
| `[Olá, mundo!]` | campo de texto (arredondado, branco) |
| `[ponteiro do mouse v]` | menu suspenso (a setinha `v` no fim é o que cria o menu) |
| `(Miau v)` | menu suspenso com fundo redondo (som, fantasia, tecla…) |
| `< >` | espaço hexagonal de condição (dentro dele vai outro bloco) |
| `#ff0000` | seletor de cor |
| `@greenFlag` | a bandeirinha verde ⚑ |
| `@turnRight` / `@turnLeft` | as setas ↻ e ↺ dos blocos de girar |

Exemplo com recuo e `end`:

    ```blocks
    quando @greenFlag for clicado
    vá para x: (0) y: (0)
    sempre
      se <tocando em (borda v)?> então
        diga [Ai! A borda!] por (2) segundos
        vá para x: (0) y: (0)
      end
    end
    ```

## Cheat-sheet: blocos usados nas aulas

A coluna da esquerda é o texto que aparece na tela do TurboWarp (versão pt-BR
que as crianças usam); a coluna da direita é o que você deve escrever no `.md`.

| Bloco na tela | Escreva assim |
|---|---|
| quando ⚑ for clicado | `quando @greenFlag for clicado` |
| quando a tecla (seta para a direita) for pressionada | `quando a tecla [seta para a direita v] for pressionada` |
| quando este ator for clicado | `quando este ator for clicado` |
| mova (10) passos | `mova (10) passos` |
| gire ↻ (15) graus | `gire @turnRight (15) graus` |
| gire ↺ (15) graus | `gire @turnLeft (15) graus` |
| vá para x: (0) y: (0) | `vá para x: (0) y: (0)` |
| vá para (posição aleatória) | `vá para (posição aleatória v)` |
| adicione (10) a x | `adicione (10) a x` |
| adicione (10) a y | `adicione (10) a y` |
| mude x para (0) | `mude x para (0)` |
| mude y para (0) | `mude y para (0)` |
| aponte para a direção (90) | `aponte para a direção (90)` |
| deslize por (1) segs. até x: (0) y: (0) | `deslize por (1) segs. até x: (0) y: (0)` |
| se tocar na borda, volte | `se tocar na borda, volte` |
| diga (Olá!) por (2) segundos | `diga [Olá!] por (2) segundos` |
| diga (Olá!) | `diga [Olá!]` |
| próxima fantasia | `próxima fantasia` |
| toque o som (Miau) até o fim | `toque o som (Miau v) até o fim` |
| toque o som (Miau) | `toque o som (Miau v)` |
| espere (1) seg | `espere (1) seg` |
| repita (10) vezes | `repita (10) vezes` |
| sempre | `sempre` |
| se <> então | `se <tocando em (borda v)?> então` |
| tocando em (borda)? | `tocando em (borda v)?` |
| pergunte (Qual é o seu nome?) e espere | `pergunte [Qual é o seu nome?] e espere` |
| resposta | `resposta` |
| posição x | `posição x` |
| posição y | `posição y` |
| adicione (1) a (pontos) | `adicione (1) a [pontos v]` |
| mude (pontos) para (0) | `mude [pontos v] para (0)` |
| junte (Olá ) com (mundo!) | `junte [Olá ] com [mundo!]` |
| número aleatório entre (1) e (10) | `número aleatório entre (1) e (10)` |
| pense (Hummm...) por (2) segundos | `pense [Hummm...] por (2) segundos` |
| mude (10) no tamanho | `mude (10) no tamanho` |
| defina o tamanho como (100) % | `defina o tamanho como (100) %` |
| mude (25) ao efeito (cor) | `mude (25) ao efeito [cor v]` |
| remova os efeitos gráficos | `remova os efeitos gráficos` |
| deslize por (1) segs. até (ponteiro do mouse) | `deslize por (1) segs. até (ponteiro do mouse v)` |
| *Caneta:* apague tudo · use a caneta · levante a caneta | `apague tudo` · `use a caneta` · `levante a caneta` |

<div class="teacher" markdown="1">

**Blocos que NÃO existem nesta versão.** O menu do TurboWarp em português não
tem "mude x por (10)" nem "mude y por (10)". O bloco de mudar sem definir o
valor se chama **"adicione (10) a x"** e **"adicione (10) a y"** — escreva
`adicione (10) a x` e `adicione (10) a y`.

Também não existe "quando bandeira clicada": o texto da tela é **"quando ⚑ for
clicado"** (a bandeirinha é um desenho, e no Markdown ela é o `@greenFlag`).

</div>

## De onde vem o texto em português

As figuras dos blocos são geradas pela biblioteca **scratchblocks 3.7.1**
(`theme/vendor/scratchblocks.min.js` + `theme/vendor/scratchblocks-translations-all.js`,
licença MIT em `theme/vendor/scratchblocks-LICENSE`), com
`style: "scratch3"` e `languages: ["pt_br", "en"]`.

Conferimos o dicionário `pt_br` da biblioteca contra o texto da interface
pt-BR da versão do TurboWarp instalada nos computadores do laboratório: para
todos os blocos acima os dois batem **palavra por palavra**, então não foi
preciso corrigir nenhuma tradução. Os únicos "menus" (conteúdo entre `[ … v]`
ou `( … v)`) são escritos por nós — como `borda`, `Miau` e
`seta para a direita` — e saem na figura exatamente como foram escritos, ou
seja, é só copiar o texto da tela.

Se algum dia o TurboWarp mudar uma palavra, a correção é simples: ajustar a
frase na tabela acima (nossa fonte é o nosso próprio `.md`) ou, se a diferença
for na biblioteca, sobrescrever o `pt_br` em `theme/vendor/scratchblocks-translations-all.js`.

## Gerando os PDFs

```sh
just pdf        # todas as aulas: pdf/<nome>.pdf
just demo       # as duas páginas de demonstração
just preview    # PNG da primeira página de cada PDF, em build/preview/
just clean      # apaga a pasta build/
```

Os arquivos gerados ficam em `build/` (não entra no git) e os PDFs finais em
`pdf/`.
