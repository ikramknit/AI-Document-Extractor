import React, { useState, useMemo } from 'react';
import { TableIcon, DownloadIcon, MagnifyingGlassIcon, ChevronUpIcon, ChevronDownIcon } from './Icons';
import { exportToCsv } from '../utils/csvUtils';

interface DataTableProps {
  data: Record<string, any>[] | null;
  isLoading: boolean;
  orderedHeaders?: string[];
  placeholder?: string;
}

const DataTable: React.FC<DataTableProps> = ({ data, isLoading, orderedHeaders, placeholder }) => {
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'ascending' | 'descending' }>({ key: null, direction: 'ascending' });
  const [filterText, setFilterText] = useState('');

  const processedData = useMemo(() => {
    if (!data) return [];

    let processableData = [...data];

    // Filtering logic
    if (filterText) {
      const lowercasedFilter = filterText.toLowerCase();
      processableData = processableData.filter(row => 
        Object.values(row).some(value => 
          String(value ?? '').toLowerCase().includes(lowercasedFilter)
        )
      );
    }

    // Sorting logic
    if (sortConfig.key) {
      processableData.sort((a, b) => {
        const key = sortConfig.key!;
        const aVal = a[key];
        const bVal = b[key];
        const directionMultiplier = sortConfig.direction === 'ascending' ? 1 : -1;

        // Push null/undefined to the bottom
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        // Check for numeric sort
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return (aVal - bVal) * directionMultiplier;
        }

        // Default to locale-aware string comparison
        return String(aVal).localeCompare(String(bVal)) * directionMultiplier;
      });
    }

    return processableData;
  }, [data, filterText, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIcon = (key: string) => {
      if (sortConfig.key !== key) return null;
      if (sortConfig.direction === 'ascending') return <ChevronUpIcon className="w-3 h-3 ml-1 inline-block" />;
      return <ChevronDownIcon className="w-3 h-3 ml-1 inline-block" />;
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse pt-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-md w-full"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-md w-full"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-md w-full"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-md w-full"></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 h-full py-10">
        <TableIcon className="w-16 h-16 mb-4 text-gray-400 dark:text-gray-500" />
        <h3 className="text-xl font-semibold">No Data Yet</h3>
        <p className="mt-2 max-w-sm">{placeholder || "Your extracted information will appear here."}</p>
      </div>
    );
  }

  const headers = orderedHeaders && orderedHeaders.length > 0 ? orderedHeaders : Object.keys(data[0] || {});

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
        <div className="relative w-full md:w-auto md:flex-grow md:max-w-xs">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
          </span>
          <input
            type="text"
            placeholder="Search table..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Search table data"
          />
        </div>
        <button
          onClick={() => exportToCsv(processedData, 'document_extract.csv', headers)}
          className="w-full md:w-auto flex items-center justify-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          disabled={!processedData || processedData.length === 0}
        >
          <DownloadIcon className="w-5 h-5" />
          Export to CSV
        </button>
      </div>
      <div className="overflow-auto relative rounded-lg border border-gray-200 dark:border-gray-700 flex-grow">
        <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10">
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col" className="py-3 px-6 whitespace-nowrap">
                  <button onClick={() => requestSort(header)} className="flex items-center gap-1 font-bold uppercase hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
                    {header.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                    <span className="opacity-70">{getSortIcon(header)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processedData.length > 0 ? (
              processedData.map((row, rowIndex) => (
                <tr key={rowIndex} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                  {headers.map((header, colIndex) => (
                    <td key={`${rowIndex}-${colIndex}`} className="py-4 px-6 whitespace-nowrap">
                      {typeof row[header] === 'object' && row[header] !== null ? JSON.stringify(row[header]) : String(row[header] ?? 'N/A')}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
                <tr>
                    <td colSpan={headers.length} className="text-center py-10">
                        <div className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                            <MagnifyingGlassIcon className="w-12 h-12 mb-4 text-gray-400 dark:text-gray-500" />
                            <h3 className="text-lg font-semibold">No Results Found</h3>
                            <p className="mt-1">Try adjusting your search query.</p>
                        </div>
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;