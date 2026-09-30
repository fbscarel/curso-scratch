# ScratchLab — o sistema do laboratório

O ScratchLab é um sistema **live** (Arch Linux, montado com archiso) que roda inteiro da memória
RAM e dá boot pelo pendrive nos computadores do laboratório. Ele traz:

- área de trabalho **labwc** com **waybar** (tema Adwaita-Labwc);
- **TurboWarp Desktop** — o Scratch que funciona offline, já com o gato e o som Miau no projeto novo;
- **Firefox em português**, com restrições para a aula e o favorito **Sala** na barra de favoritos;
- **"Entregar trabalho"** — um programa que manda o projeto do aluno para o servidor da sala;
- **avahi** com **nss-mdns** — é o que faz o nome `sala.local` resolver na rede;
- teclado ABNT2 (padrão brasileiro);
- nada é salvo no computador: ao desligar, tudo volta ao ponto de partida.

O filtro de sites usado no laboratório é configurado localmente (distro/filter/, fora do repositório)
e não é publicado.

## Requisitos

Arch Linux ou CachyOS (o computador do professor) com:

`archiso`, `just`, `sudo`, `python3`, `nodejs` e `npm` (para o patch do TurboWarp), `openssl`,
`curl` e `base-devel`.

## Gerar a ISO

```sh
cd distro && just build
```

O build pergunta **duas vezes** a senha do professor e a do root (ou use
`PROF_PASS='…' ROOT_PASS='…' just build`). As redes Wi-Fi salvas ficam em `secrets/wifi.txt`
(esse arquivo **não** vai para o git), uma rede por linha, no formato `SSID<TAB>senha`.

Se a pasta `distro/filter/` não existir, o build para com uma mensagem explicando. Para gerar uma
imagem sem filtro de sites, use `NO_FILTER=1 just build` — vale mesmo que `distro/filter/` exista.
A ISO sai em `out/`.

> **Nunca publique a ISO gerada.** Ela contém a senha do Wi-Fi e as senhas (em hash) do professor
> e do root.

## Testar e gravar os pendrives

```sh
just vm                        # testa a ISO mais nova no QEMU (UEFI)
just flash /dev/sdX            # grava no pendrive (APAGA o pendrive; confirma com SIM)
just flash-loop                # vários pendrives em sequência
just ventoy /run/media/$USER/Ventoy   # copia a ISO para um pendrive Ventoy já montado
```

## No laboratório

Ligue o computador e abra o **menu de boot** pela tecla da própria máquina (nas Lenovo, normalmente
**F12**) — não é preciso mudar nada na BIOS. Escolha o pendrive e depois a **primeira opção**, que
copia o sistema para a RAM: quando a área de trabalho azul aparecer, o pendrive já pode ser retirado.

## A sala

O servidor da aula roda no notebook do professor (veja [`../sala/README.md`](../sala/README.md)), e a
imagem já vem pronta para chegar nele:

- o **avahi** com o **nss-mdns** fazem o nome `sala.local` resolver na rede, então o endereço escrito
  no quadro pode ser `http://sala.local:8000`;
- o Firefox traz o favorito **Sala** na barra de favoritos, apontando para esse endereço — é por ali
  que a turma vê a aula de hoje, joga e abre as folhas;
- o botão **"Entregar trabalho"** (na barra do waybar e no menu) abre uma janela que lista os projetos
  `.sb3` salvos na pasta do aluno, os nomes da turma lidos do servidor, e manda o arquivo escolhido.
  Ele procura o servidor em `http://sala.local:8000`; quando não encontra, pede o endereço que o
  professor escreveu no quadro.

## Contas

| Conta | Senha | O que pode fazer |
|---|---|---|
| `aluno` | não tem | entra sozinho na área de trabalho; sem direitos de administrador |
| `professor` | definida no build | tem `sudo`; entra pelo terminal com **Ctrl+Alt+F2** |
| `root` | definida no build | administração total |

## Onde mudar as coisas

| O que | Onde |
|---|---|
| Pacotes instalados na imagem | `profile/packages.x86_64` |
| Área de trabalho (labwc e waybar) | `profile/airootfs/etc/skel/.config/labwc/` e `.../waybar/` |
| Firefox | `firefox/policies.json` |
| "Entregar trabalho" (janela em GTK 4) | `profile/airootfs/usr/local/bin/entregar-trabalho` |
| Menu de boot | `profile/efiboot/loader/entries/` e `profile/syslinux/syslinux.cfg` (os dois precisam ficar iguais) |
| Contas e serviços | `profile/airootfs/usr/local/sbin/lab-setup` |
| TurboWarp Desktop | `pkgbuilds/turbowarp-desktop-lab/` |
| Projetos das aulas | copiados de `aulas/projetos/` para `~/Aulas` a cada build |
