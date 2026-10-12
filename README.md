# Coleção Pokémon

Gerenciador de coleção de cartas Pokémon — roda 100% no navegador (sem servidor).

- **Foto → carta**: OCR (Tesseract.js) lê o nome (topo) e o número tipo `025/165` (rodapé); a busca usa a [Pokémon TCG API](https://pokemontcg.io). Se o OCR errar, edite os campos e busque de novo.
- **Preços**: TCGplayer (USD) e Cardmarket (EUR), com total da coleção e botão de atualizar.
- **Repetidas**: adicionar a mesma carta soma a quantidade; aba "Repetidas" mostra extras e seu valor.
- **Backup**: exportar/importar JSON, exportar CSV. Dados ficam no `localStorage`.

## Rodar
```
python3 -m http.server 8000   # abra http://localhost:8000 (no celular, use o IP do PC)
```
A câmera funciona via `<input capture>` em celulares. Para uso no celular, publique em GitHub Pages (HTTPS).
