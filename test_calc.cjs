const data = require('./src/services/initial_data.json');

const combinedHistory = [
  ...data.transactions.map(t => ({ ...t, _type: 'transaction' })),
  ...data.salaries.map(s => ({ ...s, _type: 'salary' }))
];

const alfonsoTotal = combinedHistory.reduce((acc, item) => {
  if (item._type === 'transaction' && Number(item.sender_id) === 1) return acc + Number(item.amount);
  if (item._type === 'salary' && Number(item.week_number) <= 11) return acc;
  if (item._type === 'salary' && item.status === 'PAGADO') return acc + (Number(item.amount) || 5000);
  return acc;
}, 0);

const victorTotal = combinedHistory.reduce((acc, item) => {
  if (item._type === 'transaction' && Number(item.sender_id) === 2) return acc + Number(item.amount);
  if (item._type === 'salary' && Number(item.week_number) <= 11) return acc;
  if (item._type === 'salary' && item.status === 'PENDIENTE') return acc + (Number(item.amount) || 5000);
  return acc;
}, 0);

console.log("Alfonso Total:", alfonsoTotal);
console.log("Victor Total:", victorTotal);
console.log("Diff (Alfonso - Victor):", alfonsoTotal - victorTotal);
