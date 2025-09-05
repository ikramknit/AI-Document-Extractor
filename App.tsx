import React, { useState, useCallback, useRef } from 'react';
import FileUpload from './components/FileUpload';
import DataTable from './components/DataTable';
import HeaderConfiguration from './components/HeaderConfiguration';
import { identifyHeadersFromFiles, extractInfoFromSingleFile, testApiKey } from './services/geminiService';
import { fileToGenerativePart } from './utils/fileUtils';
import { SparklesIcon, AlertTriangleIcon, UploadIcon, KeyIcon, CheckCircleIcon, XCircleIcon, RefreshCwIcon } from './components/Icons';
import type { FileError } from './types';
import type { Part } from '@google/genai';

type AppState = 'file_upload' | 'identifying_headers' | 'header_selection' | 'prompting' | 'extracting_data' | 'data_display';
type ApiKeyStatus = 'idle' | 'testing' | 'success' | 'error';


const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('file_upload');
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [extractedData, setExtractedData] = useState<Record<string, any>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestedHeaders, setSuggestedHeaders] = useState<string[]>([]);
  const [orderedHeaders, setOrderedHeaders] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>('idle');
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [sameHeadersForAllFiles, setSameHeadersForAllFiles] = useState(true);

  // New state for parallel processing and ETA
  const [processedFileCount, setProcessedFileCount] = useState(0);
  const [extractionStartTime, setExtractionStartTime] = useState<number | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string | null>(null);
  const smoothedEtaRef = useRef<number | null>(null);

  // New state for retrying failed documents
  const [failedItems, setFailedItems] = useState<{ file: File; index: number }[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);


  const formatEta = (ms: number): string => {
    if (ms < 1000 || !isFinite(ms)) return "a few seconds";

    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
      return `about ${minutes} minute${minutes > 1 ? 's' : ''}${seconds > 10 ? ` and ${seconds} seconds` : ''}`;
    }
    return `about ${seconds} second${seconds > 1 ? 's' : ''}`;
  };


  const handleTestApiKey = async () => {
      setApiKeyStatus('testing');
      setApiKeyError(null);
      const result = await testApiKey();
      if (result.success) {
          setApiKeyStatus('success');
          setTimeout(() => setApiKeyStatus('idle'), 5000); // Revert after 5s
      } else {
          setApiKeyStatus('error');
          setApiKeyError(result.error || 'An unknown error occurred.');
      }
  };

  const handleFilesChange = (newFiles: File[]) => {
    setFiles(prevFiles => [...prevFiles, ...newFiles]);
    setError(null);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleIdentifyHeaders = useCallback(async () => {
    if (files.length === 0) {
        setError('Please upload at least one file first.');
        return;
    }
    setError(null);
    setAppState('identifying_headers');
    setProgress(0);
    try {
        const fileParts: Part[] = [];
        const filesToProcess = sameHeadersForAllFiles && files.length > 1 ? [files[0]] : files;
        
        for (let i = 0; i < filesToProcess.length; i++) {
            const file = filesToProcess[i];
            const filePart = await fileToGenerativePart(file);
            fileParts.push(filePart);
            // Update progress for file processing (0% to 50%)
            setProgress(Math.round(((i + 1) / filesToProcess.length) * 50));
        }

        // Indicate AI processing stage
        setProgress(75);
        const headers = await identifyHeadersFromFiles(fileParts);
        
        setProgress(100); // Complete
        
        // Short delay for better UX, allowing user to see 100%
        await new Promise(resolve => setTimeout(resolve, 500));

        const enhancedHeaders = ['S.No', 'Document Name', ...headers];
        setSuggestedHeaders([...new Set(enhancedHeaders)]);
        setAppState('header_selection');
    } catch (err: any) {
        setError(err.message || 'Failed to identify headers.');
        setAppState('file_upload');
    }
  }, [files, sameHeadersForAllFiles]);

  const handleHeaderConfirm = (headers: string[]) => {
    setOrderedHeaders(headers);
    setAppState('prompting');
  };

  const handleHeaderCancel = () => {
    setSuggestedHeaders([]);
    setAppState('file_upload');
  };

  const handleExtract = useCallback(async () => {
    if (orderedHeaders.length === 0) {
        setError('Please configure headers before extracting.');
        return;
    }
    setAppState('extracting_data');
    setError(null);
    setExtractedData([]);
    setProgress(0);
    setProcessedFileCount(0);
    setEstimatedTimeRemaining(null);
    smoothedEtaRef.current = null;
    setExtractionStartTime(Date.now());
    setFailedItems([]); // Clear previous failures
    setIsRetrying(false);

    const headersForAI = orderedHeaders.filter(h => h !== 'S.No' && h !== 'Document Name');
    
    // Handle edge case where only metadata columns are selected
    if (headersForAI.length === 0) {
        const metaData = files.map((file, index) => {
            const row: Record<string, any> = {};
            if (orderedHeaders.includes('S.No')) row['S.No'] = index + 1;
            if (orderedHeaders.includes('Document Name')) row['Document Name'] = file.name;
            return row;
        });
        setExtractedData(metaData);
        setAppState('data_display');
        return;
    }
    
    const CONCURRENCY_LIMIT = 5;
    const fileQueue = files.map((file, index) => ({ file, index }));
    const results = new Array(files.length).fill(null);
    const extractionErrors: string[] = [];
    const currentRunFailedItems: { file: File; index: number }[] = [];
    
    const worker = async () => {
        while (fileQueue.length > 0) {
            const item = fileQueue.shift();
            if (!item) continue;
            const { file, index } = item;

            let rowData;
            try {
                const filePart = await fileToGenerativePart(file);
                const result = await extractInfoFromSingleFile(headersForAI, prompt, filePart);
                const parsedResult = JSON.parse(result);
                if (orderedHeaders.includes('Document Name')) {
                    parsedResult['Document Name'] = file.name;
                }
                rowData = parsedResult;
            } catch (err: any) {
                console.error("Extraction failed for file:", file.name, err);
                extractionErrors.push(`Error processing ${file.name}: ${err.message}.`);
                currentRunFailedItems.push(item);
                const errorRow: Record<string, any> = {};
                orderedHeaders.forEach(header => {
                    if (header === 'Document Name') errorRow[header] = file.name;
                    else if (header !== 'S.No') errorRow[header] = '--- EXTRACTION FAILED ---';
                });
                rowData = errorRow;
            }

            results[index] = rowData;

            setProcessedFileCount(currentCount => {
                const newCount = currentCount + 1;
                if (extractionStartTime) {
                    const elapsed = Date.now() - extractionStartTime;
                    // Start calculating ETA after 1s and at least 2 files are done for a more stable initial estimate.
                    if (elapsed > 1000 && newCount > 1) {
                        const avgTimePerFile = elapsed / newCount;
                        const remainingFiles = files.length - newCount;
                        const rawEtaMs = remainingFiles * avgTimePerFile;

                        // Apply exponential smoothing for a more stable, less jumpy estimate.
                        const smoothingFactor = 0.4;
                        if (smoothedEtaRef.current === null) {
                            smoothedEtaRef.current = rawEtaMs;
                        } else {
                            smoothedEtaRef.current = smoothingFactor * rawEtaMs + (1 - smoothingFactor) * smoothedEtaRef.current;
                        }
                        
                        setEstimatedTimeRemaining(formatEta(smoothedEtaRef.current));
                    }
                }
                setProgress(Math.round((newCount / files.length) * 100));
                return newCount;
            });
            
            const liveTableData = results
              .map((row, idx) => {
                if (!row) return null;
                const finalRow: Record<string, any> = { 'S.No': idx + 1 };
                orderedHeaders.forEach(h => {
                  if (h !== 'S.No') finalRow[h] = row[h];
                });
                return finalRow;
              })
              .filter((r): r is Record<string, any> => r !== null);
            setExtractedData(liveTableData);
        }
    };
    
    const workers = Array(CONCURRENCY_LIMIT).fill(0).map(worker);
    await Promise.all(workers);

    setFailedItems(currentRunFailedItems);
    if (extractionErrors.length > 0) {
        setError(`Extraction completed with ${extractionErrors.length} error(s). Please review the results table.`);
    }

    const finalData = results.map((row, index) => {
        const newRow: Record<string, any> = {};
        orderedHeaders.forEach(header => {
            if (header === 'S.No') {
                newRow['S.No'] = index + 1;
            } else {
                newRow[header] = row[header] ?? 'N/A';
            }
        });
        return newRow;
    });

    setEstimatedTimeRemaining(null);
    setExtractedData(finalData);
    setAppState('data_display');
  }, [orderedHeaders, prompt, files, extractionStartTime]);

  const handleRetryFailed = useCallback(async () => {
    if (failedItems.length === 0) return;

    setAppState('extracting_data');
    setError(null);
    setProgress(0);
    setProcessedFileCount(0);
    setEstimatedTimeRemaining(null);
    smoothedEtaRef.current = null;
    setExtractionStartTime(Date.now());
    setIsRetrying(true);

    const headersForAI = orderedHeaders.filter(h => h !== 'S.No' && h !== 'Document Name');
    const CONCURRENCY_LIMIT = 5;
    const fileQueue = [...failedItems];
    const results = [...(extractedData || [])];
    const newFailedItems: { file: File; index: number }[] = [];

    const worker = async () => {
        while (fileQueue.length > 0) {
            const item = fileQueue.shift();
            if (!item) continue;
            const { file, index } = item;

            try {
                const filePart = await fileToGenerativePart(file);
                const result = await extractInfoFromSingleFile(headersForAI, prompt, filePart);
                const parsedResult = JSON.parse(result);
                
                const successfulRow: Record<string, any> = {};
                orderedHeaders.forEach(header => {
                    if (header === 'S.No') successfulRow[header] = index + 1;
                    else if (header === 'Document Name') successfulRow[header] = file.name;
                    else successfulRow[header] = parsedResult[header] ?? 'N/A';
                });
                results[index] = successfulRow;

            } catch (err: any) {
                console.error("Retry failed for file:", file.name, err);
                newFailedItems.push(item);
                // Keep the existing error row in the results
            }

            setProcessedFileCount(currentCount => {
                const newCount = currentCount + 1;
                if (extractionStartTime) {
                    const elapsed = Date.now() - extractionStartTime;
                    if (elapsed > 1000 && newCount > 1) {
                        const avgTimePerFile = elapsed / newCount;
                        const remainingFiles = failedItems.length - newCount;
                        const rawEtaMs = remainingFiles * avgTimePerFile;

                        const smoothingFactor = 0.4;
                        if (smoothedEtaRef.current === null) {
                            smoothedEtaRef.current = rawEtaMs;
                        } else {
                            smoothedEtaRef.current = smoothingFactor * rawEtaMs + (1 - smoothingFactor) * smoothedEtaRef.current;
                        }
                        setEstimatedTimeRemaining(formatEta(smoothedEtaRef.current));
                    }
                }
                setProgress(Math.round((newCount / failedItems.length) * 100));
                return newCount;
            });
            
            setExtractedData([...results]);
        }
    };

    const workers = Array(CONCURRENCY_LIMIT).fill(0).map(worker);
    await Promise.all(workers);

    setFailedItems(newFailedItems);
    if (newFailedItems.length > 0) {
        setError(`Extraction completed with ${newFailedItems.length} error(s) remaining.`);
    } else {
        setError(null);
    }

    setEstimatedTimeRemaining(null);
    setAppState('data_display');
  }, [failedItems, orderedHeaders, prompt, extractedData, extractionStartTime]);
  
  const handleStartOver = () => {
    setAppState('file_upload');
    setFiles([]);
    setFileErrors([]);
    setPrompt('');
    setExtractedData(null);
    setError(null);
    setSuggestedHeaders([]);
    setOrderedHeaders([]);
    setProgress(0);
    setProcessedFileCount(0);
    setExtractionStartTime(null);
    setEstimatedTimeRemaining(null);
    smoothedEtaRef.current = null;
    setFailedItems([]);
    setIsRetrying(false);
  };

  const renderContentPanel = () => {
    const isIdentifying = appState === 'identifying_headers';

    switch (appState) {
      case 'file_upload':
      case 'identifying_headers':
        return (
          <>
            <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">1. Upload Documents</h2>
            <FileUpload onFilesChange={handleFilesChange} files={files} removeFile={removeFile} setFileErrors={setFileErrors} />
            
            {files.length > 1 && !isIdentifying && (
              <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-center">
                <label className="flex items-center justify-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={sameHeadersForAllFiles}
                        onChange={(e) => setSameHeadersForAllFiles(e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 dark:border-gray-500 bg-gray-200 dark:bg-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-gray-800 dark:text-gray-200">All documents have the same headers</span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    If checked, only the first document will be analyzed to find headers, making the process faster.
                </p>
              </div>
            )}

            {isIdentifying ? (
              <div className="mt-6 text-center">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Identifying Headers...</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 my-2">
                      {progress <= 50 ? 'Processing your documents...' : 'Asking the AI to identify potential headers...'}
                  </p>
                  <div className="w-full max-w-lg mx-auto space-y-2">
                      <div className="flex justify-between mb-1">
                          <span className="text-base font-medium text-blue-700 dark:text-blue-400">Analysis Progress</span>
                          <span className="text-sm font-medium text-blue-700 dark:text-blue-400">{progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                          <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{width: `${progress}%`}}></div>
                      </div>
                  </div>
              </div>
            ) : (
              <button
                onClick={handleIdentifyHeaders}
                disabled={files.length === 0}
                className="mt-6 w-full flex items-center justify-center gap-3 bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-300"
              >
                Identify Headers
              </button>
            )}
          </>
        );
      case 'header_selection':
        return (
          <>
            <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">2. Configure Headers</h2>
            <HeaderConfiguration suggestedHeaders={suggestedHeaders} onConfirm={handleHeaderConfirm} onCancel={handleHeaderCancel} />
          </>
        );
      case 'prompting':
        return (
          <>
            <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">3. Final Review & Extract</h2>
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Columns to Extract:</h3>
              <ul className="flex flex-wrap gap-2 mb-6">
                {orderedHeaders.map(h => <li key={h} className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 text-sm font-medium px-2.5 py-1 rounded-full">{h}</li>)}
              </ul>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Additional Instructions (Optional)</h3>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., Extract only invoices from company 'X'. Format dates as YYYY-MM-DD." className="w-full h-28 p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleExtract} className="mt-6 w-full flex items-center justify-center gap-3 bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
              <SparklesIcon className="w-6 h-6" /> Create Table
            </button>
          </>
        );
      case 'extracting_data':
        return (
            <div className="text-center p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Extraction in Progress</h2>
                <div className="w-full max-w-lg mx-auto space-y-3">
                    <div className="flex justify-between mb-1">
                        <span className="text-base font-medium text-blue-700 dark:text-blue-400">Processing Documents</span>
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-400">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                        <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{width: `${progress}%`}}></div>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                        <span className="truncate pr-4">
                            {isRetrying ? 'Retrying failed documents...' : 'Processing files concurrently...'}
                        </span>
                        <span className="flex-shrink-0">
                             File {processedFileCount} of {isRetrying ? failedItems.length : files.length}
                        </span>
                    </div>
                </div>
                 {estimatedTimeRemaining && processedFileCount < (isRetrying ? failedItems.length : files.length) && (
                    <p className="text-gray-500 dark:text-gray-400 mt-4 max-w-md mx-auto text-sm">
                        Estimated time remaining: <strong>{estimatedTimeRemaining}</strong>
                    </p>
                )}
                <p className="text-gray-500 dark:text-gray-500 mt-6 max-w-md mx-auto">
                    View the results table below as it populates in real-time.
                </p>
            </div>
        );
      case 'data_display': {
         const hasFailures = failedItems.length > 0;
         const hasSuccess = (extractedData?.length ?? 0) > failedItems.length;
         
         let title = "Extraction Complete!";
         let message = "View your data in the table below. You can now export it to CSV.";
         let bgColor = "bg-green-50 dark:bg-green-900/20";
         let textColor = "text-green-800 dark:text-green-200";

         if (hasFailures && !hasSuccess) {
             title = "Extraction Failed";
             message = "All documents failed to process. Please check your files or prompt and try again.";
             bgColor = "bg-red-50 dark:bg-red-900/20";
             textColor = "text-red-800 dark:text-red-200";
         } else if (hasFailures) {
             title = "Extraction Complete with Errors";
             message = "Some documents failed to process. You can retry the failed documents or export the partial results.";
             bgColor = "bg-yellow-50 dark:bg-yellow-900/20";
             textColor = "text-yellow-800 dark:text-yellow-200";
         }
         
         return (
             <div className={`text-center p-6 ${bgColor} rounded-lg`}>
               <h2 className={`text-2xl font-bold mb-4 ${textColor}`}>{title}</h2>
               <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  {failedItems.length > 0 && (
                      <button 
                        onClick={handleRetryFailed} 
                        className="flex items-center justify-center gap-3 bg-orange-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-orange-600 transition-colors"
                      >
                        <RefreshCwIcon className="w-6 h-6" />
                        Retry {failedItems.length} Failed Document{failedItems.length > 1 ? 's' : ''}
                      </button>
                  )}
                  <button onClick={handleStartOver} className="flex items-center justify-center gap-3 bg-gray-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-700 transition-colors">
                    <UploadIcon className="w-6 h-6" /> Start New Extraction
                  </button>
                </div>
             </div>
         );
        }
    }
  };

  const renderResultsPanel = () => {
    if (appState === 'extracting_data' || appState === 'data_display') {
      return (
          <DataTable 
            data={extractedData} 
            isLoading={false} 
            orderedHeaders={orderedHeaders}
            placeholder={
              appState === 'extracting_data' && (!extractedData || extractedData.length === 0) 
              ? "Data will appear here as it's processed..." 
              : undefined
            }
          />
      );
    }
    
    const isLoading = appState === 'identifying_headers';
    let placeholderText = "Your extracted information will appear here.";
    if (isLoading) placeholderText = "AI is working its magic...";
    if (appState === 'header_selection' || appState === 'prompting') placeholderText = "Configure your table headers above to get started.";

    return <DataTable data={null} isLoading={isLoading} placeholder={placeholderText} />;
  };

  const ApiKeyStatusIndicator: React.FC = () => {
      switch (apiKeyStatus) {
          case 'testing':
              return (
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm p-2">
                      <div className="w-5 h-5 border-2 border-dashed rounded-full animate-spin border-blue-500"></div>
                      <span>Testing Key...</span>
                  </div>
              );
          case 'success':
              return (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-semibold p-2">
                      <CheckCircleIcon className="w-6 h-6" />
                      <span>API Key Verified</span>
                  </div>
              );
          case 'error':
              return (
                  <div className="flex flex-col items-end p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                          <XCircleIcon className="w-6 h-6" />
                          <span className="font-semibold">Verification Failed</span>
                      </div>
                      <p className="text-xs text-red-500 dark:text-red-400 mt-1 max-w-xs text-right">{apiKeyError}</p>
                  </div>
              );
          case 'idle':
          default:
              return (
                  <button
                      onClick={handleTestApiKey}
                      className="flex items-center gap-2 py-2 px-3 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      title="Test API Key Connection"
                  >
                      <KeyIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                      <span className="text-sm font-semibold">Test API Key</span>
                  </button>
              );
      }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      <main className="container mx-auto p-4 md:p-8">
        <header className="text-center mb-10 relative">
          <div className="absolute top-0 right-0 -mt-2">
            <ApiKeyStatusIndicator />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-teal-400">
            AI Document Extractor
          </h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            A powerful new way to turn your documents into structured data.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
            {error && !['extracting_data', 'data_display'].includes(appState) && (
              <div className="mb-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg relative" role="alert">
                <strong className="font-bold flex items-center"><AlertTriangleIcon className="w-5 h-5 mr-2" />Error: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            )}
            {renderContentPanel()}
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 min-h-[500px] max-h-[80vh] flex flex-col">
            <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Results</h2>
             {error && (appState === 'data_display' || appState === 'extracting_data') && (
              <div className="mb-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300 px-4 py-3 rounded-lg relative" role="alert">
                <strong className="font-bold flex items-center"><AlertTriangleIcon className="w-5 h-5 mr-2" />Notice: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            )}
            {renderResultsPanel()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;