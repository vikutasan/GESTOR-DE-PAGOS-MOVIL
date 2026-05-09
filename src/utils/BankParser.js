import * as XLSX from 'xlsx';

export const parseBankStatement = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Convierte a matriz 2D
        
        const result = analyzeSheet(json);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

function analyzeSheet(rows) {
  let metadata = {
    current_debt: '',
    payment_no_interest: '',
    cut_day: '',
    payment_day: ''
  };
  let transactions = [];
  let guessedBank = null;

  // Aplanar todo para buscar el banco fácilmente
  const textContent = rows.map(r => r.join(' ').toLowerCase()).join(' ');
  
  if (textContent.includes('bbva')) guessedBank = 'BBVA';
  else if (textContent.includes('bancoppel')) guessedBank = 'BANCOPPEL';
  else if (textContent.includes('coppel')) guessedBank = 'P P COPPEL';
  else if (textContent.includes('nu mexico') || textContent.includes('tarjeta nu')) guessedBank = 'NU';

  // Lógica Heurística para Metadatos
  for (let i = 0; i < rows.length; i++) {
    const rowStr = rows[i].join(' ').toLowerCase();
    
    // Función auxiliar para atrapar números cercanos a una palabra clave
    const findNumber = (rIndex) => {
      let nums = [];
      // Buscar en la fila actual
      rows[rIndex].forEach(cell => {
        if (typeof cell === 'number') nums.push(cell);
        else if (typeof cell === 'string') {
          const parsed = parseFloat(cell.replace(/[^0-9.-]+/g, ''));
          if (!isNaN(parsed)) nums.push(parsed);
        }
      });
      // Si no hay números, buscar en la siguiente fila (a veces el monto está abajo)
      if (nums.length === 0 && rIndex + 1 < rows.length) {
        rows[rIndex + 1].forEach(cell => {
          if (typeof cell === 'number') nums.push(cell);
          else if (typeof cell === 'string') {
            const parsed = parseFloat(cell.replace(/[^0-9.-]+/g, ''));
            if (!isNaN(parsed)) nums.push(parsed);
          }
        });
      }
      return nums.length > 0 ? Math.max(...nums) : '';
    };

    // Deuda Actual
    if (rowStr.includes('saldo actual') || rowStr.includes('deuda total') || rowStr.includes('total a pagar') || rowStr.includes('saldo final')) {
      if (!metadata.current_debt) metadata.current_debt = findNumber(i);
    }
    // Pago para no generar intereses
    if (rowStr.includes('pago para no generar') || rowStr.includes('no generar intereses')) {
      if (!metadata.payment_no_interest) metadata.payment_no_interest = findNumber(i);
    }
    // Fecha límite de pago
    if (rowStr.includes('fecha límite') || rowStr.includes('limite de pago')) {
      // Extraeríamos el día de aquí idealmente. Por ahora lo dejamos manual para no fallar con formatos raros.
    }
    
    // Lógica para Transacciones (si la fila parece tener Fecha + Concepto + Monto)
    let hasDate = false;
    let amount = 0;
    let concept = "";
    let extractedDate = "";
    
    rows[i].forEach((cell) => {
      if (!cell) return;
      const val = String(cell).toLowerCase().trim();
      
      // Detectar fecha (01/12/2026, o 01 ENE)
      if (val.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/) || val.match(/^[0-3]?\d\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/)) {
        hasDate = true;
        extractedDate = val;
      }
      
      // Detectar Monto
      if (typeof cell === 'number') {
        amount = cell;
      } else if (typeof cell === 'string' && val.match(/^\$?\s*\d+(,\d{3})*(\.\d{2})?$/)) {
        const parsed = parseFloat(val.replace(/[^0-9.-]+/g, ''));
        if (!isNaN(parsed) && parsed > 0) amount = parsed;
      }
      
      // Detectar Concepto (palabras largas que no son fechas ni encabezados)
      if (typeof cell === 'string' && val.length > 5 && !val.match(/^\d+$/) && !val.match(/(saldo|pago|fecha|abono|cargo|retiro)/)) {
        if (!concept) concept = cell;
      }
    });

    if (hasDate && amount > 0 && concept && concept.length > 3) {
      let isSuspicious = false;
      let suspicionReason = [];
      
      if (amount > 3000) {
        isSuspicious = true;
        suspicionReason.push('Monto inusualmente alto');
      }
      if (concept.match(/(comision|anualidad|seguro|recargo|moratorio|interes|iva)/i)) {
        isSuspicious = true;
        suspicionReason.push('Posible cargo oculto/comisión');
      }
      
      transactions.push({
        id: Math.random().toString(36).substr(2, 9),
        date: extractedDate,
        concept: concept.toUpperCase(),
        amount: amount,
        isSuspicious: isSuspicious,
        suspicionReason: suspicionReason.join(', ')
      });
    }
  }

  // Detectar duplicados en transacciones
  let seen = {};
  transactions.forEach(t => {
    let key = `${t.date}-${t.amount}`;
    if (seen[key]) {
      t.isSuspicious = true;
      t.suspicionReason = t.suspicionReason ? t.suspicionReason + ', Cargo duplicado' : 'Posible cargo duplicado';
    }
    seen[key] = true;
  });

  return { metadata, transactions, guessedBank };
}
