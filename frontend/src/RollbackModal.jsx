import React, { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, Eye, X, ShieldAlert, Terminal, Wrench, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function RollbackModal({ currentRepo }) {
    const [blueprint, setBlueprint] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    const [isDiscarding, setIsDiscarding] = useState(false);

    useEffect(() => {
        const checkVault = async () => {
            try {
                const response = await fetch('http://localhost:8000/api/v1/latest_blueprint');
                const data = await response.json();

                if (data.status === 'available' && data.data) {
                    const backendRepo = data.data.repo_name.toLowerCase();
                    const activeRepo = (currentRepo || "")
                        .replace("https://github.com/", "")
                        .replace(".git", "")
                        .toLowerCase();

                    if (backendRepo === activeRepo) {
                        setBlueprint(data.data);
                        if (!isOpen) {
                            setIsOpen(true);
                            setIsExpanded(false);
                        }
                    } else {
                        setIsOpen(false);
                    }
                } else {
                    setIsOpen(false);
                }
            } catch (error) {
                console.error("Nexus Engine Offline", error);
            }
        };

        const interval = setInterval(checkVault, 5000);
        return () => clearInterval(interval);
    }, [isOpen, currentRepo]);

    const handleDiscard = async () => {
        setIsDiscarding(true);
        try {
            const response = await fetch('http://localhost:8000/api/v1/discard_blueprint', {
                method: 'POST'
            });
            if (response.ok) {
                setIsOpen(false);
                setBlueprint(null);
                setIsExpanded(false);
            }
        } catch (error) {
            console.error("Failed to discard", error);
        } finally {
            setIsDiscarding(false);
        }
    };

    const handleDeploy = async () => {
        setIsDeploying(true);
        try {
            const response = await fetch('http://localhost:8000/api/v1/deploy_rollback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(blueprint)
            });

            if (response.ok) {
                setIsOpen(false);
                setBlueprint(null);
                setIsExpanded(false);
            } else {
                console.error("Failed to deploy rollback.");
            }
        } catch (error) {
            console.error("Network error during deployment", error);
        } finally {
            setIsDeploying(false);
        }
    };

    if (!isOpen || !blueprint) return null;

    const isAdvisory = blueprint.type === 'advisory';
    const patch = !isAdvisory ? blueprint.blueprint.targeted_solutions?.[0] : null;
    const advisory = isAdvisory ? blueprint.blueprint.pipeline_advisories?.[0] : null;

    if (!isExpanded) {
        return (
            <div className="fixed bottom-6 right-6 z-50 w-96 bg-bat-900 border border-bat-700 shadow-[0_0_20px_rgba(20,184,166,0.1)] rounded-xl overflow-hidden font-mono flex flex-col animate-in slide-in-from-bottom-5">
                <div className={`${isAdvisory ? 'bg-neon-teal/10 border-neon-teal/30' : 'bg-red-950/30 border-red-900/50'} border-b px-4 py-3 flex items-center justify-between`}>
                    <div className={`flex items-center gap-2 ${isAdvisory ? 'text-neon-teal' : 'text-red-500'} font-bold text-sm tracking-wider`}>
                        <AlertTriangle className="w-4 h-4 animate-pulse" />
                        {isAdvisory ? 'PIPELINE ADVISORY' : 'CRITICAL PIPELINE FAILURE'}
                    </div>
                    <button onClick={handleDiscard} disabled={isDiscarding} className="text-gray-500 hover:text-white transition-colors disabled:opacity-50">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-4">
                    <p className="text-gray-300 text-xs mb-2 leading-relaxed line-clamp-2">
                        {isAdvisory ? advisory.failure_reason : patch.issue_resolved}
                    </p>
                    <p className="text-gray-500 text-[10px] mb-4 truncate">
                        TARGET: <span className="font-bold text-gray-400">{isAdvisory ? advisory.target_component : patch.file_path}</span>
                    </p>

                    <div className="flex justify-end gap-3">
                        {!isAdvisory && (
                            <button
                                onClick={handleDiscard}
                                disabled={isDiscarding}
                                className="px-4 py-1.5 text-xs font-bold text-red-500 hover:text-white bg-red-950/30 hover:bg-red-900 border border-red-900/50 rounded transition-colors disabled:opacity-50"
                            >
                                {isDiscarding ? 'DISCARDING...' : 'DISCARD'}
                            </button>
                        )}
                        <button
                            onClick={() => setIsExpanded(true)}
                            className="px-4 py-1.5 text-xs font-bold text-black bg-neon-teal hover:brightness-110 shadow-[0_0_10px_rgba(20,184,166,0.3)] rounded transition-all flex items-center gap-2"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            {isAdvisory ? 'VIEW ADVISORY' : 'REVIEW PATCH'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-in fade-in duration-200">

            <style>{`
                .scrollbar-main::-webkit-scrollbar { width: 6px; }
                .scrollbar-main::-webkit-scrollbar-track { background: transparent; }
                .scrollbar-main::-webkit-scrollbar-thumb { background: rgba(55, 65, 81, 0.8); border-radius: 4px; }
                
                .scrollbar-red::-webkit-scrollbar { height: 6px; width: 6px; }
                .scrollbar-red::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); border-radius: 4px; }
                .scrollbar-red::-webkit-scrollbar-thumb { background: rgba(153, 27, 27, 0.6); border-radius: 4px; }
                .scrollbar-red::-webkit-scrollbar-thumb:hover { background: rgba(185, 28, 28, 0.8); }
                
                .scrollbar-teal::-webkit-scrollbar { height: 6px; width: 6px; }
                .scrollbar-teal::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); border-radius: 4px; }
                .scrollbar-teal::-webkit-scrollbar-thumb { background: rgba(20, 184, 166, 0.4); border-radius: 4px; }
                .scrollbar-teal::-webkit-scrollbar-thumb:hover { background: rgba(20, 184, 166, 0.7); }
            `}</style>

            <div className={`bg-bat-900 border ${isAdvisory ? 'border-neon-teal/50 shadow-[0_0_40px_rgba(20,184,166,0.15)]' : 'border-neon-teal/50 shadow-[0_0_40px_rgba(20,184,166,0.15)]'} rounded-xl p-6 max-w-[95vw] w-full text-white font-mono flex flex-col max-h-[90vh]`}>

                <div className="flex justify-between items-center mb-6 border-b border-bat-700/50 pb-4 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <ShieldAlert className={`w-6 h-6 ${isAdvisory ? 'text-neon-teal' : 'text-red-500'} animate-pulse`} />
                        <h2 className={`text-xl font-bold ${isAdvisory ? 'text-neon-teal' : 'text-red-500'} tracking-widest uppercase`}>
                            {isAdvisory ? 'Nexus Diagnostic Advisory' : 'Nexus Auto-Healing Protocol'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="bg-bat-800 border border-bat-700 text-gray-400 px-3 py-1 rounded text-xs font-bold tracking-wider">
                            PR: {blueprint.pr_number}
                        </span>

                        <button
                            onClick={() => setIsExpanded(false)}
                            className="text-gray-500 hover:text-white bg-bat-800/40 hover:bg-bat-800 p-1.5 rounded-lg border border-bat-700/30 transition-all duration-200"
                            title="Minimize to Dashboard"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 space-y-6 scrollbar-main">

                    {isAdvisory ? (
                        <>
                            <div className="bg-red-950/20 border border-red-900/40 p-5 rounded-lg shadow-inner">
                                <h3 className="text-red-500 text-xs uppercase tracking-widest mb-3 font-bold flex items-center gap-2">
                                    <Terminal className="w-4 h-4" /> Root Cause Diagnosis
                                </h3>
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
                                <p className="text-xs text-gray-500 mt-4 pt-3 border-t border-red-900/30 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                                    Target Component: <span className="text-gray-300 font-bold">{advisory.target_component}</span>
                                </p>
                            </div>

                            <div className="bg-neon-teal/10 border border-neon-teal/30 p-5 rounded-lg shadow-inner">
                                <h3 className="text-neon-teal text-xs uppercase tracking-widest mb-3 font-bold flex items-center gap-2">
                                    <Wrench className="w-4 h-4" /> Recommended Manual Fix
                                </h3>
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
                        </>
                    ) : (
                        <>
                            <div className="bg-bat-800/50 border border-bat-700 p-4 rounded-lg">
                                <h3 className="text-neon-teal text-xs uppercase tracking-widest mb-2 font-bold">Issue Diagnosed</h3>
                                <p className="text-xs text-gray-300 leading-relaxed">{patch.issue_resolved}</p>
                                <p className="text-xs text-gray-500 mt-3 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-neon-yellow rounded-full"></span>
                                    Target File: <span className="text-gray-300 font-bold">{patch.file_path}</span>
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-black/80 border border-red-900/50 rounded-lg flex flex-col overflow-hidden">
                                    <div className="bg-red-950/30 border-b border-red-900/50 px-4 py-2">
                                        <h4 className="text-red-500 text-[10px] uppercase tracking-widest font-bold">Original Code (Search Block)</h4>
                                    </div>
                                    <div className="overflow-x-auto scrollbar-red pb-2">
                                        <pre className="p-4 text-red-400/80 text-[11px] font-mono whitespace-pre-wrap break-words">{patch.search_block}</pre>
                                    </div>
                                </div>

                                <div className="bg-black/80 border border-neon-teal/30 rounded-lg flex flex-col overflow-hidden">
                                    <div className="bg-neon-teal/10 border-b border-neon-teal/30 px-4 py-2">
                                        <h4 className="text-neon-teal text-[10px] uppercase tracking-widest font-bold">AI Proposed Fix (Replace Block)</h4>
                                    </div>
                                    <div className="overflow-x-auto scrollbar-teal pb-2">
                                        <pre className="p-4 text-neon-teal text-[11px] font-mono whitespace-pre-wrap break-words">{patch.replace_block}</pre>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                </div>

                <div className="flex justify-end space-x-4 pt-6 border-t border-bat-700/50 mt-4 flex-shrink-0">
                    {isAdvisory ? (
                        <button
                            onClick={handleDiscard}
                            disabled={isDiscarding}
                            className="cursor-pointer px-6 py-2.5 bg-neon-teal hover:brightness-110 text-black font-bold rounded transition-all shadow-[0_0_15px_rgba(20,184,166,0.3)] hover:shadow-[0_0_25px_rgba(20,184,166,0.5)] flex items-center gap-2 disabled:opacity-50 text-xs tracking-wider"
                        >
                            {isDiscarding ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> DISMISSING...</>
                            ) : (
                                <><CheckCircle2 className="w-4 h-4" /> ACKNOWLEDGE & DISMISS</>
                            )}
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={handleDiscard}
                                disabled={isDeploying || isDiscarding}
                                className="cursor-pointer px-6 py-2.5 bg-red-950/20 hover:bg-red-900/40 border border-red-900/50 text-red-500 hover:text-red-400 font-bold rounded transition-colors disabled:opacity-50 text-xs tracking-wider flex items-center"
                            >
                                {isDiscarding ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> DISCARDING...</> : "DISCARD PATCH"}
                            </button>

                            <button
                                onClick={handleDeploy}
                                disabled={isDeploying || isDiscarding}
                                className="cursor-pointer px-6 py-2.5 bg-neon-teal hover:brightness-110 text-black font-bold rounded transition-all shadow-[0_0_15px_rgba(20,184,166,0.3)] hover:shadow-[0_0_25px_rgba(20,184,166,0.5)] flex items-center gap-2 disabled:opacity-50 text-xs tracking-wider"
                            >
                                {isDeploying ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> EXECUTING SURGERY...</>
                                ) : (
                                    "DEPLOY FIX TO GITHUB"
                                )}
                            </button>
                        </>
                    )}
                </div>

            </div>
        </div>
    );
}