# Coleção Pokémon

Gerenciador de coleção de cartas Pokémon (PWA — instala no celular, sem servidor próprio).

- **Foto → carta**: OCR (Tesseract.js) lê nome e número (`025/165`); busca na [Pokémon TCG API](https://pokemontcg.io).
- **Preços**: TCGplayer (USD) e Cardmarket (EUR), total da coleção e atualização em massa.
- **Repetidas**: quantidade por carta; aba mostra extras e seu valor.
- **Faltantes**: escolha um set e veja o que falta, % de conclusão e custo estimado para completar.
- **Login + sincronização**: Google ou e-mail, via Firebase; funciona offline e sincroniza depois.
- **Backup**: JSON/CSV.

## 1. Rodar no celular (GitHub Pages)
1. Faça merge desta branch na `main`.
2. No GitHub: **Settings → Pages → Source: GitHub Actions**. O workflow `.github/workflows/pages.yml` publica a cada push na `main`.
3. Abra `https://<seu-usuario>.github.io/rcgpokemon/` no celular.
   - Android (Chrome): menu ⋮ → **Instalar app**.
   - iPhone (Safari): Compartilhar → **Adicionar à Tela de Início**.

A câmera abre ao tocar em "Tirar / escolher foto" (precisa de HTTPS, que o Pages já fornece).

## 2. Sincronização (Firebase, plano gratuito)
1. [console.firebase.google.com](https://console.firebase.google.com) → **Adicionar projeto**.
2. **Build → Authentication → Começar**; ative **Google** e **E-mail/senha**.
3. **Build → Firestore Database → Criar banco** (modo produção). Em **Regras**, cole o conteúdo de `firestore.rules` e publique.
4. **Configurações do projeto → Seus apps → Web (`</>`)**; copie o objeto `firebaseConfig` para `firebase-config.js` (`window.FIREBASE_CONFIG = {...}`).
5. **Authentication → Settings → Authorized domains**: adicione `<seu-usuario>.github.io`.
6. Commit/push na `main`. Em **Conta**, entre com Google ou e-mail em cada aparelho.

A config web do Firebase não é segredo; quem protege os dados são as regras do Firestore (cada usuário só acessa `users/<seu-uid>/cards`).

Sincronização: por carta, vence a alteração mais recente. Ao entrar pela primeira vez, as cartas locais sobem para a nuvem.

## Rodar local
```
python3 -m http.server 8000
```
