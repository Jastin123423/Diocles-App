import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { DebtService } from '../../services/debtService';
import { DebtRecord, DebtType, DebtStatus } from '../../types';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import {
  DollarSign,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Phone,
  Edit2,
  Trash2,
  Filter,
  FileText,
  User,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Sparkles,
  Info,
  Archive,
} from 'lucide-react';

export const DebtManagement: React.FC = () => {
  const { currentUser, dbState, addToast } = useApp();
  const settings = dbState.settings;

  // Active type filter: 'ALL' | 'WE_DEMAND' | 'THEY_DEMAND'
  const [activeTypeTab, setActiveTypeTab] = useState<'ALL' | DebtType>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtRecord | null>(null);
  const [payingDebt, setPayingDebt] = useState<DebtRecord | null>(null);
  const [deletingDebt, setDeletingDebt] = useState<DebtRecord | null>(null);

  // Form State
  const [formType, setFormType] = useState<DebtType>('WE_DEMAND');
  const [formName, setFormName] = useState('');
  const [formProduct, setFormProduct] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Payment note form state
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  // Compute live debts with statuses
  const debts = useMemo(() => {
    return DebtService.getAllDebts();
  }, [dbState.debts]);

  // Compute summary metrics
  const summary = useMemo(() => {
    return DebtService.getSummary();
  }, [dbState.debts]);

  // Filtered debts
  const filteredDebts = useMemo(() => {
    return debts.filter(d => {
      // Type filter
      if (activeTypeTab !== 'ALL' && d.type !== activeTypeTab) return false;

      // Status filter
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;

      // Date range filter (on dueDate or createdAt)
      if (startDate) {
        const compareDate = (d.dueDate || d.createdAt).slice(0, 10);
        if (compareDate < startDate) return false;
      }
      if (endDate) {
        const compareDate = (d.dueDate || d.createdAt).slice(0, 10);
        if (compareDate > endDate) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = d.debtorName.toLowerCase().includes(q);
        const prodMatch = (d.productDescription || '').toLowerCase().includes(q);
        const contactMatch = (d.contact || '').toLowerCase().includes(q);
        const notesMatch = (d.notes || '').toLowerCase().includes(q);
        if (!nameMatch && !prodMatch && !contactMatch && !notesMatch) return false;
      }

      return true;
    });
  }, [debts, activeTypeTab, statusFilter, startDate, endDate, searchQuery]);

  // Open Create Modal
  const openCreateModal = (type: DebtType = 'WE_DEMAND') => {
    setEditingDebt(null);
    setFormType(type);
    setFormName('');
    setFormProduct('');
    setFormAmount('');
    setFormDueDate('');
    setFormContact('');
    setFormNotes('');
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (debt: DebtRecord) => {
    setEditingDebt(debt);
    setFormType(debt.type);
    setFormName(debt.debtorName);
    setFormProduct(debt.productDescription || '');
    setFormAmount(debt.amount.toString());
    setFormDueDate(debt.dueDate ? debt.dueDate.slice(0, 10) : '');
    setFormContact(debt.contact || '');
    setFormNotes(debt.notes || '');
    setIsCreateModalOpen(true);
  };

  // Handle Form Submit
  const handleSaveDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!formName.trim()) {
      addToast({ type: 'error', title: 'Tafadhali weka jina / Name is required' });
      return;
    }

    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      addToast({ type: 'error', title: 'Weka kiasi sahihi / Enter a valid amount' });
      return;
    }

    if (editingDebt) {
      // Update
      DebtService.updateDebt(editingDebt.id, {
        type: formType,
        debtorName: formName.trim(),
        productDescription: formProduct.trim() || undefined,
        amount: amt,
        dueDate: formDueDate ? formDueDate : undefined,
        contact: formContact.trim() || undefined,
        notes: formNotes.trim() || undefined,
        status: editingDebt.status === 'PAID' ? 'PAID' : DebtService.calculateStatus({
          ...editingDebt,
          dueDate: formDueDate,
        }),
      });

      addToast({
        type: 'success',
        title: 'Deni Limesasishwa / Debt Updated',
        description: `Rekodi ya ${formName} imesasishwa kwa mafanikio.`,
      });
    } else {
      // Create new
      DebtService.createDebt(
        {
          type: formType,
          debtorName: formName.trim(),
          productDescription: formProduct.trim() || undefined,
          amount: amt,
          dueDate: formDueDate ? formDueDate : undefined,
          contact: formContact.trim() || undefined,
          notes: formNotes.trim() || undefined,
        },
        currentUser
      );

      addToast({
        type: 'success',
        title: formType === 'WE_DEMAND' ? 'Deni la Mteja Limehifadhiwa' : 'Deni la Kampuni Limehifadhiwa',
        description: `Rekodi ya ${formName} (TSh ${amt.toLocaleString()}) imehifadhiwa.`,
      });
    }

    setIsCreateModalOpen(false);
    setEditingDebt(null);
  };

  // Handle Mark as Paid
  const handleConfirmPayment = () => {
    if (!payingDebt || !currentUser) return;

    DebtService.markAsPaid(payingDebt.id, currentUser, paymentNote, new Date().toISOString());

    addToast({
      type: 'success',
      title: 'Malipo Yamekamilika / Marked as Paid',
      description: `Deni la ${payingDebt.debtorName} (TSh ${payingDebt.amount.toLocaleString()}) limewekwa kama LIMELIPWA.`,
    });

    setPayingDebt(null);
    setPaymentNote('');
  };

  // Handle Delete
  const handleConfirmDelete = () => {
    if (!deletingDebt) return;

    DebtService.deleteDebt(deletingDebt.id);

    addToast({
      type: 'info',
      title: 'Deni Limefutwa',
      description: `Rekodi ya ${deletingDebt.debtorName} imefutwa.`,
    });

    setDeletingDebt(null);
  };

  return (
    <div id="debt-management-page" className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                Usimamizi wa Madeni
                <span className="text-xs font-normal text-slate-400">/ Debt Management</span>
              </h1>
              <p className="text-xs text-slate-400">
                Daftari huru la kurekodi wanaotudai (Tunadai) na tunaowadai (Wanatudai) pamoja na vikumbusho
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreateModal('WE_DEMAND')}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tunadai (Wateja)</span>
          </button>
          <button
            onClick={() => openCreateModal('THEY_DEMAND')}
            className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ Wanatudai (Watoa Huduma)</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* SUMMARY CARDS / DEBT DASHBOARD */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 1. TUNADAI (WE DEMAND) */}
          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <ArrowDownLeft className="w-4 h-4" />
                <span>Tunadai / We Demand</span>
                <span className="text-[11px] font-normal text-slate-400">(Watu/Wateja wanaotudai pesa)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold">
                {summary.weDemand.totalCount} Rekodi
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400 font-medium uppercase">Kiasi Tunachodai</div>
                <div className="text-sm sm:text-base font-bold font-mono text-emerald-400 mt-0.5">
                  {formatCurrency(summary.weDemand.totalOutstanding, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Haijalipwa bado</div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-amber-400 font-medium uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Leo / Due Today
                </div>
                <div className="text-sm sm:text-base font-bold font-mono text-amber-300 mt-0.5">
                  {formatCurrency(summary.weDemand.dueTodayAmount, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{summary.weDemand.dueTodayCount} wateja</div>
              </div>

              <div className="bg-slate-950/80 border border-rose-900/40 rounded-lg p-2.5 bg-rose-950/10">
                <div className="text-[10px] text-rose-400 font-medium uppercase flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Zimechelewa
                </div>
                <div className="text-sm sm:text-base font-bold font-mono text-rose-400 mt-0.5">
                  {formatCurrency(summary.weDemand.overdueAmount, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-rose-300/70 mt-0.5">{summary.weDemand.overdueCount} zimepitiliza</div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400 font-medium uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Zimelipwa
                </div>
                <div className="text-sm sm:text-base font-bold font-mono text-slate-300 mt-0.5">
                  {formatCurrency(summary.weDemand.paidAmount, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{summary.weDemand.paidCount} zimekamilika</div>
              </div>
            </div>
          </div>

          {/* 2. WANATUDAI (THEY DEMAND US) */}
          <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <ArrowUpRight className="w-4 h-4" />
                <span>Wanatudai / They Demand Us</span>
                <span className="text-[11px] font-normal text-slate-400">(Watoa huduma tunaowadai pesa)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-bold">
                {summary.theyDemand.totalCount} Rekodi
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400 font-medium uppercase">Kiasi Wanachotudai</div>
                <div className="text-sm sm:text-base font-bold font-mono text-amber-400 mt-0.5">
                  {formatCurrency(summary.theyDemand.totalOutstanding, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Madeni yetu</div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-amber-400 font-medium uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Kulipa Leo
                </div>
                <div className="text-sm sm:text-base font-bold font-mono text-amber-300 mt-0.5">
                  {formatCurrency(summary.theyDemand.dueTodayAmount, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{summary.theyDemand.dueTodayCount} watoa huduma</div>
              </div>

              <div className="bg-slate-950/80 border border-rose-900/40 rounded-lg p-2.5 bg-rose-950/10">
                <div className="text-[10px] text-rose-400 font-medium uppercase flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Zimechelewa
                </div>
                <div className="text-sm sm:text-base font-bold font-mono text-rose-400 mt-0.5">
                  {formatCurrency(summary.theyDemand.overdueAmount, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-rose-300/70 mt-0.5">{summary.theyDemand.overdueCount} zimepitiliza</div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400 font-medium uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Tumeshalipa
                </div>
                <div className="text-sm sm:text-base font-bold font-mono text-slate-300 mt-0.5">
                  {formatCurrency(summary.theyDemand.paidAmount, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{summary.theyDemand.paidCount} zimekamilika</div>
              </div>
            </div>
          </div>
        </div>

        {/* CONTROLS & FILTER BAR */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Main Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTypeTab('ALL')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  activeTypeTab === 'ALL'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Madeni Yote ({debts.length})
              </button>
              <button
                onClick={() => setActiveTypeTab('WE_DEMAND')}
                className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition ${
                  activeTypeTab === 'WE_DEMAND'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-400 hover:bg-slate-900'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Tunadai ({summary.weDemand.totalCount})
              </button>
              <button
                onClick={() => setActiveTypeTab('THEY_DEMAND')}
                className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition ${
                  activeTypeTab === 'THEY_DEMAND'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-400 hover:bg-slate-900'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Wanatudai ({summary.theyDemand.totalCount})
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Hali:
              </span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-950 text-xs text-white px-2.5 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Hali Zote (All Statuses)</option>
                <option value="PENDING">Inasubiri (Pending)</option>
                <option value="DUE_TODAY">Inatakiwa Leo (Due Today)</option>
                <option value="OVERDUE">Imechelewa (Overdue)</option>
                <option value="PAID">Imelipwa (Paid)</option>
                <option value="CANCELLED">Imeghairiwa (Cancelled)</option>
              </select>
            </div>
          </div>

          {/* Search and Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tafuta jina, bidhaa, simu, maelezo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white pl-9 pr-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Kuanzia:</span>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white px-2.5 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Mpaka:</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white px-2.5 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
              />
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                  title="Ondoa tarehe"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* DEBTS TABLE */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Aina / Type</th>
                  <th className="py-3 px-4">Jina / Name</th>
                  <th className="py-3 px-4">Bidhaa/Maelezo</th>
                  <th className="py-3 px-4">Kiasi (Amount)</th>
                  <th className="py-3 px-4">Tarehe ya Kulipa</th>
                  <th className="py-3 px-4">Mawasiliano</th>
                  <th className="py-3 px-4">Hali (Status)</th>
                  <th className="py-3 px-4 text-right">Vitendo (Actions)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDebts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <div className="font-medium text-slate-400">Hakuna rekodi za madeni zilizopatikana</div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        Bonyeza "+ Tunadai" au "+ Wanatudai" kurekodi deni jipya.
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDebts.map(debt => {
                    const isPaid = debt.status === 'PAID';
                    const isOverdue = debt.status === 'OVERDUE';
                    const isDueToday = debt.status === 'DUE_TODAY';
                    const overdueDays = isOverdue ? DebtService.getOverdueDays(debt.dueDate) : 0;

                    return (
                      <tr
                        key={debt.id}
                        className={`hover:bg-slate-850/60 transition ${
                          isOverdue && !isPaid ? 'bg-rose-950/10' : ''
                        }`}
                      >
                        {/* Type */}
                        <td className="py-3.5 px-4">
                          {debt.type === 'WE_DEMAND' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                              <ArrowDownLeft className="w-3 h-3" /> Tunadai
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                              <ArrowUpRight className="w-3 h-3" /> Wanatudai
                            </span>
                          )}
                        </td>

                        {/* Debtor Name */}
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <div className="flex items-center gap-1.5">
                            <span>{debt.debtorName}</span>
                          </div>
                          {debt.notes && (
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5 max-w-xs truncate">
                              {debt.notes}
                            </div>
                          )}
                        </td>

                        {/* Product / Description (manually typed text) */}
                        <td className="py-3.5 px-4 text-slate-300">
                          <div className="font-medium">{debt.productDescription || '—'}</div>
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 font-mono font-bold text-sm">
                          <span
                            className={
                              debt.type === 'WE_DEMAND' ? 'text-emerald-400' : 'text-amber-400'
                            }
                          >
                            {formatCurrency(debt.amount, settings.currencySymbol)}
                          </span>
                        </td>

                        {/* Due Date */}
                        <td className="py-3.5 px-4">
                          {debt.dueDate ? (
                            <div>
                              <div className="font-mono text-slate-300">
                                {formatDate(debt.dueDate)}
                              </div>
                              {isOverdue && !isPaid && (
                                <div className="text-[10px] font-semibold text-rose-400 flex items-center gap-1 mt-0.5">
                                  <AlertTriangle className="w-3 h-3" /> Zimepita siku {overdueDays}
                                </div>
                              )}
                              {isDueToday && !isPaid && (
                                <div className="text-[10px] font-semibold text-amber-400 flex items-center gap-1 mt-0.5">
                                  <Clock className="w-3 h-3" /> Inatakiwa leo
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500">Haina tarehe</span>
                          )}
                        </td>

                        {/* Contact */}
                        <td className="py-3.5 px-4 text-slate-400">
                          {debt.contact ? (
                            <div className="flex items-center gap-1 font-mono text-slate-300">
                              <Phone className="w-3 h-3 text-slate-500" />
                              <span>{debt.contact}</span>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4">
                          {isPaid ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800 text-[10px] font-semibold">
                                <CheckCircle2 className="w-3 h-3" /> Imelipwa
                              </span>
                              {debt.paidAt && (
                                <div className="text-[9px] text-slate-400 font-mono">
                                  {debt.paidAt.slice(0, 10)}
                                </div>
                              )}
                            </div>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[10px] font-semibold">
                              <AlertTriangle className="w-3 h-3" /> Imechelewa
                            </span>
                          ) : isDueToday ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] font-semibold">
                              <Clock className="w-3 h-3" /> Inatakiwa Leo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold">
                              Inasubiri (Pending)
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isPaid && (
                              <button
                                onClick={() => {
                                  setPayingDebt(debt);
                                  setPaymentNote('');
                                  setPaymentDate(new Date().toISOString().slice(0, 10));
                                }}
                                className="px-2.5 py-1 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium text-[11px] flex items-center gap-1 shadow-xs transition"
                                title="Weka kama Imelipwa"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Lipa</span>
                              </button>
                            )}

                            <button
                              onClick={() => openEditModal(debt)}
                              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                              title="Hariri rekodi"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setDeletingDebt(debt)}
                              className="p-1.5 rounded hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 transition"
                              title="Futa rekodi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CREATE / EDIT DEBT MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>
                  {editingDebt
                    ? 'Hariri Deni / Edit Debt Record'
                    : formType === 'WE_DEMAND'
                    ? 'Rekodi Deni Jipya la Mteja (Tunadai)'
                    : 'Rekodi Deni Jipya la Kampuni (Wanatudai)'}
                </span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDebt} className="p-5 space-y-4">
              {/* Type Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Aina ya Deni / Debt Type <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType('WE_DEMAND')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      formType === 'WE_DEMAND'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-xs'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                    <span>Tunadai (Mteja Anatupa)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormType('THEY_DEMAND')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                      formType === 'THEY_DEMAND'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-300 shadow-xs'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-amber-400" />
                    <span>Wanatudai (Tunalipa Mtoa Huduma)</span>
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Jina la Mteja / Mtoa Huduma (Name) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={formType === 'WE_DEMAND' ? 'Mfano: Juma, Mama Amina, Musa...' : 'Mfano: ABC Supplier, Twiga Cement...'}
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Product / Description (MANUALLY TYPED PLAIN TEXT) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Bidhaa / Maelezo ya Deni (Product/Description)
                  </label>
                  <span className="text-[10px] text-slate-500">Andika kwa mkono (Plain text)</span>
                </div>
                <input
                  type="text"
                  placeholder="Mfano: Daftari, Simenti mifuko 10, Sare ya shule..."
                  value={formProduct}
                  onChange={e => setFormProduct(e.target.value)}
                  className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  * Hii ni maandishi huru ya kukumbusha — haiingiliani wala kubadilisha bidhaa au akiba (stock) za duka.
                </p>
              </div>

              {/* Amount & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Kiasi cha Pesa / Amount (TSh) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      placeholder="1000"
                      value={formAmount}
                      onChange={e => setFormAmount(e.target.value)}
                      className="w-full bg-slate-950 text-xs font-mono font-bold text-emerald-400 px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Siku ya Kulipa (Day to Pay)
                  </label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={e => setFormDueDate(e.target.value)}
                    className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Contact */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Namba ya Simu / Mawasiliano (Contact)
                </label>
                <input
                  type="text"
                  placeholder="Mfano: 0712345678"
                  value={formContact}
                  onChange={e => setFormContact(e.target.value)}
                  className="w-full bg-slate-950 text-xs font-mono text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Maelezo ya Ziada / Notes (Hiari)
                </label>
                <textarea
                  rows={2}
                  placeholder="Maelezo mengine yoyote kuhusu deni hili..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Ghairi (Cancel)
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-lg text-white text-xs font-semibold shadow-sm transition ${
                    formType === 'WE_DEMAND'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  {editingDebt ? 'Hifadhi Mabadiliko' : 'Hifadhi Deni Hili'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MARK AS PAID MODAL */}
      {payingDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>Thibitisha Malipo / Mark as Paid</span>
              </div>
              <button
                onClick={() => setPayingDebt(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Jina:</span>
                  <span className="font-bold text-white">{payingDebt.debtorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Bidhaa/Maelezo:</span>
                  <span className="text-slate-200">{payingDebt.productDescription || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Kiasi:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {formatCurrency(payingDebt.amount, settings.currencySymbol)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tarehe ya Malipo (Payment Date)
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Maelezo ya Malipo / Payment Note (Hiari)
                </label>
                <input
                  type="text"
                  placeholder="Mfano: Amelipa taslimu dukani, M-Pesa..."
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-emerald-950/30 border border-emerald-500/20 p-3 rounded text-[11px] text-emerald-300/90 flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Kuweka deni hili kama <strong>Limelipwa</strong> kutasimamisha vikumbusho vya deni lililochelewa. Rekodi na historia itabaki salama kwenye daftari.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPayingDebt(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Ghairi
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Ndio, Weka Limelipwa</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3 text-rose-400">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="font-bold text-sm text-white">
                  Futa Rekodi ya Deni la "{deletingDebt.debtorName}"?
                </h3>
              </div>

              <p className="text-xs text-slate-300 mb-4">
                Una uhakika unataka kufuta rekodi hii ya deni la TSh {deletingDebt.amount.toLocaleString()} ({deletingDebt.productDescription || 'bidhaa'})?
              </p>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeletingDebt(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Ghairi
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition"
                >
                  Futa Deni
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
