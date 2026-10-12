# Coleção Pokémon

Gerenciador de coleção de cartas Pokémon (PWA — instala no celular, sem servidor próprio).

- **Foto → carta**: OCR (Tesseract.js) lê nome e número (`025/165`); busca na [Pokémon TCG API](https://pokemontcg.io).
- **Preços**: TCGplayer (USD) e Cardmarket (EUR), total da coleção e atualização em massa.
- **Repetidas**: quantidade por carta; aba mostra extras e seu valor.
- **Faltantes**: escolha um set e veja o que falta, % de conclusão e custo estimado para completar.
- **Dados locais**: salvos no celular, funciona offline.
- **Backup**: JSON/CSV.

## 1. Rodar no celular (GitHub Pages)
1. Faça merge desta branch na `main`.
2. No GitHub: **Settings → Pages → Source: GitHub Actions**. O workflow `.github/workflows/pages.yml` publica a cada push na `main`.
3. Abra `https://<seu-usuario>.github.io/rcgpokemon/` no celular.
   - Android (Chrome): menu ⋮ → **Instalar app**.
   - iPhone (Safari): Compartilhar → **Adicionar à Tela de Início**.

A câmera abre ao tocar em "Tirar / escolher foto" (precisa de HTTPS, que o Pages já fornece).

## 2. Onde ficam os dados
Tudo é salvo no próprio celular (`localStorage`), sem conta nem servidor. Cada aparelho tem a sua coleção.
Limpar os dados do navegador apaga a coleção, então use **Mais → Exportar JSON** de vez em quando; para levar a coleção a outro aparelho, exporte lá e **Importar JSON** no novo (as quantidades são somadas).

## Rodar local
```
python3 -m http.server 8000
```
