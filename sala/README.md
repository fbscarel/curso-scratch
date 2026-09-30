# Sala — o servidor da aula

A Sala é o servidor que roda no notebook do professor durante a aula. Os computadores do laboratório
(que dão boot pelo pendrive do ScratchLab, veja [`../distro/README.md`](../distro/README.md)) abrem o
endereço dela no navegador e encontram, na mesma página, tudo o que a aula precisa: a aula de hoje,
as folhas em PDF, o jogo do dia — um emulador rodando dentro da página, com as ROMs que estiverem no
disco do professor — e o botão de entregar o trabalho. O professor entra pelo painel para cadastrar
os alunos, marcar presença, escolher o jogo da aula e conferir as entregas e o placar. Tudo acontece
na rede local, dentro do notebook: nada é publicado e, com o emulador e as dependências já baixados,
a aula roda sem internet.

O servidor guarda o que a turma faz em `sala/dados/`, uma pasta que **não** vai para o git (o
repositório é público): é lá que ficam a configuração, o banco e os arquivos entregues.

## O que precisa no notebook

Arch Linux ou CachyOS (o notebook do professor) com:

| O que | Para quê |
|---|---|
| `python3` | rodar o servidor (o `just` cria um `.venv` e instala as dependências sozinho) |
| `just` | as receitas deste README |
| `nodejs` e `pnpm` | compilar o site (`web/`), que o servidor serve |
| `avahi` e `nss-mdns` | opcional: faz o nome `sala.local` funcionar na rede da sala |

```sh
sudo pacman -S python just nodejs pnpm
sudo pacman -S avahi nss-mdns && sudo systemctl enable --now avahi-daemon   # opcional
```

## Primeira vez

```sh
cd sala
just sala-config     # o caminho do painel e a senha do professor
just sala-emulador   # baixa o EmulatorJS 4.2.3 (uma vez por máquina)
```

`just sala-config` pergunta o caminho do painel (por padrão `/professor-` mais quatro letras
sorteadas) e a senha, e escreve `sala/dados/config.toml` com modo `0600`. Esse arquivo guarda também
a chave das sessões: ele é secreto e não vai para o git. Sem ele o servidor se recusa a subir — "Não
achei o dados/config.toml. Rode primeiro: just sala-config".

`just sala-emulador` baixa uma vez os arquivos do EmulatorJS 4.2.3 para
`sala/vendor/emulatorjs/data` (essa pasta também não vai para o git). O que está no repositório é só
o manifesto `sala/emulador.sha256`, com o sha256 de cada arquivo: cada arquivo baixado é conferido
antes de ser guardado, e um que não confira é descartado. Rodar de novo é seguro — o que já está
certo é pulado, e o que falhou pode ser baixado outra vez.

## As ROMs

As ROMs **nunca** entram no git. Copie as que você vai usar para uma pasta sua, com uma subpasta por
sistema:

```
roms/
  atari2600/   arcade/   nes/   snes/   genesis/
```

e aponte `SALA_ROMS` para ela (`/mnt/z/roms` é o padrão). Os nomes dos arquivos são exatamente as
linhas `rom:` do catálogo (`sala/jogos.yml`) — por exemplo `atari2600/Enduro (USA).zip` ou
`arcade/frogger.zip`. O jogo cuja ROM não está lá simplesmente não aparece para a turma, e o painel
diz o que falta:

- `Falta a ROM de Enduro: confira a pasta de ROMs (SALA_ROMS).`
- `Falta o emulador de Enduro: rode just sala-emulador.`

## Dar a aula

```sh
just sala                # compila o site e sobe o servidor para a turma
just sala enduro         # o jogo do dia (o mesmo que `just sala jogo=enduro`)
just sala jogo=livre     # modo livre: a turma escolhe qualquer jogo do catálogo
```

O comando compila o site (na primeira vez o `pnpm` instala as dependências dele) e imprime os
endereços da rede local. **Escreva um deles no quadro**: é por ali que a turma entra. Com o avahi
ligado ele também anuncia `http://sala.local:8000` (o nome sai de `SALA_NOME`, `sala` por padrão) e
o quadro pode levar só esse endereço; sem o avahi, o comando imprime o lembrete do `pacman` e a
turma usa o IP. `Ctrl+C` encerra o servidor — e o aviso do avahi junto com ele.

Nomear um jogo desliga o modo livre: quem diz qual é o jogo da aula não quer a turma vendo o
catálogo inteiro. Um nome que o catálogo não tem faz o servidor parar antes de subir, listando os
ids que ele conhece e o `livre`.

O que a turma encontra na página: a aula de hoje, o jogo do dia, as folhas (a ficha e os desafios
das aulas que já começaram), "Quem sou eu?" para escolher o nome, "Entregar trabalho" e "Meus
arquivos". O jogo abre dentro da própria página, num emulador que roda no navegador do aluno e
carrega a ROM pelo servidor da sala.

## O painel do professor

O painel fica no caminho que o `just sala-config` definiu (`/professor-xxxx`, por padrão), no mesmo
endereço da turma — por exemplo `http://sala.local:8000/professor-abcd`. A senha é a que você
escolheu na configuração. Nem o caminho nem a senha estão no código ou no site compilado: os dois
vivem só no `sala/dados/config.toml`.

| Aba | O que faz |
|---|---|
| **Aula atual** | A aula que a turma está fazendo agora; dá para escolher outra manualmente. |
| **Alunos** | Os nomes que aparecem em "Quem é você?". |
| **Aulas** | O calendário do curso. A aula atual sai daqui. |
| **Presença** | Marque quem veio à aula. Só o professor marca. |
| **Entregas** | Os trabalhos que a turma mandou; dá para baixar os de uma aula num zip. |
| **Jogos** | O que a turma pode jogar na aula de hoje, e o que falta em cada jogo. |
| **Placar** | As pontuações da turma, e o que espera a sua confirmação. |

## Onde ficam os dados

Tudo o que a sala guarda vive em `sala/dados/` (ou onde `SALA_DADOS` apontar):

| Caminho | O que é |
|---|---|
| `config.toml` | O caminho do painel, o hash da senha e a chave das sessões (modo `0600`). |
| `sala.db` | O banco SQLite: alunos, aulas, presença, entregas e placar. |
| `aulas/aula-NN/<id>-<nome>/` | Os arquivos entregues, com a data e a hora no nome. |

**Backup** é copiar essa pasta inteira, com o servidor parado: ela é pequena e tem tudo. Como o
`config.toml` guarda segredos, trate a cópia como trataria uma senha.

## Como acrescentar um jogo

O catálogo é `sala/jogos.yml`: uma lista, um jogo por entrada. Os campos:

| Campo | O que é |
|---|---|
| `id` | O nome curto do jogo: só minúsculas, números e hífen (`a-z0-9-`). É o que você digita em `just sala <id>` e o que aparece na URL `/jogos/<id>`. |
| `title` | O nome que a turma lê. |
| `type` | `emulated` (roda no emulador) ou `builtin` (uma página nossa, como o Pong — sem `system`, `core` nem `rom`). |
| `system` | O console, entre os que o catálogo conhece (tabela abaixo). |
| `core` | O núcleo do EmulatorJS que roda a ROM — precisa ser o do `system`. |
| `rom` | O caminho da ROM, relativo à pasta de ROMs (nada de `/` nem `..`). |
| `year`, `maker`, `about` | O ano, a fabricante e uma frase sobre o jogo. |
| `controls` | A lista de teclas e o que cada uma faz. |
| `score` | Opcional: onde a pontuação vive dentro do jogo (veja abaixo). |

| `system` | `core` |
|---|---|
| `atari2600` | `stella2014` |
| `arcade` | `mame2003_plus` (ou `fbneo`) |
| `nes` | `fceumm` |
| `snes` | `snes9x` |
| `genesis` | `genesis_plus_gx` |

O catálogo é lido e conferido quando o servidor sobe: uma entrada errada aparece em português, com o
arquivo e a entrada (`jogos.yml: entrada 4 ("enduro"): …`), e o servidor não sobe. Vale para id
repetido, sistema ou núcleo desconhecido, núcleo que não é o do sistema, caminho de ROM que saia da
pasta e bloco `score` que não descreva um estado do emulador.

### As teclas

O emulador usa sempre o mesmo mapa (jogador 1): as **setas** são o direcional, `x` é o B (o botão de
ação), `z` é o A, `s` é o Y, `a` é o X, `q` e `e` são L e R, `v` é o SELECT (a ficha, no arcade) e
`Enter` é o START (o reset, no Atari). O que muda de um sistema para o outro é quais dessas teclas os
jogos usam:

| Sistema | Teclas que os jogos usam |
|---|---|
| `atari2600` | setas, `x` (acelerar/atirar/pular), `v` (select), `Enter` (reset) |
| `arcade` | setas, `x` (atirar/pular), `v` (ficha), `Enter` (começar a partida) |
| `nes` | setas, `z` (pular = A), `x` (correr = B) |
| `snes` | setas, `x` (pular = B), `z` (mortal = A), `s` (correr e pegar = Y) |
| `genesis` | setas, `s`, `x` e `z` (A/B/C), `Enter` (pausar) |

A lista `controls` de cada jogo é o que a página mostra embaixo do emulador — escreva nela o que as
teclas fazem naquele jogo.

### O bloco `score`

Com um bloco `score`, a página do jogo sabe ler a pontuação dentro do emulador e manda ela sozinha
para o placar, sem passar pela sua confirmação. Sem ele, o jogo é jogado do mesmo jeito, mas a
pontuação que o aluno anotar é que chega ao placar — e essa espera a sua confirmação no painel.

```yaml
# Enduro: o odômetro de 6 dígitos fica little endian no estado do emulador
# ($A4..$A6, o menos significativo primeiro); $90 é 0x00 na tela de
# demonstração e 0xff quando a corrida está rodando.
score:
  bcd: [0xA6, 0xA5, 0xA4]
  multiplier: 1
  in_game: {offset: 0x90, is: 0xFF}
```

```yaml
# Frogger: a pontuação do 1-UP guarda quatro dígitos BCD, da dezena para cima —
# a casa das unidades é um 0 fixo, sem origem na memória, então o jogo guarda um
# décimo da pontuação. $454C é o PLAY_FLAG: 0 na demonstração, que também
# escreve uma pontuação nos mesmos bytes.
score:
  bcd: [0x453C, 0x453B]
  multiplier: 10
  in_game: {offset: 0x454C, not: 0x00}
```

- `bcd`: de 1 a 4 posições no estado do emulador, em BCD empacotado, da mais significativa para a
  menos (não são endereços da RAM do console).
- `multiplier`: `1`, `10` ou `100` — os dígitos que o jogo não guarda.
- `in_game`: o `offset` do byte que diz que a partida está rodando e o valor que significa isso —
  `is` (quando o byte é igual) ou `not` (quando é diferente). É o que separa a tela de demonstração
  da partida de verdade.

O servidor também recusa um bloco cuja leitura pudesse passar do limite do placar (9.999.999
pontos): um save assim nunca poderia ser confirmado.

## Variáveis de ambiente

| Variável | Padrão | O que muda |
|---|---|---|
| `SALA_DADOS` | `sala/dados` | Onde ficam a configuração, o banco e as entregas. |
| `SALA_ROMS` | `/mnt/z/roms` | A pasta das ROMs. |
| `SALA_PORTA` | `8000` | A porta do servidor (e a dos endereços do quadro). |
| `SALA_EMULADOR` | `sala/vendor/emulatorjs/data` | Onde o EmulatorJS está instalado. |
| `SALA_PDFS` | `aulas/pdf` do repositório | A pasta das folhas em PDF. |
| `SALA_NOME` | `sala` | O nome anunciado na rede: `http://<nome>.local:<porta>`. Só minúsculas, números e hífen. |

## Desenvolvimento

```sh
just check                       # tudo: testes do servidor, biome, TypeScript e vitest
just test                        # só os testes do servidor (pytest)
just web-build                   # compila o site para app/static/dist
just web-lint                    # biome e TypeScript
cd web && VITE_MOCK=1 pnpm dev   # o site com dados de mentira, sem servidor
```

O `VITE_MOCK=1` liga os dados de mentira do site (`web/src/dev/mock.ts`): dá para mexer nas telas
sem configurar nada nem subir o servidor.

## Licenças de terceiros

O código da sala é MIT (veja [`../LICENSE`](../LICENSE)). O servidor e o site usam:

| Peça | Licença | Onde |
|---|---|---|
| EmulatorJS 4.2.3 | GPL-3.0 | baixado pelo `just sala-emulador`, fora do repositório |
| three.js | MIT | `web/node_modules/three` |
| React e React DOM | MIT | `web/node_modules/react` e `.../react-dom` |
| shadcn/ui | MIT | os componentes copiados para `web/src/components/ui/` |
| Radix UI | MIT | `web/node_modules/radix-ui` |
| lucide (ícones) | ISC | `web/node_modules/lucide-react` |
| Tailwind CSS | MIT | `web/node_modules/tailwindcss` |
| canvas-confetti | ISC | `web/node_modules/canvas-confetti` |
| Nunito | SIL OFL 1.1 | `web/node_modules/@fontsource-variable/nunito` |
