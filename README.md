# game

ブラウザで遊べる自作ゲームのコレクションです。すべて1つのHTMLファイルで動きます。

## 作品

| 作品 | 内容 | リンク |
|---|---|---|
| 蒼焔戦記 | ファイアーエムブレム風の戦略シミュレーションRPG（全2章） | `souen/` |

公開URL: https://kiyohiro00.github.io/game/

## フォルダ構成

```
index.html          作品一覧のトップページ
souen/index.html    蒼焔戦記（ビルド済み。これがそのまま公開される）
souen/src/          蒼焔戦記のソース（js/, assets/, build.py）
```

## 作品を追加するには

1. `作品名/index.html` を作る（フォルダ名は英小文字とハイフン）
2. `index.html`（トップページ）の `GAMES` に1件追加する
3. コミットして push すると、数分でGitHub Pagesに反映される

## 蒼焔戦記のビルド

`souen/src/` で `python3 build.py` を実行すると `index.html` が生成される。
生成した `index.html` を `souen/index.html` へコピーする。

## 注意

- このリポジトリはPublicなので、HTMLの中身は誰でも見られます。個人情報やAPIキーは入れないでください。
