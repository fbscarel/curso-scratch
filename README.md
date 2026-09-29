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
| `entrega/` | O programa (Google Apps Script) que recebe os trabalhos enviados pelo botão **Entregar trabalho** do laboratório e guarda na pasta do professor no Google Drive. Como colocar no ar: [`entrega/README.md`](entrega/README.md). |

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

Scratch é um projeto da Scratch Foundation, em colaboração com o Lifelong Kindergarten Group do MIT
Media Lab. Curso independente, sem afiliação ao MIT ou à Scratch Foundation.
