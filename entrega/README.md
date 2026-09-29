# Entrega de trabalhos

Os computadores do laboratório apagam tudo ao desligar. Para guardar o que as crianças fizeram,
o botão **Entregar trabalho** (na barra de baixo do ScratchLab) envia o projeto `.sb3` para uma
pasta no **Google Drive do professor**:

```
Curso de Scratch — Entregas/
  Aula 03/
    Maria/
      2026-10-06 16h45 - Labirinto.sb3
```

A criança escolhe o projeto salvo, escreve o **nome** e o **número da aula** e clica em
**Enviar**. Nada é sobrescrito: cada envio vira um arquivo novo, com a data e a hora. "maria",
"Maria" e "Mária" caem na mesma pasta. Os arquivos ficam só no Drive do professor; nada é
publicado.

O servidor é um pequeno programa do Google Apps Script ([`Code.gs`](Code.gs)): gratuito, sem
servidor próprio e sem conta para as crianças.

## Como colocar no ar (uma vez)

1. Entre em [script.google.com](https://script.google.com/) com a sua conta Google e clique em
   **Novo projeto**. Dê um nome ao projeto (por exemplo, "Entrega Curso de Scratch").
2. Apague o conteúdo de `Código.gs`, cole o conteúdo de [`Code.gs`](Code.gs) e salve (Ctrl+S).
3. **Implantar → Nova implantação**. Em "Selecionar tipo" (engrenagem), escolha **App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**

   Clique em **Implantar** e autorize o acesso ao Drive. Como o programa é seu e não foi
   verificado pelo Google, aparece um aviso: clique em **Avançado → Acessar … (não seguro)** e
   depois em **Permitir**.
4. Copie a **URL do app da Web** (termina em `/exec`) e salve em `distro/secrets/entrega-url.txt`
   (essa pasta **não** vai para o git).
5. Teste:
   - abra a URL no navegador: deve aparecer "Entrega de trabalhos do Curso de Scratch: funcionando";
   - `cd distro && just entrega-teste` envia um projeto de teste para `Aula 999/Teste` no seu
     Drive (apague depois).
6. Gere a imagem de novo (`cd distro && just build`) e grave os pendrives: a URL entra na
   imagem, e o botão passa a funcionar.

**Guarde a URL só no `secrets/`**: quem tiver o link consegue enviar arquivos para a pasta. Se
ele vazar, faça uma **nova implantação** (a URL muda), atualize `secrets/entrega-url.txt` e gere a
imagem de novo.

## Mudou o `Code.gs`?

Cole a versão nova no editor e use **Implantar → Gerenciar implantações → ✏️ (editar) →
Versão: Nova versão → Implantar**. Assim a URL continua a mesma e não é preciso gerar a imagem
de novo. ("Nova implantação" criaria outra URL.)

## Limites

- Só projetos do Scratch (`.sb3`), até 20 MB cada.
- Número da aula de 1 a 999; nome com até 40 letras.
- Precisa de internet no laboratório.
