import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload, FileImage, Settings, Play, X, Image as ImageIcon, FolderOpen } from 'lucide-react'
import clsx from 'clsx'
import * as pdfjsLib from 'pdfjs-dist';
import { api, FileItem, isWeb } from './api'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

function App() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [version, setVersion] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [targetFormat, setTargetFormat] = useState('png')
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [progress, setProgress] = useState(0)
  
  const [showSettings, setShowSettings] = useState(false)
  const [autoClear, setAutoClear] = useState(false)
  const autoClearRef = useRef(false)

  useEffect(() => { autoClearRef.current = autoClear }, [autoClear])

  useEffect(() => {
    if (!isWeb) {
        const electronApi = window.electronAPI
        if (electronApi) {
            electronApi.getVersion().then(setVersion).catch(e => console.error(e))

            electronApi.onProgress((data) => {
                setProgress(data.progress)
            })

            electronApi.onConversionComplete((summary) => {
                setIsConverting(false)
                setProgress(100)
                setTimeout(() => {
                    let message = `Done! Converted: ${summary.completed}, Errors: ${summary.errors}`;
                    if (summary.errors > 0 && summary.errorLog && summary.errorLog.length > 0) {
                        message += `\n\nErrors:\n${summary.errorLog.join('\n')}`;
                    }
                    alert(message)
                    setProgress(0)
                    if (autoClearRef.current) setFiles([])
                }, 500)
            })
            
            electronApi.onConversionError((err) => {
                console.error("Conversion error:", err)
                setIsConverting(false)
                alert(`Error: ${err}`)
            })

            // Handle PDF rendering requests from Main process
            electronApi.onPdfRenderRequest(async ({ id, buffer }) => {
                try {
                    console.log('Received PDF render request', id);
                    const loadingTask = pdfjsLib.getDocument({ data: buffer });
                    const pdf = await loadingTask.promise;
                    const page = await pdf.getPage(1); // Always render first page for now

                    const viewport = page.getViewport({ scale: 2.0 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    if (!context) throw new Error('Canvas context creation failed');

                    await page.render({ canvasContext: context, viewport, canvas }).promise;
                    
                    const dataUrl = canvas.toDataURL('image/png');
                    await electronApi.sendPdfRendered(id, dataUrl);
                    console.log('PDF rendered and sent back', id);
                } catch (error: any) {
                    console.error('PDF render error:', error);
                    await electronApi.sendPdfRendered(id, null, error.message || 'Unknown error');
                }
            });
        }
    } else {
        setVersion('Web 1.0');
    }
  }, [])

  const handleSelectFiles = async () => {
    if (isConverting) return
    try {
        const selected = await api.selectFiles()
        if (selected && selected.length > 0) {
            // Deduplicate based on path/name
            setFiles(prev => {
                const existing = new Set(prev.map(f => f.path));
                const newFiles = selected.filter(f => !existing.has(f.path));
                return [...prev, ...newFiles];
            })
        }
    } catch (error) {
        console.error("Failed to select files:", error)
        alert("Failed to open file dialog")
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (!isWeb) {
        // Electron specific
        const droppedFiles = Array.from(e.dataTransfer.files).map(f => ({
            path: (f as any).path,
            name: f.name
        }));
        if (droppedFiles.length > 0) {
             setFiles(prev => {
                const existing = new Set(prev.map(f => f.path));
                const newFiles = droppedFiles.filter(f => !existing.has(f.path));
                return [...prev, ...newFiles];
            })
        }
    } else {
        // Web specific
        const droppedFiles = Array.from(e.dataTransfer.files).map(f => ({
            path: f.name,
            name: f.name,
            file: f
        }));
        if (droppedFiles.length > 0) {
            setFiles(prev => {
                const existing = new Set(prev.map(f => f.path));
                const newFiles = droppedFiles.filter(f => !existing.has(f.path));
                return [...prev, ...newFiles];
            })
        }
    }
  }, [])

  const removeFile = (pathToRemove: string) => {
    if (isConverting) return
    setFiles(files.filter(f => f.path !== pathToRemove))
  }

  const handleSelectDirectory = async () => {
    if (isConverting || isWeb) return
    try {
        const dir = await window.electronAPI.selectDirectory()
        if (dir) {
            setOutputDir(dir)
        }
    } catch (error) {
        console.error("Failed to select directory:", error)
    }
  }

  const handleConvert = async () => {
    if (files.length === 0 || isConverting) return
    
    setIsConverting(true)
    setProgress(0)
    try {
      const result = await api.convertFiles(
          { files, format: targetFormat, outputDir: outputDir || undefined },
          (p) => setProgress(p)
      );
      
      if (isWeb && result) {
          setIsConverting(false)
          alert(`Done! Converted ${result.completed} files.`);
          if (autoClearRef.current) setFiles([]);
      }
    } catch (e: any) {
      console.error(e)
      setIsConverting(false)
      alert("Failed to start conversion: " + e.message)
    }
  }

  return (
    <div className="min-h-screen flex flex-col p-6 gap-6 select-none">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/50">
            <FileImage className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent leading-none">
              Универсальный Графический Конвертер
            </h1>
            <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-mono">v{version}</span>
            </div>
          </div>
        </div>
        <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors"
        >
          <Settings className="w-5 h-5 text-slate-400" />
        </button>
      </header>

      <main className="flex-1 flex flex-col gap-6 overflow-hidden">
        {/* Drop Zone */}
        <div 
          onClick={handleSelectFiles}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={clsx(
            "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group",
            isDragging 
              ? "border-blue-500 bg-blue-500/10 scale-[1.01]" 
              : "border-slate-700 hover:border-blue-500 hover:bg-slate-800/50"
          )}
        >
          <div className={clsx(
            "w-16 h-16 rounded-full flex items-center justify-center transition-transform",
            isDragging ? "bg-blue-600 scale-110" : "bg-slate-800 group-hover:scale-110"
          )}>
            <Upload className={clsx("w-8 h-8", isDragging ? "text-white" : "text-blue-400")} />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-slate-200">
              {isDragging ? "Drop files now!" : "Drag & Drop files here"}
            </p>
            <p className="text-sm text-slate-500">or click to select</p>
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex justify-between items-center">
            <h2 className="font-medium text-slate-300">Queue ({files.length})</h2>
            {files.length > 0 && (
              <button 
                onClick={() => setFiles([])}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
            {files.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 opacity-50">
                <ImageIcon className="w-12 h-12" />
                <p>No files selected</p>
              </div>
            ) : (
              files.map((file, idx) => (
                <div key={idx} className="bg-slate-800 p-3 rounded-lg border border-slate-700/50 flex items-center gap-3 group hover:border-slate-600 transition-colors">
                  <div className="w-10 h-10 bg-slate-900 rounded flex items-center justify-center text-slate-500">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate" title={file.path}>
                      {file.path}
                    </p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeFile(file.path); }}
                    className="p-1.5 hover:bg-red-500/20 hover:text-red-400 text-slate-500 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-4 bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium ml-1">Output Format</label>
            <select 
              value={targetFormat}
              onChange={(e) => setTargetFormat(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
            >
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
          
          {/* Hide output directory in Web mode */}
          {!isWeb && (
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <label className="text-xs text-slate-400 font-medium ml-1">Output Directory</label>
                <div className="flex gap-2">
                    <div className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm truncate leading-5" title={outputDir || 'Same as source file'}>
                        {outputDir || <span className="text-slate-500 italic">Same as source file</span>}
                    </div>
                    <button 
                        onClick={handleSelectDirectory}
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors"
                        title="Change output directory"
                    >
                        <FolderOpen className="w-5 h-5" />
                    </button>
                </div>
              </div>
          )}

          <button 
            disabled={files.length === 0 || isConverting}
            onClick={handleConvert}
            className={clsx(
              "px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg ml-auto",
              isConverting 
                ? "bg-slate-700 cursor-not-allowed text-slate-400" 
                : "bg-blue-600 hover:bg-blue-500 text-white active:scale-95 shadow-blue-900/20"
            )}
          >
            {isConverting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{progress}%</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>Convert</span>
              </>
            )}
          </button>
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-200">Settings</h2>
                    <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
                        <div>
                            <p className="font-medium text-slate-200">Auto-clear list</p>
                            <p className="text-xs text-slate-500">Clear files after successful conversion</p>
                        </div>
                        <button 
                            onClick={() => setAutoClear(!autoClear)}
                            className={clsx(
                                "w-12 h-6 rounded-full p-1 transition-colors relative",
                                autoClear ? "bg-blue-600" : "bg-slate-700"
                            )}
                        >
                            <div className={clsx(
                                "w-4 h-4 bg-white rounded-full transition-transform",
                                autoClear ? "translate-x-6" : "translate-x-0"
                            )} />
                        </button>
                    </div>

                    <div className="p-4 bg-slate-800/50 rounded-xl">
                        <p className="font-medium text-slate-200 mb-2">About</p>
                        <p className="text-sm text-slate-400">
                            Universal Graphic Converter<br/>
                            Version: {version}<br/>
                            {isWeb ? 'Running in Web Mode' : 'Running in Desktop Mode'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}

export default App
