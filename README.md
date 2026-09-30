# Curso de Scratch — Top Cursos (Santana/BA)

Curso gratuito de programação com Scratch para crianças de 8 a 13 anos, às terças e sextas,
das 16h às 17h, desde 29/09/2026. Este repositório tem os materiais das aulas (roteiros, fichas,
desafios, slides e projetos de treino) e o sistema que roda nos computadores do laboratório.

## Site do curso

**[fbscarel.github.io/curso-scratch](https://fbscarel.github.io/curso-scratch/)** — fichas, desafios,
slides, roteiros e projetos para baixar, por aula.

## O que tem aqui

| Pasta | O que é |
|---|---|
| `aulas/` | Os materiais das aulas: roteiros, fichas, desafios, slides e o bilhete aos pais, escritos em Markdown e convertidos para PDF; os projetos de treino em `.sb3`, gerados por `tools/build_sb3.py`; o guia de escrita das figuras de blocos está em `aulas/src/_BLOCKS.md`. |
| `site/` | O site do curso, feito com MkDocs e publicado no GitHub Pages. |
| `distro/` | **ScratchLab**: o sistema live em pendrive que roda nos computadores do laboratório. Como gerar e gravar: [`distro/README.md`](distro/README.md). |
| `sala/` | **Sala**: o servidor que roda no notebook do professor durante a aula — o jogo do dia num emulador, as folhas, a presença, as entregas e o placar. Como usar: [`sala/README.md`](sala/README.md). |

## Como gerar os materiais

```sh
# materiais das aulas
cd aulas && just pdf      # src/*.md -> pdf/*.pdf
cd aulas && just sb3      # tools/build_sb3.py -> projetos/*.sb3
cd aulas && just check    # confere se os PDFs em pdf/ estão atualizados

# site
cd site && just build     # gera o site
cd site && just serve     # abre o site no navegador
```

Para isso você precisa de: `python3` (com o pacote `markdown`), `chromium`, `poppler` e `just`.

## Servidor da sala

```sh
cd sala && just sala-config     # o caminho do painel e a senha do professor
cd sala && just sala-emulador   # baixa o EmulatorJS (uma vez por máquina)
cd sala && just sala enduro     # compila o site e sobe o servidor para a turma
```

Para isso você precisa de: `python3`, `just`, `nodejs` e `pnpm` — e, se quiser que a turma chegue
pelo nome `sala.local`, `avahi` e `nss-mdns`. O que a sala guarda fica em `sala/dados/`, fora do git.

## Licenças

- **Código** (scripts, ferramentas e receitas deste repositório): MIT — veja [`LICENSE`](LICENSE).
- **Materiais das aulas** (`aulas/src`, `aulas/pdf`, `aulas/projetos`, `site/pages`, `site/aulas.yml`):
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br) — pode usar, copiar e
  adaptar, desde que cite a origem e mantenha a mesma licença.
- **De terceiros:**
  - [scratchblocks](https://github.com/scratchblocks/scratchblocks) 3.7.1 — MIT —
    `aulas/theme/vendor/scratchblocks-LICENSE`.
  - Os desenhos do Scratch que ficam dentro dos projetos `.sb3` e em `aulas/src/img/gato.svg` —
    © Scratch Foundation, [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/).
    "Scratch" e o Scratch Cat são marcas do Scratch Team.
  - Tema Plymouth `arch-logo` — GPL-3.0-or-later — `distro/pkgbuilds/plymouth-theme-arch-logo`.
  - Tema Adwaita-Labwc — [labwc-artwork](https://github.com/labwc/labwc-artwork), CC BY-SA 4.0.
  - `distro/pkgbuilds/turbowarp-desktop-lab/patch-default-project.js` — GPL-3.0-or-later.
  - EmulatorJS 4.2.3 (o emulador de jogos da sala) — GPL-3.0 — baixado pelo `just sala-emulador` na
    configuração do servidor, não está no repositório.
  - three.js, React, Radix UI, shadcn/ui e Tailwind CSS — MIT — dependências do site da sala
    (`sala/web`); os componentes do shadcn/ui foram copiados para `sala/web/src/components/ui/`.
  - lucide (ícones) e canvas-confetti — ISC — dependências do site da sala.
  - Fonte Nunito — [SIL OFL 1.1](https://openfontlicense.org/) — `@fontsource-variable/nunito`,
    dependência do site da sala.

Scratch é um projeto da Scratch Foundation, em colaboração com o Lifelong Kindergarten Group do MIT
Media Lab. Curso independente, sem afiliação ao MIT ou à Scratch Foundation.
