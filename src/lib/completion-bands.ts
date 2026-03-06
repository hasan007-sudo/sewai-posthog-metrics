export type CompletionBandLabel =
  | "0"
  | "1-25"
  | "25-50"
  | "50-75"
  | "75-100"
  | "Unknown";

export interface CompletionBand {
  label: CompletionBandLabel;
  sessionCount: number;
  sharePct: number;
}

export const COMPLETION_BAND_ORDER: CompletionBandLabel[] = [
  "0",
  "1-25",
  "25-50",
  "50-75",
  "75-100",
  "Unknown",
];

export function getCompletionBandLabel(
  questionsCompleted: number,
  totalQuestions: number,
): CompletionBandLabel {
  if (totalQuestions <= 0) {
    return "Unknown";
  }

  const pct = Math.max(
    0,
    Math.min((questionsCompleted / totalQuestions) * 100, 100),
  );

  if (pct === 0) {
    return "0";
  }
  if (pct <= 25) {
    return "1-25";
  }
  if (pct <= 50) {
    return "25-50";
  }
  if (pct <= 75) {
    return "50-75";
  }

  return "75-100";
}

export function buildCompletionBands(
  rows: { questions_completed: number; total_questions_of_session: number }[],
): CompletionBand[] {
  const counts = new Map<CompletionBandLabel, number>(
    COMPLETION_BAND_ORDER.map((label) => [label, 0]),
  );

  for (const row of rows) {
    const label = getCompletionBandLabel(
      row.questions_completed,
      row.total_questions_of_session,
    );
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const total = rows.length;
  return COMPLETION_BAND_ORDER.map((label) => {
    const sessionCount = counts.get(label) ?? 0;
    const sharePct =
      total > 0 ? Math.round((sessionCount / total) * 1000) / 10 : 0;
    return { label, sessionCount, sharePct };
  });
}
