import React, { useState, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import DataTable from './components/DataTable';
import HeaderConfiguration from './components/HeaderConfiguration';
import { identifyHeadersFromFiles, extractInfoFromSingleFile, testApiKey } from './services/geminiService';
import { fileToGenerativePart } from './utils/fileUtils';
import { SparklesIcon, AlertTriangleIcon, UploadIcon, KeyIcon, CheckCircleIcon, XCircleIcon } from './components/Icons';
import type { FileError } from './types';

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

  const handleIdentifyHeaders = async () => {
    if (files.length === 0) {
      setError('Please upload at least one file first.');
      return;
    }
    setError(null);
    setAppState('identifying_headers');
    try {
      const fileParts = await Promise.all(files.map(fileToGenerativePart));
      const headers = await identifyHeadersFromFiles(fileParts);
      const enhancedHeaders = ['S.No', 'Document Name', ...headers];
      setSuggestedHeaders([...new Set(enhancedHeaders)]);
      setAppState('header_selection');
    } catch (err: any) {
      setError(err.message || 'Failed to identify headers.');
      setAppState('file_upload');
    }
  };

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

    const allResults: Record<string, any>[] = [];
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

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const filePart = await fileToGenerativePart(file);
            const result = await extractInfoFromSingleFile(headersForAI, prompt, filePart);
            const parsedResult = JSON.parse(result);
            
            if (orderedHeaders.includes('Document Name')) {
                parsedResult['Document Name'] = file.name;
            }
            allResults.push(parsedResult);
            
            // Add S.No at this stage to keep it consistent during live update
            const liveData = allResults.map((row, index) => ({ 'S.No': index + 1, ...row }));
            setExtractedData(liveData);

        } catch (err: any) {
            console.error("Extraction failed for file:", file.name, err);
            setError(`Error processing ${file.name}: ${err.message}. Extraction stopped.`);
            setAppState('prompting');
            // Revert data to what was successfully processed
            const finalData = allResults.map((row, index) => {
                const newRow: Record<string, any> = {};
                if (orderedHeaders.includes('S.No')) newRow['S.No'] = index + 1;
                orderedHeaders.filter(h => h !== 'S.No').forEach(header => {
                    newRow[header] = row[header];
                });
                return newRow;
            });
            setExtractedData(finalData);
            return;
        }
        setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    const finalData = allResults.map((row, index) => {
        const newRow: Record<string, any> = {};
        orderedHeaders.forEach(header => {
            if (header === 'S.No') {
                newRow['S.No'] = index + 1;
            } else {
                newRow[header] = row[header];
            }
        });
        return newRow;
    });

    setExtractedData(finalData);
    setAppState('data_display');
  }, [orderedHeaders, prompt, files]);
  
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
            {isIdentifying ? (
              <div className="mt-6 text-center">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Identifying Headers...</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 my-2">
                      AI is analyzing your documents. Please wait.
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 overflow-hidden">
                      <div className="bg-blue-600 h-2.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
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
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-right">
                        File {Math.min(Math.ceil(progress / 100 * files.length), files.length)} of {files.length}
                    </p>
                </div>
                <p className="text-gray-500 dark:text-gray-500 mt-6 max-w-md mx-auto">
                    View the results table below as it populates in real-time.
                </p>
            </div>
        );
      case 'data_display':
         return (
            <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <h2 className="text-2xl font-bold mb-4 text-green-800 dark:text-green-200">Extraction Complete!</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">View your data in the table below. You can now export it to CSV.</p>
              <button onClick={handleStartOver} className="w-full flex items-center justify-center gap-3 bg-gray-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-700 transition-colors">
                <UploadIcon className="w-6 h-6" /> Start New Extraction
              </button>
            </div>
         );
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
            {error && appState !== 'extracting_data' && (
              <div className="mb-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg relative" role="alert">
                <strong className="font-bold flex items-center"><AlertTriangleIcon className="w-5 h-5 mr-2" />Error: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            )}
            {renderContentPanel()}
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 min-h-[500px] max-h-[80vh] flex flex-col">
            <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">Results</h2>
             {error && appState === 'extracting_data' && (
              <div className="mb-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg relative" role="alert">
                <strong className="font-bold flex items-center"><AlertTriangleIcon className="w-5 h-5 mr-2" />Error: </strong>
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
