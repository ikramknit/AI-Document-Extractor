import React, { useState, useEffect, useRef } from 'react';
import { DragHandleIcon, TrashIcon } from './Icons';

interface HeaderConfigurationProps {
  suggestedHeaders: string[];
  onConfirm: (orderedHeaders: string[]) => void;
  onCancel: () => void;
}

const HeaderConfiguration: React.FC<HeaderConfigurationProps> = ({ suggestedHeaders, onConfirm, onCancel }) => {
    const [selectedHeaders, setSelectedHeaders] = useState<Record<string, boolean>>({});
    const [orderedHeaders, setOrderedHeaders] = useState<string[]>([]);
    
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    useEffect(() => {
        const initialSelection = suggestedHeaders.reduce((acc, header) => ({ ...acc, [header]: true }), {});
        setSelectedHeaders(initialSelection);
        setOrderedHeaders(suggestedHeaders);
    }, [suggestedHeaders]);

    const handleCheckboxChange = (header: string) => {
        const isChecked = !selectedHeaders[header];
        const newSelection = { ...selectedHeaders, [header]: isChecked };
        setSelectedHeaders(newSelection);
        
        if (isChecked) {
            setOrderedHeaders(prev => [...prev, header]);
        } else {
            setOrderedHeaders(prev => prev.filter(h => h !== header));
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLLIElement>, index: number) => {
        dragItem.current = index;
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (index: number) => {
        dragOverItem.current = index;
    };

    const handleDrop = () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        
        const newOrderedHeaders = [...orderedHeaders];
        const dragItemContent = newOrderedHeaders[dragItem.current];
        newOrderedHeaders.splice(dragItem.current, 1);
        newOrderedHeaders.splice(dragOverItem.current, 0, dragItemContent);
        
        dragItem.current = null;
        dragOverItem.current = null;
        setOrderedHeaders(newOrderedHeaders);
    };

    const handleRemoveHeader = (headerToRemove: string) => {
        handleCheckboxChange(headerToRemove);
    }

    const handleSelectAll = () => {
        const allSelected = suggestedHeaders.reduce((acc, header) => ({...acc, [header]: true}), {});
        setSelectedHeaders(allSelected);
        setOrderedHeaders(suggestedHeaders);
    };

    const handleDeselectAll = () => {
        const noneSelected = suggestedHeaders.reduce((acc, header) => ({...acc, [header]: false}), {});
        setSelectedHeaders(noneSelected);
        setOrderedHeaders([]);
    };
    
    return (
        <div className="space-y-6">
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Select Headers to Extract</h3>
                    <div className="flex gap-4">
                        <button onClick={handleSelectAll} className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:hover:text-blue-400">Select All</button>
                        <button onClick={handleDeselectAll} className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:hover:text-blue-400">Deselect All</button>
                    </div>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 p-3 bg-gray-100 dark:bg-gray-900/30 rounded-lg border border-gray-300 dark:border-gray-600">
                    {suggestedHeaders.length > 0 ? suggestedHeaders.map(header => (
                        <label key={header} className="flex items-center space-x-3 cursor-pointer p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">
                            <input
                                type="checkbox"
                                checked={selectedHeaders[header] || false}
                                onChange={() => handleCheckboxChange(header)}
                                className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 bg-gray-200 dark:bg-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700 dark:text-gray-300">{header}</span>
                        </label>
                    )) : (
                        <p className="text-center text-gray-500 dark:text-gray-400 p-4">No headers suggested. You may need to try different documents.</p>
                    )}
                </div>
            </div>

            <div>
                 <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Set Column Order</h3>
                 <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Drag and drop to reorder the columns for your final table.</p>
                <ul onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} className="space-y-2">
                    {orderedHeaders.map((header, index) => (
                        <li
                            key={header}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragEnter={() => handleDragEnter(index)}
                            onDragEnd={handleDrop}
                            className="flex items-center justify-between bg-white dark:bg-gray-700 p-3 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 cursor-grab active:cursor-grabbing"
                        >
                           <div className="flex items-center gap-3 overflow-hidden">
                                <DragHandleIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{header}</span>
                           </div>
                           <button onClick={() => handleRemoveHeader(header)} className="p-1 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                                <TrashIcon className="w-5 h-5" />
                           </button>
                        </li>
                    ))}
                    {orderedHeaders.length === 0 && (
                        <li className="text-center text-gray-500 dark:text-gray-400 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                            Select headers from the list above to get started.
                        </li>
                    )}
                </ul>
            </div>
            
            <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                 <button onClick={onCancel} className="py-2 px-4 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 font-semibold transition-colors">
                    Back to Upload
                </button>
                <button onClick={() => onConfirm(orderedHeaders)} disabled={orderedHeaders.length === 0} className="py-2 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
                    Confirm Headers & Continue
                </button>
            </div>
        </div>
    );
};

export default HeaderConfiguration;