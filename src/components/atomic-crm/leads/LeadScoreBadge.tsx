export const getScoreConfig = (score: number) => {
  if (score >= 76)
    return { bg: "rgba(76, 175, 80, 0.12)", text: "#4CAF50", label: "Hot" };
  if (score >= 51)
    return { bg: "rgba(255, 152, 0, 0.12)", text: "#FF9800", label: "Warm" };
  if (score >= 21)
    return {
      bg: "rgba(33, 150, 243, 0.12)",
      text: "#2196F3",
      label: "Warming",
    };
  return { bg: "rgba(156, 163, 175, 0.12)", text: "#9CA3AF", label: "Cold" };
};

export const LeadScoreBadge = ({ score }: { score: number }) => {
  const config = getScoreConfig(score);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {score}
      <span className="opacity-75">{config.label}</span>
    </span>
  );
};
