import React, { useState, useEffect } from 'react';
import { X, History, CheckCircle2, XCircle, FileCode2, Clock, ExternalLink, Trash2, AlertTriangle, Terminal, Eye, EyeOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function AuditHistoryModal({ isOpen, onClose }) {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [expandedRecord, setExpandedRecord] = useState(null);
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

    useEffect(() => {
        if (isOpen) {
            fetchHistory();
            setShowConfirmDelete(false);
            setExpandedRecord(null);
        }
    }, [isOpen]);

    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/audit_history`);
            const data = await response.json();
            if (data.status === 'success') {
                setHistory(data.data);
            }
        } catch (error) {
            console.error("Failed to fetch history:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteHistory = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/audit_history`, {
                method: 'DELETE'
            });
            if (response.ok) {
                setHistory([]);
                setShowConfirmDelete(false);
            }
        } catch (error) {
            console.error("Failed to delete history:", error);
        }
    };

    const toggleExpand = (idx) => {
        setExpandedRecord(expandedRecord === idx ? null : idx);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-in fade-in duration-200">

            {/* TACTICAL GRADIENT SCROLLBAR */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { 
                    background: rgba(0, 0, 0, 0.3); 
                    border-radius: 4px; 
                }
                .custom-scrollbar::-webkit-scrollbar-thumb { 
                    background: linear-gradient(to bottom, rgba(20, 184, 166, 0.6), rgba(220, 38, 38, 0.6)); 
                    border-radius: 4px; 
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { 
                    background: linear-gradient(to bottom, rgba(20, 184, 166, 1), rgba(220, 38, 38, 1)); 
                }
                .scrollbar-teal::-webkit-scrollbar { height: 6px; width: 6px; }
                .scrollbar-teal::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); border-radius: 4px; }
                .scrollbar-teal::-webkit-scrollbar-thumb { background: rgba(20, 184, 166, 0.4); border-radius: 4px; }
                .scrollbar-teal::-webkit-scrollbar-thumb:hover { background: rgba(20, 184, 166, 0.7); }
            `}</style>

            <div className="bg-bat-900 border border-bat-700 rounded-xl p-6 max-w-[95vw] w-full text-white font-mono shadow-[0_0_40px_rgba(20,184,166,0.1)] flex flex-col max-h-[90vh] relative overflow-hidden">

                {/* Header - Pinned */}
                <div className="flex justify-between items-center mb-6 border-b border-bat-700/50 pb-4 flex-shrink-0 relative z-10">
                    <h2 className="text-xl font-bold text-gray-200 flex items-center gap-3 tracking-widest uppercase">
                        <History className="w-6 h-6 text-neon-teal" />
                        System Audit Ledger
                    </h2>

                    <div className="flex items-center gap-3">
                        {history.length > 0 && !showConfirmDelete && (
                            <button
                                onClick={() => setShowConfirmDelete(true)}
                                className="flex items-center gap-2 text-red-500 hover:text-white bg-red-950/20 hover:bg-red-900/60 px-3 py-1.5 rounded-lg border border-red-900/30 transition-all duration-200 text-xs font-bold uppercase tracking-wider"
                            >
                                <Trash2 className="w-4 h-4" /> Purge Logs
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-white bg-bat-800/40 hover:bg-bat-800 p-1.5 rounded-lg border border-bat-700/30 transition-all duration-200"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* THE CONFIRMATION OVERLAY */}
                {showConfirmDelete && (
                    <div className="absolute inset-0 bg-bat-900/95 backdrop-blur-md z-20 flex flex-col items-center justify-center p-6 border border-red-900/50 rounded-xl">
                        <div className="w-16 h-16 rounded-full bg-red-950/50 flex items-center justify-center mb-4 border border-red-900/50 shadow-[0_0_30px_rgba(220,38,38,0.2)]">
                            <AlertTriangle className="w-8 h-8 text-red-500 animate-pulse" />
                        </div>
                        <h3 className="text-xl font-bold text-red-500 uppercase tracking-widest mb-2">Confirm Data Purge</h3>
                        <p className="text-gray-400 text-sm mb-8 max-w-md text-center leading-relaxed">
                            Are you sure you want to delete the system history? This action is irreversible and will wipe all recorded patches and diagnostic advisories from the engine's memory.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowConfirmDelete(false)}
                                className="px-6 py-2.5 bg-bat-800 hover:bg-bat-700 text-gray-300 font-bold rounded-lg transition-colors border border-bat-600 text-xs tracking-wider uppercase"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteHistory}
                                className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all shadow-[0_0_15px_rgba(220,38,38,0.4)] text-xs tracking-wider uppercase flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" /> Confirm Purge
                            </button>
                        </div>
                    </div>
                )}

                {/* Body - Scrollable */}
                <div className="flex-grow overflow-y-auto pr-2 space-y-4 custom-scrollbar relative z-10">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-32 text-neon-teal animate-pulse text-sm tracking-widest uppercase">
                            Accessing Secure Vault...
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center text-gray-500 py-12 text-sm uppercase tracking-widest flex flex-col items-center gap-3">
                            <History className="w-8 h-8 opacity-20" />
                            No historical audit records found.
                        </div>
                    ) : (
                        history.map((record, idx) => {
                            const isAdvisory = record.type === 'advisory';
                            const patch = !isAdvisory ? record.blueprint?.targeted_solutions?.[0] || {} : null;
                            const advisory = isAdvisory ? record.blueprint?.pipeline_advisories?.[0] || {} : null;
                            const isExpanded = expandedRecord === idx;

                            return (
                                <div key={idx} className={`bg-bat-800/30 border transition-all duration-300 p-4 rounded-lg flex flex-col gap-3 ${isExpanded ? 'border-neon-teal/40 bg-bat-800/60' : 'border-bat-700 hover:border-bat-600'}`}>

                                    {/* Card Header */}
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-[10px] text-gray-400 flex items-center gap-1.5 uppercase tracking-widest">
                                                <Clock className="w-3 h-3" />
                                                {new Date(record.timestamp).toLocaleString()}
                                            </span>
                                            <span className="font-bold text-sm text-gray-200 tracking-wider flex items-center gap-2">
                                                {record.repo_name || "Unknown Repository"}
                                                {isAdvisory && <span className="bg-neon-teal/10 text-neon-teal border border-neon-teal/30 px-2 py-0.5 rounded text-[9px] uppercase tracking-widest">Advisory</span>}
                                            </span>
                                        </div>

                                        <div className={`px-3 py-1 rounded text-[10px] font-bold tracking-wider flex items-center gap-1.5 uppercase ${record.action_taken === 'DEPLOYED' ? 'bg-neon-teal/10 text-neon-teal border border-neon-teal/30' : 'bg-red-950/30 text-red-500 border border-red-900/50'}`}>
                                            {record.action_taken === 'DEPLOYED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                            {record.action_taken}
                                        </div>
                                    </div>

                                    {/* Card Summary Line */}
                                    <div className="bg-black/40 border border-bat-700/50 p-3 rounded-md flex justify-between items-center">
                                        <div className="overflow-hidden pr-4">
                                            <div className="flex items-center gap-2 mb-1.5 text-xs font-bold text-neon-teal">
                                                {isAdvisory ? <Terminal className="w-4 h-4" /> : <FileCode2 className="w-4 h-4" />}
                                                <span className="truncate">{isAdvisory ? advisory.target_component : patch.file_path}</span>
                                            </div>
                                            <p className="text-xs text-gray-400 truncate">
                                                {isAdvisory ? advisory.failure_reason : patch.issue_resolved}
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => toggleExpand(idx)}
                                            className="shrink-0 flex items-center gap-1.5 bg-bat-700/50 hover:bg-bat-700 text-gray-300 px-3 py-1.5 rounded transition-colors text-[10px] font-bold uppercase tracking-widest border border-bat-600"
                                        >
                                            {isExpanded ? <><EyeOff className="w-3 h-3" /> Close</> : <><Eye className="w-3 h-3" /> Review</>}
                                        </button>
                                    </div>

                                    {/* EXPANDED DETAILS REVEAL */}
                                    {isExpanded && (
                                        <div className="mt-2 animate-in slide-in-from-top-2 fade-in duration-200">
                                            {isAdvisory ? (
                                                <div className="flex flex-col gap-4">
                                                    {/* ROOT CAUSE DIAGNOSIS (RED THEME) */}
                                                    <div className="bg-black/60 border border-red-900/30 p-4 rounded-md">
                                                        <h4 className="text-[10px] text-red-500 font-bold uppercase tracking-widest mb-2 border-b border-red-900/30 pb-2">Root Cause Diagnosis</h4>
                                                        <div className="text-sm text-gray-300 leading-relaxed">
                                                            <ReactMarkdown
                                                                components={{
                                                                    code({ node, className, children, ...props }) {
                                                                        const match = /language-(\w+)/.exec(className || '');
                                                                        const isBlock = match || String(children).includes('\n');

                                                                        return isBlock ? (
                                                                            <div className="bg-black/80 border border-red-900/40 rounded-lg p-4 my-4 overflow-x-auto shadow-inner scrollbar-red w-full">
                                                                                <code className="text-[13px] text-red-400 font-mono whitespace-pre leading-relaxed" {...props}>
                                                                                    {children}
                                                                                </code>
                                                                            </div>
                                                                        ) : (
                                                                            <code className="bg-red-500/10 text-red-400 px-1.5 py-0.5 mx-0.5 rounded text-[13px] font-mono border border-red-500/20" {...props}>
                                                                                {children}
                                                                            </code>
                                                                        );
                                                                    }
                                                                }}
                                                            >
                                                                {advisory.failure_reason}
                                                            </ReactMarkdown>
                                                        </div>
                                                    </div>

                                                    {/* DIAGNOSTIC RESOLUTION (NEON TEAL THEME) */}
                                                    <div className="bg-black/60 border border-neon-teal/30 p-4 rounded-md">
                                                        <h4 className="text-[10px] text-neon-teal font-bold uppercase tracking-widest mb-2 border-b border-neon-teal/30 pb-2">Diagnostic Resolution</h4>
                                                        <div className="text-sm text-gray-300 leading-relaxed">
                                                            <ReactMarkdown
                                                                components={{
                                                                    code({ node, className, children, ...props }) {
                                                                        const match = /language-(\w+)/.exec(className || '');
                                                                        const isBlock = match || String(children).includes('\n');

                                                                        return isBlock ? (
                                                                            <div className="bg-black/80 border border-neon-teal/30 rounded-lg p-4 my-4 overflow-x-auto shadow-inner scrollbar-teal w-full">
                                                                                <code className="text-[13px] text-neon-teal font-mono whitespace-pre leading-relaxed" {...props}>
                                                                                    {children}
                                                                                </code>
                                                                            </div>
                                                                        ) : (
                                                                            <code className="bg-neon-teal/10 text-neon-teal px-1.5 py-0.5 mx-0.5 rounded text-[13px] font-mono border border-neon-teal/20" {...props}>
                                                                                {children}
                                                                            </code>
                                                                        );
                                                                    }
                                                                }}
                                                            >
                                                                {advisory.recommended_fix}
                                                            </ReactMarkdown>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="bg-black/60 border border-red-900/30 rounded-md overflow-hidden flex flex-col">
                                                        <div className="bg-red-950/20 px-3 py-1.5 border-b border-red-900/30">
                                                            <span className="text-[9px] text-red-500 font-bold uppercase tracking-widest">Original Code</span>
                                                        </div>
                                                        <pre className="p-3 text-[10px] text-red-400/80 whitespace-pre-wrap">{patch.search_block}</pre>
                                                    </div>
                                                    <div className="bg-black/60 border border-neon-teal/30 rounded-md overflow-hidden flex flex-col">
                                                        <div className="bg-neon-teal/10 px-3 py-1.5 border-b border-neon-teal/30">
                                                            <span className="text-[9px] text-neon-teal font-bold uppercase tracking-widest">Applied Patch</span>
                                                        </div>
                                                        <pre className="p-3 text-[10px] text-neon-teal whitespace-pre-wrap">{patch.replace_block}</pre>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Action Link (If Deployed) */}
                                    {record.action_taken === 'DEPLOYED' && record.pr_url && (
                                        <div className="text-right mt-1">
                                            <a
                                                href={record.pr_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 text-[10px] text-neon-teal hover:text-white transition-colors uppercase tracking-widest font-bold"
                                            >
                                                View Live PR <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}