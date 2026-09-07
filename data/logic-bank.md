---
type: logic
levels: [L1, L2, L3]
---

# 逻辑固定题

> NEEDS_REVIEW：C1 种子内容（AI 初稿），需教研校对后移除本标记。
> 格式：每道题以 `- kind:` 起头，`- domain:` 为能力域（observe / classify / pattern / spatial / number / deduce），
> `- stem:` 为三语题干，`- clue:` 为线索（可选），`- answer:` 为三语答案。

## 找规律 Les suites

- level: L1
- domain: pattern
- kind: pattern
- stem: 🔴🔵🔴🔵…，接下来是什么？| 🔴🔵🔴🔵… What comes next? | 🔴🔵🔴🔵… Quelle est la suite ?
- answer: 🔴 | 🔴 | 🔴

- level: L1
- domain: pattern
- kind: pattern
- stem: 大 小 小 大 小 小…，接下来是什么？| Big Small Small Big Small Small… What comes next? | Grand Petit Petit Grand Petit Petit… Quelle est la suite ?
- answer: 大 | Big | Grand

- level: L2
- domain: pattern
- kind: pattern
- stem: 2、4、6、8，接下来是几？| 2, 4, 6, 8, what comes next? | 2, 4, 6, 8, quel est le suivant ?
- answer: 10 | 10 | 10

## 分类与排序 Classement

- level: L1
- domain: classify
- kind: classify
- stem: 🍎🍌🐶🍇，哪一个不是水果？| 🍎🍌🐶🍇 Which one is not a fruit? | 🍎🍌🐶🍇 Lequel n'est pas un fruit ?
- answer: 🐶 | 🐶 | 🐶

- level: L2
- domain: classify
- kind: classify
- stem: 按颜色把它们分成两类：🔴🔵🔴🔵 | Sort them into two groups by colour. | Trie-les en deux groupes par couleur.
- answer: 红色一类，蓝色一类 | Red group and blue group | Un groupe rouge, un groupe bleu

## 找不同 L'intrus

- level: L1
- domain: observe
- kind: oddOne
- stem: 哪一个和其他不一样？🔺🔺⭕🔺 | Which one is different? | Lequel est différent ?
- answer: ⭕ | ⭕ | ⭕

- level: L2
- domain: observe
- kind: oddOne
- stem: 找出不一样的细节：🐱🐱🐱🐰 | Find the odd one out. | Trouve l'intrus.
- answer: 🐰 | 🐰 | 🐰

## 演绎推理 Déduction

- level: L3
- domain: deduce
- kind: deduce
- stem: 谁偷吃了蛋糕？| Who ate the cake? | Qui a mangé le gâteau ?
- clue: 小兔在吃萝卜。| The rabbit is eating a carrot. | Le lapin mange une carotte.
- answer: 狐狸 | the fox | le renard

## 空间与迷宫 Labyrinthe

- level: L3
- domain: spatial
- kind: maze
- stem: 帮小狐狸走到树洞，路上要避开水坑。| Help the fox reach the tree hollow, avoid the puddles. | Aide le renard à atteindre l'arbre, évite les flaques.
- answer: 向右→向上→向右 | Right → Up → Right | Droite → Haut → Droite

## 数独入门 Sudoku

- level: L3
- domain: number
- kind: sudoku
- stem: 4 宫格中每行每列都要有 1、2、3、4，空格填几？| In this 4×4 grid each row and column needs 1, 2, 3, 4. What goes in the blank? | Dans cette grille 4×4, chaque ligne et colonne contient 1, 2, 3, 4. Que met-on dans la case vide ?
- answer: 3 | 3 | 3
