const terminalEntry = document.querySelector('[data-terminal-entry]');
terminalEntry.hidden = false;

if (new URLSearchParams(location.search).get('terminal') === '1' && !location.hash) {
    initializeTerminal();
}

function initializeTerminal() {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const portfolio = document.getElementById('portfolio-view');
    const terminal = document.getElementById('terminal-view');
    const boot = document.getElementById('boot-screen');
    const skip = document.getElementById('skip-intro');
    const exit = document.getElementById('terminal-exit');

    const chapterSections = { 'tpl-2': 'projects', 'tpl-3': 'experience', 'tpl-4': 'credentials', 'tpl-5': 'publications' };
    for (const [template, section] of Object.entries(chapterSections)) {
        const contents = document.createElement('div');
        contents.className = 'output-block';
        for (const node of document.getElementById(section).children) contents.append(node.cloneNode(true));
        contents.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        document.getElementById(template).content.append(contents);
    }

    portfolio.hidden = true;
    terminal.hidden = false;
    document.body.classList.add('terminal-mode');

    function initializeBoot() {
        if (reducedMotion) return;
        try {
            if (sessionStorage.getItem('abstractos-booted')) return;
            sessionStorage.setItem('abstractos-booted', '1');
        } catch {
            // The optional intro also works when storage is unavailable.
        }

        terminal.inert = true;
        boot.hidden = false;
        skip.focus();
        const timer = setTimeout(dismissBoot, 3200);
        skip.addEventListener('click', dismissBoot, { once: true });
        boot.addEventListener('keydown', event => {
            if (event.key === 'Escape') dismissBoot();
        });

        function dismissBoot() {
            clearTimeout(timer);
            boot.hidden = true;
            terminal.inert = false;
            exit.focus({ preventScroll: true });
        }
    }

    initializeBoot();

    const terminalHistory = document.getElementById('terminal-history');
    const typewriterElement = document.getElementById('typewriter');
    const promptDir = document.getElementById('prompt-dir');
    const terminalViewport = document.getElementById('terminal-viewport');

    // Guard against missing critical elements
    if (!terminalHistory || !typewriterElement || !promptDir || !terminalViewport) {
        console.error('[AgentOS] Critical DOM elements missing. Aborting boot sequence.');
    }


    const sidebarItems = document.querySelectorAll('.sidebar .folder, .sidebar .file');

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

    if (telToggleBtn && telSidebar) {
        telToggleBtn.addEventListener('click', () => {
            if (telSidebar.classList.contains('open')) {
                telSidebar.style.display = 'none';
                telSidebar.classList.remove('open');
                telToggleBtn.style.color = 'var(--accent-primary)';
                stopTelemetryLoop();
                if (mobileOverlay && window.innerWidth <= 800) mobileOverlay.classList.remove('active');
            } else {
                telSidebar.style.display = '';
                telSidebar.classList.add('open');
                telToggleBtn.style.color = 'var(--success)';
                startTelemetryLoop();

                // On mobile, show overlay and block the other sheet
                if (window.innerWidth <= 800) {
                    if (mobileOverlay) mobileOverlay.classList.add('active');
                    if (sidebarEl && sidebarEl.classList.contains('mobile-open')) {
                        sidebarEl.classList.remove('mobile-open');
                    }
                }
            }
        });
    }

    // Mobile Nav Toggle
    if (mobileNavBtn && sidebarEl) {
        mobileNavBtn.addEventListener('click', () => {
            const isOpening = !sidebarEl.classList.contains('mobile-open');
            sidebarEl.classList.toggle('mobile-open');

            if (window.innerWidth <= 800 && mobileOverlay) {
                if (isOpening) {
                    mobileOverlay.classList.add('active');
                    // Close telemetry sheet if open
                    if (telSidebar && telSidebar.classList.contains('open')) {
                        telSidebar.style.display = 'none';
                        telSidebar.classList.remove('open');
                        if (telToggleBtn) telToggleBtn.style.color = 'var(--accent-primary)';
                    }
                } else {
                    mobileOverlay.classList.remove('active');
                }
            }
        });
    }

    // Close bottom sheets when clicking the overlay
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', () => {
            mobileOverlay.classList.remove('active');
            if (sidebarEl) sidebarEl.classList.remove('mobile-open');
            if (telSidebar && telSidebar.classList.contains('open')) {
                telSidebar.style.display = 'none';
                telSidebar.classList.remove('open');
                if (telToggleBtn) telToggleBtn.style.color = 'var(--accent-primary)';
            }
        });
    }


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
    let currentChapter = -1;
    let isTyping = false;
    let typeInterval;
    let scrollHintTimeout;

    // Ghost text element
    const ghostTextElement = document.createElement('span');
    ghostTextElement.className = 'ghost-text';
    let ghostEl;

    // Handle Scroll Event to determine active chapter
    window.addEventListener('scroll', () => {
        // We have 1000vh total. So each chapter gets exactly 100vh of scroll space.
        const scrollPos = window.scrollY;
        const windowHeight = window.innerHeight;

        // Calculate fractional progress and snap to chapter index
        let newChapter = Math.floor(scrollPos / windowHeight);

        // Edge case if we pull past max height
        if (newChapter >= totalChapters) newChapter = totalChapters - 1;
        if (newChapter < 0) newChapter = 0;

        if (newChapter !== currentChapter) {
            changeChapter(newChapter);
        }
    });

    function changeChapter(index) {
        if (isTyping) {
            clearInterval(typeInterval);
            isTyping = false;
        }

        currentChapter = index;

        updateSidebarUI(index);
        renderInstantHistory(index);
        startTypingCommand(index);
    }

    // Ensure the sidebar styling updates
    function updateSidebarUI(index) {
        sidebarItems.forEach(item => item.classList.remove('active'));
        // Find the item matching this index
        const activeItem = document.querySelector(`.sidebar [data-index="${index}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
            // if it's a file, ensure parent folder is seemingly open
            if (activeItem.classList.contains('file')) {
                activeItem.parentElement.parentElement.classList.add('active');
            }
        }
    }

    // Automatically jump scroll depth if sidebar item is clicked
    sidebarItems.forEach(item => {
        if (!(item.classList.contains('folder') && item.querySelector('.file'))) {
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                item.click();
            });
        }
        item.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent bubbling to parent folder if clicking a file
            const index = parseInt(item.getAttribute('data-index'));
            const targetScroll = index * window.innerHeight;
            window.scrollTo({
                top: targetScroll,
                behavior: reducedMotion ? 'instant' : 'smooth'
            });

            // Hide sidebar automatically on mobile
            if (window.innerWidth <= 800) {
                if (sidebarEl) sidebarEl.classList.remove('mobile-open');
                if (mobileOverlay) mobileOverlay.classList.remove('active');
            }
        });
    });

    // Add Enter key to execute next command
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.defaultPrevented && !e.target.closest?.('a, button, input, select, textarea, [role=button]')) {
            e.preventDefault();
            if (isTyping) return; // Prevent skipping ahead while the agent is actively typing/thinking

            const nextIndex = currentChapter + 1;
            if (nextIndex < totalChapters) {
                const targetScroll = nextIndex * window.innerHeight;
                window.scrollTo({
                    top: targetScroll,
                    behavior: reducedMotion ? 'instant' : 'smooth'
                });
            }
        }
    });

    // Terminal Viewport Mobile Tap to Advance
    if (terminalViewport) {
        terminalViewport.addEventListener('click', (e) => {
            // Only trigger on mobile to avoid preventing desktop text selection logic
            if (window.innerWidth > 800) return;

            // Ignore clicks on links or specific interactive chunks
            if (e.target.tagName.toLowerCase() === 'a' ||
                e.target.closest('.tab') ||
                e.target.closest('.ide-header') ||
                e.target.closest('.mobile-overlay')) return;

            if (isTyping) return;

            const nextIndex = currentChapter + 1;
            if (nextIndex < totalChapters) {
                window.scrollTo({
                    top: nextIndex * window.innerHeight,
                    behavior: reducedMotion ? 'instant' : 'smooth'
                });
            }
        });
    }

    // Render everything before the current chapter INSTANTLY to simulate history
    function renderInstantHistory(targetIndex) {
        terminalHistory.innerHTML = ''; // Wipe clean

        for (let i = 0; i < targetIndex; i++) {
            const c = chapters[i];
            const cmdHTML = `
                <div class="command-line" style="margin-bottom: 10px; margin-top:15px;">
                    <span class="prompt"><span class="user">agent@abstractOS</span>:<span class="dir">${c.dir}</span>$</span>
                    <span>${c.cmd}</span>
                </div>
            `;
            const outputTemplate = document.getElementById(c.tpl);
            if (outputTemplate) {
                terminalHistory.innerHTML += cmdHTML + outputTemplate.innerHTML;
            }
        }
        scrollToBottom();
    }

    // Start typing the active command
    function startTypingCommand(index) {
        const c = chapters[index];
        typewriterElement.textContent = '';
        promptDir.textContent = c.dir;

        // Hide ghost text
        if (ghostEl) ghostEl.style.opacity = '0';

        if (reducedMotion) {
            renderInstantHistory(index + 1);
            return;
        }

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
                    executeThinkingSteps(index, c);
                }, 200);
            }
        }, 30); // Faster typed speed for snappier feel
    }

    // Simulate Agent Thinking
    function executeThinkingSteps(index, c) {
        if (currentChapter !== index) return;

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
                if (currentChapter !== index) return; // abort if scrolled away
                // Add a spinner for the active step
                const stepEl = document.createElement('div');
                stepEl.className = 'sys-out';
                stepEl.innerHTML = `<i class="fas fa-spinner"></i> ${stepText}`;
                thinkContainer.appendChild(stepEl);
                scrollToBottom();

                // If it's not the last step, we change the spinner to a checkmark after it "completes"
                setTimeout(() => {
                    if (stepEl && currentChapter === index) {
                        stepEl.innerHTML = `<i class="fas fa-check" style="color:var(--success); margin-right:8px;"></i> ${stepText}`;
                        audioEngine.playBeep(); // Beep on completion
                    }
                }, 400); // simulate the step finishing

            }, stepDelay);
            stepDelay += 500; // wait 500ms before starting next step
        });

        // After all thinking is done, dump the actual template
        setTimeout(() => {
            if (currentChapter !== index) return;
            executeCommandFinal(index);
        }, stepDelay + 200);
    }

    function executeCommandFinal(index) {
        if (currentChapter !== index) return;

        const c = chapters[index];
        const outputTemplate = document.getElementById(c.tpl);

        if (outputTemplate) {
            // We clone and stagger children for nice animation
            terminalHistory.insertAdjacentHTML('beforeend', outputTemplate.innerHTML);

            // Add staggered animation strictly to the newly added block (native Web Animations API)
            const newBlock = terminalHistory.lastElementChild;
            if (!reducedMotion && newBlock && newBlock.classList.contains('output-block')) {
                Array.from(newBlock.children).forEach((child, i) => {
                    child.animate(
                        [{ opacity: 0, transform: 'translateY(15px)' }, { opacity: 1, transform: 'translateY(0)' }],
                        { duration: 400, delay: i * 100, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }
                    );
                    child.style.opacity = '0'; // start hidden, animation fills forwards
                });
            }

            // Pin header to top gracefully
            const activeCmds = terminalHistory.querySelectorAll('.command-line');
            if (activeCmds.length > 0) {
                const lastCmd = activeCmds[activeCmds.length - 1];
                setTimeout(() => {
                    lastCmd.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
                }, 50);
            } else {
                scrollToBottom();
            }
        }

        // Setup ghost text for NEXT command
        clearTimeout(scrollHintTimeout);
        scrollHintTimeout = setTimeout(() => {
            if (index + 1 < totalChapters) {
                const nextC = chapters[index + 1];
                promptDir.textContent = nextC.dir;
                if (!ghostEl) {
                    ghostEl = document.getElementById('ghost-text');
                }
                if (ghostEl) {
                    if (window.innerWidth <= 800) {
                        ghostEl.textContent = `[TAP / Scroll]`;
                    } else {
                        ghostEl.textContent = `[Press Enter or Scroll to execute: ${nextC.cmd}]`;
                    }
                    ghostEl.style.opacity = '1';
                }
            }
        }, 800); // Wait almost a second before showing hint
    }

    function scrollToBottom() {
        // We add a tiny delay for DOM painting
        setTimeout(() => {
            terminalViewport.scrollTo({
                top: terminalViewport.scrollHeight,
                behavior: reducedMotion ? 'instant' : 'smooth'
            });
        }, 50);
    }

    // Initial Boot (Force trigger the 0 state if we open the page)
    // A tiny delay ensures the CSS and heights are properly loaded before querying
    setTimeout(() => {
        const scrollPos = window.scrollY;
        let initialChapter = Math.floor(scrollPos / window.innerHeight);
        if (initialChapter > totalChapters - 1) initialChapter = totalChapters - 1;
        changeChapter(initialChapter);
    }, 100);

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

                // Prune: keep max ~12 child nodes (6 lines x 2 nodes each)
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


    let serverLogRendered = false;

    if (tabBash && tabServer) {
        tabBash.addEventListener('click', () => {
            tabBash.classList.add('active');
            tabServer.classList.remove('active');
            tabBash.setAttribute('aria-pressed', 'true');
            tabServer.setAttribute('aria-pressed', 'false');
            bashViewport.style.display = 'block';
            serverViewport.style.display = 'none';
        });

        tabServer.addEventListener('click', () => {
            tabServer.classList.add('active');
            tabBash.classList.remove('active');
            tabBash.setAttribute('aria-pressed', 'false');
            tabServer.setAttribute('aria-pressed', 'true');
            serverViewport.style.display = 'block';
            bashViewport.style.display = 'none';

            if (!serverLogRendered) {
                renderServerLogStatic();
                serverLogRendered = true;
            }
        });
    }

    function renderServerLogStatic() {
        const items = document.querySelector('#timeline .portfolio-list').cloneNode(true);
        items.querySelectorAll('a[href^="#"]').forEach(link => link.setAttribute('href', './' + link.getAttribute('href')));
        serverLogStream.replaceChildren(items);
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

}

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
