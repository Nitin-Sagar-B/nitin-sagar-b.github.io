const terminalHistory = document.getElementById('terminal-history');
const typewriterElement = document.getElementById('typewriter');
const promptDir = document.getElementById('prompt-dir');
const terminalViewport = document.getElementById('terminal-viewport');

// Guard against missing critical elements
if (!terminalHistory || !typewriterElement || !promptDir || !terminalViewport) {
    console.error('[AgentOS] Critical DOM elements missing. Aborting boot sequence.');
}

// ==========================================
// BOOT SEQUENCE
// ==========================================
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const narrowScreen = window.matchMedia('(max-width: 800px)');
const sidebarItems = [...document.querySelectorAll('.sidebar a[data-index]')];

function initBootSequence() {
    const bootScreen = document.getElementById('boot-screen');
    const skip = document.getElementById('skip-intro');
    const replay = document.getElementById('replay-intro');
    const terminal = document.querySelector('.ide-container');
    let bootTimer;
    let previousFocus;

    function finishBoot() {
        clearTimeout(bootTimer);
        bootScreen.hidden = true;
        terminal.inert = false;
        const focusTarget = previousFocus?.isConnected ? previousFocus : tabBash;
        focusTarget.focus({ preventScroll: true });
    }

    function showBoot() {
        previousFocus = document.activeElement === document.body ? null : document.activeElement;
        terminal.inert = true;
        bootScreen.hidden = false;
        skip.focus();
        bootTimer = setTimeout(finishBoot, 3200);
    }

    skip.addEventListener('click', finishBoot);
    bootScreen.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') finishBoot();
        if (event.key === 'Tab') event.preventDefault();
    });
    replay.addEventListener('click', showBoot);

    let seen = false;
    try {
        seen = sessionStorage.getItem('abstractos-booted') === '1';
        sessionStorage.setItem('abstractos-booted', '1');
    } catch {
        // The intro still runs when storage is unavailable.
    }
    if (!seen && !location.hash && !reducedMotion.matches) showBoot();
}

// ==========================================
// CYBER AUDIO ENGINE
// ==========================================
class CyberAudioEngine {
    constructor() {
        this.ctx = null;
        this.enabled = false;
        this.ambientOsc = null;
        this.ambientGain = null;
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
        this.startAmbientHum();
    }

    toggle() {
        if (!this.ctx) this.init();
        if (this.enabled) {
            this.ctx.suspend();
            this.enabled = false;
        } else {
            this.ctx.resume();
            this.enabled = true;
        }
        return this.enabled;
    }

    playTyping() {
        if (!this.enabled || !this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.02; // very short 20ms click
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    playBeep() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    startAmbientHum() {
        if (!this.ctx) return;
        this.ambientOsc = this.ctx.createOscillator();
        this.ambientOsc.type = 'sawtooth';
        this.ambientOsc.frequency.value = 55;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.value = 0.015; // ultra quiet background hum

        this.ambientOsc.connect(filter);
        filter.connect(this.ambientGain);
        this.ambientGain.connect(this.ctx.destination);
        this.ambientOsc.start();
    }
}
const audioEngine = new CyberAudioEngine();

// UI Bindings
const audioToggleBtn = document.getElementById('audio-toggle');
if (audioToggleBtn) {
    audioToggleBtn.addEventListener('click', () => {
        const isNowOn = audioEngine.toggle();
        audioToggleBtn.setAttribute('aria-pressed', String(isNowOn));
        document.getElementById('audio-status').textContent = isNowOn ? "ON" : "OFF";
        document.getElementById('audio-icon').className = isNowOn ? "fas fa-volume-up" : "fas fa-volume-mute";
        audioToggleBtn.style.color = isNowOn ? "var(--success)" : "var(--text-muted)";
    });
}

const telToggleBtn = document.getElementById('tel-toggle');
const telSidebar = document.getElementById('telemetry-sidebar');
const mobileOverlay = document.getElementById('mobile-overlay');
const sidebarEl = document.querySelector('.sidebar');
const mobileNavBtn = document.getElementById('mobile-nav-toggle');

function setTelemetry(open) {
    telSidebar.style.display = open ? '' : 'none';
    telSidebar.classList.toggle('open', open);
    telSidebar.inert = !open;
    telToggleBtn.setAttribute('aria-expanded', String(open));
    telToggleBtn.style.color = open ? 'var(--success)' : 'var(--accent-primary)';
    if (open) startTelemetryLoop();
    else stopTelemetryLoop();
    updateMobileOverlay();
}

function setExplorer(open, restoreFocus = false) {
    sidebarEl.classList.toggle('mobile-open', open);
    sidebarEl.inert = narrowScreen.matches && !open;
    mobileNavBtn.setAttribute('aria-expanded', String(open));
    updateMobileOverlay();
    if (restoreFocus) mobileNavBtn.focus({ preventScroll: true });
}

function updateMobileOverlay() {
    const covered = narrowScreen.matches &&
        (sidebarEl.classList.contains('mobile-open') || telSidebar.classList.contains('open'));
    terminalMain.inert = covered;
    mobileOverlay.classList.toggle('active', covered);
}

telSidebar.inert = true;
sidebarEl.inert = narrowScreen.matches;
narrowScreen.addEventListener('change', () => {
    if (narrowScreen.matches && sidebarEl.contains(document.activeElement)) mobileNavBtn.focus();
    setExplorer(false);
});

telToggleBtn.addEventListener('click', () => {
    const open = !telSidebar.classList.contains('open');
    if (open && narrowScreen.matches) setExplorer(false);
    setTelemetry(open);
});

mobileNavBtn.addEventListener('click', () => {
    const open = !sidebarEl.classList.contains('mobile-open');
    if (open) setTelemetry(false);
    setExplorer(open);
    if (open) sidebarEl.querySelector('.quick-profile').focus({ preventScroll: true });
});

function closeMobileSheets() {
    if (sidebarEl.classList.contains('mobile-open')) setExplorer(false, true);
    if (narrowScreen.matches && telSidebar.classList.contains('open')) {
        setTelemetry(false);
        telToggleBtn.focus({ preventScroll: true });
    }
}

mobileOverlay.addEventListener('click', closeMobileSheets);
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobileSheets();
});

// Define the chapters that occur sequentially as we scroll
const chapters = [
    { dir: '~/about', cmd: 'cat identity.md', tpl: 'tpl-0', think: ['Resolving user context...', 'Extracting core parameters...'] },
    { dir: '~/skills', cmd: './display_vectors.sh', tpl: 'tpl-1', think: ['Querying language registries...', 'Mapping ML frameworks...'] },
    { dir: '~/projects', cmd: 'ls -al --deployed', tpl: 'tpl-2', think: ['Scanning active repositories...', 'Fetching deployment metrics...'] },
    { dir: '~/experience', cmd: 'cat work_history.log', tpl: 'tpl-3', think: ['Accessing employment logs...', 'Parsing timeline...'] },
    { dir: '~/certifications', cmd: 'fetch --verified', tpl: 'tpl-4', think: ['Checking digital signatures...', 'Validating badges...'] },
    { dir: '~/publications', cmd: 'grep -r "papers"', tpl: 'tpl-5', think: ['Searching global journals...', 'Found 1 matching article.'] },
    { dir: '~/sparkience_ai', cmd: 'git pull origin main', tpl: 'tpl-6', think: ['Connecting to organization...', 'Downloading active modules...'] },
    { dir: '~/misc', cmd: 'cat education.md', tpl: 'tpl-7', think: ['Locating academic transcripts...'] },
    { dir: '~/misc', cmd: 'cat languages.json', tpl: 'tpl-8', think: ['Parsing linguistic capabilities...'] },
    { dir: '~/misc', cmd: 'cat interests.txt', tpl: 'tpl-9', think: ['Compiling behavior vectors...'] },
    { dir: '~/contact', cmd: './establish_connection.sh', tpl: 'tpl-10', think: ['Resolving communication protocols...', 'Opening secure channels...'] }
];

const totalChapters = chapters.length;
const nextChapter = document.getElementById('next-chapter');
const ghostEl = document.getElementById('ghost-text');
const sectionScrollSpacer = document.getElementById('section-scroll-spacer');
let currentChapter = -1;
let isTyping = false;
let typeInterval;
let scrollHintTimeout;
let renderToken = 0;

function sectionIndex(hash) {
    return Number(sidebarItems.find(item => item.hash === hash)?.dataset.index ?? 0);
}

function currentLocation() {
    return tabServer.getAttribute('aria-selected') === 'true' ? '#timeline' : sidebarItems[currentChapter]?.hash;
}

function recordNavigation(hash) {
    const current = currentLocation();
    const previous = location.hash || '#about';
    if (hash === current && hash === previous) return;
    if (current && current !== previous) history.replaceState(null, '', current);
    if (hash !== (location.hash || '#about')) history.pushState(null, '', hash);
}

function jumpToSection(index, { record = false, focus = false } = {}) {
    if (record) recordNavigation(sidebarItems[index].hash);
    selectTerminalTab(tabBash);
    window.scrollTo({ top: index * window.innerHeight, behavior: 'instant' });
    changeChapter(index, { instant: true, focus });
}

function openTimeline({ record = false, focus = false } = {}) {
    if (record) recordNavigation('#timeline');
    selectTerminalTab(tabServer);
    if (focus) serverViewport.focus({ preventScroll: true });
}

function readLocation() {
    if (location.hash === '#timeline') {
        openTimeline();
    } else {
        const index = sectionIndex(location.hash);
        if (currentChapter !== index || tabServer.getAttribute('aria-selected') === 'true') jumpToSection(index);
    }
}

history.scrollRestoration = 'manual';
window.addEventListener('popstate', readLocation);
window.addEventListener('hashchange', readLocation);
window.addEventListener('resize', () => {
    if (currentChapter < 0 || tabServer.getAttribute('aria-selected') === 'true') return;
    const currentOutput = terminalHistory.querySelector('.current-output');
    if (currentOutput) fitSectionScroll(currentOutput.querySelector('h1, h2, h3') || currentOutput);
    window.scrollTo({ top: currentChapter * window.innerHeight, behavior: 'instant' });
});

window.addEventListener('scroll', () => {
    if (tabServer.getAttribute('aria-selected') === 'true') return;
    const index = Math.min(totalChapters - 1, Math.max(0, Math.floor(window.scrollY / window.innerHeight)));
    if (index !== currentChapter) changeChapter(index, { instant: reducedMotion.matches });
});

function changeChapter(index, { instant = false, focus = false } = {}) {
    clearInterval(typeInterval);
    clearTimeout(scrollHintTimeout);
    isTyping = false;
    renderToken++;
    currentChapter = index;

    updateSidebarUI(index);
    nextChapter.hidden = true;
    sectionScrollSpacer.style.height = '0px';
    ghostEl.textContent = '';
    typewriterElement.textContent = '';
    promptDir.textContent = chapters[index].dir;
    renderInstantHistory(index);

    if (instant) {
        terminalHistory.insertAdjacentHTML('beforeend', commandMarkup(chapters[index]));
        executeCommandFinal(index, renderToken, { instant, focus });
    } else {
        scrollToBottom();
        startTypingCommand(index);
    }
}

function updateSidebarUI(index) {
    sidebarItems.forEach((item, i) => {
        item.parentElement.classList.toggle('active', i === index);
        if (i === index) item.setAttribute('aria-current', 'location');
        else item.removeAttribute('aria-current');
    });
    const subTree = sidebarItems[index].closest('.sub-tree');
    document.querySelector('.sub-tree').parentElement.classList.toggle('active', !!subTree);
}

sidebarItems.forEach((item, i) => {
    item.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        event.preventDefault();
        setExplorer(false);
        jumpToSection(i, { record: true, focus: true });
    });
});

function advanceChapter() {
    if (isTyping || nextChapter.hidden) return;
    if (currentChapter + 1 < totalChapters) {
        jumpToSection(currentChapter + 1, { record: true, focus: true });
    }
}
nextChapter.addEventListener('click', advanceChapter);
window.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
        tabServer.getAttribute('aria-selected') === 'true' ||
        (event.target !== document.body && event.target !== terminalViewport)) return;
    advanceChapter();
});

function commandMarkup(chapter) {
    return `<div class="command-line" style="margin-bottom: 10px; margin-top:15px;">
        <span class="prompt"><span class="user">agent@abstractOS</span>:<span class="dir">${chapter.dir}</span>$</span>
        <span>${chapter.cmd}</span>
    </div>`;
}

function renderInstantHistory(targetIndex) {
    terminalHistory.innerHTML = chapters.slice(0, targetIndex)
        .map(chapter => commandMarkup(chapter) + document.getElementById(chapter.tpl).innerHTML)
        .join('');
}

// Start typing the active command
function startTypingCommand(index) {
    const c = chapters[index];
    const token = renderToken;
    typewriterElement.textContent = '';
    promptDir.textContent = c.dir;

    // Hide ghost text
    if (ghostEl) ghostEl.style.opacity = '0';

    isTyping = true;
    let charIndex = 0;

    // Fast typing effect
    typeInterval = setInterval(() => {
        typewriterElement.textContent += c.cmd.charAt(charIndex);
        audioEngine.playTyping(); // Play audio typing sound
        charIndex++;

        if (charIndex >= c.cmd.length) {
            clearInterval(typeInterval);
            isTyping = false;

            // Wait 200ms before "pressing enter" and simulating the Agent Thinking steps
            setTimeout(() => {
                executeThinkingSteps(index, c, token);
            }, 200);
        }
    }, 30); // Faster typed speed for snappier feel
}

// Simulate Agent Thinking
function executeThinkingSteps(index, c, token) {
    if (token !== renderToken) return;

    // Commit the typed command into the history so the active line moves down
    const cmdHTML = `
        <div class="command-line" style="margin-bottom: 10px; margin-top:20px;">
            <span class="prompt"><span class="user">agent@abstractOS</span>:<span class="dir">${c.dir}</span>$</span>
            <span>${c.cmd}</span>
        </div>
    `;

    // Clear active prompt
    typewriterElement.textContent = '';
    terminalHistory.insertAdjacentHTML('beforeend', cmdHTML);

    // We append a floating container for the thinking steps
    const thinkId = `think-${Date.now()}`;
    terminalHistory.insertAdjacentHTML('beforeend', `<div id="${thinkId}" style="margin-bottom: 15px; font-style:italic;"></div>`);
    const thinkContainer = document.getElementById(thinkId);

    let stepDelay = 0;

    // Fallback pool of general thinking texts
    const generalPool = [
        "Analyzing user context...", "Extracting parameters...",
        "Establishing secure connection...", "Querying database...",
        "Validating cache...", "Compiling neural pathways...",
        "Executing core routines..."
    ];

    // Choose randomly how many steps (1 to 3)
    const stepCount = Math.floor(Math.random() * 3) + 1;

    // Build the specific steps for this iteration
    let stepsToRun = [];
    if (c.think && c.think.length > 0) {
        // If chapter defines exactly >= stepCount, take those. Else mix.
        stepsToRun = c.think.slice(0, stepCount);
        while (stepsToRun.length < stepCount) {
            stepsToRun.push(generalPool[Math.floor(Math.random() * generalPool.length)]);
        }
    } else {
        // Randomly pick from general pool
        for (let i = 0; i < stepCount; i++) {
            stepsToRun.push(generalPool[Math.floor(Math.random() * generalPool.length)]);
        }
    }

    stepsToRun.forEach((stepText, i) => {
        setTimeout(() => {
            if (token !== renderToken) return; // abort if scrolled away
            // Add a spinner for the active step
            const stepEl = document.createElement('div');
            stepEl.className = 'sys-out';
            stepEl.innerHTML = `<i class="fas fa-spinner"></i> ${stepText}`;
            thinkContainer.appendChild(stepEl);
            scrollToBottom();

            // If it's not the last step, we change the spinner to a checkmark after it "completes"
            setTimeout(() => {
                if (token === renderToken) {
                    stepEl.innerHTML = `<i class="fas fa-check" style="color:var(--success); margin-right:8px;"></i> ${stepText}`;
                    audioEngine.playBeep(); // Beep on completion
                }
            }, 400); // simulate the step finishing

        }, stepDelay);
        stepDelay += 500; // wait 500ms before starting next step
    });

    // After all thinking is done, dump the actual template
    setTimeout(() => {
        if (token !== renderToken) return;
        executeCommandFinal(index, token);
    }, stepDelay + 200);
}

function executeCommandFinal(index, token, { instant = false, focus = false } = {}) {
    if (token !== renderToken) return;

    const chapter = chapters[index];
    terminalHistory.insertAdjacentHTML('beforeend', document.getElementById(chapter.tpl).innerHTML);
    const content = terminalHistory.lastElementChild;
    const heading = content.querySelector('h1, h2, h3') || content;
    content.id = sidebarItems[index].hash.slice(1);
    if (instant) {
        content.classList.add('current-output');
        showNextChapter(index);
        terminalViewport.scrollTo({ top: fitSectionScroll(heading), behavior: 'instant' });
        if (focus) {
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
        }
    } else {
        Array.from(content.children).forEach((child, i) => {
            child.animate(
                [{ opacity: 0, transform: 'translateY(15px)' }, { opacity: 1, transform: 'translateY(0)' }],
                { duration: 400, delay: i * 100, easing: 'ease-out', fill: 'backwards' }
            );
        });
        const commands = terminalHistory.querySelectorAll('.command-line');
        const last = commands[commands.length - 1];
        const top = last.getBoundingClientRect().top - terminalViewport.getBoundingClientRect().top;
        terminalViewport.scrollTo({ top: terminalViewport.scrollTop + top - 12, behavior: 'smooth' });
    }

    if (!instant) {
        scrollHintTimeout = setTimeout(() => {
            if (token === renderToken) showNextChapter(index);
        }, 800);
    }
}

function fitSectionScroll(heading) {
    const top = terminalViewport.scrollTop +
        heading.getBoundingClientRect().top - terminalViewport.getBoundingClientRect().top - 12;
    sectionScrollSpacer.style.height = '0px';
    const missing = top + terminalViewport.clientHeight - terminalViewport.scrollHeight;
    sectionScrollSpacer.style.height = `${Math.max(0, Math.ceil(missing))}px`;
    return top;
}

function showNextChapter(index) {
    if (index + 1 >= totalChapters) return;
    const next = chapters[index + 1];
    promptDir.textContent = next.dir;
    nextChapter.textContent = `Next: ${sidebarItems[index + 1].textContent.trim()}`;
    nextChapter.hidden = false;
    ghostEl.textContent = `[Press Enter or scroll to execute: ${next.cmd}]`;
    ghostEl.style.opacity = '1';
}

function scrollToBottom() {
    const token = renderToken;
    setTimeout(() => {
        if (token !== renderToken) return;
        terminalViewport.scrollTo({ top: terminalViewport.scrollHeight, behavior: 'smooth' });
    }, 50);
}

// ==========================================
// TELEMETRY SIMULATION LOOP
// ==========================================
const cpuBar = document.getElementById('cpu-bar');
const cpuVal = document.getElementById('cpu-val');
const memBar = document.getElementById('mem-bar');
const memVal = document.getElementById('mem-val');
const sysClock = document.getElementById('sys-clock');
const netTx = document.getElementById('net-tx');
const netRx = document.getElementById('net-rx');
const miniLog = document.getElementById('mini-log');

const logMessages = [
    "kernel: allocating memory...",
    "sys: process 424 terminated",
    "net: receiving packets",
    "bash: active user agent",
    "auth: secure session OK",
    "daemon: scanning ports...",
    "kernel: optimizing route",
    "sys: memory dumped"
];

// Only run telemetry tick when the sidebar is actually visible
let telemetryIntervalId = null;

function startTelemetryLoop() {
    if (telemetryIntervalId) return; // already running
    telemetryIntervalId = setInterval(() => {
        if (!sysClock) return;
        // Clock
        const now = new Date();
        sysClock.textContent = now.toISOString().substring(11, 23);

        // CPU Fluctuate (20% to 90%)
        let currentCpu = Math.random() * 70 + 20;
        cpuBar.style.width = currentCpu + '%';
        cpuVal.textContent = currentCpu.toFixed(1) + '%';
        cpuVal.style.color = currentCpu > 80 ? 'var(--error)' : 'var(--success)';

        // Mem fluctuate slightly (35G to 45G out of 64G)
        let memoryGIGS = Math.random() * 10 + 35;
        memBar.style.width = (memoryGIGS / 64 * 100) + '%';
        memVal.textContent = memoryGIGS.toFixed(1) + 'G Used';

        // Network Tx Rx
        netTx.textContent = Math.floor(Math.random() * 80 + 5);
        netRx.textContent = Math.floor(Math.random() * 200 + 10);

        // Occasionally add to mini-log using DOM methods (avoids innerHTML reparse)
        if (Math.random() > 0.7 && miniLog) {
            const logLine = logMessages[Math.floor(Math.random() * logMessages.length)];
            miniLog.appendChild(document.createElement('br'));
            miniLog.appendChild(document.createTextNode(logLine));

            // Prune: keep max ~12 child nodes (6 lines × 2 nodes each)
            while (miniLog.childNodes.length > 12) {
                miniLog.removeChild(miniLog.firstChild);
            }
        }
    }, 1000);
}

function stopTelemetryLoop() {
    if (telemetryIntervalId) {
        clearInterval(telemetryIntervalId);
        telemetryIntervalId = null;
    }
}

// ==========================================
// SERVER LOG TIMELINE ENGINE
// ==========================================
const tabBash = document.getElementById('tab-bash');
const tabServer = document.getElementById('tab-server');
const bashViewport = document.getElementById('terminal-viewport');
const serverViewport = document.getElementById('server-viewport');
const serverLogStream = document.getElementById('server-log-stream');
const terminalMain = document.querySelector('.terminal-main');

const masterTimeline = [
    {"date":"Nov 2026","type":"init","text":"Earned OpenAI Agents and Workflows and Applied AI Foundations credentials"},
    {"date":"Nov 2026","type":"event","text":"Added the local MCP interface to Sparkfolio","note":"The browser guide and MCP server share the same readiness rules."},
    { date: "Mar 2026", type: "init", text: "Earned Reinvention with Agentic AI certification (Accenture)", note: "Embraced the shift towards autonomous Agentic AI architectures." },
    { date: "Jan 2026", type: "event", text: "Created repository 'SCM-assistant'" },
    { date: "Oct 2025", type: "sys", text: "Joined Accenture full time as an Associate Software Engineer", note: "Transitioned from an intern to a full-time force multiplier." },
    { date: "Sep 2025", type: "event", text: "Created repositories 'GFG-21-Days-21-Projects' & '100-days-2025'" },
    {"date":"Aug 2025","type":"event","text":"Started The Receptionist","note":"Local Ollama routing with opt-in cloud models."},
    { date: "Aug 2025", type: "event", text: "Created repository 'spark-insights'", note: "Built an autonomous AI data scientist agent for comprehensive EDA and ML model building." },
    { date: "Aug 2025", type: "init", text: "Earned Columbia Prompt Engineering & Google Cloud Gemini certs" },
    { date: "Jul 2025", type: "init", text: "Earned Hugging Face Agents Certificate", note: "Deep dive into open-source agent ecosystems." },
    { date: "Jun 2025", type: "sys", text: "Concluded Java Developer Internship at Accenture", note: "Completed the Java Nanodegree and traced Spring Boot API flows." },
    { date: "Jun 2025", type: "init", text: "Graduated with BTech in AI & Data Science (CGPA: 8.52)" },
    { date: "May 2025", type: "init", text: "Earned Learn AI Agents certification (ULSA)" },
    { date: "Mar 2025", type: "event", text: "Created repository 'RaTiO-CoRE'" },
    { date: "Feb 2025", type: "sys", text: "Started Java Developer Internship at Accenture", note: "Built Java and Spring Boot projects." },
    { date: "Jan 2025", type: "event", text: "Created repository 'DSSential-The-AI-Chief'" },
    { date: "Dec 2024", type: "init", text: "Earned Oracle Database for Developers: Foundations cert" },
    {"date":"Nov 2024","type":"init","text":"Posted the FlowScope preprint to arXiv","note":"arXiv:2411.10716."},
    { date: "Nov 2024", type: "init", text: "Earned Career Essentials in Generative AI certification (Microsoft)" },
    { date: "Nov 2024", type: "init", text: "Formalized the Sparkience AI Organization & Created 'Sparkle-AI'", note: "Established a central hub for all my AI and LLM projects." },
    { date: "Oct 2024", type: "event", text: "Created 'PCI-data-story-of-Telangana' & 'communicate-using-markdown'" },
    { date: "Sep 2024", type: "event", text: "Created repository 'SparkOllama'" },
    { date: "Sep 2024", type: "sys", text: "Concluded Altair RapidMiner Internship" },
    { date: "Aug 2024", type: "event", text: "Created repositories 'SparkDB' & 'SparkPrompt'" },
    { date: "Aug 2024", type: "init", text: "Earned Principles of Generative AI certification (Infosys)" },
    { date: "Jul 2024", type: "init", text: "Earned AWS Academy Cloud Foundations certification" },
    { date: "Jul 2024", type: "sys", text: "Started Data Science Internship at Altair RapidMiner", note: "Engaged in an AICTE-certified Data Science Master Virtual Internship." },
    { date: "Jun 2024", type: "sys", text: "Concluded Swecha Internship" },
    { date: "Jun 2024", type: "init", text: "Earned Prompt Engineering for Developers certification (Infosys)" },
    { date: "Jun 2024", type: "event", text: "Created repositories 'SparkDilemmaX' & 'SparkDocs'", note: "Built SparkDocs: an AI PDF analyzer using LangChain and Gemini." },
    { date: "May 2024", type: "sys", text: "Started Summer of AI Internship at Swecha Telangana", note: "Contributed to cultural preservation through speech data collection." },
    { date: "May 2024", type: "init", text: "Completed Foundations of Modern Machine Learning (Grade: A)", note: "Months of rigorous, hands-on ML coursework paid off." },
    { date: "May 2024", type: "event", text: "Created repository 'flowscope'" },
    { date: "Nov 2023", type: "event", text: "Created repository 'Resources'" },
    { date: "Sep 2023", type: "event", text: "Created repository 'FMML_PROJECTS_AND_LABS'" },
    { date: "Aug 2023", type: "sys", text: "Began Foundations of Modern Machine Learning at IIITH" },
    { date: "Jul 2023", type: "event", text: "Initialized nitin-sagar-b.github.io (Portfolio foundation)" },
    { date: "May 2023", type: "sys", text: "Began developing FlowScope HybridFlow Framework", note: "Architected a hybrid framework for time series forecasting." },
    { date: "May 2023", type: "event", text: "Created repository 'scratch.mit.edu-projects'" },
    { date: "Jan 2023", type: "init", text: "Published: 'Artificial Intelligence: A neoteric reach in Periodontics'", note: "Explored AI's massive potential in dental and healthcare domains." },
    { date: "Dec 2021", type: "init", text: "Started BTech in Artificial Intelligence & Data Science at BVRIT" },
];

let serverLogRendered = false;

const terminalTabs = [tabBash, tabServer];
const tabList = tabBash.parentElement;
function selectTerminalTab(selected) {
    terminalTabs.forEach((tab) => {
        const active = tab === selected;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
    });
    bashViewport.hidden = selected !== tabBash;
    serverViewport.hidden = selected !== tabServer;
    if (!serverViewport.hidden && !serverLogRendered) {
        renderServerLogStatic();
        serverLogRendered = true;
    }
}

tabBash.addEventListener('click', () => {
    if (tabBash.getAttribute('aria-selected') !== 'true') jumpToSection(Math.max(0, currentChapter), { record: true });
});
tabServer.addEventListener('click', () => {
    if (tabServer.getAttribute('aria-selected') !== 'true') openTimeline({ record: true });
});
terminalTabs.forEach((tab, index) => {
    tab.addEventListener('keydown', (event) => {
        const order = { Home: 0, End: 1, ArrowLeft: 1 - index, ArrowRight: 1 - index };
        if (!Object.hasOwn(order, event.key)) return;
        event.preventDefault();
        const next = terminalTabs[order[event.key]];
        tab.tabIndex = -1;
        next.tabIndex = 0;
        next.focus();
    });
});
tabList.addEventListener('focusout', (event) => {
    if (tabList.contains(event.relatedTarget)) return;
    terminalTabs.forEach(tab => { tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1; });
});

function renderServerLogStatic() {
    serverLogStream.innerHTML = '';

    let currentYear = null;

    masterTimeline.forEach((item) => {
        // Extract year
        const itemYear = item.date.match(/\d{4}/)?.[0];
        if (itemYear && itemYear !== currentYear) {
            currentYear = itemYear;
            const yearHeading = document.createElement('div');
            yearHeading.className = 'hl-year';
            yearHeading.innerHTML = `<span>[ ARCHIVE_INDEX: ${currentYear} ]</span>`;
            serverLogStream.appendChild(yearHeading);

            // Add a filler system log for the year change
            appendLogEntry(`SYS_TIME_${currentYear}`, 'sys', `Mounting historical memory partition ${currentYear}...`, true);
        }

        // Agentic Syntax Highlighting for text
        let formattedText = item.text;

        // Highlight logic
        formattedText = formattedText.replace(/Created repositories/g, '<span class="hl-cmd">git init --multi</span>');
        formattedText = formattedText.replace(/Created repository/g, '<span class="hl-cmd">git init</span>');
        formattedText = formattedText.replace(/'([^']+)'/g, '<span class="hl-repo">$1</span>'); // repos in single quotes
        formattedText = formattedText.replace(/Earned/g, '<span class="hl-cmd">FETCH_CERT</span>');
        formattedText = formattedText.replace(/Started/g, '<span class="hl-cmd">EXECUTE process</span>');
        formattedText = formattedText.replace(/Concluded/g, '<span class="hl-cmd">KILL process</span>');
        formattedText = formattedText.replace(/Graduated with/g, '<span class="hl-cmd">BUILD_SUCCESS</span>');
        formattedText = formattedText.replace(/Completed/g, '<span class="hl-cmd">STATUS_OK</span>');
        formattedText = formattedText.replace(/Initialized/g, '<span class="hl-cmd">BOOT_PROC</span>');

        // Standard entity matching
        const companies = ['Accenture', 'Altair RapidMiner', 'Swecha Telangana', 'Infosys', 'Microsoft', 'ULSA', 'BVRIT', 'IIITH'];
        companies.forEach(company => {
            const regex = new RegExp(company, "g");
            formattedText = formattedText.replace(regex, `<span class="hl-company">${company}</span>`);
        });

        formattedText = formattedText.replace(/certification|cert|Certificate/gi, '<span class="hl-cert">$&</span>');

        appendLogEntry(item.date, item.type, formattedText, false);

        // Append note if it exists
        if (item.note) {
            appendLogEntry('', 'sys', `&#8627; <i>${item.note}</i>`, true);
        }
    });

    appendLogEntry('SYS_HALT', 'sys', '<span class="hl-cmd">EOF</span> --- TIMELINE MOUNTED SUCCESSFULLY ---', false);
}

function appendLogEntry(time, type, message, isFiller) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    if (isFiller) {
        entry.innerHTML = `
            <span class="log-time">[${time}]</span>
            <span class="log-message hl-comment">${message}</span>
        `;
    } else {
        entry.innerHTML = `
            <span class="log-time" style="color:var(--accent-secondary);">[${time}]</span>
            <span class="log-type ${type}" style="min-width:65px;">${type.toUpperCase()}</span>
            <span class="log-message" style="color:#d4d4d4;">${message}</span>
        `;
    }
    serverLogStream.appendChild(entry);
}

// ==========================================
// TIME-AWARE GREETING (injected into tpl-0)
// ==========================================
(function injectTimeGreeting() {
    const tpl0 = document.getElementById('tpl-0');
    if (!tpl0) return;

    const hour = new Date().getHours();
    let greeting;

    if (hour >= 5 && hour < 12) {
        greeting = '> Good morning. Initializing daily workflow...';
    } else if (hour >= 12 && hour < 17) {
        greeting = '> Afternoon session active. Running inference pipelines...';
    } else if (hour >= 17 && hour < 22) {
        greeting = '> Evening mode. Reviewing pull requests...';
    } else {
        greeting = `> System Status: Still coding at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}. Agent never sleeps.`;
    }

    // Inject into the template content
    const greetingEl = tpl0.content.getElementById('time-greeting');
    if (greetingEl) {
        greetingEl.textContent = greeting;
    }
})();

// Render the home section promptly, then preserve the animated scroll tour.
if (location.hash === '#timeline') {
    changeChapter(0, { instant: true });
    openTimeline();
} else {
    jumpToSection(sectionIndex(location.hash));
}
initBootSequence();

// ==========================================
// PWA SERVICE WORKER REGISTRATION
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('[AgentOS] Service Worker registered. Scope:', reg.scope))
            .catch(err => console.warn('[AgentOS] SW registration failed:', err));
    });
}
