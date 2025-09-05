import React from 'react';
import { TableIcon, DownloadIcon } from './Icons';
import { exportToCsv } from '../utils/csvUtils';

interface DataTableProps {
  data: Record<string, any>[] | null;
  isLoading: boolean;
  orderedHeaders?: string[];
  placeholder?: string;
}

const DataTable: React.FC<DataTableProps> = ({ data, isLoading, orderedHeaders, placeholder }) => {
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
      <div className="flex justify-end mb-4">
        <button
          onClick={() => exportToCsv(data, 'document_extract.csv')}
          className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
        >
          <DownloadIcon className="w-5 h-5" />
          Export to CSV
        </button>
      </div>
      <div className="overflow-auto relative rounded-lg border border-gray-200 dark:border-gray-700 flex-grow">
        <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0">
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col" className="py-3 px-6 whitespace-nowrap">
                  {header.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                {headers.map((header, colIndex) => (
                  <td key={`${rowIndex}-${colIndex}`} className="py-4 px-6 whitespace-nowrap">
                    {typeof row[header] === 'object' && row[header] !== null ? JSON.stringify(row[header]) : String(row[header] ?? 'N/A')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;