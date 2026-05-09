import localforage from 'localforage';
import { format } from 'date-fns';

// Configurar instancias de bases de datos (tablas)
const dbAccounts = localforage.createInstance({ name: 'pagos', storeName: 'accounts' });
const dbCreditLines = localforage.createInstance({ name: 'pagos', storeName: 'credit_lines' });
const dbTransactions = localforage.createInstance({ name: 'pagos', storeName: 'transactions' });
const dbSalaries = localforage.createInstance({ name: 'pagos', storeName: 'salaries' });

export const initDB = async () => {
  const accountsCount = await dbAccounts.length();
  if (accountsCount === 0) {
    await dbAccounts.setItem('1', { id: '1', name: 'Alfonso', balance: 0 });
    await dbAccounts.setItem('2', { id: '2', name: 'Víctor', balance: 0 });
  }

  // Si no hay tarjetas, cargar unas por defecto o dejar vacío
  const cardsCount = await dbCreditLines.length();
  if (cardsCount === 0) {
    const defaultCards = [
      { id: '1', name: 'NU', type: 'TDC', credit_limit: 12000, cut_day: 22, payment_day: 4, current_debt: 0, payment_no_interest: 0, available_credit: 0, liquidation_amount: 0, periodicity: 'MENSUAL' }
    ];
    for (let c of defaultCards) {
      await dbCreditLines.setItem(c.id, c);
    }
  }
};

export const getDashboard = async () => {
  let accounts = [];
  await dbAccounts.iterate((value) => { accounts.push(value); });

  let transactions = [];
  await dbTransactions.iterate((value) => { transactions.push(value); });

  let alfonsoBalance = 0;
  let victorBalance = 0;

  transactions.forEach(t => {
    if (t.sender_id === '1') alfonsoBalance -= t.amount;
    if (t.receiver_id === '1') alfonsoBalance += t.amount;
    if (t.sender_id === '2') victorBalance -= t.amount;
    if (t.receiver_id === '2') victorBalance += t.amount;
  });

  let totalDebt = 0;
  await dbCreditLines.iterate((card) => {
    totalDebt += (Number(card.current_debt) || 0);
  });

  let salaries = [];
  await dbSalaries.iterate((s) => { salaries.push(s); });

  salaries.forEach(s => {
    if (s.week_number <= 11) return;
    if (s.status === 'PENDIENTE') {
      victorBalance -= (Number(s.amount) || 5000);
    } else if (s.status === 'PAGADO') {
      alfonsoBalance -= (Number(s.amount) || 5000);
    }
  });

  return {
    accounts: [
      { id: '1', name: 'Alfonso', balance: alfonsoBalance },
      { id: '2', name: 'Víctor', balance: victorBalance }
    ],
    totalDebt
  };
};

export const getCards = async () => {
  let cards = [];
  await dbCreditLines.iterate((card) => { cards.push(card); });
  // Sort by payment day
  return cards.sort((a, b) => (a.payment_day || 31) - (b.payment_day || 31));
};

export const saveCard = async (cardData, id = null) => {
  const cardId = id || Date.now().toString();
  await dbCreditLines.setItem(cardId, { ...cardData, id: cardId });
  return { success: true, id: cardId };
};

export const getTransactions = async () => {
  let trans = [];
  await dbTransactions.iterate((t) => { trans.push(t); });
  return trans.sort((a, b) => new Date(b.date) - new Date(a.date));
};

export const saveTransaction = async (data) => {
  const id = Date.now().toString();
  const date = data.date ? new Date(data.date).toISOString() : new Date().toISOString();
  const t = {
    ...data,
    id,
    date,
    amount: Number(data.amount),
    interest_amount: Number(data.interest_amount || 0)
  };
  await dbTransactions.setItem(id, t);
  return { success: true, id };
};

export const getSalaries = async () => {
  let salaries = [];
  await dbSalaries.iterate((s) => { salaries.push(s); });
  
  // Lógica de auto-generar semanas
  const today = new Date();
  const lastThursday = new Date();
  lastThursday.setDate(today.getDate() - ((today.getDay() + 3) % 7));
  lastThursday.setHours(0, 0, 0, 0);

  // Ordenamos para ver el último
  salaries.sort((a, b) => b.week_number - a.week_number);
  const lastEntryDate = salaries.length > 0 ? new Date(salaries[0].date) : new Date('2026-03-04');
  const lastWeekNum = salaries.length > 0 ? salaries[0].week_number : 10;

  if (lastThursday > lastEntryDate) {
    const diffTime = lastThursday - lastEntryDate;
    const weeksToGenerate = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));

    if (weeksToGenerate > 0) {
      let currentWeek = lastWeekNum;
      let currentDate = new Date(lastEntryDate);
      for (let i = 0; i < weeksToGenerate; i++) {
        currentWeek++;
        currentDate.setDate(currentDate.getDate() + 7);
        const dateStr = currentDate.toISOString().split('T')[0];
        const newSalary = { id: Date.now().toString() + i, week_number: currentWeek, date: dateStr, status: 'PENDIENTE', amount: 5000 };
        await dbSalaries.setItem(newSalary.id, newSalary);
        salaries.push(newSalary);
      }
    }
  }

  return salaries.sort((a, b) => b.week_number - a.week_number);
};

export const updateSalaryStatus = async (id, status) => {
  const s = await dbSalaries.getItem(id.toString());
  if (s) {
    s.status = status;
    await dbSalaries.setItem(id.toString(), s);
  }
};

export const getSuggestions = async () => {
  let cards = await getCards();
  const today = new Date().getDate();
  const tdcCards = cards.filter(c => c.type === 'TDC' && c.cut_day);
  
  if (tdcCards.length === 0) return null;

  let bestCard = null;
  let minDiff = 31;

  tdcCards.forEach(card => {
    let diff = today - card.cut_day;
    if (diff < 0) diff += 30;
    
    if (diff >= 0 && diff < minDiff) {
      minDiff = diff;
      bestCard = card;
    }
  });

  return { bestCard, daysSinceCut: minDiff };
};

export const syncCard = async (id, metadata) => {
  const card = await dbCreditLines.getItem(id.toString());
  if (card) {
    if (metadata.current_debt !== undefined) card.current_debt = metadata.current_debt;
    if (metadata.payment_no_interest !== undefined) card.payment_no_interest = metadata.payment_no_interest;
    await dbCreditLines.setItem(id.toString(), card);
    return { updated: 1 };
  }
  throw new Error("Card not found");
};
