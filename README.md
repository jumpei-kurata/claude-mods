# kurata-mods

倉田さん専用の Claude Code mod 置き場（ローカルのプラグイン置き場＝マーケットプレイス `kurata-mods`）。
ここに置いた mod は、フォルダから直接読まれる（編集 → セッションで `/reload-plugins` で反映。入れ直し不要）。

置き場所: `/Users/Shared/Files From c.localized/workspace/claude-mods`（他のプロジェクトと同じ workspace。2026-10-11 に `~/claude-mods` から移した）。
GitHub: https://github.com/jumpei-kurata/claude-mods （非公開）。

## 入っている mod

| mod | 何をする | 状態 |
|---|---|---|
| `usage-band` | 入力欄の下の段の右側に「5H 29% 1h15m / 7D 15% 4d」のように常に表示（行は増やさない。デスクトップはこの場所の幅が約13文字分で、長いと「…」で切られるため短くした。枠の名前は大文字・残り時間は小文字、週は日数だけ）。80%・95% を新しく超えたら1回だけ知らせる。前回の値を覚えておき、開いた直後も表示する | 2026-10-11 導入・全セッションで有効（user scope）。同日に入力欄の上の帯から下の段へ移した |

## 確認・テスト（デスクトップアプリ同梱の新しい Claude Code で実行する）

ターミナルの `claude` は v2.1.153（自動更新オフ）で mod を知らないため、検証は同梱版で行う:

```bash
"$HOME/Library/Application Support/Claude/claude-code/2.1.295/9d6405864fdc/claude.app/Contents/MacOS/claude" plugin validate "/Users/Shared/Files From c.localized/workspace/claude-mods/usage-band"
"$HOME/Library/Application Support/Claude/claude-code/2.1.295/9d6405864fdc/claude.app/Contents/MacOS/claude" plugin test "/Users/Shared/Files From c.localized/workspace/claude-mods/usage-band"
```

（同梱版のフォルダ名はアプリの更新で変わる。`ls "$HOME/Library/Application Support/Claude/claude-code"` で確認）

## 別の Mac で入れ直すとき

```bash
claude plugin marketplace add "<このフォルダのパス>"
claude plugin install usage-band@kurata-mods --scope user
```

## 外すとき

```bash
claude plugin uninstall usage-band@kurata-mods
```

または `/plugin` の Installed タブで無効化。

ナレッジ（調査と次の候補）: vault `wiki/claude/claude-code-mods.md`
