import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, AlertCircle, CheckCircle, Clock, X, ChevronLeft } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://duroflex-call-analyser.onrender.com';

const VideoCallUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // State management
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [csvPreview, setCsvPreview] = useState(null);
  const [progress, setProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');

  // Handle drag and drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.csv')) {
        setSelectedFile(file);
        previewCSV(file);
      } else {
        alert('Please drop a CSV file');
      }
    }
  };

  // File selection from input
  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      previewCSV(file);
    }
  };

  // Preview CSV (first few rows)
  const previewCSV = async (file) => {
    try {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',');
      const firstRows = lines.slice(1, 4).map(line => line.split(','));
      
      setCsvPreview({
        headers,
        rows: firstRows.filter(row => row.length > 1)
      });
    } catch (err) {
      console.error('Preview error:', err);
    }
  };

  // Upload and process
  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    setIsProcessing(true);
    setUploadResult(null);
    setProgress(0);
    setProcessingStatus('Uploading file...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      console.log('[UPLOAD] Sending video CSV to backend...');
      
      // Simulate progress during upload
      setProgress(10);
      setProcessingStatus('Uploading CSV file...');

      const response = await fetch(`${API_BASE}/api/video-reports/upload`, {
        method: 'POST',
        body: formData
      });

      setProgress(30);
      setProcessingStatus('Analyzing videos with Gemini AI...');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
      }

      // Simulate progress while waiting for response
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 5;
        });
      }, 1000);

      const result = await response.json();
      clearInterval(progressInterval);
      
      console.log('[UPLOAD] Processing complete:', result);
      setProgress(100);
      setProcessingStatus('Processing complete!');

      setTimeout(() => {
        setUploadResult(result);
        setSelectedFile(null);
        setCsvPreview(null);
      }, 500);

    } catch (err) {
      console.error('[UPLOAD] Error:', err);
      setUploadResult({
        status: 'failed',
        error: err.message || 'Upload failed'
      });
      setProgress(0);
      setProcessingStatus('');
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
      }, 600);
    }
  };

  // Reset form
  const handleReset = () => {
    setSelectedFile(null);
    setCsvPreview(null);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Navigate back to video reports
  const handleBackToReports = () => {
    navigate('/popins-inbound');
  };

  return (
    <div className="min-h-screen bg-[#08080c] text-gray-100">
      {/* Header */}
      <header className="border-b border-white/10 bg-gradient-to-r from-[#0f0f14] to-[#16161d] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToReports}
              className="p-2 hover:bg-white/5 rounded-lg transition"
            >
              <ChevronLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "'Fraunces', serif", letterSpacing: '-0.02em' }}>
                Upload Video Calls
              </h1>
              <p className="text-gray-400 text-sm mt-1">Upload a CSV with video recordings for automated analysis</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        
        {/* Instructions */}
        <div className="bg-[#0f0f14] border border-purple-500/20 rounded-2xl p-8 mb-12">
          <h2 className="text-lg font-semibold mb-4 text-purple-400">Required CSV Format</h2>
          <p className="text-gray-300 mb-4">Your CSV file must contain these columns:</p>
          <div className="grid grid-cols-2 gap-3 text-sm text-gray-400">
            <div>• Store Name</div>
            <div>• WeekNum</div>
            <div>• Recording URL</div>
            <div>• Month</div>
            <div>• Duration</div>
            <div>• CleanNumber</div>
            <div>• CleanDateTime</div>
            <div>• is_converted</div>
            <div>• Date</div>
          </div>
          <p className="text-gray-400 text-sm mt-4 leading-relaxed">
            Each row will be processed through Gemini API to analyze video quality, agent performance, customer engagement, and product demonstrations.
          </p>
        </div>

        {/* Upload Area */}
        {!uploadResult && (
          <div className="space-y-8">
            {/* Drag Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition ${
                dragActive
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-white/10 hover:border-white/20 bg-white/2 hover:bg-white/5'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-purple-900/20 rounded-xl border border-purple-600/30">
                  <Upload className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Drag and drop your CSV file</h3>
                  <p className="text-gray-400 text-sm">or click to browse</p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 px-6 py-2 bg-purple-600/20 border border-purple-500/40 rounded-lg text-purple-400 hover:bg-purple-600/30 transition text-sm font-medium"
                >
                  Select File
                </button>
              </div>
            </div>

            {/* File Selected Info */}
            {selectedFile && (
              <div className="bg-[#0f0f14] border border-white/10 rounded-2xl p-8">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Selected File</p>
                    <h3 className="text-xl font-semibold text-gray-100">{selectedFile.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="p-2 hover:bg-white/5 rounded-lg transition text-gray-400 hover:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* CSV Preview */}
                {csvPreview && (
                  <div className="mb-8">
                    <p className="text-sm text-gray-400 mb-4">Column Preview:</p>
                    <div className="bg-black/20 rounded-lg overflow-x-auto">
                      <table className="w-full text-xs text-gray-300">
                        <thead>
                          <tr className="border-b border-white/10">
                            {csvPreview.headers.slice(0, 5).map((header, i) => (
                              <th key={i} className="px-4 py-3 text-left font-semibold text-gray-400">
                                {header.trim()}
                              </th>
                            ))}
                            {csvPreview.headers.length > 5 && (
                              <th className="px-4 py-3 text-left text-gray-500">+{csvPreview.headers.length - 5}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.rows.map((row, i) => (
                            <tr key={i} className="border-b border-white/5">
                              {row.slice(0, 5).map((cell, j) => (
                                <td key={j} className="px-4 py-2 text-gray-400 truncate">
                                  {typeof cell === 'string' ? cell.trim() : cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Upload Button */}
                <button
                  onClick={handleUpload}
                  disabled={isProcessing}
                  className={`w-full py-3 rounded-lg font-semibold transition ${
                    isProcessing
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {isProcessing ? (
                    <div className="flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4 animate-spin" />
                      Processing...
                    </div>
                  ) : (
                    'Start Processing'
                  )}
                </button>

                {/* Progress Bar - Windows Style */}
                {isProcessing && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">{processingStatus}</span>
                      <span className="text-gray-400">{Math.round(progress)}%</span>
                    </div>
                    
                    {/* Windows-style green progress bar */}
                    <div className="h-8 bg-[#0a0a0f] rounded-lg border border-white/10 overflow-hidden shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-green-600 to-green-500 transition-all duration-300 ease-out relative"
                        style={{ width: `${progress}%` }}
                      >
                        {/* Animated shine effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
                        
                        {/* Inner glow */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent"></div>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 text-center">
                      This may take several minutes depending on video size and quantity
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {uploadResult && (
          <div className={`bg-[#0f0f14] border rounded-2xl p-8 ${
            uploadResult.status === 'failed'
              ? 'border-red-500/20'
              : 'border-green-500/20'
          }`}>
            <div className="flex items-start gap-4 mb-6">
              {uploadResult.status === 'failed' ? (
                <>
                  <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                  <div>
                    <h2 className="text-xl font-semibold text-red-400 mb-1">Processing Failed</h2>
                    <p className="text-gray-400">{uploadResult.error}</p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                  <div>
                    <h2 className="text-xl font-semibold text-green-400 mb-1">Processing Complete</h2>
                    <p className="text-gray-400">{uploadResult.filename}</p>
                  </div>
                </>
              )}
            </div>

            {/* Summary Stats */}
            {uploadResult.status !== 'failed' && (
              <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Total Records</p>
                  <p className="text-2xl font-bold text-gray-100">{uploadResult.total_records}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Processed</p>
                  <p className="text-2xl font-bold text-gray-100">{uploadResult.processed}</p>
                </div>
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                  <p className="text-xs uppercase tracking-wider text-green-400 mb-2">Successful</p>
                  <p className="text-2xl font-bold text-green-400">{uploadResult.successful}</p>
                </div>
                <div className={`rounded-lg p-4 ${
                  uploadResult.failed > 0
                    ? 'bg-red-900/20 border border-red-500/30'
                    : 'bg-white/5'
                }`}>
                  <p className={`text-xs uppercase tracking-wider mb-2 ${
                    uploadResult.failed > 0 ? 'text-red-400' : 'text-gray-500'
                  }`}>
                    Failed
                  </p>
                  <p className={`text-2xl font-bold ${
                    uploadResult.failed > 0 ? 'text-red-400' : 'text-gray-100'
                  }`}>
                    {uploadResult.failed}
                  </p>
                </div>
              </div>
            )}

            {/* Error Details */}
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-300 mb-4">Error Summary (First 10)</h3>
                <div className="bg-black/20 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  {uploadResult.errors.map((err, idx) => (
                    <div key={idx} className="p-4 border-b border-white/5 last:border-b-0">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-300">
                            Row {err.row}: {err.store}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">{err.error}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleReset}
                className="flex-1 py-3 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 transition font-semibold"
              >
                Upload Another File
              </button>
              <button
                onClick={handleBackToReports}
                className="flex-1 py-3 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition font-semibold"
              >
                View All Video Reports
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default VideoCallUpload;
