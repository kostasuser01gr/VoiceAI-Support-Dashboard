/**
 * BLACK_VAULT NEXUS LIVE — Frontend Application
 *
 * Handles:
 * - WebSocket connection to live agent
 * - Voice recording (Web Audio API + MediaRecorder)
 * - Screenshot capture (getDisplayMedia)
 * - Code analysis API calls
 * - Story generation and rendering
 * - UI state management
 */

// ─── State ───────────────────────────────────────────────────

const state = {
  sessionId: null,
  ws: null,
  isRecording: false,
  mediaRecorder: null,
  audioContext: null,
  audioStream: null,
};

const API_BASE = window.location.origin;

// ─── Session Management ──────────────────────────────────────

async function createSession() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voice_enabled: true,
        vision_enabled: true,
        compliance_frameworks: ['OWASP_TOP_10', 'SOC2'],
      }),
    });
    const data = await res.json();
    state.sessionId = data.session_id;
    connectWebSocket(data.websocket_url);
    updateStatus('connecting');
  } catch (err) {
    console.error('Failed to create session:', err);
    addChatMessage('agent', 'Failed to connect to the live agent. Check that the backend is running.');
  }
}

function connectWebSocket(path) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}${path}`;

  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    updateStatus('connected');
    document.getElementById('btnInterrupt').disabled = false;
    addChatMessage('agent', 'Live session connected! I can hear you, see your screen, and analyze your code in real-time.');
  };

  state.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleAgentResponse(msg);
  };

  state.ws.onclose = () => {
    updateStatus('disconnected');
    document.getElementById('btnInterrupt').disabled = true;
  };

  state.ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    updateStatus('disconnected');
  };
}

function updateStatus(status) {
  const dot = document.getElementById('connectionStatus');
  const text = document.getElementById('connectionText');
  dot.className = `status-dot ${status}`;
  text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

// ─── Agent Response Handling ─────────────────────────────────

function handleAgentResponse(msg) {
  switch (msg.type) {
    case 'text':
      addChatMessage('agent', msg.data);
      break;
    case 'audio':
      playAudio(msg.data, msg.metadata?.mime_type);
      break;
    case 'end':
      addChatMessage('agent', '---\n*Turn complete*');
      break;
    case 'error':
      addChatMessage('agent', `Error: ${msg.data}`);
      break;
    case 'interrupt_ack':
      addChatMessage('agent', '*[Interrupt acknowledged]*');
      break;
  }
}

function playAudio(base64Data, mimeType = 'audio/pcm') {
  try {
    const audioBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const blob = new Blob([audioBytes], { type: mimeType || 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play().catch(e => console.warn('Audio playback failed:', e));
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (e) {
    console.warn('Audio decode failed:', e);
  }
}

// ─── Voice Recording ─────────────────────────────────────────

async function toggleVoice() {
  if (state.isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    state.audioStream = stream;
    state.isRecording = true;

    const btn = document.getElementById('btnVoice');
    btn.classList.add('active');
    document.getElementById('voiceIcon').textContent = '\u23F9'; // Stop icon

    // Create MediaRecorder for chunked sending
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    state.mediaRecorder = recorder;

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const buffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
          type: 'audio',
          data: base64,
          metadata: { format: 'webm', sample_rate: 16000 },
        }));
        addChatMessage('user', '*[Voice message sent]*');
      }
    };

    recorder.start(1000); // Collect chunks every second
    addChatMessage('user', '*Recording... Click the microphone button to stop.*');

  } catch (err) {
    console.error('Microphone access denied:', err);
    addChatMessage('agent', 'Microphone access denied. Please allow microphone permission.');
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  if (state.audioStream) {
    state.audioStream.getTracks().forEach(t => t.stop());
  }

  state.isRecording = false;
  const btn = document.getElementById('btnVoice');
  btn.classList.remove('active');
  document.getElementById('voiceIcon').textContent = '\uD83C\uDFA4';
}

// ─── Text Input ──────────────────────────────────────────────

function sendText() {
  const input = document.getElementById('textInput');
  const text = input.value.trim();
  if (!text) return;

  addChatMessage('user', text);
  input.value = '';

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'text', data: text }));
  } else {
    // Fallback: use REST API for analysis
    analyzeViaREST(text);
  }
}

async function analyzeViaREST(question) {
  const code = document.getElementById('codeInput').value;
  try {
    const res = await fetch(`${API_BASE}/api/v1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        filename: document.getElementById('filenameInput').value,
        language: document.getElementById('languageSelect').value,
        context: question,
        frameworks: ['OWASP_TOP_10'],
        include_fixes: true,
      }),
    });
    const data = await res.json();
    displayAnalysisResults(data);
  } catch (err) {
    addChatMessage('agent', `Analysis failed: ${err.message}`);
  }
}

// ─── Interrupt ───────────────────────────────────────────────

function sendInterrupt() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'control', data: 'interrupt' }));
    addChatMessage('user', '*[Interrupt sent]*');
  }
}

// ─── Code Analysis ───────────────────────────────────────────

async function analyzeCode() {
  const code = document.getElementById('codeInput').value.trim();
  if (!code) return;

  const btn = document.getElementById('btnAnalyze');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  addChatMessage('user', 'Analyze this code for security vulnerabilities.');

  // If connected via WebSocket, use live agent
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({
      type: 'code',
      data: code,
      metadata: {
        filename: document.getElementById('filenameInput').value,
        language: document.getElementById('languageSelect').value,
      },
    }));
    btn.disabled = false;
    btn.textContent = 'Analyze';
    return;
  }

  // Fallback: REST API
  try {
    const res = await fetch(`${API_BASE}/api/v1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        filename: document.getElementById('filenameInput').value,
        language: document.getElementById('languageSelect').value,
        frameworks: ['OWASP_TOP_10'],
        include_fixes: true,
      }),
    });
    const data = await res.json();
    displayAnalysisResults(data);
    addChatMessage('agent', `Analysis complete: found ${(data.pattern_findings || []).length + (data.ai_findings || []).length} vulnerabilities. Risk score: ${data.risk_score}/10.`);
  } catch (err) {
    addChatMessage('agent', `Analysis error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze';
  }
}

// ─── Screenshot Capture ──────────────────────────────────────

async function captureAndAnalyze() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(track);
    const bitmap = await imageCapture.grabFrame();
    track.stop();

    // Convert to PNG
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);

    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append('file', blob, 'screenshot.png');

      addChatMessage('user', '*[Screenshot captured — analyzing...]*');

      const res = await fetch(`${API_BASE}/api/v1/navigate/analyze`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      displayNavigatorResults(data);
    }, 'image/png');
  } catch (err) {
    console.error('Screen capture failed:', err);
    addChatMessage('agent', 'Screen capture was cancelled or not supported.');
  }
}

// ─── Story Generation ────────────────────────────────────────

async function generateStory() {
  const code = document.getElementById('codeInput').value.trim();
  if (!code) {
    addChatMessage('agent', 'Please paste some code first to generate a hardening story.');
    return;
  }

  addChatMessage('agent', 'Generating hardening story with interleaved multimodal content...');

  try {
    const res = await fetch(`${API_BASE}/api/v1/stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        filename: document.getElementById('filenameInput').value,
        language: document.getElementById('languageSelect').value,
        frameworks: ['OWASP_TOP_10'],
      }),
    });
    const story = await res.json();
    displayStory(story);
    showTab('story');
    addChatMessage('agent', `Hardening story generated with ${story.section_count} interleaved sections across ${(story.modalities || []).join(', ')} modalities.`);
  } catch (err) {
    addChatMessage('agent', `Story generation failed: ${err.message}`);
  }
}

// ─── Display Functions ───────────────────────────────────────

function displayAnalysisResults(data) {
  // Risk Score
  const riskEl = document.getElementById('riskScore');
  const score = data.risk_score || 0;
  riskEl.querySelector('.risk-value').textContent = score.toFixed(1);
  riskEl.className = `risk-badge ${
    score === 0 ? 'risk-low' :
    score <= 3 ? 'risk-medium' :
    score <= 6 ? 'risk-high' :
    'risk-critical'
  }`;

  // Compliance
  const compEl = document.getElementById('complianceStatus');
  compEl.innerHTML = Object.entries(data.compliance_status || {}).map(([fw, pass]) =>
    `<div class="compliance-item ${pass ? 'compliance-pass' : 'compliance-fail'}">${pass ? '\u2705' : '\u274C'} ${fw}</div>`
  ).join('');

  // Vulnerabilities
  const vulnEl = document.getElementById('vulnList');
  const allFindings = [...(data.pattern_findings || []), ...(data.ai_findings || [])];

  if (allFindings.length === 0) {
    vulnEl.innerHTML = '<p class="empty-state">\u2705 No vulnerabilities detected!</p>';
    return;
  }

  vulnEl.innerHTML = allFindings.map(v => `
    <div class="vuln-item severity-${v.severity}">
      <div class="vuln-header">
        <span class="vuln-title">${v.title || v.type}</span>
        <span class="vuln-severity ${v.severity}">${v.severity}</span>
      </div>
      <div class="vuln-desc">${v.description}</div>
      <div class="vuln-meta">
        ${v.line_number ? `<span>Line ${v.line_number}</span>` : ''}
        ${v.cwe_id ? `<span>${v.cwe_id}</span>` : ''}
        ${v.owasp_category ? `<span>${v.owasp_category}</span>` : ''}
      </div>
      ${v.fix_hint ? `<div style="margin-top:0.4rem;font-size:0.75rem;color:var(--accent-green)">Fix: ${v.fix_hint}</div>` : ''}
    </div>
  `).join('');

  // Fixes
  const fixEl = document.getElementById('fixList');
  const fixes = data.fixes || [];
  if (fixes.length > 0) {
    fixEl.innerHTML = fixes.map(f => `
      <div class="fix-item">
        <h3>${f.vulnerability_type || f.description || 'Fix'}</h3>
        ${f.before_code ? `<p style="font-size:0.75rem;color:var(--accent-red)">Before:</p><pre><code>${escapeHtml(f.before_code)}</code></pre>` : ''}
        ${f.after_code ? `<p style="font-size:0.75rem;color:var(--accent-green)">After:</p><pre><code>${escapeHtml(f.after_code)}</code></pre>` : ''}
        ${f.explanation ? `<p style="font-size:0.8rem;margin-top:0.5rem">${f.explanation}</p>` : ''}
      </div>
    `).join('');
  }

  showTab('vulns');
}

function displayNavigatorResults(data) {
  addChatMessage('agent',
    `**UI Navigator Analysis**\n` +
    `IDE: ${data.screen_context?.ide || 'Unknown'}\n` +
    `File: ${data.screen_context?.filename || 'Unknown'}\n` +
    `Risk: ${data.overall_risk || 'UNKNOWN'}\n` +
    `Vulnerabilities: ${(data.vulnerabilities || []).length}`
  );

  // Convert to same format as analysis results for display
  displayAnalysisResults({
    risk_score: data.overall_risk === 'CRITICAL' ? 10 : data.overall_risk === 'HIGH' ? 7 : data.overall_risk === 'MEDIUM' ? 4 : 1,
    compliance_status: {},
    pattern_findings: (data.vulnerabilities || []).map(v => ({
      ...v,
      title: v.title || v.type,
    })),
    ai_findings: [],
    fixes: (data.suggested_actions || []).filter(a => a.fix_code).map(a => ({
      description: a.description,
      after_code: a.fix_code,
    })),
  });
}

function displayStory(story) {
  const container = document.getElementById('storyContent');
  container.innerHTML = (story.sections || []).map(section => {
    const mod = section.modality || 'text';
    const title = section.metadata?.title ? `<h3>${section.metadata.title}</h3>` : '';

    if (mod === 'code') {
      const lang = section.metadata?.language || 'python';
      return `<div class="story-section story-section-code">${title}<pre><code class="language-${lang}">${escapeHtml(section.content)}</code></pre></div>`;
    }
    if (mod === 'diagram') {
      return `<div class="story-section story-section-diagram">${title}<div class="mermaid">${section.content}</div></div>`;
    }
    if (mod === 'checklist') {
      const items = section.content.split('\n').filter(l => l.trim()).map(l => `<li>${l.replace(/^[-*]\s*/, '')}</li>`).join('');
      return `<div class="story-section story-section-text">${title}<ul>${items}</ul></div>`;
    }
    return `<div class="story-section story-section-text">${title}<p>${section.content}</p></div>`;
  }).join('');

  // Re-render Mermaid diagrams and highlight code
  if (window.mermaid) mermaid.init(undefined, '.mermaid');
  if (window.hljs) hljs.highlightAll();
}

// ─── UI Helpers ──────────────────────────────────────────────

function addChatMessage(role, content) {
  const area = document.getElementById('chatArea');
  const avatar = role === 'agent' ? '\uD83E\uDD16' : '\uD83D\uDC64';

  const div = document.createElement('div');
  div.className = `chat-message ${role}`;
  div.innerHTML = `
    <div class="chat-avatar">${avatar}</div>
    <div class="chat-content"><p>${formatMessage(content)}</p></div>
  `;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function formatMessage(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));

  const tabContent = document.getElementById(`tab-${tabName}`);
  if (tabContent) tabContent.classList.add('active');

  // Highlight corresponding tab button
  document.querySelectorAll('.tab').forEach(el => {
    if (el.textContent.toLowerCase().includes(tabName.substring(0, 4))) {
      el.classList.add('active');
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Initialization ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Try to create a live session on load
  createSession().catch(() => {
    addChatMessage('agent', 'Running in offline mode. Use the Analyze button for REST-based analysis.');
  });
});
