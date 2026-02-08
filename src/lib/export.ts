import * as XLSX from 'xlsx';
import { Procurement, Category } from '@/types/procurement';

interface ExportData {
  'PR Number': string;
  'Description': string;
  'Category': string;
  'Status': string;
  'Date Added': string;
}

export const exportToExcel = (
  procurements: Procurement[],
  categories: Category[],
  filename: string = 'procurement-records'
): void => {
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  
  const data: ExportData[] = procurements.map(p => ({
    'PR Number': p.prNumber,
    'Description': p.description,
    'Category': categoryMap.get(p.categoryId) || 'Unknown',
    'Status': p.status.charAt(0).toUpperCase() + p.status.slice(1),
    'Date Added': new Date(p.dateAdded).toLocaleDateString(),
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Procurements');
  
  // Auto-size columns
  const colWidths = Object.keys(data[0] || {}).map(key => ({
    wch: Math.max(key.length, ...data.map(row => String(row[key as keyof ExportData]).length)) + 2
  }));
  worksheet['!cols'] = colWidths;

  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

export const exportToCSV = (
  procurements: Procurement[],
  categories: Category[],
  filename: string = 'procurement-records'
): void => {
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  
  const headers = ['PR Number', 'Description', 'Category', 'Status', 'Date Added'];
  const rows = procurements.map(p => [
    p.prNumber,
    `"${p.description.replace(/"/g, '""')}"`,
    categoryMap.get(p.categoryId) || 'Unknown',
    p.status.charAt(0).toUpperCase() + p.status.slice(1),
    new Date(p.dateAdded).toLocaleDateString(),
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};
