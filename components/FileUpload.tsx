import React, { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { UploadIcon, FileIcon, TrashIcon } from './Icons';
import type { FileError } from '../types';

interface FileUploadProps {
  onFilesChange: (files: File[]) => void;
  files: File[];
  removeFile: (index: number) => void;
  setFileErrors: Dispatch<SetStateAction<FileError[]>>;
}

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 20;

const FileUpload: React.FC<FileUploadProps> = ({ onFilesChange, files, removeFile, setFileErrors }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const validateFile = (file: File): string | null => {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      return `File type not supported: ${file.type}. Please use JPG, PNG, WEBP, or PDF.`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Max size is ${MAX_SIZE_MB}MB.`;
    }
    return null;
  };
  
  const processFiles = useCallback((fileList: FileList) => {
    const newFiles: File[] = [];
    const errors: FileError[] = [];
    Array.from(fileList).forEach(file => {
      const error = validateFile(file);
      if (error) {
        errors.push({ fileName: file.name, error });
      } else {
        newFiles.push(file);
      }
    });
    setFileErrors(errors);
    if (newFiles.length > 0) {
      onFilesChange(newFiles);
    }
  }, [onFilesChange, setFileErrors]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <div>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-300 ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'}`}
      >
        <input
          type="file"
          multiple
          accept={SUPPORTED_TYPES.join(',')}
          className="hidden"
          id="file-upload"
          onChange={handleFileSelect}
        />
        <label htmlFor="file-upload" className="flex flex-col items-center justify-center cursor-pointer">
          <UploadIcon className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
          <p className="font-semibold text-gray-700 dark:text-gray-300">
            Drag & drop files here or <span className="text-blue-500">click to browse</span>
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Supports: PDF, JPG, PNG, WEBP (20MB each)
          </p>
        </label>
      </div>
      
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300">Selected Files:</h3>
            {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <FileIcon className="w-6 h-6 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{file.name}</span>
                    </div>
                    <button onClick={() => removeFile(index)} className="p-1 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;