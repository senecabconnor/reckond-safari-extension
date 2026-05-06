/**
 * Hex values must match popup.css :root --reckond-grade-* (toolbar badge).
 * Aligned with Reckond app grade color system (Direction 3 — Terracotta Modern).
 */
export const RECKOND_GRADE_HEX = {
  A: "#3A7D52",
  B: "#5A8A2E",
  C: "#C4841A",
  D: "#C4601A",
  F: "#B83030",
  N: "#7A5C45",
};

export function badgeBackgroundColorForGrade(grade) {
  const letter = String(grade ?? "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return RECKOND_GRADE_HEX[letter] ?? RECKOND_GRADE_HEX.C;
}
