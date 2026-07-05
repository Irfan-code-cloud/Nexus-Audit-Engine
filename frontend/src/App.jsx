import { useState, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, ShieldCheck, FileCode2, Loader2, XCircle, ShieldAlert, Hexagon, BrainCircuit, GitPullRequest, Bot, Copy, Pencil, Save, Zap, History, Book, ExternalLink, GitBranch, Link } from 'lucide-react'
import RollbackModal from './RollbackModal';
import AuditHistoryModal from './AuditHistoryModal';

function App() {
  const [contracts, setContracts] = useState(null)
  const [isAuditing, setIsAuditing] = useState(false)
  const [error, setError] = useState(null)
  const [auditStep, setAuditStep] = useState(0)

  // Validation States
  const [isValidating, setIsValidating] = useState(false)
  const [validationReport, setValidationReport] = useState(null)

  // PM Onboarding States
  const [repoUrl, setRepoUrl] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectMsg, setConnectMsg] = useState(null)
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [editingIndex, setEditingIndex] = useState(null) // NEW: Tracks the active edit block
  const [repoHistory, setRepoHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [isAuditLedgerOpen, setIsAuditLedgerOpen] = useState(false)

  // 1. On initial page load, check if we have saved data in localStorage
  useEffect(() => {
    const savedContracts = localStorage.getItem('batcomputer_audit_data');
    const savedRepo = localStorage.getItem('batcomputer_repo_url');
    const savedHistory = localStorage.getItem('batcomputer_repo_history'); // NEW

    if (savedContracts) {
      setContracts(JSON.parse(savedContracts));
    }
    if (savedRepo) {
      setRepoUrl(savedRepo);
    }
    if (savedHistory) {
      setRepoHistory(JSON.parse(savedHistory)); // NEW
    }
  }, []);

  // 2. Whenever 'contracts' state changes, save it!
  useEffect(() => {
    if (contracts) {
      localStorage.setItem('batcomputer_audit_data', JSON.stringify(contracts));
    }
  }, [contracts]);

  // 📋 Clipboard Handler
  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000); // Reset the checkmark after 2 seconds
  }

  // 🔗 The Repo Link Trigger with Radar Polling
  const handleConnect = async () => {
    setIsConnecting(true)
    // Show a yellow warning state while building
    setConnectMsg({ type: 'warning', text: `Compiling Vector Brain...` })

    setContracts(null);
    localStorage.removeItem('batcomputer_audit_data');

    try {
      // 1. Send the initial connect request to trigger the background worker
      await fetch('http://127.0.0.1:8000/api/v1/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: repoUrl })
      })

      // 2. Start the Radar Loop (Polling)
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('http://127.0.0.1:8000/api/v1/status');
          const statusData = await statusRes.json();

          // 3. Check if the lock is released!
          if (statusData.is_building === false) {
            clearInterval(pollInterval); // Stop the radar
            setIsConnecting(false);      // Turn off the loading state

            // Check if the backend reported an error during the build
            if (statusData.message.includes("Failed")) {
              setConnectMsg({ type: 'error', text: `${statusData.message.replace(/❌/g, '').trim()}` });
            } else {
              // Success! Show the sleek, short green text.
              setConnectMsg({ type: 'success', text: `Repository Successfully Connected` });

              // CRITICAL BUG FIX: Save the URL to local storage so the Push function doesn't send an empty string!
              localStorage.setItem('batcomputer_repo_url', repoUrl);

              // NEW: Save to History (Keep top 5, remove duplicates)
              const updatedHistory = [repoUrl, ...repoHistory.filter(url => url !== repoUrl)].slice(0, 5);
              setRepoHistory(updatedHistory);
              localStorage.setItem('batcomputer_repo_history', JSON.stringify(updatedHistory));
            }
          }
        } catch (pollErr) {
          clearInterval(pollInterval);
          setIsConnecting(false);
          setConnectMsg({ type: 'error', text: "Lost connection during build." });
        }
      }, 2000); // The radar pings exactly every 2000 milliseconds (2 seconds)

    } catch (err) {
      setConnectMsg({ type: 'error', text: "Backend offline." })
      setIsConnecting(false)
    }
  }

  // 🔍 The Deep Code Audit Trigger with Live Agent Tracking
  const handleAudit = async () => {
    setIsAuditing(true)
    setAuditStep(1) // Instantly light up the first agent
    setError(null)
    setContracts(null)
    setValidationReport(null)

    // Start the Radar Loop to track the AI Agents
    const auditInterval = setInterval(async () => {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/v1/status');
        const data = await res.json();
        // Update the UI if the backend has moved to a new step
        if (data.audit_step > 0) {
          setAuditStep(data.audit_step);
        }
      } catch (e) {
        // Silently ignore minor polling drops
      }
    }, 1000); // Ping every 1 second for fast UI updates

    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/audit', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setContracts(data.generated_contracts)

    } catch (err) {
      console.error("Audit failed:", err)
      setError("Engine Severed. Is your FastAPI server running?")
    } finally {
      clearInterval(auditInterval) // Stop the radar
      setAuditStep(0)              // Reset the tracker
      setIsAuditing(false)         // Stop the loading state
    }
  }

  // 🚀 Phase 4: Push to Repo Workflow
  const handlePushToRepo = async () => {
    setIsValidating(true)
    setValidationReport(null)

    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // UPDATED: Now we send both the AI contracts AND the dynamic repo URL
        body: JSON.stringify({
          blueprint: contracts,
          repo_url: repoUrl
        })
      })
      const data = await response.json()

      setValidationReport({
        success: data.success,
        logs: [
          { status: data.success ? "success" : "error", test: "GitHub API Connection", details: "Authenticating token." },
          { status: data.success ? "success" : "error", test: "Branch Creation", details: "Isolating code environment." },
          { status: data.success ? "success" : "error", test: "Pull Request Opened", details: data.url ? data.url : data.message?.replace(/❌/g, '').trim() }
        ],
        url: data.url
      })
    } catch (err) {
      console.error("Push failed:", err)
      setValidationReport({ success: false, logs: [{ status: "error", test: "Network Error", details: "Could not reach backend." }] })
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="min-h-screen bg-bat-900 text-gray-300 font-mono p-6 flex flex-col">
      {/* Modals */}
      <RollbackModal currentRepo={repoUrl} />
      <AuditHistoryModal
        isOpen={isAuditLedgerOpen}
        onClose={() => setIsAuditLedgerOpen(false)}
      />
      {/* Header */}
      <header className="border-b border-bat-700/50 pb-4 mb-8 flex justify-between items-end max-w-[95vw] mx-auto w-full">
        <div className="flex items-center gap-5">
          {/* UPGRADED: Layered Tactical Hardware Node */}
          <div className="relative bg-bat-800/80 p-4 rounded-xl border border-bat-700 shadow-[0_0_20px_rgba(20,184,166,0.15)] flex items-center justify-center group">
            {/* Outer Shell */}
            <Hexagon className="w-8 h-8 text-neon-teal/40 group-hover:text-neon-teal transition-colors duration-500" strokeWidth={1.5} />
            {/* Inner Glowing Core */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-neon-teal rounded-full shadow-[0_0_12px_rgba(20,184,166,1)] animate-pulse"></div>
            </div>
          </div>

          <div className="flex flex-col justify-center">
            {/* UPGRADED: Emphasized Delimiters and Weighted Text */}
            <h1 className="text-3xl font-bold tracking-widest uppercase flex items-center gap-4">
              <span className="text-gray-100 drop-shadow-[0_2px_15px_rgba(255,255,255,0.15)]">NEXUS</span>
              <span className="text-neon-teal text-xl opacity-80">//</span>
              <span className="text-gray-400 text-xl font-medium tracking-[0.15em]">DEEP AUDIT</span>
            </h1>

            {/* UPGRADED: Monospace Terminal Readout */}
            <div className="font-mono text-[9px] mt-1 uppercase tracking-[0.3em] text-neon-teal/60 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-neon-teal/40 rounded-sm"></span>
              Autonomous Security & QA Pipeline
            </div>
          </div>

          {/* NEW: THE AUDIT LEDGER TRIGGER */}
          <button
            onClick={() => setIsAuditLedgerOpen(true)}
            className="cursor-pointer ml-8 flex items-center gap-2 px-4 py-2 bg-bat-800/40 hover:bg-bat-700/60 border border-bat-700 rounded text-gray-400 hover:text-neon-teal transition-all duration-200 font-mono text-sm uppercase tracking-widest group"
          >
            <History className="w-4 h-4 group-hover:animate-spin-slow" />
            System Ledger
          </button>
        </div>

        {/* Repository Connections - LOCKED WIDTH CONTAINER */}
        <div className="flex flex-col items-end gap-4 w-[380px]">

          {/* Main Control Block: Stacked vertically, taking full width of the 380px container */}
          <div className="flex flex-col items-start gap-1 w-full">

            {/* 1. Status Message (Locked directly above the input) */}
            <div className="h-4 pl-1">
              {connectMsg && (
                <span className={`text-[13px] font-bold flex items-center gap-1.5 ${connectMsg.type === 'success' ? 'text-neon-teal' :
                  connectMsg.type === 'warning' ? 'text-neon-yellow' : 'text-neon-red'
                  }`}>
                  {connectMsg.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {connectMsg.type === 'warning' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {connectMsg.type === 'error' && <XCircle className="w-3.5 h-3.5" />}

                  {/* TRUNCATE LONG INSTALL ERRORS TO KEEP HEADER CLEAN */}
                  {connectMsg.type === 'error' && connectMsg.text.includes('installed')
                    ? 'Connection Refused'
                    : connectMsg.text}
                </span>
              )}
            </div>

            {/* 2. Input and Connect Button Row */}
            <div className="flex items-center gap-2 w-full">
              {/* WRAP THE INPUT IN A RELATIVE DIV FOR THE DROPDOWN */}
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Paste GitHub URL..."
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onFocus={() => setShowHistory(true)}
                  onBlur={() => setTimeout(() => setShowHistory(false), 200)}
                  // Changed: Removed w-64, added w-full to perfectly fill the flex-1 space
                  className="w-full px-3 py-1.5 rounded-md bg-bat-800 border border-bat-700/50 text-sm text-gray-300 focus:outline-none focus:border-neon-teal placeholder-gray-600 shadow-inner"
                />

                {/* THE FLOATING HISTORY DROPDOWN */}
                {showHistory && repoHistory.length > 0 && (
                  <div className="absolute top-full mt-1.5 w-full bg-bat-800 border border-bat-700/50 rounded-md shadow-xl z-50 overflow-hidden">
                    <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-gray-500 bg-bat-900/80 border-b border-bat-700/50 flex items-center gap-1.5 font-bold">
                      <History className="w-3 h-3" /> Recent Repositories
                    </div>
                    <div className="flex flex-col">
                      {repoHistory.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setRepoUrl(url);
                            setShowHistory(false);
                          }}
                          className="cursor-pointer w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-bat-700 hover:text-neon-teal transition-colors flex items-center gap-2 truncate"
                        >
                          <Book className="w-3.5 h-3.5 shrink-0 text-gray-500" />
                          <span className="truncate">{url.replace('https://github.com/', '')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleConnect}
                disabled={isConnecting || !repoUrl}
                // Changed: Added strict w-[110px] and flex justify-center so text changes do not alter the button size
                className={`cursor-pointer w-[110px] flex justify-center px-3 py-1.5 rounded-md font-bold uppercase tracking-wider transition-all text-sm ${isConnecting || !repoUrl
                  ? 'bg-bat-700 text-gray-500 cursor-not-allowed'
                  : 'bg-bat-800 text-neon-teal border border-neon-teal/50 hover:bg-neon-teal hover:text-black'
                  }`}
              >
                {isConnecting ? 'Syncing...' : 'Connect'}
              </button>
            </div>

            {/* 3. Helper Text */}
            <span className="text-[10px] text-gray-500 pl-1 mt-0.5">
              Engine blocked? <a href="https://github.com/apps/batcomputer-deep-audit-engine/installations/new" target="_blank" rel="noreferrer" className="text-neon-teal hover:underline inline-flex items-center gap-1"><ExternalLink className="w-2.5 h-2.5" /> Install Nexus GitHub App</a>
            </span>
          </div>

          <button
            onClick={handleAudit}
            disabled={isAuditing || isConnecting || !connectMsg || connectMsg.type !== 'success'}
            // Changed: Removed max-w-[344px], ensuring it stretches to the full width of the w-[380px] parent
            className={`cursor-pointer px-4 py-1.5 rounded-md font-bold uppercase tracking-wider transition-all duration-300 text-sm flex items-center justify-center gap-2 w-full ${isAuditing || isConnecting || !connectMsg || connectMsg.type !== 'success'
              ? 'bg-bat-700 text-gray-500 cursor-not-allowed'
              : 'bg-neon-teal text-black shadow-[0_0_10px_rgba(20,184,166,0.3)] hover:brightness-100 hover:shadow-[0_0_15px_rgba(20,184,166,0.4)]'
              }`}
          >
            {isAuditing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Auditing...
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                Run Deep Code Audit
              </>
            )}
          </button>
        </div>
      </header >

      {/* --- NEW: QUICK START ONBOARDING BANNER --- */}
      {
        !contracts && !isAuditing && (
          <div className="max-w-[95vw] mx-auto w-full mb-6">
            <div className="bg-bat-800/40 border border-bat-700/50 rounded-lg p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center justify-between w-full px-4">

                {/* Step 1 */}
                <div className="flex items-center gap-4.5">
                  <div className="bg-bat-700/50 p-2.5 rounded-lg border border-bat-700 shadow-inner flex items-center justify-center">
                    {/* Bulletproof Inline SVG replacing the Lucide import */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-300"
                    >
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                      <path d="M9 18c-4.51 2-5-2-7-2" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-200 uppercase tracking-wider mb-0.5">1. Authorize Engine</p>
                    <a
                      href="https://github.com/apps/batcomputer-deep-audit-engine/installations/new"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-neon-teal hover:text-teal-400 hover:underline inline-flex items-center gap-1 transition-colors"
                    >
                      Install Nexus GitHub App on Target repos <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                <div className="w-12 h-px bg-bat-700/80 hidden md:block"></div>

                {/* Step 2 */}
                <div className="flex items-center gap-4.5">
                  <div className="bg-bat-700/50 p-2.5 rounded-lg border border-bat-700 shadow-inner">
                    <Link className="w-5 h-5 text-gray-300" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-200 uppercase tracking-wider mb-0.5">2. Connect Repository</p>
                    <p className="text-[10px] text-gray-500">Paste the URL and sync the Vector Brain.</p>
                  </div>
                </div>

                <div className="w-12 h-px bg-bat-700/80 hidden md:block"></div>

                {/* Step 3 */}
                <div className="flex items-center gap-4.5">
                  <div className="bg-neon-teal/10 p-2.5 rounded-lg border border-neon-teal/30 shadow-[0_0_10px_rgba(20,184,166,0.1)]">
                    <Zap className="w-5 h-5 text-neon-teal" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neon-teal uppercase tracking-wider mb-0.5">3. Execute Audit</p>
                    <p className="text-[10px] text-gray-500">Run the agents to generate live PRs.</p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )
      }

      {/* Main Container - Centered and Focused */}
      <div className="max-w-[95vw] mx-auto w-full flex-grow flex flex-col gap-6">

        {error && (
          <div className="bg-neon-red/10 border border-neon-red/50 text-neon-red p-4 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Unified Audit Blueprint Container */}
        <div className="bg-bat-800 border border-bat-700/50 rounded-xl p-6 shadow-lg flex flex-col flex-grow">
          <h2 className="text-sm uppercase tracking-wider text-gray-400 font-bold mb-4 border-b border-bat-700/50 pb-3 flex justify-between items-center">
            <span>Autonomous PR Drafts & Tech Debt Report</span>
            {contracts && (
              <span className="text-[10px] bg-neon-teal/20 text-neon-teal px-2 py-1 rounded-lg border border-neon-teal/50">
                AUDIT COMPLETE
              </span>
            )}
          </h2>

          <div className="bg-bat-900 p-6 rounded-lg border border-bat-700/40 font-mono text-sm text-green-400 flex-grow shadow-inner">
            {isAuditing ? (
              <div className="flex flex-col gap-5 p-4 font-mono text-sm bg-bat-900/50 rounded-lg border border-bat-700/30">

                {/* Step 1: Auditor Agent */}
                <div className={`flex items-center gap-4 transition-colors duration-300 ${auditStep === 1 ? 'text-neon-yellow' : auditStep > 1 ? 'text-neon-teal' : 'text-gray-600'}`}>
                  <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                    {auditStep === 1 ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : auditStep > 1 ? (
                      <CheckCircle2 className="w-4.5 h-4.5" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-600"></div>
                    )}
                  </div>
                  <span className={`${auditStep === 1 ? 'font-bold' : ''}`}>
                    [TIER 1] Auditor Agent: Scanning AST and retrieving vulnerabilities...
                  </span>
                </div>

                {/* Step 2: Architect Agent */}
                <div className={`flex items-center gap-4 transition-colors duration-300 ${auditStep === 2 ? 'text-neon-yellow' : auditStep > 2 ? 'text-neon-teal' : 'text-gray-600'}`}>
                  <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                    {auditStep === 2 ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : auditStep > 2 ? (
                      <CheckCircle2 className="w-4.5 h-4.5" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-600"></div>
                    )}
                  </div>
                  <span className={`${auditStep === 2 ? 'font-bold' : ''}`}>
                    [TIER 2] Architect Agent: Drafting complex code patches...
                  </span>
                </div>

                {/* Step 3: QA Agent */}
                <div className={`flex items-center gap-4 transition-colors duration-300 ${auditStep === 3 ? 'text-neon-yellow' : auditStep > 3 ? 'text-neon-teal' : 'text-gray-600'}`}>
                  <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                    {auditStep === 3 ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : auditStep > 3 ? (
                      <CheckCircle2 className="w-4.5 h-4.5" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-600"></div>
                    )}
                  </div>
                  <span className={`${auditStep === 3 ? 'font-bold' : ''}`}>
                    [TIER 3] QA Agent: Validating structural integrity and byte-for-byte matching...
                  </span>
                </div>

              </div>
            ) : contracts ? (
              contracts.targeted_solutions?.length === 0 ? (
                // NEW: The Enterprise "All Clear" Shield
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-bat-800/30 rounded-xl border border-neon-teal/20 h-full shadow-[inset_0_0_20px_rgba(20,184,166,0.05)]">
                  <div className="w-16 h-16 rounded-full bg-neon-teal/10 flex items-center justify-center mb-4 border border-neon-teal/40 shadow-[0_0_25px_rgba(20,184,166,0.3)]">
                    <ShieldCheck className="w-8 h-8 text-neon-teal" />
                  </div>
                  <h3 className="text-neon-teal font-bold text-lg uppercase tracking-widest mb-2">Zero Vulnerabilities Detected</h3>
                  <p className="text-gray-400 text-sm max-w-md leading-relaxed">
                    {contracts.tech_debt_flags?.architectural_note || "The deep audit verified structural integrity. No automated patches required."}
                  </p>
                </div>
              ) : (
                // EXISTING: The diff mapping logic for when bugs ARE found
                <div className="flex flex-col gap-6">
                  {contracts.targeted_solutions?.map((sol, idx) => (
                    <div key={idx} className="bg-bat-800/50 border border-bat-700/40 rounded-xl p-5 shadow-sm">
                      <div className="flex justify-between items-start mb-3 border-b border-bat-700/50 pb-3">
                        <span className="font-mono text-neon-teal text-sm flex items-center gap-2">
                          <FileCode2 className="w-4 h-4" /> {sol.file_path}
                        </span>
                        <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider ${sol.impact_level === 'CRITICAL' ? 'bg-neon-red/10 text-neon-red border border-neon-red/30' :
                          sol.impact_level === 'HIGH' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30' :
                            'bg-neon-yellow/10 text-neon-yellow border border-neon-yellow/30'
                          }`}>
                          {sol.impact_level}
                        </span>
                      </div>

                      <h4 className="text-gray-200 font-normal text-sm tracking-wide mb-2">{sol.issue_resolved}</h4>
                      <p className="text-gray-200 text-sm mb-4 leading-relaxed">{sol.analysis}</p>

                      {sol.qa_intervention_note && (
                        <div className="mb-4 p-4 bg-neon-teal/10 border-l-4 border-neon-teal rounded-r-lg text-sm text-neon-teal flex gap-2 items-start">
                          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-bold uppercase tracking-wider block mb-0.5">QA Agent Verification</span>
                            <span className="text-gray-300 opacity-90">{sol.qa_intervention_note}</span>
                          </div>
                        </div>
                      )}

                      <div className="bg-black/40 p-4 rounded-lg border border-bat-700/30 overflow-x-auto mt-4">
                        {/* The Toolbar Header */}
                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-bat-700/50">
                          <div className="text-[10px] text-gray-500 font-sans uppercase tracking-widest">Search & Replace Diff</div>

                          <div className="flex items-center gap-2">
                            {/* The Edit/Save Toggle Button */}
                            <button
                              onClick={() => setEditingIndex(editingIndex === idx ? null : idx)}
                              title={editingIndex === idx ? "Save Changes" : "Edit Patch"}
                              className={`cursor-pointer p-1.5 rounded transition-colors border ${editingIndex === idx
                                ? 'bg-neon-yellow/20 text-neon-yellow border-neon-yellow/50 hover:bg-neon-yellow/30'
                                : 'bg-bat-800 text-gray-400 hover:text-white hover:bg-bat-700 border-bat-700/50'
                                }`}
                            >
                              {editingIndex === idx ? <Save className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                            </button>

                            <button
                              onClick={() => handleCopy(sol.replace_block, idx)}
                              title="Copy new code to Clipboard"
                              className="cursor-pointer p-1.5 rounded bg-bat-800 text-gray-400 hover:text-white hover:bg-bat-700 transition-colors border border-bat-700/50"
                            >
                              {copiedIndex === idx ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-neon-teal" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* The Code Blocks (Original Neon Colors Restored) */}
                        <div className="overflow-x-auto">
                          {/* Red Block: Old Code */}
                          <pre className="text-neon-red font-mono text-sm leading-relaxed whitespace-pre-wrap break-words mb-1.5 border-l-2 border-neon-red py-2 pl-3 bg-neon-red/5">
                            - {sol.search_block}
                          </pre>

                          {/* Green Block: Toggle between Display (<pre>) and Edit (<textarea>) */}
                          {editingIndex === idx ? (
                            <textarea
                              value={sol.replace_block}
                              onChange={(e) => {
                                const updatedContracts = { ...contracts };
                                updatedContracts.targeted_solutions[idx].replace_block = e.target.value;
                                setContracts(updatedContracts);
                              }}
                              // Guarantees at least 4 rows of breathing room for editing
                              rows={Math.max(sol.replace_block.split('\n').length, 4)}
                              // Removed overflow-hidden/resize-none. Added overflow-auto, resize-y, and min-h
                              className="w-full text-neon-teal font-mono text-sm leading-relaxed border-l-2 border-neon-yellow py-2 pl-3 bg-neon-teal/10 outline-none focus:bg-neon-teal/20 overflow-auto resize-y min-h-[120px]"
                              spellCheck="false"
                            />
                          ) : (
                            /* Green Block: Removed min-w-max, added break-words */
                            <pre className="text-neon-teal font-mono text-sm leading-relaxed whitespace-pre-wrap break-words border-l-2 border-neon-teal py-2 pl-3 bg-neon-teal/5 w-full">
                              + {sol.replace_block}
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {contracts.tech_debt_flags?.architectural_note && (
                    <div className="mt-2 p-4 rounded-lg bg-neon-yellow/5 border border-neon-yellow/20">
                      <h4 className="text-neon-yellow font-bold text-sm uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Architectural Tech Debt
                      </h4>
                      <p className="text-gray-400 text-sm">{contracts.tech_debt_flags.architectural_note}</p>
                    </div>
                  )}
                </div>
              )
            ) : connectMsg?.type === 'error' && connectMsg.text.includes('installed') ? (

              // NEW: THE CENTERED "ACCESS DENIED" TAKEOVER CARD
              <div className="flex flex-col items-center justify-center h-full py-12 px-4">
                <div className="bg-neon-red/5 border border-neon-red/30 p-8 rounded-xl max-w-lg w-full text-center shadow-[0_0_30px_rgba(244,63,94,0.05)] relative overflow-hidden">
                  {/* Background Glow Effect */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-neon-red/20 blur-[50px] rounded-full pointer-events-none"></div>

                  <div className="w-16 h-16 rounded-full bg-neon-red/10 flex items-center justify-center mx-auto mb-5 border border-neon-red/20 shadow-inner relative z-10">
                    <ShieldAlert className="w-8 h-8 text-neon-red" />
                  </div>

                  <h3 className="text-neon-red font-bold text-lg uppercase tracking-widest mb-3 relative z-10">Access Denied</h3>
                  <p className="text-gray-400 text-sm leading-relaxed mb-8 relative z-10">
                    The Nexus engine cannot connect to this repository. The required structural permissions are missing. You must authorize the engine on GitHub to proceed.
                  </p>

                  <a
                    href="https://github.com/apps/batcomputer-deep-audit-engine/installations/new"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 bg-neon-red/10 text-neon-red border border-neon-red/50 hover:bg-neon-red hover:text-black font-bold py-3 px-6 rounded-lg transition-all uppercase tracking-wide text-sm w-full shadow-[0_0_15px_rgba(244,63,94,0.2)] relative z-10"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Authorize Repository
                  </a>
                </div>
              </div>

            ) : (

              // EXISTING: The Default 3-Card Welcome Screen
              <div className="flex flex-col items-center justify-center h-full py-8">
                <div className="text-center mb-10">
                  <h3 className="text-xl font-bold text-gray-200 tracking-wider uppercase mb-2">Initialize Security Pipeline</h3>
                  <p className="text-gray-500 text-sm max-w-lg mx-auto">
                    Connect a repository to allow the Nexus engine to map dependencies, detect vulnerabilities, and autonomously deploy structural patches.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
                  {/* Card 1 */}
                  <div className="bg-bat-900/50 border border-bat-700/50 p-6 rounded-xl hover:border-neon-teal/30 transition-colors">
                    <BrainCircuit className="w-8 h-8 text-neon-teal mb-4" />
                    <h4 className="text-gray-200 font-bold text-sm uppercase tracking-wider mb-2">1. Vector Brain Mapping</h4>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      The engine pulls your codebase into memory, chunking files and mapping AST dependencies using a FAISS vector database to understand the blast radius of potential bugs.
                    </p>
                  </div>

                  {/* Card 2 */}
                  <div className="bg-bat-900/50 border border-bat-700/50 p-6 rounded-xl hover:border-neon-teal/30 transition-colors">
                    <Bot className="w-8 h-8 text-neon-teal mb-4" />
                    <h4 className="text-gray-200 font-bold text-sm uppercase tracking-wider mb-2">2. Multi-Agent Audit</h4>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      A three-tier AI pipeline activates. The Auditor hunts for vulnerabilities, the Architect drafts secure patches, and the QA Agent strictly enforces byte-for-byte structural integrity.
                    </p>
                  </div>

                  {/* Card 3 */}
                  <div className="bg-bat-900/50 border border-bat-700/50 p-6 rounded-xl hover:border-neon-teal/30 transition-colors">
                    <GitPullRequest className="w-8 h-8 text-neon-teal mb-4" />
                    <h4 className="text-gray-200 font-bold text-sm uppercase tracking-wider mb-2">3. Autonomous Pull Requests</h4>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      Approved patches are instantly pushed to an isolation branch. The engine automatically opens a GitHub Pull Request, allowing your team to review and merge the fixes with one click.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handlePushToRepo}
            disabled={!contracts || contracts.targeted_solutions?.length === 0 || isValidating}
            className={`mt-6 w-full font-bold py-3 px-4 rounded-lg transition-all duration-300 uppercase tracking-wide text-sm flex items-center justify-center gap-2 ${(!contracts || contracts.targeted_solutions?.length === 0)
              ? 'bg-bat-700/50 text-gray-500 cursor-not-allowed border border-bat-700'
              : isValidating
                ? 'bg-neon-teal text-black shadow-[0_0_15px_rgba(20,184,166,0.4)] brightness-110 cursor-not-allowed'
                // UPGRADED: Removed hover:bg-teal-400, added brightness and glowing shadow
                : 'bg-neon-teal text-black shadow-[0_0_15px_rgba(20,184,166,0.3)] hover:brightness-110 hover:shadow-[0_0_25px_rgba(20,184,166,0.5)] cursor-pointer'
              }`}
          >
            {isValidating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Pull Request...
              </>
            ) : (
              <>
                <GitPullRequest className="w-4 h-4" />
                Merge & Open Pull Request
              </>
            )}
          </button>

          {validationReport && (
            <div className={`mt-5 p-5 rounded-xl border shadow-lg ${validationReport.success ? 'bg-neon-teal/5 border-neon-teal/30' : 'bg-neon-red/5 border-neon-red/30'}`}>
              <h3 className={`font-bold text-sm flex items-center gap-2 uppercase tracking-wider mb-3 ${validationReport.success ? 'text-neon-teal' : 'text-neon-red'}`}>
                {validationReport.success ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                {validationReport.success ? 'Status: All Green. PR Initiated.' : 'Status: Red. PR Blocked.'}
              </h3>
              <div className="text-sm text-gray-300 space-y-2">
                {validationReport.logs?.map((log, idx) => (
                  <div key={idx} className="flex flex-col border-b border-bat-700/40 pb-2 mb-1 last:border-0 last:pb-0">
                    <span className="font-medium text-gray-200 text-sm flex items-center gap-2">
                      {log.status === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-neon-teal" /> : <XCircle className="w-3.5 h-3.5 text-neon-red" />}
                      {log.test}
                    </span>
                    <span className="text-sm text-gray-500 ml-5.5">{log.details}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* --- NEW: TACTICAL FOOTER WITH RAW SVGS --- */}
      <footer className="mt-12 border-t border-bat-700/50 pt-6 pb-2 max-w-[95vw] mx-auto w-full flex flex-col md:flex-row justify-between items-center gap-4">

        {/* Left Side: System Readout */}
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-neon-teal rounded-full animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.8)]"></div>
          <span className="font-mono text-[11px] text-gray-500 uppercase tracking-widest">
            System Authenticated: Irfan Khattak // Lead Engineer
          </span>
        </div>

        {/* Right Side: Professional Comm-Links */}
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/Irfan-code-cloud"
            target="_blank"
            rel="noreferrer"
            className="text-gray-500 hover:text-neon-teal transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] rounded-full p-1"
            title="GitHub Profile"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
              <path d="M9 18c-4.51 2-5-2-7-2" />
            </svg>
          </a>

          <a
            href="https://www.linkedin.com/in/irfan-khattak-00b847251"
            target="_blank"
            rel="noreferrer"
            className="text-gray-500 hover:text-neon-teal transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] rounded-full p-1"
            title="LinkedIn Network"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
              <rect width="4" height="12" x="2" y="9" />
              <circle cx="4" cy="4" r="2" />
            </svg>
          </a>

          <a
            href="https://www.irfankhattak.com/"
            target="_blank"
            rel="noreferrer"
            className="text-gray-500 hover:text-neon-teal transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] rounded-full p-1"
            title="Digital Portfolio"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              <path d="M2 12h20" />
            </svg>
          </a>

          <a
            href="mailto:ifnkhattak@outlook.com"
            className="text-gray-500 hover:text-neon-teal transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] rounded-full p-1"
            title="Secure Comms (Email)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </a>
        </div>
      </footer>
    </div >
  )
}

export default App