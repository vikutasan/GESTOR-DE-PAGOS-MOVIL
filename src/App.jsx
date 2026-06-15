import React, { useState, useEffect, useRef } from 'react';
import { 
  CreditCard, 
  AlertCircle, 
  Plus, 
  CheckCircle, 
  Edit, 
  ArrowLeft, 
  Settings, 
  LayoutDashboard, 
  Calendar,
  DollarSign,
  UploadCloud,
  AlertTriangle,
  ShieldAlert,
  FileDown,
  Database,
  ImagePlus
} from 'lucide-react';
import { parseBankStatement } from './utils/BankParser';
import { processBankStatementImage } from './services/visionApi';
import './App.css';
import { initDB, getDashboard, getCards, saveCard, deleteCard, getTransactions, saveTransaction, deleteTransaction, getSalaries, updateSalaryStatus, getSuggestions, syncCard, exportAllData, importData } from './services/db';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function App() {
  const [activeModule, setActiveModule] = useState('payments');
  const [debtTab, setDebtTab] = useState('alfonso');
  const [dashboard, setDashboard] = useState({ accounts: [], totalDebt: 0 });
  const [cards, setCards] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [combinedHistory, setCombinedHistory] = useState([]);
  const [suggestionAlf, setSuggestionAlf] = useState(null);
  const [suggestionVic, setSuggestionVic] = useState(null);
  
  // Sync Module State
  const [syncFile, setSyncFile] = useState(null);
  const [syncData, setSyncData] = useState(null);
  const [syncSelectedCardId, setSyncSelectedCardId] = useState('');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [geminiApiKey, setGeminiApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false); // Operaciones
  const [isCardModalOpen, setIsCardModalOpen] = useState(false); // Fichas
  
  // Import / Export State
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  
  const [formData, setFormData] = useState({
    amount: '', sender_id: '1', receiver_id: '2', concept: '', is_salary: false, interest_amount: '', credit_line_id: '', date: ''
  });

  const [editingCardId, setEditingCardId] = useState(null);
  const [editingTransactionId, setEditingTransactionId] = useState(null);
  const [cardData, setCardData] = useState({
    name: '', type: 'TDC', periodicity: 'MENSUAL', credit_limit: '', 
    cut_day: '', payment_day: '', current_debt: '', 
    payment_no_interest: '', available_credit: '', liquidation_amount: '',
    managed_by: 'alfonso'
  });

  const fetchData = async () => {
    try {
      await initDB();
      const dbData = await getDashboard();
      setDashboard(dbData);

      const cardsData = await getCards();
      setCards(cardsData);

      const txData = await getTransactions();
      setTransactions(txData);

      const salData = await getSalaries();
      setSalaries(salData);

      // Build combined history
      const txWithType = txData.map(t => ({ ...t, _type: 'transaction' }));
      const salWithType = salData.map(s => ({ ...s, _type: 'salary' }));
      const combined = [...txWithType, ...salWithType].sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA - dateB;
      });
      setCombinedHistory(combined);

      // Suggestions
      try {
        const sugA = await getSuggestions('alfonso');
        setSuggestionAlf(sugA);
      } catch(e) { console.log('No suggestions for alfonso'); }
      try {
        const sugV = await getSuggestions('victor');
        setSuggestionVic(sugV);
      } catch(e) { console.log('No suggestions for victor'); }

    } catch (e) {
      console.error("Error fetching data", e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSalaryStatusChange = async (id, newStatus) => {
    try {
      await updateSalaryStatus(id, newStatus);
      fetchData();
    } catch (e) {
      console.error("Error updating salary status", e);
    }
  };

  const handleTransactionSubmit = async (e) => {
    e.preventDefault();
    try {
      const tx = {
        amount: parseFloat(formData.amount),
        sender_id: formData.sender_id ? parseInt(formData.sender_id) : null,
        receiver_id: formData.receiver_id ? parseInt(formData.receiver_id) : null,
        concept: formData.concept,
        is_salary: formData.is_salary ? 1 : 0,
        interest_amount: formData.interest_amount ? parseFloat(formData.interest_amount) : 0,
        credit_line_id: formData.credit_line_id ? parseInt(formData.credit_line_id) : null,
        date: formData.date ? new Date(formData.date + 'T12:00:00').toISOString() : new Date().toISOString()
      };
      if (editingTransactionId) {
        tx.id = editingTransactionId;
      }
      await saveTransaction(tx);
      setIsModalOpen(false);
      setEditingTransactionId(null);
      fetchData();
    } catch (e) {
      alert("Error al guardar: " + e.message);
    }
  };

  const handleCardSubmit = async (e) => {
    e.preventDefault();
    try {
      const card = {
        ...cardData,
        credit_limit: cardData.credit_limit ? parseFloat(cardData.credit_limit) : 0,
        current_debt: cardData.current_debt ? parseFloat(cardData.current_debt) : 0,
        cut_day: cardData.cut_day ? parseInt(cardData.cut_day) : null,
        payment_day: cardData.payment_day ? parseInt(cardData.payment_day) : null,
        payment_no_interest: cardData.payment_no_interest ? parseFloat(cardData.payment_no_interest) : 0,
        available_credit: cardData.available_credit ? parseFloat(cardData.available_credit) : 0,
        liquidation_amount: cardData.liquidation_amount ? parseFloat(cardData.liquidation_amount) : 0,
      };
      if (editingCardId) {
        card.id = editingCardId;
      }
      await saveCard(card);
      setIsCardModalOpen(false);
      fetchData();
    } catch (e) {
      alert("Error al guardar ficha: " + e.message);
    }
  };

  const openEditTransactionModal = (t) => {
    setEditingTransactionId(t.id);
    setFormData({
      amount: t.amount.toString(),
      sender_id: t.sender_id ? t.sender_id.toString() : '',
      receiver_id: t.receiver_id ? t.receiver_id.toString() : '',
      concept: t.concept || '',
      is_salary: !!t.is_salary,
      interest_amount: t.interest_amount ? t.interest_amount.toString() : '',
      credit_line_id: t.credit_line_id ? t.credit_line_id.toString() : '',
      date: t.date ? t.date.substring(0, 10) : ''
    });
    setIsModalOpen(true);
  };

  const openCardModal = (card = null) => {
    if (card) {
      setEditingCardId(card.id);
      setCardData({ ...card });
    } else {
      setEditingCardId(null);
      setCardData({
        name: '', type: 'TDC', periodicity: 'MENSUAL', credit_limit: '', 
        cut_day: '', payment_day: '', current_debt: '', 
        payment_no_interest: '', available_credit: '', liquidation_amount: '',
        managed_by: debtTab
      });
    }
    setIsCardModalOpen(true);
  };

  const handleExportPDF = async () => {
    try {
      const doc = new jsPDF();
      
      // Totals calculation
      const alfonsoTotal = combinedHistory.reduce((acc, item) => {
        if (item._type === 'transaction' && item.sender_id === 1) return acc + item.amount;
        if (item._type === 'salary' && item.week_number <= 11) return acc;
        if (item._type === 'salary' && item.status === 'PAGADO') return acc + (item.amount || 5000);
        return acc;
      }, 0);
      
      const victorTotal = combinedHistory.reduce((acc, item) => {
        if (item._type === 'transaction' && item.sender_id === 2) return acc + item.amount;
        if (item._type === 'salary' && item.week_number <= 11) return acc;
        if (item._type === 'salary' && item.status === 'PENDIENTE') return acc + (item.amount || 5000);
        return acc;
      }, 0);

      const interestTotal = combinedHistory.reduce((acc, item) => item._type === 'transaction' ? acc + (item.interest_amount || 0) : acc, 0);

      const diff = alfonsoTotal - victorTotal;
      let resultText = "Nadie le debe a nadie (Están a mano)";
      if (diff > 0) resultText = `Víctor aún debe a Alfonso: $${Math.abs(diff).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
      else if (diff < 0) resultText = `Alfonso aún debe a Víctor: $${Math.abs(diff).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

      doc.setFontSize(14);
      doc.text("Historial de Aportaciones A&V", 105, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`RESULTADO: ${resultText}`, 105, 22, { align: 'center' });
      
      const tableData = combinedHistory.map(item => {
        if (item._type === 'transaction') {
          return [
            new Date(item.date).toLocaleDateString('es-MX'),
            item.concept,
            item.sender_id === 1 ? `$${item.amount.toLocaleString()}` : '-',
            item.interest_amount > 0 ? `$${item.interest_amount.toLocaleString()}` : '-',
            item.sender_id === 2 ? `$${item.amount.toLocaleString()}` : '-'
          ];
        } else {
          return [
            new Date(item.date).toLocaleDateString('es-MX'),
            `Sueldo Sem. ${item.week_number} (${item.status})`,
            item.status === 'PAGADO' ? `$${(item.amount || 5000).toLocaleString()}` : '-',
            '-',
            item.status === 'PENDIENTE' ? `$${(item.amount || 5000).toLocaleString()}` : '-'
          ];
        }
      });

      autoTable(doc, {
        startY: 28,
        head: [['Fecha', 'Concepto', 'Aport. Alfonso', 'Intereses Pag.', 'Aport. Víctor']],
        body: tableData,
        foot: [['', 'TOTALES', `$${alfonsoTotal.toLocaleString()}`, `$${interestTotal.toLocaleString()}`, `$${victorTotal.toLocaleString()}`]],
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 2, textColor: [0, 0, 0] },
        headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold', lineWidth: 0.1, lineColor: [51, 51, 51] },
        footStyles: { fontStyle: 'bold', fontSize: 10, textColor: [0, 0, 0] },
        columnStyles: {
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' }
        }
      });

      // Get base64 string
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      
      // Check if it's running in Capacitor
      if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        const fileName = `aportaciones_${Date.now()}.pdf`;
        const writeResult = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache
        });
        
        await Share.share({
          title: 'Historial de Aportaciones',
          text: 'Aquí está el historial de Aportaciones A&V',
          url: writeResult.uri,
          dialogTitle: 'Compartir PDF'
        });
      } else {
        // Fallback for browser
        doc.save(`aportaciones_${Date.now()}.pdf`);
      }
    } catch (e) {
      alert("Error exportando PDF: " + e.message);
    }
  };

  const getBalanceStatus = () => {
    if (!dashboard.accounts || dashboard.accounts.length === 0) return { text: "Cargando...", color: "text-secondary" };
    const victor = dashboard.accounts.find(a => a.name === 'Víctor');
    let victorBalance = victor?.balance || 0;
    
    if (victorBalance > 0) return { text: `Víctor debe a Alfonso: $${victorBalance.toLocaleString()}`, color: 'text-red' };
    if (victorBalance < 0) return { text: `Alfonso debe a Víctor: $${Math.abs(victorBalance).toLocaleString()}`, color: 'text-green' };
    return { text: `Están a mano ($0.00)`, color: 'text-secondary' };
  };

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>SUITE A&V</h2>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeModule === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveModule('payments')}
          >
            <LayoutDashboard size={20} />
            <span>Gestión de Pagos</span>
          </button>
          <button 
            className={`nav-item ${activeModule === 'salaries' ? 'active' : ''}`}
            onClick={() => setActiveModule('salaries')}
          >
            <Calendar size={20} />
            <span>Semanalidades Víctor</span>
          </button>
          <button 
            className={`nav-item ${activeModule === 'agreements' ? 'active' : ''}`}
            onClick={() => setActiveModule('agreements')}
          >
            <CheckCircle size={20} />
            <span>Acuerdos A&V</span>
          </button>
          <button 
            className={`nav-item ${activeModule === 'contributions' ? 'active' : ''}`}
            onClick={() => setActiveModule('contributions')}
          >
            <DollarSign size={20} />
            <span>Aportaciones A&V</span>
          </button>
          <button 
            className={`nav-item ${activeModule === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveModule('sync')}
          >
            <UploadCloud size={20} />
            <span>Sincronizar Banco</span>
          </button>
          <button 
            className={`nav-item ${activeModule === 'import_export' ? 'active' : ''}`}
            onClick={() => setActiveModule('import_export')}
          >
            <Database size={20} />
            <span>Respaldos (JSON)</span>
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {activeModule === 'payments' ? (
          <div className="app-container animate-fade-in">
            <header>
              <h1>GESTIÓN DE PAGOS DE DEUDAS</h1>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'white' }} onClick={() => openCardModal(null)}>
                  <Plus size={20} /> Añadir Ficha
                </button>
              </div>
            </header>

            {/* TABS Alfonso / Victor */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '2px solid var(--border-color)' }}>
              <button 
                onClick={() => setDebtTab('alfonso')}
                style={{ 
                  padding: '0.75rem 2rem', fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer',
                  background: debtTab === 'alfonso' ? 'var(--accent-blue)' : 'transparent',
                  color: debtTab === 'alfonso' ? '#fff' : 'var(--text-secondary)',
                  border: 'none', borderRadius: '8px 8px 0 0', transition: 'all 0.2s ease'
                }}
              >
                Deudas Adm. por Alfonso
              </button>
              <button 
                onClick={() => setDebtTab('victor')}
                style={{ 
                  padding: '0.75rem 2rem', fontWeight: 'bold', fontSize: '0.95rem', cursor: 'pointer',
                  background: debtTab === 'victor' ? 'var(--accent-purple)' : 'transparent',
                  color: debtTab === 'victor' ? '#fff' : 'var(--text-secondary)',
                  border: 'none', borderRadius: '8px 8px 0 0', transition: 'all 0.2s ease'
                }}
              >
                Deudas Adm. por Víctor
              </button>
            </div>

            {(() => {
              const tabCards = cards.filter(c => (c.managed_by || 'alfonso') === debtTab);
              const suggestion = debtTab === 'alfonso' ? suggestionAlf : suggestionVic;
              const tabDebt = tabCards.reduce((acc, c) => acc + (c.current_debt || 0), 0);

              return (
                <>
                  <div className="dashboard-grid">
                    <div className="card">
                      <div className="stat-label">Deuda Total Acumulada</div>
                      <div className="stat-value text-red">
                        ${tabDebt ? tabDebt.toLocaleString() : '0.00'}
                      </div>
                    </div>

                    {suggestion && suggestion.suggestions && suggestion.suggestions.length > 0 && (
                      <div className="card" style={{ borderLeft: '4px solid var(--accent-purple)' }}>
                        <div className="stat-label" style={{color: 'var(--accent-purple)'}}>Sugerencia Inteligente</div>
                        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {suggestion.suggestions.map((card, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                               <span style={{color: i === 0 ? 'var(--accent-blue)' : 'var(--text-primary)', fontWeight: 'bold', fontSize: i === 0 ? '1.1rem' : '0.9rem'}}>{i + 1}. Usa {card.name}</span>
                               <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Corte hace {card.daysSinceCut} días</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const urgentCards = tabCards.map(c => {
                        const today = new Date().getDate();
                        let daysUntil = null;
                        if (c.payment_day) {
                          daysUntil = c.payment_day - today;
                          if (daysUntil < 0) daysUntil += 30;
                        }
                        return { ...c, daysUntil };
                      }).filter(c => c.daysUntil !== null && c.current_debt > 0 && c.daysUntil <= 7)
                        .sort((a, b) => a.daysUntil - b.daysUntil);

                      if (urgentCards.length > 0) {
                        return (
                          <div className="card" style={{ borderLeft: '4px solid var(--accent-red)' }}>
                            <div className="stat-label" style={{color: 'var(--accent-red)'}}>Foco Rojo (Próximos a Pagar)</div>
                            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {urgentCards.map((uc, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 'bold' }}>{uc.name}</span>
                                  <span style={{ fontSize: '0.85rem', color: uc.daysUntil <= 3 ? 'var(--accent-red)' : 'var(--accent-purple)', fontWeight: 'bold' }}>
                                    {uc.daysUntil === 0 ? 'HOY' : `en ${uc.daysUntil} días`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

            <h2 style={{ marginBottom: '1.5rem' }}>Tarjetas y Créditos (Próximos Vencimientos)</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[...tabCards].sort((a, b) => {
                const today = new Date().getDate();
                const getDaysUntil = (day) => {
                  if (!day) return 999;
                  let diff = day - today;
                  if (diff < 0) diff += 30;
                  return diff;
                };
                return getDaysUntil(a.payment_day) - getDaysUntil(b.payment_day);
              }).map(card => {
                const today = new Date().getDate();
                let daysUntil = card.payment_day ? card.payment_day - today : null;
                if (daysUntil !== null && daysUntil < 0) daysUntil += 30;
                
                let urgencyColor = 'var(--text-secondary)';
                if (daysUntil !== null) {
                  if (daysUntil <= 3) urgencyColor = 'var(--accent-red)';
                  else if (daysUntil <= 7) urgencyColor = 'var(--accent-purple)';
                  else if (daysUntil <= 15) urgencyColor = 'var(--accent-blue)';
                  else urgencyColor = 'var(--accent-green)';
                }

                return (
                  <div key={card.id} className="card" style={{ cursor: 'pointer', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s ease', borderLeft: `4px solid ${urgencyColor}` }} onClick={() => openCardModal(card)} onMouseOver={(e) => e.currentTarget.style.transform = 'translateX(5px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateX(0)'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: 1 }}>
                      <div style={{ minWidth: '150px' }}>
                        <span style={{ fontWeight: '700', fontSize: '1.1rem', display: 'block', marginBottom: '0.2rem' }}>{card.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{card.type}</span>
                      </div>
                      
                      <div style={{ flex: 1, display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem' }}>Crédito Autorizado</span>
                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                            ${(card.credit_limit || 0).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem' }}>Deuda Total</span>
                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: card.current_debt > 0 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                            ${(card.current_debt || 0).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem' }}>Saldo Disponible</span>
                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--accent-green)' }}>
                            ${(card.available_credit || 0).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem' }}>Fecha de Corte</span>
                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{card.cut_day || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem' }}>Pago (Sin Int.)</span>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: card.payment_no_interest > 0 ? 'var(--accent-purple)' : 'var(--text-primary)' }}>
                          ${(card.payment_no_interest || 0).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem' }}>Fecha Límite</span>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{card.payment_day || 'N/A'}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem' }}>Vence en</span>
                        <span style={{ fontWeight: '900', color: urgencyColor, fontSize: '0.9rem' }}>
                          {daysUntil !== null ? (daysUntil === 0 ? 'HOY' : `${daysUntil} días`) : 'N/A'}
                        </span>
                      </div>
                      <Edit size={18} className="text-secondary" style={{ opacity: 0.5 }} />
                    </div>
                  </div>
                );
              })}
            </div>
                </>
              );
            })()}
          </div>
        ) : activeModule === 'contributions' ? (
          <div className="app-container animate-fade-in">
            <header>
              <h1>APORTACIONES DE ALFONSO Y DE VICTOR</h1>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'white' }} onClick={handleExportPDF}>
                  <FileDown size={20} /> Exportar PDF
                </button>
                <button className="btn" onClick={() => {
                  setEditingTransactionId(null);
                  setFormData({ amount: '', sender_id: '1', receiver_id: '2', concept: '', is_salary: false, interest_amount: '', credit_line_id: '', date: '' });
                  setIsModalOpen(true);
                }}>
                  <Plus size={20} /> Registrar Aportación
                </button>
              </div>
            </header>

            <div className="card">
              <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Historial de Movimientos</h2>
              
              <div style={{ background: 'var(--bg-dark)', padding: '1.5rem', borderRadius: '0.75rem', marginBottom: '1.5rem', textAlign: 'center', fontSize: '1.2rem', border: '1px solid var(--border-color)' }}>
                {(() => {
                  const alfonsoTotal = combinedHistory.reduce((acc, item) => {
                    if (item._type === 'transaction' && item.sender_id === 1) return acc + item.amount;
                    if (item._type === 'salary' && item.week_number <= 11) return acc;
                    if (item._type === 'salary' && item.status === 'PAGADO') return acc + (item.amount || 5000);
                    return acc;
                  }, 0);
                  
                  const victorTotal = combinedHistory.reduce((acc, item) => {
                    if (item._type === 'transaction' && item.sender_id === 2) return acc + item.amount;
                    if (item._type === 'salary' && item.week_number <= 11) return acc;
                    if (item._type === 'salary' && item.status === 'PENDIENTE') return acc + (item.amount || 5000);
                    return acc;
                  }, 0);
                  
                  const diff = alfonsoTotal - victorTotal;
                  
                  if (diff > 0) {
                    return <span style={{ color: 'var(--accent-red)' }}>RESULTADO: Víctor aún debe a Alfonso <strong style={{fontSize: '1.4rem'}}>${Math.abs(diff).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></span>;
                  } else if (diff < 0) {
                    return <span style={{ color: 'var(--accent-green)' }}>RESULTADO: Alfonso aún debe a Víctor <strong style={{fontSize: '1.4rem'}}>${Math.abs(diff).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></span>;
                  } else {
                    return <span style={{ color: 'var(--text-secondary)' }}>RESULTADO: Nadie le debe a nadie (Están a mano)</span>;
                  }
                })()}
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th style={{ textAlign: 'right' }}>Aportación Alfonso</th>
                      <th style={{ textAlign: 'right', color: 'var(--accent-purple)' }}>Intereses Pagados</th>
                      <th style={{ textAlign: 'right' }}>Aportación Víctor</th>
                      <th className="nav-item"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedHistory.map((item, index) => {
                      if (item._type === 'transaction') {
                        const t = item;
                        return (
                          <tr key={`trans-${t.id}-${index}`}>
                            <td className="text-secondary" style={{ fontSize: '0.8rem' }}>{new Date(t.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                            <td style={{ fontWeight: '500' }}>{t.concept}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                              {t.sender_id === 1 ? `$${t.amount.toLocaleString()}` : '-'}
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--accent-purple)' }}>
                              {t.interest_amount > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                  <span style={{ fontWeight: 'bold' }}>${t.interest_amount.toLocaleString()}</span>
                                  {t.credit_line_id && cards.find(c => c.id === t.credit_line_id) && (
                                    <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                                      ({((t.interest_amount / (cards.find(c => c.id === t.credit_line_id).current_debt || 1)) * 100).toFixed(1)}% tasa real)
                                    </span>
                                  )}
                                </div>
                              ) : '-'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                              {t.sender_id === 2 ? `$${t.amount.toLocaleString()}` : '-'}
                            </td>
                            <td className="nav-item" style={{ textAlign: 'right' }}>
                              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => openEditTransactionModal(t)}>
                                <Edit size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      } else {
                        const s = item;
                        return (
                          <tr key={`sal-${s.id}-${index}`} style={{ background: s.status === 'PENDIENTE' ? 'rgba(248, 113, 113, 0.05)' : 'rgba(74, 222, 128, 0.05)' }}>
                            <td className="text-secondary" style={{ fontSize: '0.8rem' }}>{new Date(s.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                            <td style={{ fontWeight: '500' }}>
                              Sueldo Semana {s.week_number} <span style={{fontSize:'0.7rem', opacity:0.7}}>({s.status})</span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: s.status === 'PAGADO' ? 'var(--accent-green)' : 'inherit' }}>
                              {s.status === 'PAGADO' ? `$${(s.amount || 5000).toLocaleString()}` : '-'}
                            </td>
                            <td style={{ textAlign: 'right' }}>-</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', color: s.status === 'PENDIENTE' ? 'var(--accent-red)' : 'inherit' }}>
                              {s.status === 'PENDIENTE' ? `$${(s.amount || 5000).toLocaleString()}` : '-'}
                            </td>
                            <td className="nav-item"></td>
                          </tr>
                        );
                      }
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', fontWeight: '800' }}>
                      <td colSpan="2">TOTALES</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-blue)' }}>
                        ${combinedHistory.reduce((acc, item) => {
                          if (item._type === 'transaction' && item.sender_id === 1) return acc + item.amount;
                          if (item._type === 'salary' && item.week_number <= 11) return acc;
                          if (item._type === 'salary' && item.status === 'PAGADO') return acc + (item.amount || 5000);
                          return acc;
                        }, 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-purple)' }}>
                        ${combinedHistory.reduce((acc, item) => item._type === 'transaction' ? acc + (item.interest_amount || 0) : acc, 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-green)' }}>
                        ${combinedHistory.reduce((acc, item) => {
                          if (item._type === 'transaction' && item.sender_id === 2) return acc + item.amount;
                          if (item._type === 'salary' && item.week_number <= 11) return acc;
                          if (item._type === 'salary' && item.status === 'PENDIENTE') return acc + (item.amount || 5000);
                          return acc;
                        }, 0).toLocaleString()}
                      </td>
                      <td className="nav-item"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        ) : activeModule === 'agreements' ? (
          <div className="app-container animate-fade-in">
            <header>
              <h1>ACUERDOS A&V</h1>
            </header>
            
            <div className="card agreements-doc" style={{ padding: '3rem', maxWidth: '900px', margin: '0 auto' }}>
              <section className="doc-section">
                <h2 style={{ color: 'var(--accent-blue)', marginBottom: '1.5rem' }}>Bases del Sistema</h2>
                <div className="agreement-box">
                  <strong>Salario Semanal:</strong> Alfonso se compromete a pagar a Víctor <strong>$5,000 MXN</strong> todos los días <strong>jueves</strong> por concepto de salario.
                </div>
              </section>

              <section className="doc-section" style={{ marginTop: '2.5rem' }}>
                <h2 style={{ color: 'var(--accent-purple)', marginBottom: '1.5rem' }}>Estrategia de Optimización Financiera</h2>
                <p className="text-secondary" style={{ marginBottom: '1rem' }}>
                  Víctor posee adeudos diversos (TDC, servicios, tiendas departamentales). Debido a la complejidad de las fechas, se incurre en intereses evitables del 3%. 
                  La estrategia "Coppel Leverage" permite reducir este costo al <strong>1% efectivo</strong>.
                </p>
                <div className="card" style={{ background: 'rgba(255,255,255,0.03)', borderStyle: 'dashed' }}>
                  <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>La Pieza Clave: Préstamo Coppel</h3>
                  <ul className="text-secondary" style={{ paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
                    <li style={{ marginBottom: '0.5rem' }}>Solicitud de préstamo en efectivo por parte de Víctor.</li>
                    <li style={{ marginBottom: '0.5rem' }}>Liquidación total por Alfonso usando TDC dentro de los <strong>primeros 7 días</strong>.</li>
                    <li style={{ marginBottom: '0.5rem' }}>Costo estimado: 3% interés - 2% retorno en dinero electrónico = <strong>1% Neto</strong>.</li>
                    <li><strong className="text-red">Advertencia:</strong> El pago DEBE ser antes del día 7 para evitar cargos diarios y capitalización de intereses.</li>
                  </ul>
                </div>
              </section>

              <section className="doc-section" style={{ marginTop: '2.5rem' }}>
                <h2 style={{ color: 'var(--accent-green)', marginBottom: '1.5rem' }}>Los 3 Acuerdos Maestros</h2>
                <div className="agreement-item" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--accent-green)', paddingLeft: '1.5rem' }}>
                  <h3>Acuerdo 1: Liquidez Operativa</h3>
                  <p className="text-secondary">Alfonso proporcionará el efectivo necesario a Víctor para cubrir sus "Pagos para No Generar Intereses" antes de las fechas límite de sus acreedores.</p>
                </div>
                <div className="agreement-item" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--accent-green)', paddingLeft: '1.5rem' }}>
                  <h3>Acuerdo 2: Gestión de Préstamo</h3>
                  <p className="text-secondary">Alfonso liquidará con su TDC la totalidad del préstamo personal Coppel de Víctor dentro de la ventana de 7 días para asegurar el beneficio de intereses bajos y dinero electrónico.</p>
                </div>
                <div className="agreement-item" style={{ borderLeft: '3px solid var(--accent-green)', paddingLeft: '1.5rem' }}>
                  <h3>Acuerdo 3: Absorción de Intereses</h3>
                  <p className="text-secondary">Los intereses del préstamo Coppel serán <strong>absorbidos por Alfonso</strong>. Se mantendrá un registro para monitoreo de la tasa real, pero no afectarán el sueldo de Víctor.</p>
                </div>
                <div className="agreement-item" style={{ marginTop: '1.5rem', borderLeft: '3px solid var(--accent-green)', paddingLeft: '1.5rem' }}>
                  <h3>Acuerdo 4: Beneficio de Dinero Electrónico</h3>
                  <p className="text-secondary">El dinero electrónico generado por los pagos puntuales será un <strong>beneficio extra para Víctor</strong>, independiente de su salario. Víctor podrá disponer de este recurso para compras en Coppel según su preferencia.</p>
                </div>
                <div className="agreement-item" style={{ marginTop: '1.5rem', borderLeft: '3px solid var(--accent-green)', paddingLeft: '1.5rem' }}>
                  <h3>Acuerdo 5: Registro y Balance Neto</h3>
                  <p className="text-secondary">Todas las aportaciones de capital realizadas tanto por Alfonso como por Víctor serán registradas rigurosamente en el sistema para calcular el <strong>balance neto</strong> en tiempo real, asegurando transparencia total en la deuda interpersonal.</p>
                </div>
              </section>
            </div>
          </div>
        ) : activeModule === 'salaries' ? (
          <div className="app-container animate-fade-in">
            <header>
              <h1>SEMANALIDADES DE VÍCTOR</h1>
            </header>

            <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
              <div className="card" style={{ borderLeft: '4px solid var(--accent-red)' }}>
                <div className="stat-label">Monto Pendiente por Semanalidades</div>
                <div className="stat-value text-red">
                  ${salaries.reduce((acc, curr) => curr.status === 'PENDIENTE' ? acc + (curr.amount || 5000) : acc, 0).toLocaleString()}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  CONCEPTO DE SEMANALIDADES NO PAGADAS A VICTOR
                </p>
              </div>
            </div>

            <div className="card">
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Semana</th>
                      <th>Fecha de Jueves</th>
                      <th>Monto</th>
                      <th>Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaries.map(salary => (
                      <tr key={salary.id}>
                        <td style={{fontWeight: '600'}}>Semana {salary.week_number}</td>
                        <td className="text-secondary">{new Date(salary.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                        <td>${(salary.amount || 5000).toLocaleString()}</td>
                        <td>
                          <select 
                            className="status-select"
                            value={salary.status}
                            onChange={(e) => handleSalaryStatusChange(salary.id, e.target.value)}
                            style={{ 
                              color: salary.status === 'PAGADO' ? '#4ade80' : '#f87171',
                              fontWeight: 'bold'
                            }}
                          >
                            <option value="PENDIENTE">PENDIENTE</option>
                            <option value="PAGADO">PAGADO</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeModule === 'sync' ? (
          <div className="app-container animate-fade-in">
            <header>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UploadCloud size={28} color="var(--accent-blue)" /> 
                SINCRONIZACIÓN BANCARIA INTELIGENTE
              </h1>
            </header>
            
            {!syncData ? (
              <>
              <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--accent-purple)', marginTop: '2rem' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--accent-purple)', marginBottom: '1rem' }}>Configuración de IA (Gemini)</h3>
                <p className="text-secondary" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>Para extraer datos de capturas de pantalla de la app de tu banco, ingresa tu clave de API de Google Gemini.</p>
                <input 
                  type="password" 
                  className="status-select" 
                  placeholder="Pega tu API Key de Gemini aquí..." 
                  style={{ width: '100%', padding: '0.75rem' }} 
                  value={geminiApiKey} 
                  onChange={e => {
                    setGeminiApiKey(e.target.value);
                    localStorage.setItem('geminiApiKey', e.target.value);
                  }} 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div 
                className="card" 
                style={{ 
                  border: '2px dashed var(--accent-blue)', 
                  padding: '3rem 2rem', 
                  textAlign: 'center', 
                  background: 'rgba(59, 130, 246, 0.05)',
                  cursor: 'pointer'
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    setSyncFile(file);
                    try {
                      const result = await parseBankStatement(file);
                      setSyncData(result);
                      if (result.guessedBank) {
                        const matchedCard = cards.find(c => c.name.toUpperCase().includes(result.guessedBank));
                        if (matchedCard) setSyncSelectedCardId(matchedCard.id);
                      }
                    } catch(err) {
                      alert("Error al leer archivo Excel: " + err.message);
                    }
                  }
                }}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                  onChange={async (e) => {
                    if (e.target.files.length > 0) {
                      const file = e.target.files[0];
                      setSyncFile(file);
                      try {
                        const result = await parseBankStatement(file);
                        setSyncData(result);
                        if (result.guessedBank) {
                          const matchedCard = cards.find(c => c.name.toUpperCase().includes(result.guessedBank));
                          if (matchedCard) setSyncSelectedCardId(matchedCard.id);
                        }
                      } catch(err) {
                        alert("Error al leer archivo Excel: " + err.message);
                      }
                    }
                  }}
                />
                <UploadCloud size={64} color="var(--accent-blue)" style={{ margin: '0 auto 1rem', opacity: 0.8 }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Arrastra tu Estado de Cuenta (Excel/CSV)</h3>
                <p className="text-secondary">Análisis heurístico local. Ideal para historial de transacciones.</p>
              </div>

              <div 
                className="card" 
                style={{ 
                  border: '2px dashed var(--accent-purple)', 
                  padding: '3rem 2rem', 
                  textAlign: 'center', 
                  background: 'rgba(168, 85, 247, 0.05)',
                  cursor: isProcessingImage ? 'not-allowed' : 'pointer',
                  opacity: isProcessingImage ? 0.6 : 1
                }}
                onClick={() => !isProcessingImage && imageInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={imageInputRef} 
                  style={{ display: 'none' }} 
                  accept="image/*" 
                  onChange={async (e) => {
                    if (e.target.files.length > 0) {
                      if (!geminiApiKey) return alert('Por favor, configura tu API Key de Gemini primero en la caja de arriba.');
                      const file = e.target.files[0];
                      setSyncFile(file);
                      setIsProcessingImage(true);
                      try {
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                          try {
                            const resultJson = await processBankStatementImage(reader.result, geminiApiKey);
                            setSyncData({ metadata: resultJson, transactions: [] });
                          } catch(err) {
                            alert("Error al procesar imagen: " + err.message);
                            setSyncFile(null);
                          } finally {
                            setIsProcessingImage(false);
                          }
                        };
                        reader.readAsDataURL(file);
                      } catch(err) {
                        alert("Error: " + err.message);
                        setIsProcessingImage(false);
                        setSyncFile(null);
                      }
                    }
                  }}
                />
                <ImagePlus size={64} color="var(--accent-purple)" style={{ margin: '0 auto 1rem', opacity: 0.8 }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                  {isProcessingImage ? 'Procesando Imagen con IA...' : 'Subir Captura de Pantalla'}
                </h3>
                <p className="text-secondary">Usa Inteligencia Artificial para extraer saldos y fechas al instante.</p>
              </div>
              </div>
              </>
            ) : (
              <div className="card animate-fade-in" style={{ marginTop: '2rem' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.2rem' }}>Confirmación de Lectura</h2>
                    <span className="text-secondary" style={{ fontSize: '0.85rem' }}>Archivo: {syncFile?.name}</span>
                  </div>
                  <button className="btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'white' }} onClick={() => { setSyncData(null); setSyncFile(null); }}>
                    Cancelar y subir otro
                  </button>
                </header>

                <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                  <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--accent-blue)' }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--accent-blue)' }}>1. Vinculación de Tarjeta</h3>
                    <div className="form-group">
                      <label className="stat-label">Tarjeta / Banco Identificado</label>
                      <select className="status-select" style={{ width: '100%' }} value={syncSelectedCardId} onChange={e => setSyncSelectedCardId(e.target.value)}>
                        <option value="">-- Selecciona la Tarjeta --</option>
                        {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--accent-green)' }}>
                    <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--accent-green)' }}>2. Datos Extraídos (Editables)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="stat-label">Deuda Actual (Detectada)</label>
                        <input 
                          type="number" 
                          className="status-select"
                          style={{ width: '100%' }}
                          value={syncData.metadata.current_debt || ''} 
                          onChange={(e) => setSyncData({...syncData, metadata: {...syncData.metadata, current_debt: e.target.value}})} 
                        />
                      </div>
                      <div className="form-group">
                        <label className="stat-label">Pago para no generar int.</label>
                        <input 
                          type="number" 
                          className="status-select"
                          style={{ width: '100%' }}
                          value={syncData.metadata.payment_no_interest || ''} 
                          onChange={(e) => setSyncData({...syncData, metadata: {...syncData.metadata, payment_no_interest: e.target.value}})} 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldAlert size={20} color="var(--accent-red)" />
                  Análisis de Transacciones ({syncData.transactions.length} detectadas)
                </h3>
                <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '2rem' }}>
                  <table>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)' }}>
                      <tr>
                        <th>Fecha</th>
                        <th>Concepto</th>
                        <th style={{ textAlign: 'right' }}>Monto</th>
                        <th>Alerta de Seguridad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncData.transactions.map((t, i) => (
                        <tr key={i} style={{ background: t.isSuspicious ? 'rgba(248, 113, 113, 0.1)' : 'transparent' }}>
                          <td className="text-secondary">{t.date}</td>
                          <td>{t.concept}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${t.amount.toLocaleString()}</td>
                          <td>
                            {t.isSuspicious ? (
                              <span style={{ color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
                                <AlertTriangle size={14} /> {t.suspicionReason}
                              </span>
                            ) : <span className="text-secondary" style={{ fontSize: '0.8rem' }}>Normal</span>}
                          </td>
                        </tr>
                      ))}
                      {syncData.transactions.length === 0 && (
                        <tr><td colSpan="4" style={{ textAlign: 'center' }} className="text-secondary">No se detectaron transacciones válidas. Revisa el formato del Excel.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    className="btn" 
                    style={{ background: 'var(--accent-green)' }}
                    disabled={!syncSelectedCardId}
                    onClick={async () => {
                      try {
                        const res = await syncCard(syncSelectedCardId, syncData.metadata);
                        if(res.updated) {
                          alert('Tarjeta sincronizada exitosamente.');
                          setSyncData(null);
                          setSyncFile(null);
                          // Recargar dashboard
                          setCards(await getCards());
                          setDashboard(await getDashboard());
                          setActiveModule('payments'); // Regresar al dashboard principal
                        } else {
                          const error = { error: e.message };
                          alert('Error: ' + error.error);
                        }
                      } catch(e) {
                        alert('Error de conexión.');
                      }
                    }}
                  >
                    Guardar Datos y Sincronizar Ficha
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : activeModule === 'import_export' ? (
          <div className="app-container animate-fade-in">
            <header>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={28} color="var(--accent-purple)" /> 
                IMPORTAR Y EXPORTAR DATOS
              </h1>
            </header>
            
            <div style={{ display: 'flex', gap: '2rem', marginTop: '2rem', flexDirection: 'column' }}>
              <div className="card" style={{ borderLeft: '4px solid var(--accent-blue)' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--accent-blue)' }}>1. Exportar Datos (Hacia tu computadora)</h2>
                <p className="text-secondary" style={{ marginBottom: '1rem' }}>Genera un texto con todas tus tarjetas, operaciones y balances actuales. Cópialo y envíatelo para tener un respaldo.</p>
                <button 
                  className="btn" 
                  style={{ background: 'var(--accent-blue)', marginBottom: '1rem' }}
                  onClick={async () => {
                    const json = await exportAllData();
                    setExportText(json);
                    navigator.clipboard.writeText(json);
                    alert("¡Datos copiados al portapapeles!");
                  }}
                >
                  <FileDown size={20} /> Generar y Copiar JSON
                </button>
                {exportText && (
                  <textarea 
                    className="status-select" 
                    style={{ width: '100%', height: '150px', fontFamily: 'monospace', fontSize: '0.8rem', padding: '1rem' }} 
                    readOnly 
                    value={exportText}
                  />
                )}
              </div>

              <div className="card" style={{ borderLeft: '4px solid var(--accent-red)' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--accent-red)' }}>2. Importar Datos (Desde tu computadora)</h2>
                <p className="text-secondary" style={{ marginBottom: '1rem' }}>Pega aquí el código JSON para inyectarlo en tu celular. <strong style={{ color: 'var(--accent-red)' }}>ADVERTENCIA:</strong> Esto borrará tu base de datos actual y la reemplazará por la que pegues aquí.</p>
                
                <textarea 
                  className="status-select" 
                  style={{ width: '100%', height: '200px', fontFamily: 'monospace', fontSize: '0.8rem', padding: '1rem', marginBottom: '1rem' }} 
                  placeholder="Pega el texto JSON aquí..."
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                
                <button 
                  className="btn" 
                  style={{ background: 'var(--accent-red)' }}
                  disabled={!importText}
                  onClick={async () => {
                    if (window.confirm("¿ESTÁS SEGURO? Todos tus datos actuales en este celular se borrarán y serán reemplazados por el texto que pegaste.")) {
                      try {
                        await importData(importText);
                        alert("¡Base de datos importada correctamente!");
                        setImportText('');
                        fetchData(); // Recargar el estado
                        setActiveModule('payments');
                      } catch (e) {
                        alert("Error: " + e.message);
                      }
                    }
                  }}
                >
                  <AlertTriangle size={20} /> Ejecutar Importación Destructiva
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* MODAL TRANSACCIONES */}
        {isModalOpen && (
          <div className="modal-overlay" style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div className="modal-content card" style={{ width: '450px', position: 'relative' }}>
              <div className="modal-header" style={{marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between'}}>
                <h3>{editingTransactionId ? 'Editar Operación' : 'Registrar Operación'}</h3>
                <button style={{background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem'}} onClick={() => {
                  setIsModalOpen(false);
                  setEditingTransactionId(null);
                }}>×</button>
              </div>
              <form onSubmit={handleTransactionSubmit}>
                <div className="form-group" style={{marginBottom: '1rem'}}>
                  <label className="stat-label" style={{display: 'block'}}>Fecha (Opcional, usa hoy por defecto)</label>
                  <input type="date" className="status-select" style={{width: '100%', padding: '0.75rem', marginBottom: '1rem'}} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                  <label className="stat-label" style={{display: 'block'}}>Concepto</label>
                  <input required type="text" className="status-select" style={{width: '100%', padding: '0.75rem'}} value={formData.concept} onChange={e => setFormData({...formData, concept: e.target.value})} />
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
                  <div className="form-group">
                    <label className="stat-label">Monto Principal Aportación ($)</label>
                    <input required type="number" step="0.01" className="status-select" style={{width: '100%', padding: '0.75rem'}} value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="stat-label">Intereses Pagados (No suma al balance)</label>
                    <input type="number" step="0.01" className="status-select" style={{width: '100%', padding: '0.75rem'}} value={formData.interest_amount} onChange={e => setFormData({...formData, interest_amount: e.target.value})} />
                  </div>
                </div>

                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem'}}>
                  <div className="form-group">
                    <label className="stat-label">Emisor</label>
                    <select className="status-select" style={{width: '100%'}} value={formData.sender_id} onChange={e => setFormData({...formData, sender_id: e.target.value})}>
                      <option value="1">Alfonso</option>
                      <option value="2">Víctor</option>
                      <option value="">Externo</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="stat-label">Receptor</label>
                    <select className="status-select" style={{width: '100%'}} value={formData.receiver_id} onChange={e => setFormData({...formData, receiver_id: e.target.value})}>
                      <option value="1">Alfonso</option>
                      <option value="2">Víctor</option>
                      <option value="">Tercero</option>
                    </select>
                  </div>
                </div>
                <div style={{display: 'flex', gap: '1rem'}}>
                  <button type="submit" className="btn" style={{flex: 1, justifyContent: 'center'}}>Guardar</button>
                  {editingTransactionId && (
                    <button type="button" className="btn" style={{flex: 1, justifyContent: 'center', background: 'var(--accent-red)'}} onClick={async () => {
                      if(window.confirm('¿Eliminar esta operación?')) {
                        await deleteTransaction(editingTransactionId);
                        setIsModalOpen(false);
                        setEditingTransactionId(null);
                        fetchData();
                      }
                    }}>Eliminar</button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL FICHAS */}
        {isCardModalOpen && (
          <div className="modal-overlay" style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div className="modal-content card" style={{ width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="modal-header" style={{marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between'}}>
                <h3>{editingCardId ? 'Editar Ficha' : 'Nueva Ficha'}</h3>
                <button style={{background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.5rem'}} onClick={() => setIsCardModalOpen(false)}>×</button>
              </div>
              <form onSubmit={handleCardSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Renglón 1 */}
                  <div className="form-group">
                    <label className="stat-label">Nombre</label>
                    <input required type="text" className="status-select" style={{width: '100%'}} value={cardData.name} onChange={e => setCardData({...cardData, name: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="stat-label">Tipo</label>
                    <select className="status-select" style={{width: '100%'}} value={cardData.type} onChange={e => setCardData({...cardData, type: e.target.value})}>
                      <option value="TDC">Tarjeta de Crédito</option>
                      <option value="SERVICIOS">Servicio</option>
                      <option value="CREDITO DEPARTAMENTAL">Crédito Dep.</option>
                    </select>
                  </div>

                  {/* Administrada por */}
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="stat-label">Administrada por</label>
                    <select className="status-select" style={{width: '100%'}} value={cardData.managed_by || 'alfonso'} onChange={e => setCardData({...cardData, managed_by: e.target.value})}>
                      <option value="alfonso">Alfonso</option>
                      <option value="victor">Víctor</option>
                    </select>
                  </div>

                  {/* Renglón 2 */}
                  <div className="form-group">
                    <label className="stat-label">Deuda Total ($)</label>
                    <input type="number" step="0.01" className="status-select" style={{width: '100%'}} value={cardData.current_debt} onChange={e => setCardData({...cardData, current_debt: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="stat-label">Límite de Crédito ($)</label>
                    <input type="number" step="0.01" className="status-select" style={{width: '100%'}} value={cardData.credit_limit} onChange={e => setCardData({...cardData, credit_limit: e.target.value})} />
                  </div>

                  {/* Renglón 3 */}
                  <div className="form-group">
                    <label className="stat-label">Fecha de Corte (Día)</label>
                    <input type="number" className="status-select" style={{width: '100%'}} value={cardData.cut_day} onChange={e => setCardData({...cardData, cut_day: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="stat-label">Saldo Disponible ($)</label>
                    <input type="number" step="0.01" className="status-select" style={{width: '100%'}} value={cardData.available_credit} onChange={e => setCardData({...cardData, available_credit: e.target.value})} />
                  </div>

                  {/* Renglón 4 */}
                  <div className="form-group">
                    <label className="stat-label">Pago para no generar int. ($)</label>
                    <input type="number" step="0.01" className="status-select" style={{width: '100%'}} value={cardData.payment_no_interest} onChange={e => setCardData({...cardData, payment_no_interest: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="stat-label">Fecha Límite de Pago (Día)</label>
                    <input required type="number" className="status-select" style={{width: '100%'}} value={cardData.payment_day} onChange={e => setCardData({...cardData, payment_day: e.target.value})} />
                  </div>
                </div>
                <div style={{display: 'flex', gap: '1rem', marginTop: '1.5rem'}}>
                  <button type="submit" className="btn" style={{flex: 1, justifyContent: 'center', background: 'var(--accent-purple)'}}>Guardar Ficha</button>
                  {editingCardId && (
                    <button type="button" className="btn" style={{flex: 1, justifyContent: 'center', background: 'var(--accent-red)'}} onClick={async () => {
                      if(window.confirm('¿Eliminar esta ficha?')) {
                        await deleteCard(editingCardId);
                        setIsCardModalOpen(false);
                        setEditingCardId(null);
                        fetchData();
                      }
                    }}>Eliminar</button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
