---
type: math
levels: [L1, L2, L3, L4]
---

# 数学固定题

> NEEDS_REVIEW：C1 种子内容（AI 初稿），需教研校对后移除本标记。
> 格式：每道题以 `- kind:` 起头（clock / money / shape / wordProblem），
> `- prompt:` 为三语题干，`- answer:` 为三语标准答案（判等取中文表述）。
> 本文件只收录「生成器无法程序化」的固定题，其余题由 `lib/mathGenerator.ts` 生成（Phase 2）。

## 认识时钟 L'heure

- level: L3
- kind: clock
- prompt: 钟面上短针指 3、长针指 12，是几点？| The short hand points to 3 and the long hand to 12. What time is it? | La petite aiguille est sur 3 et la grande sur 12. Il est quelle heure ?
- answer: 3 点 | 3 o'clock | 3 heures

- level: L3
- kind: clock
- prompt: 短针指 8、长针指 12，是几点？| The short hand points to 8 and the long hand to 12. What time is it? | La petite aiguille est sur 8. Il est quelle heure ?
- answer: 8 点 | 8 o'clock | 8 heures

- level: L3
- kind: clock
- prompt: 长针指 6、短针过了 4，是几点？| The long hand points to 6 and the short hand is past 4. What time is it? | La grande aiguille est sur 6. Il est quelle heure ?
- answer: 4 点半 | half past four | 4 heures et demie

## 认识人民币 L'argent

- level: L3
- kind: money
- prompt: 这张纸币是多少钱？🪙（1 元）| How much is this note? (1 yuan) | Combien vaut ce billet ? (1 yuan)
- answer: 1 元 | 1 yuan | 1 yuan

- level: L3
- kind: money
- prompt: 这张纸币是多少钱？（10 元）| How much is this note? (10 yuan) | Combien vaut ce billet ? (10 yuan)
- answer: 10 元 | 10 yuan | 10 yuan

- level: L2
- kind: money
- prompt: 一枚 1 元 + 一枚 1 元，一共多少钱？| One 1-yuan coin plus another. How much in total? | Une pièce de 1 yuan plus une autre. Combien au total ?
- answer: 2 元 | 2 yuan | 2 yuans

## 认识图形 Les formes

- level: L1
- kind: shape
- prompt: 哪个图形是圆圆的、没有角？🔴 | Which shape is round with no corners? | Quelle forme est ronde sans coin ?
- answer: 圆形 | circle | cercle

- level: L1
- kind: shape
- prompt: 哪个图形有三条边、三个角？🔺 | Which shape has three sides and three corners? | Quelle forme a trois côtés et trois coins ?
- answer: 三角形 | triangle | triangle

## 应用题 Problèmes

- level: L4
- kind: wordProblem
- prompt: 树上有 5 只小鸟，又飞来 3 只，一共几只？| There are 5 birds in the tree, 3 more come. How many in total? | Il y a 5 oiseaux dans l'arbre, 3 arrivent. Combien en tout ?
- answer: 8 只 | 8 birds | 8 oiseaux

- level: L4
- kind: wordProblem
- prompt: 盘子里有 9 颗糖，吃掉 4 颗，还剩几颗？| There are 9 candies on the plate, 4 are eaten. How many are left? | Il y a 9 bonbons dans l'assiette, 4 sont mangés. Combien en reste-t-il ?
- answer: 5 颗 | 5 candies | 5 bonbons

## 长度单位 Les unités de longueur

- level: L5
- kind: lengthUnit
- prompt: 1 米 = ? 厘米 | 1 meter = ? centimeters | 1 mètre = ? centimètres
- answer: 100 厘米 | 100 centimeters | 100 centimètres

- level: L5
- kind: lengthUnit
- prompt: 1 千米 = ? 米 | 1 kilometer = ? meters | 1 kilomètre = ? mètres
- answer: 1000 米 | 1000 meters | 1000 mètres

## 质量单位 Les unités de masse

- level: L5
- kind: massUnit
- prompt: 1 千克 = ? 克 | 1 kilogram = ? grams | 1 kilogramme = ? grammes
- answer: 1000 克 | 1000 grams | 1000 grammes

- level: L5
- kind: massUnit
- prompt: 1 吨 = ? 千克 | 1 ton = ? kilograms | 1 tonne = ? kilogrammes
- answer: 1000 千克 | 1000 kilograms | 1000 kilogrammes

## 轴对称图形 Symétrie axiale

- level: L5
- kind: axisSymmetry
- prompt: 「⊞」是轴对称图形吗？| Is "⊞" an axis-symmetric shape? | La forme "⊞" est-elle symétrique ?
- answer: 是 | yes | oui

- level: L5
- kind: axisSymmetry
- prompt: 「⧄」是轴对称图形吗？| Is "⧄" an axis-symmetric shape? | La forme "⧄" est-elle symétrique ?
- answer: 不是 | no | non
