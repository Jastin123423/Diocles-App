import React, { useState, useRef } from 'react';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  AlertTriangle,
  FileText,
  RotateCcw,
  Sparkles,
  Cloud,
  Check,
  X,
  Code,
  Store,
  Clock,
  History,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BackupService } from '../../services/backupService';
import { QuickBooksService } from '../../services/quickbooksService';
import { SyncService } from '../../services/syncService';
import { CsvDataService, ImportValidationResult } from '../../services/csvDataService';
import { CsvDataType } from '../../types';
import { formatDateTime } from '../../utils/formatters';

export const AdminDataManagement: React.FC = () => {
  const { currentUser, dbState, addToast } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<'csv' | 'backup' | 'quickbooks' | 'sync'>('csv');

  // CSV Data Center sub-states
  const [csvSection, setCsvSection] = useState<'export' | 'import' | 'templates' | 'history'>('export');
  const [selectedExportType, setSelectedExportType] = useState<CsvDataType>('PRODUCTS');
  const [selectedExportShopId, setSelectedExportShopId] = useState<string>('ALL');

  const [selectedTemplateType, setSelectedTemplateType] = useState<CsvDataType>('PRODUCTS');

  // CSV Import State
  const [importDataType, setImportDataType] = useState<CsvDataType>('PRODUCTS');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // QuickBooks Import state
  const [qbImportText, setQbImportText] = useState('');
  const [qbImportResult, setQbImportResult] = useState<any>(null);
  const [isProcessingQB, setIsProcessingQB] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  const shops = dbState.shops || [];
  const importHistory = dbState.importHistory || [];

  // Handle Export CSV
  const handleExportCsv = () => {
    const { fileName, csvContent } = CsvDataService.exportDataToCsv(selectedExportType, selectedExportShopId);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      type: 'success',
      title: 'CSV Export Generated',
      description: `Downloaded ${fileName} with isolated shop data and IDs.`,
    });
  };

  // Handle Download CSV Template
  const handleDownloadTemplate = (type: CsvDataType) => {
    const { fileName, csvContent } = CsvDataService.getCsvTemplate(type);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      type: 'info',
      title: 'Template Downloaded',
      description: `Downloaded template ${fileName}. Fill in your data and re-upload.`,
    });
  };

  // Handle CSV File Selection & Instant Validation
  const handleCsvFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const text = event.target?.result as string;
        const validation = CsvDataService.validateCsv(importDataType, text, file.name);
        setValidationResult(validation);
      } catch (err: any) {
        addToast({
          type: 'error',
          title: 'CSV Read Error',
          description: err.message || 'Failed to parse file.',
        });
      }
    };
    reader.readAsText(file);
  };

  // Handle Confirm & Commit CSV Import
  const handleCommitImport = async () => {
    if (!validationResult) return;
    setIsImporting(true);

    const res = await CsvDataService.commitImport(validationResult, currentUser);
    setIsImporting(false);

    if (res.success) {
      addToast({
        type: 'success',
        title: 'Import Successful',
        description: `Imported ${res.importedCount} records (${res.createdCount} created, ${res.updatedCount} updated).`,
      });
      setValidationResult(null);
      setUploadedFileName('');
      if (csvFileInputRef.current) csvFileInputRef.current.value = '';
    } else {
      addToast({
        type: 'error',
        title: 'Import Failed',
        description: res.error || 'Failed to commit import records.',
      });
    }
  };

  // Handle Export Backup
  const handleExportBackup = () => {
    BackupService.exportBackupFile(currentUser);
    addToast({
      type: 'success',
      title: 'Backup Generated',
      description: 'Full database snapshot exported to your local disk.',
    });
  };

  // Handle Restore Backup
  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const content = event.target?.result as string;
        const res = BackupService.restoreFromBackupFile(content, currentUser);
        if (res.success) {
          addToast({
            type: 'success',
            title: 'Database Restored',
            description: 'All collections, shops, users, and transactions restored successfully.',
          });
          window.location.reload();
        } else {
          addToast({
            type: 'error',
            title: 'Restore Failed',
            description: res.error || 'Invalid backup file structure.',
          });
        }
      } catch (err: any) {
        addToast({
          type: 'error',
          title: 'File Read Error',
          description: err.message,
        });
      }
    };
    reader.readAsText(file);
  };

  // QuickBooks Import
  const handleLoadQBSample = () => {
    const sample = QuickBooksService.generateSampleIIF();
    setQbImportText(sample);
    setQbImportResult(null);
  };

  const handleExecuteQBImport = () => {
    if (!qbImportText.trim()) return;

    setIsProcessingQB(true);
    const result = QuickBooksService.parseAndImportIIF(qbImportText, currentUser);
    setIsProcessingQB(false);
    setQbImportResult(result);

    if (result.success) {
      addToast({
        type: 'success',
        title: 'QuickBooks Import Complete',
        description: `Imported ${result.itemsImported} products from QuickBooks export.`,
      });
    }
  };

  // Simulate Cloud Sync
  const handleSimulateSync = async () => {
    setIsSyncing(true);
    const result = await SyncService.processSyncQueue(currentUser);
    setIsSyncing(false);

    if (result.success) {
      addToast({
        type: 'success',
        title: 'Sync Successful',
        description: `Synchronized ${result.processedCount} local transactions with cloud endpoint queue.`,
      });
    }
  };

  const queueStats = SyncService.getSyncStats();

  return (
    <div id="admin-data-management-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Data Management & CSV Center</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Export & import CSV datasets per shop, download templates, audit import history, and manage local JSON backups
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Download className="w-4 h-4" />
            <span>Export Full JSON Backup</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveSubTab('csv')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'csv'
              ? 'border-blue-500 text-blue-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>CSV Data Management</span>
        </button>

        <button
          onClick={() => setActiveSubTab('backup')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'backup'
              ? 'border-blue-500 text-blue-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>JSON Database Backup</span>
        </button>

        <button
          onClick={() => setActiveSubTab('quickbooks')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'quickbooks'
              ? 'border-blue-500 text-blue-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Code className="w-4 h-4" />
          <span>QuickBooks .IIF</span>
        </button>

        <button
          onClick={() => setActiveSubTab('sync')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
            activeSubTab === 'sync'
              ? 'border-blue-500 text-blue-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cloud className="w-4 h-4" />
          <span>Sync Queue ({queueStats.pending})</span>
        </button>
      </div>

      {/* SUB-TAB 1: CSV DATA MANAGEMENT */}
      {activeSubTab === 'csv' && (
        <div className="space-y-6">
          {/* Sub Navigation Bar */}
          <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-lg border border-slate-800 w-fit">
            <button
              onClick={() => setCsvSection('export')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                csvSection === 'export' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Export CSV
            </button>
            <button
              onClick={() => setCsvSection('import')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                csvSection === 'import' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Import CSV
            </button>
            <button
              onClick={() => setCsvSection('templates')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                csvSection === 'templates' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CSV Templates
            </button>
            <button
              onClick={() => setCsvSection('history')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                csvSection === 'history' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Import History ({importHistory.length})
            </button>
          </div>

          {/* 1. EXPORT CSV SECTION */}
          {csvSection === 'export' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <div>
                <h3 className="font-bold text-sm text-white">Export Dataset to CSV</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Export operational data for spreadsheet analysis or backup. Unique IDs and shop associations are preserved so exported files can be safely re-imported.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Data Category</label>
                  <select
                    value={selectedExportType}
                    onChange={e => setSelectedExportType(e.target.value as CsvDataType)}
                    className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="PRODUCTS">📦 Products (Catalog & Prices)</option>
                    <option value="INVENTORY">📊 Inventory (Stock Movements Log)</option>
                    <option value="SALES">🛒 Sales Transactions & Receipts</option>
                    <option value="PURCHASES">🚚 Purchases & Stock Invoices</option>
                    <option value="EXPENSES">📉 Operational Expenses</option>
                    <option value="SELLERS">👥 Sellers & Staff Accounts</option>
                    <option value="SHOPS">🏪 Shops & Business Units</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Filter by Shop Unit</label>
                  <select
                    value={selectedExportShopId}
                    onChange={e => setSelectedExportShopId(e.target.value)}
                    className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="ALL">🏢 All Shops (Includes Shop Column)</option>
                    {shops.map(sh => (
                      <option key={sh.id} value={sh.id}>
                        🏪 {sh.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  id="btn-trigger-csv-export"
                  onClick={handleExportCsv}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg shadow-sm transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {selectedExportType} CSV</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. IMPORT CSV SECTION */}
          {csvSection === 'import' && (
            <div className="space-y-5">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                <div>
                  <h3 className="font-bold text-sm text-white">Import CSV Dataset (Offline Parser)</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload a CSV file. The system will validate all rows offline, match shop assignments, prevent duplicate records, and allow you to review before committing.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Target Data Type</label>
                    <select
                      value={importDataType}
                      onChange={e => {
                        setImportDataType(e.target.value as CsvDataType);
                        setValidationResult(null);
                      }}
                      className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
                    >
                      <option value="PRODUCTS">📦 Products</option>
                      <option value="EXPENSES">📉 Expenses</option>
                      <option value="SELLERS">👥 Sellers</option>
                      <option value="SHOPS">🏪 Shops</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select CSV File</label>
                    <input
                      ref={csvFileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleCsvFileSelected}
                      className="w-full bg-slate-950 text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer p-1 rounded-lg border border-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Validation & Preview Result */}
              {validationResult && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5 animate-in fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <h4 className="font-bold text-sm text-white">Import Validation Summary</h4>
                      <p className="text-xs text-slate-400">File: {validationResult.fileName}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {validationResult.errors.length === 0 && validationResult.parsedRecords.length > 0 ? (
                        <button
                          id="btn-commit-csv-import"
                          onClick={handleCommitImport}
                          disabled={isImporting}
                          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg shadow-sm transition disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{isImporting ? 'Importing...' : 'Confirm & Commit Import'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-rose-400 bg-rose-950/40 px-3 py-1.5 rounded-lg border border-rose-900/60 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4" />
                          Fix errors below before importing
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Total Rows</span>
                      <span className="text-sm font-bold text-slate-200">{validationResult.totalRows}</span>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-center">
                      <span className="text-[10px] text-emerald-400 uppercase tracking-wider block mb-1">New To Create</span>
                      <span className="text-sm font-bold text-emerald-400">+{validationResult.willCreateCount}</span>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-center">
                      <span className="text-[10px] text-blue-400 uppercase tracking-wider block mb-1">To Update (Known ID)</span>
                      <span className="text-sm font-bold text-blue-400">⟳ {validationResult.willUpdateCount}</span>
                    </div>

                    <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-center">
                      <span className="text-[10px] text-rose-400 uppercase tracking-wider block mb-1">Blocking Errors</span>
                      <span className="text-sm font-bold text-rose-400">{validationResult.errors.length}</span>
                    </div>
                  </div>

                  {/* Errors List */}
                  {validationResult.errors.length > 0 && (
                    <div className="p-4 bg-rose-950/20 border border-rose-800/40 rounded-lg space-y-2">
                      <h5 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        Validation Errors ({validationResult.errors.length})
                      </h5>
                      <div className="max-h-40 overflow-y-auto space-y-1 text-xs text-rose-200">
                        {validationResult.errors.map((err, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="font-mono text-[10px] bg-rose-900/60 px-1.5 py-0.5 rounded">Row {err.rowNumber}</span>
                            <span>{err.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warnings List */}
                  {validationResult.warnings.length > 0 && (
                    <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-lg space-y-2">
                      <h5 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4" />
                        Notices / Warnings ({validationResult.warnings.length})
                      </h5>
                      <div className="max-h-32 overflow-y-auto space-y-1 text-xs text-amber-200">
                        {validationResult.warnings.map((warn, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="font-mono text-[10px] bg-amber-900/60 px-1.5 py-0.5 rounded">Row {warn.rowNumber}</span>
                            <span>{warn.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parsed Preview Table */}
                  {validationResult.parsedRecords.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-slate-300 mb-2">Valid Records Ready for Import (Preview first 10)</h5>
                      <div className="overflow-x-auto border border-slate-800 rounded-lg">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-950 text-slate-400 text-[11px]">
                            <tr>
                              <th className="p-2.5">Action</th>
                              <th className="p-2.5">Name / Title</th>
                              <th className="p-2.5">Shop</th>
                              <th className="p-2.5">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {validationResult.parsedRecords.slice(0, 10).map((r, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40">
                                <td className="p-2.5">
                                  <span
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                      r.isUpdate
                                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    }`}
                                  >
                                    {r.isUpdate ? 'UPDATE' : 'CREATE'}
                                  </span>
                                </td>
                                <td className="p-2.5 font-medium text-white">{r.name || r.title || r.username}</td>
                                <td className="p-2.5 text-slate-300">
                                  {r.shopName || shops.find(s => s.id === r.shopId)?.name || 'General Company'}
                                </td>
                                <td className="p-2.5 text-slate-400">
                                  {r.sellingPrice !== undefined && `Price: $${r.sellingPrice} | Stock: ${r.currentStock}`}
                                  {r.amount !== undefined && `Amount: $${r.amount} (${r.category})`}
                                  {r.assignedShopIds && `Assigned: ${r.assignedShopIds.length} shops`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. CSV TEMPLATES SECTION */}
          {csvSection === 'templates' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <div>
                <h3 className="font-bold text-sm text-white">Download Standard CSV Templates</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Use these pre-formatted templates to populate your catalog, shop units, expense categories, or staff lists.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-xl mb-2 block">📦</span>
                    <h4 className="font-semibold text-xs text-white">Products Template</h4>
                    <p className="text-[11px] text-slate-400 mt-1">SKU, barcodes, shop IDs, prices, initial stock.</p>
                  </div>
                  <button
                    onClick={() => handleDownloadTemplate('PRODUCTS')}
                    className="mt-4 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-medium transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .CSV</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-xl mb-2 block">🏪</span>
                    <h4 className="font-semibold text-xs text-white">Shops Template</h4>
                    <p className="text-[11px] text-slate-400 mt-1">Shop names, codes, addresses, contact numbers.</p>
                  </div>
                  <button
                    onClick={() => handleDownloadTemplate('SHOPS')}
                    className="mt-4 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-medium transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .CSV</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-xl mb-2 block">📉</span>
                    <h4 className="font-semibold text-xs text-white">Expenses Template</h4>
                    <p className="text-[11px] text-slate-400 mt-1">Shop/Company expenses, amounts, categories.</p>
                  </div>
                  <button
                    onClick={() => handleDownloadTemplate('EXPENSES')}
                    className="mt-4 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-medium transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .CSV</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <span className="text-xl mb-2 block">👥</span>
                    <h4 className="font-semibold text-xs text-white">Sellers Template</h4>
                    <p className="text-[11px] text-slate-400 mt-1">Usernames, names, passwords, assigned shops.</p>
                  </div>
                  <button
                    onClick={() => handleDownloadTemplate('SELLERS')}
                    className="mt-4 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-medium transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .CSV</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. IMPORT HISTORY SECTION */}
          {csvSection === 'history' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div>
                <h3 className="font-bold text-sm text-white">CSV Import Audit History</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Log of all CSV bulk uploads processed in the offline system.
                </p>
              </div>

              {importHistory.length > 0 ? (
                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950 text-slate-400 text-[11px]">
                      <tr>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3">File Name</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Success / Total</th>
                        <th className="p-3">Created / Updated</th>
                        <th className="p-3">Imported By</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {importHistory.map(item => (
                        <tr key={item.id} className="hover:bg-slate-800/40">
                          <td className="p-3 font-mono text-slate-400">{formatDateTime(item.createdAt)}</td>
                          <td className="p-3 font-semibold text-white">{item.fileName}</td>
                          <td className="p-3">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {item.dataType}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-emerald-400 font-bold">{item.successCount}</span>
                            <span className="text-slate-500"> / {item.totalRecords}</span>
                          </td>
                          <td className="p-3 text-slate-300">
                            +{item.createdCount} / ⟳{item.updatedCount}
                          </td>
                          <td className="p-3 text-slate-300">{item.importedByName}</td>
                          <td className="p-3 text-slate-400 text-[11px]">{item.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-950/40 rounded-lg border border-slate-800 text-slate-400 text-xs">
                  No CSV imports recorded yet.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: JSON BACKUP / RESTORE */}
      {activeSubTab === 'backup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3 text-blue-400">
              <Download className="w-5 h-5" />
              <h3 className="font-bold text-sm text-white">Export Full JSON Database Backup</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Export all multi-shop data, products, inventory movements, sales, purchases, expenses, and sellers into a portable .json backup file.
            </p>
            <button
              onClick={handleExportBackup}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition"
            >
              <Download className="w-4 h-4" />
              <span>Download .json Backup</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3 text-emerald-400">
              <Upload className="w-5 h-5" />
              <h3 className="font-bold text-sm text-white">Restore Database Snapshot</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Restore the entire local database from a previously exported Diocres backup file.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleRestoreFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition"
            >
              <Upload className="w-4 h-4" />
              <span>Select .json Backup File</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: QUICKBOOKS .IIF */}
      {activeSubTab === 'quickbooks' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-white">QuickBooks IIF Product Importer</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Paste raw QuickBooks Item List (.IIF) text to import inventory products
              </p>
            </div>
            <button
              onClick={handleLoadQBSample}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
            >
              Load Sample IIF Data
            </button>
          </div>

          <textarea
            rows={8}
            value={qbImportText}
            onChange={e => setQbImportText(e.target.value)}
            placeholder="Paste raw QuickBooks .IIF export text here..."
            className="w-full bg-slate-950 font-mono text-xs text-slate-200 p-3 rounded-xl border border-slate-800 focus:outline-none focus:border-blue-500"
          />

          <button
            onClick={handleExecuteQBImport}
            disabled={isProcessingQB || !qbImportText.trim()}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow transition disabled:opacity-50"
          >
            {isProcessingQB ? 'Processing IIF...' : 'Import Products from IIF'}
          </button>

          {qbImportResult && (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
              <span className="font-bold text-emerald-400">Result:</span> Imported {qbImportResult.itemsImported} products.
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 4: SYNC QUEUE */}
      {activeSubTab === 'sync' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-white">Offline Synchronization Queue</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Local transactions waiting for cloud gateway synchronization
              </p>
            </div>
            <button
              onClick={handleSimulateSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Simulate Cloud Sync</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block mb-0.5">Pending Records</span>
              <span className="text-sm font-bold text-amber-400">{queueStats.pending}</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block mb-0.5">Synced Records</span>
              <span className="text-sm font-bold text-emerald-400">{queueStats.synced}</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 block mb-0.5">Total Queue Logs</span>
              <span className="text-sm font-bold text-slate-200">{queueStats.total}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
