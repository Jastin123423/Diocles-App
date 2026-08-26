import React, { useState } from 'react';
import {
  CreditCard,
  Plus,
  Calendar,
  DollarSign,
  Search,
  PieChart,
  X,
  AlertCircle,
  TrendingDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ExpenseService } from '../../services/expenseService';
import { ExpenseCategory, PaymentMethod } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { formatPriceInput, parsePriceInput } from '../../utils/priceInput';

const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'RENT', label: 'Store Rent & Lease' },
  { id: 'ELECTRICITY', label: 'Electricity & Utilities' },
  { id: 'SALARIES', label: 'Staff Salaries & Payroll' },
  { id: 'TRANSPORT', label: 'Transport & Logistics' },
  { id: 'INTERNET', label: 'Internet & Communications' },
  { id: 'MAINTENANCE', label: 'Maintenance & Repairs' },
  { id: 'MARKETING', label: 'Marketing & Advertising' },
  { id: 'SUPPLIES', label: 'Store Supplies & Consumables' },
  { id: 'OTHER', label: 'General / Miscellaneous' },
];

export const AdminExpenses: React.FC = () => {
  const { currentUser, dbState, addToast } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('ELECTRICITY');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  const settings = dbState.settings;
  const expenses = ExpenseService.getExpenses(
    {
      category: categoryFilter === 'ALL' ? undefined : (categoryFilter as ExpenseCategory),
      search: searchQuery,
    },
    currentUser
  );

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  const openAddModal = () => {
    setTitle('');
    setCategory('ELECTRICITY');
    setAmount('');
    setPaymentMethod('CASH');
    setReference('');
    setNotes('');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim()) {
      setFormError('Expense description title is required.');
      return;
    }

    // Parse formatted amount string back to number
    const amt = parsePriceInput(amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Please enter a valid expense amount.');
      return;
    }

    const res = ExpenseService.createExpense(
      {
        title: title.trim(),
        category,
        amount: amt,
        paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      currentUser
    );

    if (res.success) {
      addToast({
        type: 'success',
        title: 'Expense Recorded',
        description: `Expense of ${formatCurrency(amt, settings.currencySymbol)} logged under ${category}.`,
      });
      setIsModalOpen(false);
    } else {
      setFormError(res.error || 'Failed to record expense.');
    }
  };

  return (
    <div id="admin-expenses-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Operating Expenses</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Log overhead operating costs, utility bills, salaries, and maintenance for P&L tracking
          </p>
        </div>

        <button
          id="record-expense-btn"
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg transition"
        >
          <Plus className="w-4 h-4" />
          <span>Record Expense</span>
        </button>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Recorded Spend</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-300 font-mono">
            {formatCurrency(totalSpent, settings.currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{expenses.length} expense transactions</p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Top Spend Category</span>
            <PieChart className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-white truncate">
            {EXPENSE_CATEGORIES[0]?.label}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Automatic financial reporting included</p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Data Protection</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-amber-300">Protected From Sellers</div>
          <p className="text-[11px] text-slate-400 mt-1">Sellers cannot view overhead expenses</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search expenses, reference #, notes..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Categories</option>
            {EXPENSE_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Expense Title</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Payment Method</th>
                <th className="py-3 px-4 font-semibold">Reference</th>
                <th className="py-3 px-4 font-semibold">Recorded By</th>
                <th className="py-3 px-4 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No expense records match your filter.</p>
                  </td>
                </tr>
              ) : (
                expenses.map(expense => (
                  <tr key={expense.id} className="hover:bg-slate-850/60 transition">
                    <td className="py-3.5 px-4 text-slate-400 font-mono">
                      {formatDateTime(expense.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">{expense.title}</td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-medium border border-slate-700/60">
                        {expense.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase font-medium">
                        {expense.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {expense.reference || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">{expense.createdByName}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-400 text-sm">
                      {formatCurrency(expense.amount, settings.currencySymbol)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Record Expense */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Record Operating Expense</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveExpense} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Expense Description *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Electricity Bill - July 2026"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {EXPENSE_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Amount Spent *</label>
                  <input
                    type="text"
                    required
                    value={amount}
                    onChange={e => setAmount(formatPriceInput(e.target.value))}
                    placeholder="0"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank Transfer / Check</option>
                    <option value="CARD">Debit / Credit Card</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Receipt / Invoice #</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="e.g. UTL-9912"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Additional context or account reference..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow transition"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
