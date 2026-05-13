# Design — Thèmes & Effets visuels
*2026-05-13*

## Objectif

Ajouter un thème clair et un thème sombre distincts avec un système de toggle persistant, plus des effets visuels forts (relief, glows, gradients, transitions) pour donner de la profondeur à l'interface.

## Décisions

- **Approche** : `next-themes` + redéfinition des CSS variables dans `globals.css`
- **Persistance** : localStorage via next-themes, SSR-safe
- **Toggle** : dans la page `/settings` uniquement (pas de bouton persistent dans la sidebar/header) — composant `Switch` shadcn déjà installé
- **Thème par défaut** : `system` (respecte la préférence OS de l'utilisateur)
- **Effets** : CSS pur — pas de Framer Motion, pas de dépendance lourde

## Thème Clair — Crème / Warm

Ambiance premium et douce, tons beige-sable.

| Token CSS | Valeur HSL | Description |
|---|---|---|
| `--background` | `42 30% 96%` | Crème clair |
| `--foreground` | `25 20% 15%` | Brun foncé |
| `--card` | `40 25% 98%` | Blanc cassé |
| `--card-foreground` | `25 20% 15%` | Brun foncé |
| `--popover` | `40 25% 98%` | Blanc cassé |
| `--popover-foreground` | `25 20% 15%` | Brun foncé |
| `--primary` | `25 40% 30%` | Brun chaud |
| `--primary-foreground` | `40 30% 96%` | Crème |
| `--secondary` | `35 25% 90%` | Sable doux |
| `--secondary-foreground` | `25 20% 15%` | Brun foncé |
| `--muted` | `35 25% 90%` | Sable doux |
| `--muted-foreground` | `25 15% 45%` | Brun médium |
| `--accent` | `35 50% 88%` | Sable lumineux |
| `--accent-foreground` | `25 20% 15%` | Brun foncé |
| `--destructive` | `0 84% 60%` | Rouge |
| `--destructive-foreground` | `0 0% 98%` | Blanc |
| `--border` | `35 20% 85%` | Beige moyen |
| `--input` | `35 20% 85%` | Beige moyen |
| `--ring` | `25 40% 30%` | Brun chaud |
| `--radius` | `0.6rem` | Légèrement plus arrondi |

## Thème Sombre — Charbon Chaud

Fond gris-brun foncé, accents ambre/or.

| Token CSS | Valeur HSL | Description |
|---|---|---|
| `--background` | `25 15% 10%` | Brun-noir profond |
| `--foreground` | `35 15% 90%` | Blanc chaud |
| `--card` | `25 12% 14%` | Charbon |
| `--card-foreground` | `35 15% 90%` | Blanc chaud |
| `--popover` | `25 12% 14%` | Charbon |
| `--popover-foreground` | `35 15% 90%` | Blanc chaud |
| `--primary` | `35 80% 65%` | Ambre/or |
| `--primary-foreground` | `25 15% 10%` | Brun-noir |
| `--secondary` | `25 15% 18%` | Charbon clair |
| `--secondary-foreground` | `35 15% 90%` | Blanc chaud |
| `--muted` | `25 15% 18%` | Charbon clair |
| `--muted-foreground` | `35 10% 60%` | Gris chaud |
| `--accent` | `25 20% 20%` | Charbon lumineux |
| `--accent-foreground` | `35 15% 90%` | Blanc chaud |
| `--destructive` | `0 62% 50%` | Rouge vif |
| `--destructive-foreground` | `0 0% 98%` | Blanc |
| `--border` | `25 15% 22%` | Contour chaud |
| `--input` | `25 15% 22%` | Contour chaud |
| `--ring` | `35 80% 65%` | Ambre/or |
| `--radius` | `0.6rem` | Légèrement plus arrondi |

## Effets Visuels

### Fond body
Très léger gradient radial depuis le coin supérieur gauche — quasi invisible, donne de la profondeur :
```css
body {
  background-image: radial-gradient(
    ellipse 80% 50% at 10% 0%,
    hsl(var(--accent) / 0.4) 0%,
    transparent 70%
  );
}
```

### Cards
Ombre multicouche donnant de l'élévation :
```css
.card-elevated {
  box-shadow:
    0 1px 2px hsl(var(--foreground) / 0.04),
    0 4px 12px hsl(var(--foreground) / 0.08),
    0 0 0 1px hsl(var(--border));
  transition: box-shadow 150ms ease, transform 150ms ease;
}
.card-elevated:hover {
  transform: translateY(-1px);
  box-shadow:
    0 2px 4px hsl(var(--foreground) / 0.06),
    0 8px 20px hsl(var(--foreground) / 0.12),
    0 0 0 1px hsl(var(--border));
}
```

### Sidebar — Glassmorphism
```css
aside {
  background: hsl(var(--card) / 0.7);
  backdrop-filter: blur(12px);
  border-right: 1px solid hsl(var(--border) / 0.6);
  box-shadow: 4px 0 20px hsl(var(--foreground) / 0.05);
}
```

### Sidebar — Lien actif avec glow ambre
```css
.sidebar-active {
  background: hsl(var(--accent));
  box-shadow:
    inset 0 0 12px hsl(var(--primary) / 0.15),
    0 0 8px hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
  font-weight: 500;
}
```

### Bouton primaire — Glow au hover
```css
.btn-glow:hover {
  box-shadow: 0 0 16px hsl(var(--primary) / 0.4);
  transform: translateY(-1px);
}
```

### Rows de liste — Élévation au hover
```css
.list-row {
  transition: transform 150ms ease, box-shadow 150ms ease;
}
.list-row:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px hsl(var(--foreground) / 0.08);
  z-index: 1;
  position: relative;
}
```

### Titres h1 — Gradient texte (dark uniquement)
```css
.dark h1 {
  background: linear-gradient(135deg, hsl(35 15% 90%) 0%, hsl(35 60% 70%) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Badge "sent" — Lueur verte
```css
[data-status="sent"] {
  box-shadow: 0 0 8px hsl(142 70% 45% / 0.4);
}
```

## Fichiers à modifier

| Fichier | Changement |
|---|---|
| `package.json` | Ajouter `next-themes` |
| `frontend/app/globals.css` | Remplacer tokens + ajouter classes d'effets |
| `frontend/app/layout.tsx` | Wrapper `ThemeProvider` de next-themes, supprimer `className="dark"` |
| `frontend/components/sidebar.tsx` | Classes glassmorphism + glow actif |
| `frontend/app/(app)/settings/page.tsx` | Ajouter toggle thème (bouton radio ou switch) |
| `frontend/app/(app)/dashboard/page.tsx` | Ajouter classe `card-elevated` sur les compteurs |
| `frontend/app/(app)/clients/page.tsx` | Classe `list-row` sur les lignes |
| `frontend/app/(app)/tasks/page.tsx` | Classe `list-row` + `card-elevated` |
| `frontend/app/(app)/history/page.tsx` | Classe `list-row` |

## Ce qui n'est PAS inclus

- Framer Motion (pas de transitions inter-pages)
- Animations complexes (spinner custom, skeleton loaders)
- Changement de la structure des layouts
