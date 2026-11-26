// src/report/score.js
// Score wording shared by the PDF report and the notification messages.
function scoreGrade(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs improvement';
  return 'Poor';
}

module.exports = { scoreGrade };
