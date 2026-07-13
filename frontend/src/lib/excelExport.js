import * as XLSX from 'xlsx';

const toOptsArray = (opts) => {
  if (!opts) return [];
  if (Array.isArray(opts)) return opts;
  return ['A', 'B', 'C', 'D'].map(l => opts[l] ?? '');
};
const toCorrectIdx = (ca, ans) => {
  if (typeof ca === 'number' && ca >= 0) return ca;
  if (typeof ans === 'string') { const i = ['A','B','C','D'].indexOf(ans.toUpperCase()); return i >= 0 ? i : 0; }
  return 0;
};

export function downloadMCQsAsExcel(questions, topic) {
  const data = questions.map((q, idx) => {
    const opts = toOptsArray(q.options);
    const ca = toCorrectIdx(q.correctAnswer, q.answer);
    return {
    'Question No': idx + 1,
    'Topic': topic,
    'Question': q.question,
    'Option A': opts[0] ?? '',
    'Option B': opts[1] ?? '',
    'Option C': opts[2] ?? '',
    'Option D': opts[3] ?? '',
    'Correct Answer': String.fromCharCode(65 + ca),
    'Explanation': q.explanation,
    'Recommended For': q.recommendedFor
  };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MCQs');
  
  // Design column widths
  const wscols = [
    { wch: 10 }, // Question No
    { wch: 20 }, // Topic
    { wch: 60 }, // Question
    { wch: 30 }, // Option A
    { wch: 30 }, // Option B
    { wch: 30 }, // Option C
    { wch: 30 }, // Option D
    { wch: 15 }, // Correct Answer
    { wch: 60 }, // Explanation
    { wch: 30 }, // Recommended For
  ];
  worksheet['!cols'] = wscols;

  XLSX.writeFile(workbook, `FRIDAY_MCQs_${topic.replace(/\s+/g, '_')}.xlsx`);
}
