// Initialize PDF.js worker (skip if running locally via file:// to prevent CORS same-origin worker blocking)
if (typeof pdfjsLib !== 'undefined') {
    if (window.location.protocol !== 'file:') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
}

// Global Application State
const state = {
    resumes: [],
    jobTitle: "Senior Frontend Engineer",
    jobRequirements: "",
    settings: {
        aiEngineMode: "local", // "local" or "gemini"
        geminiApiKey: "",
        voiceSelect: "default",
        voiceRate: 1.0,
        voicePitch: 1.0
    },
    speechRecognition: null,
    isListening: false,
    currentSpeakingUtterance: null
};

// Job Templates Data
const jobTemplates = {
    frontend: {
        title: "Senior Frontend Engineer",
        description: "React, TypeScript, Redux, HTML5, CSS3, Javascript, Webpack, Git, testing, responsive design, REST APIs, performance optimization, user experience, clean code"
    },
    backend: {
        title: "Python / Backend Developer",
        description: "Python, Django, FastAPI, PostgreSQL, Redis, REST APIs, AWS, Docker, Git, SQL, Unit testing, Microservices, Kubernetes, system architecture, database performance"
    },
    datascientist: {
        title: "Data Scientist & AI Specialist",
        description: "Python, Machine Learning, TensorFlow, PyTorch, SQL, Pandas, NumPy, Scikit-learn, Statistics, Data Visualization, NLP, Deep Learning, Git, Jupyter, analytics"
    },
    uxdesigner: {
        title: "UI/UX Product Designer",
        description: "Figma, Wireframing, Prototyping, User Research, Information Architecture, Adobe XD, UI design, Usability testing, Design systems, HTML/CSS, visual hierarchy, mobile layout"
    }
};

// Standard Resume Structure Headers for Formats Audit
const standardHeaders = ["experience", "education", "skills", "projects", "contact", "summary", "certification", "languages"];

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    initDOM();
    initSpeechRecognition();
    populateVoiceList();
    
    // Set default job requirements
    setJobTemplate("frontend");
    
    // Welcome vocal greeting after short delay
    setTimeout(() => {
        respondVocally("System initialized. I am Aura, your resume voice assistant. Upload candidate resumes to begin.");
    }, 1000);
});

// Load Settings from LocalStorage
function loadSettings() {
    const saved = localStorage.getItem("aura_resume_settings");
    if (saved) {
        try {
            state.settings = { ...state.settings, ...JSON.parse(saved) };
        } catch (e) {
            console.error("Failed to parse settings", e);
        }
    }
}

// Save Settings to LocalStorage
function saveSettings() {
    localStorage.setItem("aura_resume_settings", JSON.stringify(state.settings));
}

// --- DOM EVENT HANDLERS ---
let dropzone, fileInput, uploadQueue, rankingsTableBody, chatLog;
let detailsModal, settingsModal;

function initDOM() {
    dropzone = document.getElementById("dropzone");
    fileInput = document.getElementById("fileInput");
    uploadQueue = document.getElementById("uploadQueue");
    rankingsTableBody = document.getElementById("rankingsTableBody");
    chatLog = document.getElementById("chatLog");
    
    detailsModal = document.getElementById("detailsModal");
    settingsModal = document.getElementById("settingsModal");
    
    // Dropzone click triggers the input, but we ignore clicks originating from the input itself to prevent recursive loop
    dropzone.addEventListener("click", (e) => {
        if (e.target !== fileInput) {
            fileInput.click();
        }
    });
    
    // Stop propagation of click events from fileInput to prevent recursive loop
    fileInput.addEventListener("click", (e) => {
        e.stopPropagation();
    });
    
    dropzone.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });
    
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });
    
    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });
    
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            handleFileUploads(e.dataTransfer.files);
        }
    });
    
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFileUploads(e.target.files);
            fileInput.value = ""; // Clear file value to allow re-upload of same file
        }
    });

    // Job template selector change
    document.getElementById("jobTemplateSelect").addEventListener("change", (e) => {
        const val = e.target.value;
        if (val !== "custom") {
            setJobTemplate(val);
        }
    });

    // Job title and description field edits update state
    document.getElementById("jobTitle").addEventListener("input", (e) => {
        state.jobTitle = e.target.value;
    });
    document.getElementById("jobDescription").addEventListener("input", (e) => {
        state.jobRequirements = e.target.value;
    });

    // Voice assistant control listeners
    document.getElementById("listenBtn").addEventListener("click", toggleListening);
    document.getElementById("stopVoiceBtn").addEventListener("click", stopSpeaking);
    
    // Suggested prompt tag click helper
    document.querySelectorAll(".prompt-tag").forEach(tag => {
        tag.addEventListener("click", () => {
            const cmd = tag.getAttribute("data-cmd");
            addChatMessage(cmd, "user");
            processVoiceCommand(cmd);
        });
    });

    // Modals controls
    document.getElementById("settingsBtn").addEventListener("click", openSettings);
    document.getElementById("closeSettingsModal").addEventListener("click", closeSettings);
    document.getElementById("cancelSettingsBtn").addEventListener("click", closeSettings);
    document.getElementById("saveSettingsBtn").addEventListener("click", saveConfigurations);
    
    document.getElementById("closeModal").addEventListener("click", closeDetails);
    document.getElementById("modalCloseBtn").addEventListener("click", closeDetails);
    
    // Modal tabs toggle
    document.querySelectorAll(".tab-btn").forEach(tab => {
        tab.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            
            tab.classList.add("active");
            const targetId = tab.getAttribute("data-tab");
            document.getElementById(targetId).classList.add("active");
        });
    });
    
    // Voice Summary from Details Modal
    document.getElementById("modalVoiceSummaryBtn").addEventListener("click", () => {
        const name = document.getElementById("modalCandidateName").innerText;
        const score = document.getElementById("modalScoreText").innerText;
        const gaps = Array.from(document.getElementById("modalGapsList").children).map(li => li.innerText).join(", ");
        const rec = document.getElementById("modalFeedbackText").innerText;
        
        let text = `${name} has an overall matching score of ${score}. `;
        if (gaps && gaps !== "None identified.") {
            text += `Major skills gaps identified are: ${gaps}. `;
        } else {
            text += `They match all major skill requirements. `;
        }
        text += `Recommendation: ${rec}`;
        respondVocally(text);
    });

    // Clear and reset buttons
    document.getElementById("clearAllBtn").addEventListener("click", clearAllResumes);
    
    // Voice settings preview triggers
    const rateInput = document.getElementById("voiceRate");
    const rateVal = document.getElementById("rateVal");
    rateInput.addEventListener("input", (e) => {
        rateVal.innerText = e.target.value;
        state.settings.voiceRate = parseFloat(e.target.value);
    });
    
    const pitchInput = document.getElementById("voicePitch");
    const pitchVal = document.getElementById("pitchVal");
    pitchInput.addEventListener("input", (e) => {
        pitchVal.innerText = e.target.value;
        state.settings.voicePitch = parseFloat(e.target.value);
    });

    // Settings Toggle Radio engine Mode
    const engineRadios = document.getElementsByName("aiEngineMode");
    const apiKeyGroup = document.getElementById("apiKeySettingsGroup");
    engineRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            if (e.target.value === "gemini") {
                apiKeyGroup.classList.remove("hidden");
            } else {
                apiKeyGroup.classList.add("hidden");
            }
        });
    });
    
    // Toggle API Key visibility
    document.getElementById("toggleApiKeyVisibility").addEventListener("click", () => {
        const keyInput = document.getElementById("geminiApiKey");
        if (keyInput.type === "password") {
            keyInput.type = "text";
            document.getElementById("toggleApiKeyVisibility").innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
            keyInput.type = "password";
            document.getElementById("toggleApiKeyVisibility").innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
    });

    // Populate settings values on load
    document.getElementById("geminiApiKey").value = state.settings.geminiApiKey;
    if (state.settings.aiEngineMode === "gemini") {
        document.querySelector('input[name="aiEngineMode"][value="gemini"]').checked = true;
        apiKeyGroup.classList.remove("hidden");
    } else {
        document.querySelector('input[name="aiEngineMode"][value="local"]').checked = true;
        apiKeyGroup.classList.add("hidden");
    }
    
    window.speechSynthesis.onvoiceschanged = populateVoiceList;
}

// Prefill templates helper
function setJobTemplate(key) {
    if (jobTemplates[key]) {
        document.getElementById("jobTitle").value = jobTemplates[key].title;
        document.getElementById("jobDescription").value = jobTemplates[key].description;
        state.jobTitle = jobTemplates[key].title;
        state.jobRequirements = jobTemplates[key].description;
    }
}

// --- VOICE ASSISTANT: TTS (Text to Speech) ---

function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') return;
    const voices = speechSynthesis.getVoices();
    const select = document.getElementById("voiceSelect");
    
    // Clear old options except default
    select.innerHTML = '<option value="default">System Default Voice</option>';
    
    voices.forEach(voice => {
        const option = document.createElement("option");
        option.textContent = `${voice.name} (${voice.lang})`;
        option.value = voice.name;
        if (state.settings.voiceSelect === voice.name) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function respondVocally(text) {
    if (typeof speechSynthesis === 'undefined') return;
    
    // Stop currently speaking
    stopSpeaking();
    
    addChatMessage(text, "assistant");
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set customized speech configurations
    if (state.settings.voiceSelect !== "default") {
        const voices = speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => v.name === state.settings.voiceSelect);
        if (selectedVoice) utterance.voice = selectedVoice;
    }
    
    utterance.rate = state.settings.voiceRate;
    utterance.pitch = state.settings.voicePitch;
    
    // Event hooks to visual waveforms and UI state
    utterance.onstart = () => {
        state.currentSpeakingUtterance = utterance;
        setAssistantState("speaking");
        document.getElementById("stopVoiceBtn").disabled = false;
    };
    
    utterance.onend = () => {
        state.currentSpeakingUtterance = null;
        setAssistantState("idle");
        document.getElementById("stopVoiceBtn").disabled = true;
    };
    
    utterance.onerror = (e) => {
        console.error("SpeechSynthesis error:", e);
        state.currentSpeakingUtterance = null;
        setAssistantState("idle");
        document.getElementById("stopVoiceBtn").disabled = true;
    };
    
    speechSynthesis.speak(utterance);
}

function stopSpeaking() {
    if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.cancel();
        setAssistantState("idle");
        document.getElementById("stopVoiceBtn").disabled = true;
    }
}

// --- VOICE ASSISTANT: STT (Speech to Text) ---

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech Recognition not supported in this browser.");
        document.getElementById("listenBtn").disabled = true;
        document.getElementById("listenBtn").innerText = "Voice Input Unsupported";
        return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
        state.isListening = true;
        setAssistantState("listening");
        document.getElementById("listenBtn").innerHTML = '<i class="fa-solid fa-microphone-slash"></i> Stop Listening';
        // Mute speaker if speaking to prevent echo loops
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
    };
    
    recognition.onresult = (event) => {
        const speechToText = event.results[0][0].transcript;
        addChatMessage(speechToText, "user");
        processVoiceCommand(speechToText);
    };
    
    recognition.onerror = (event) => {
        console.error("Speech Recognition error: ", event.error);
        if (event.error === 'not-allowed') {
            respondVocally("Microphone access was denied. Please allow microphone access in your browser settings.");
        }
        setAssistantState("idle");
    };
    
    recognition.onend = () => {
        state.isListening = false;
        document.getElementById("listenBtn").innerHTML = '<i class="fa-solid fa-microphone"></i> Start Listening';
        // Only set back to idle if we aren't currently speaking
        if (!speechSynthesis.speaking) {
            setAssistantState("idle");
        }
    };
    
    state.speechRecognition = recognition;
}

function toggleListening() {
    if (!state.speechRecognition) return;
    
    if (state.isListening) {
        state.speechRecognition.stop();
    } else {
        state.speechRecognition.start();
    }
}

// UI State controller for voice assistant avatar
function setAssistantState(assistantState) {
    const widget = document.querySelector(".assistant-widget");
    const statusText = document.getElementById("assistantStatusText");
    const icon = document.getElementById("assistantIcon");
    
    widget.classList.remove("idle", "listening", "speaking", "thinking");
    widget.classList.add(assistantState);
    
    if (assistantState === "listening") {
        statusText.innerText = "Listening...";
        icon.className = "fa-solid fa-microphone";
    } else if (assistantState === "speaking") {
        statusText.innerText = "Speaking...";
        icon.className = "fa-solid fa-volume-high";
    } else if (assistantState === "thinking") {
        statusText.innerText = "Analyzing...";
        icon.className = "fa-solid fa-spinner fa-spin";
    } else {
        statusText.innerText = "Idle";
        icon.className = "fa-solid fa-microphone";
    }
}

function addChatMessage(text, sender) {
    const bubbleDiv = document.createElement("div");
    bubbleDiv.classList.add("chat-message", sender);
    
    bubbleDiv.innerHTML = `
        <div class="msg-bubble">${text}</div>
    `;
    
    chatLog.appendChild(bubbleDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
    
    // Max 10 messages stored in list to keep neat
    while (chatLog.children.length > 10) {
        chatLog.removeChild(chatLog.firstChild);
    }
}

// --- VOICE COMMAND / INTENT PARSER ---

async function processVoiceCommand(command) {
    const cmd = command.toLowerCase().trim();
    setAssistantState("thinking");
    
    // 1. Check if there are resumes loaded for query operations
    if (state.resumes.length === 0 && !cmd.includes("hello") && !cmd.includes("hi") && !cmd.includes("help") && !cmd.includes("reset") && !cmd.includes("clear")) {
        setTimeout(() => {
            respondVocally("No resumes loaded. Please upload resumes before querying candidates.");
        }, 800);
        return;
    }
    
    // Sort resumes descending by score to ensure top is rank 1
    const sorted = [...state.resumes].sort((a, b) => b.score - a.score);
    
    // Handle specific intent commands
    
    // INTENT: Greeting
    if (cmd.startsWith("hello") || cmd.startsWith("hi ") || cmd === "hi") {
        respondVocally("Hello! I am Aura. How can I assist you with your candidates today?");
    }
    
    // INTENT: Best Candidate summary
    else if (cmd.includes("best candidate") || cmd.includes("top candidate") || cmd.includes("best applicant") || cmd.includes("top rank") || cmd.includes("highest score")) {
        const top = sorted[0];
        const text = `The top ranked candidate is ${top.name} with a match score of ${top.score} percent. They have strong capabilities in ${top.skillsMatched.slice(0, 3).join(", ") || 'required skills'}.`;
        respondVocally(text);
    }
    
    // INTENT: Compare top two candidates
    else if (cmd.includes("compare top two") || cmd.includes("compare the top two") || cmd.includes("compare candidate") || cmd.includes("compare top candidates")) {
        if (sorted.length < 2) {
            respondVocally("You need at least two candidates uploaded in order to perform a comparison.");
        } else {
            const first = sorted[0];
            const second = sorted[1];
            const diff = first.score - second.score;
            let text = `${first.name} ranks first with ${first.score} percent, ahead of ${second.name} who scored ${second.score} percent. `;
            if (diff > 0) {
                text += `The difference is ${diff} percentage points. `;
            }
            if (first.skillsMatched.length > second.skillsMatched.length) {
                text += `${first.name} matched more core keywords, specifically: ${first.skillsMatched.slice(0, 3).join(", ")}.`;
            } else {
                text += `${second.name} lacks some critical skills required, such as: ${second.skillsMissing.slice(0, 3).join(", ") || 'none'}.`;
            }
            respondVocally(text);
        }
    }
    
    // INTENT: Explanation of ranking metric
    else if (cmd.includes("explain the matching score") || cmd.includes("explain score") || cmd.includes("how are they ranked") || cmd.includes("ranking logic")) {
        const text = "Matching scores are calculated based on three dimensions. Fifty percent is allocated to skill keyword alignment. Thirty percent is based on years of relevant experience matches. The remaining twenty percent comes from formatting layout audits.";
        respondVocally(text);
    }
    
    // INTENT: Clear all candidates
    else if (cmd.includes("reset all") || cmd.includes("clear all") || cmd.includes("delete all") || cmd === "reset" || cmd === "clear") {
        clearAllResumes();
        respondVocally("All candidate resumes and metrics have been cleared successfully.");
    }
    
    // INTENT: Explain details about a specific candidate
    else if (cmd.includes("tell me about") || cmd.includes("explain candidate") || cmd.includes("summarize candidate") || cmd.includes("who is")) {
        // Extract candidate name from query
        let parsedName = cmd.replace("tell me about", "")
                            .replace("explain candidate", "")
                            .replace("summarize candidate", "")
                            .replace("who is", "")
                            .replace("candidate", "")
                            .trim();
        
        if (!parsedName) {
            respondVocally("Please specify a candidate name, for example: tell me about John Doe.");
            return;
        }
        
        // Find best match in candidate array
        const match = state.resumes.find(r => r.name.toLowerCase().includes(parsedName) || parsedName.includes(r.name.toLowerCase()));
        
        if (match) {
            let text = `${match.name} scored ${match.score} percent. `;
            if (match.skillsMatched.length > 0) {
                text += `Their top matching skills are ${match.skillsMatched.slice(0, 3).join(", ")}. `;
            }
            if (match.skillsMissing.length > 0) {
                text += `Missing key skills are ${match.skillsMissing.slice(0, 2).join(", ")}. `;
            }
            text += `Recommendation: ${match.recommendations}`;
            respondVocally(text);
        } else {
            respondVocally(`I could not find a candidate matching the name ${parsedName}. Please check the candidate list table.`);
        }
    }
    
    // LLM Fallback (Gemini Prompting) if API Key is set
    else if (state.settings.aiEngineMode === "gemini" && state.settings.geminiApiKey) {
        try {
            const answer = await queryGeminiConversation(command);
            respondVocally(answer);
        } catch (e) {
            console.error("Gemini query failed, falling back", e);
            respondVocally("I heard you say: " + command + ". However, I couldn't process the query. Try asking: Who is the top candidate?");
        }
    }
    
    // Local Default Canned Responders
    else {
        let matched = false;
        // Search if user mentions candidate name in generic query
        for (let r of state.resumes) {
            if (cmd.includes(r.name.toLowerCase())) {
                respondVocally(`${r.name} has a score of ${r.score}%. Strengths include ${r.strengths[0] || 'experience'}.`);
                matched = true;
                break;
            }
        }
        
        if (!matched) {
            respondVocally(`I heard: "${command}". Try asking: "Who is the top candidate?", "Compare the top two", or "Tell me about ${state.resumes[0]?.name || 'candidates'}".`);
        }
    }
}

// Ask Gemini for conversation response (Optional feature)
async function queryGeminiConversation(userPrompt) {
    const resumesSummary = state.resumes.map(r => ({
        name: r.name,
        score: r.score,
        email: r.email,
        matched: r.skillsMatched,
        missing: r.skillsMissing,
        exp: r.experience,
        recommendation: r.recommendations
    }));
    
    const context = `
You are Aura, an AI voice assistant for a Resume Ranking dashboard.
Below is the list of candidates analyzed relative to the target role: "${state.jobTitle}".
Job Description details: "${state.jobRequirements}".
Candidates analyzed: ${JSON.stringify(resumesSummary)}

The user asked you a verbal question: "${userPrompt}"
Provide a brief, natural-sounding reply (maximum 2-3 sentences) suitable for text-to-speech. Do not include markdown formatting, bold tags, bullet points, or complex symbols. Explain clearly and concisely.
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.settings.geminiApiKey}`;
    
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: context }] }],
            generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
        })
    });
    
    if (!response.ok) throw new Error("Gemini request failed");
    const json = await response.json();
    return json.candidates[0].content.parts[0].text.trim();
}

// --- FILE PARSING & PIPELINE ---

async function handleFileUploads(files) {
    // Basic verification: Check if job details are configured
    if (!state.jobRequirements.trim()) {
        respondVocally("Please specify job description requirements before uploading resumes.");
        return;
    }
    
    setAssistantState("thinking");
    
    for (let file of files) {
        // Add to queue UI
        const queueId = "q-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
        addQueueItemUI(queueId, file.name);
        
        try {
            let text = "";
            const fileNameLower = file.name.toLowerCase();
            if (file.type === "application/pdf" || fileNameLower.endsWith(".pdf")) {
                text = await parsePDFFile(file);
            } else if (file.type === "text/plain" || fileNameLower.endsWith(".txt")) {
                text = await parseTextFile(file);
            } else {
                throw new Error("Unsupported file format. Only PDF and TXT files are supported.");
            }
            
            // Clean up parsed text
            text = text.trim();
            if (text.length < 50) {
                throw new Error("Extracted text too short. Resume may be scanned image/unreadable.");
            }
            
            // Analyze using Heuristic or Gemini
            let parsedObj;
            if (state.settings.aiEngineMode === "gemini" && state.settings.geminiApiKey) {
                updateQueueStatus(queueId, "Analyzing with Gemini...", "loading");
                parsedObj = await analyzeWithGemini(text, file.name);
            } else {
                updateQueueStatus(queueId, "Analyzing locally...", "loading");
                parsedObj = analyzeLocally(text, file.name);
            }
            
            // Add ID
            parsedObj.id = "res-" + Date.now() + "-" + Math.floor(Math.random()*1000);
            parsedObj.filename = file.name;
            parsedObj.rawText = text;
            
            state.resumes.push(parsedObj);
            updateQueueStatus(queueId, "Success", "success");
            
        } catch (err) {
            console.error("Error processing file " + file.name, err);
            updateQueueStatus(queueId, err.message || "Failed to analyze", "error");
        }
    }
    
    // Sort and update rankings
    updateDashboard();
    
    // Verbal announcement of upload completion
    if (state.resumes.length > 0) {
        const sorted = [...state.resumes].sort((a, b) => b.score - a.score);
        const top = sorted[0];
        const count = files.length;
        
        setTimeout(() => {
            let greeting = `Processed ${count} resume${count > 1 ? 's' : ''}. `;
            greeting += `The current leader is ${top.name} with a match rating of ${top.score} percent.`;
            respondVocally(greeting);
        }, 1200);
    }
}

// PDF Parser using PDF.js
function parsePDFFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                const arrayBuffer = this.result;
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = "";
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    fullText += pageText + "\n";
                }
                
                resolve(fullText);
            } catch (err) {
                reject(new Error("Failed to parse PDF pages: " + err.message));
            }
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsArrayBuffer(file);
    });
}

// Text Parser using standard FileReader
function parseTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function() {
            resolve(this.result);
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsText(file);
    });
}

// --- QUEUE UI HELPERS ---
function addQueueItemUI(id, filename) {
    const div = document.createElement("div");
    div.id = id;
    div.className = "queue-item";
    div.innerHTML = `
        <div class="queue-item-details">
            <i class="fa-solid fa-file-pdf"></i>
            <span>${filename}</span>
        </div>
        <div class="queue-item-status loading">Parsing...</div>
    `;
    uploadQueue.appendChild(div);
    uploadQueue.scrollTop = uploadQueue.scrollHeight;
}

function updateQueueStatus(id, text, statusClass) {
    const item = document.getElementById(id);
    if (item) {
        const statusDiv = item.querySelector(".queue-item-status");
        statusDiv.innerText = text;
        statusDiv.className = `queue-item-status ${statusClass}`;
        
        // If success or error, remove after 5 seconds to keep queue clean
        if (statusClass === "success" || statusClass === "error") {
            setTimeout(() => {
                if (item.parentNode) {
                    item.parentNode.removeChild(item);
                }
            }, 6000);
        }
    }
}

// --- AI SCORING: LOCAL HEURISTICS ENGINE ---

function analyzeLocally(text, filename) {
    // 1. Text Normalization
    const normalizedText = text.toLowerCase();
    
    // 2. Contact details extraction via regex
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : "N/A";
    
    const phoneMatch = text.match(/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/);
    const phone = phoneMatch ? phoneMatch[0] : "N/A";
    
    // Name Extraction: Grab first non-trivial line from the top of the text
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    let name = "Unknown Candidate";
    
    // Heuristics: search top 4 lines that don't match typical keywords, headers or contact elements
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i];
        if (!line.includes("@") && 
            !line.includes("resume") && 
            !line.includes("curriculum") && 
            !line.includes("cv") &&
            !/\d{4,}/.test(line) && // no phone numbers or long digits
            line.split(/\s+/).length >= 2 && 
            line.split(/\s+/).length <= 4) {
            
            // Capitalize properly
            name = line.replace(/[^a-zA-Z\s]/g, "").split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
            break;
        }
    }
    
    // If we failed, fallback to filename
    if (name === "Unknown Candidate" && filename) {
        name = filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }

    // 3. Keyword/Skills analysis
    const reqSkills = state.jobRequirements.toLowerCase().split(/[\s,;\n]+/).map(s => s.trim()).filter(s => s.length > 2);
    
    // Unique list of requirements
    const uniqueReqs = [...new Set(reqSkills)];
    
    let matchedSkills = [];
    let missingSkills = [];
    
    if (uniqueReqs.length > 0) {
        uniqueReqs.forEach(skill => {
            // Check boundary matching or sub-word inclusion
            const escaped = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp("\\b" + escaped + "\\b|\\b" + escaped, "i");
            if (regex.test(normalizedText)) {
                matchedSkills.push(skill);
            } else {
                missingSkills.push(skill);
            }
        });
    }

    // Calculate Skills Match Rating (50% of total score)
    const skillScore = uniqueReqs.length > 0 ? Math.round((matchedSkills.length / uniqueReqs.length) * 100) : 70;

    // 4. Experience Evaluation (30% of total score)
    let experienceYears = 0;
    const expRegexes = [
        /(\d+)\+?\s*years?\s+of\s+exp/gi,
        /(\d+)\+?\s*years?\s+(?:of\s+)?experience/gi,
        /experience[:\s]+(\d+)\+?\s*years/gi
    ];
    
    let match;
    for (let regex of expRegexes) {
        while ((match = regex.exec(normalizedText)) !== null) {
            const val = parseInt(match[1]);
            if (val > experienceYears && val < 40) {
                experienceYears = val;
            }
        }
    }
    
    // Secondary experience check: find date years (e.g. 2018 - 2022) to estimate total duration
    if (experienceYears === 0) {
        const yearRangeRegex = /\b(19\d{2}|20\d{2})\s*[-–—]\s*(20\d{2}|present)\b/gi;
        let datesMatches = [];
        while ((match = yearRangeRegex.exec(normalizedText)) !== null) {
            const startYear = parseInt(match[1]);
            const endYear = match[2].toLowerCase() === "present" ? new Date().getFullYear() : parseInt(match[2]);
            if (endYear >= startYear) {
                datesMatches.push(endYear - startYear);
            }
        }
        if (datesMatches.length > 0) {
            experienceYears = Math.min(30, datesMatches.reduce((a, b) => a + b, 0));
        }
    }
    
    // Assume moderate experience fallback if years not explicit but role phrases exist
    if (experienceYears === 0) {
        if (normalizedText.includes("senior") || normalizedText.includes("lead") || normalizedText.includes("principal")) {
            experienceYears = 6;
        } else if (normalizedText.includes("junior") || normalizedText.includes("intern")) {
            experienceYears = 1;
        } else {
            experienceYears = 3;
        }
    }
    
    // Target experience rating
    let expScore = 70;
    if (state.jobTitle.toLowerCase().includes("senior") || state.jobRequirements.toLowerCase().includes("5+ years") || state.jobRequirements.toLowerCase().includes("senior")) {
        expScore = experienceYears >= 5 ? 100 : (experienceYears / 5) * 100;
    } else if (state.jobTitle.toLowerCase().includes("lead") || state.jobTitle.toLowerCase().includes("manager")) {
        expScore = experienceYears >= 8 ? 100 : (experienceYears / 8) * 100;
    } else {
        expScore = experienceYears >= 2 ? 100 : (experienceYears / 2) * 100;
    }
    expScore = Math.round(Math.min(100, Math.max(20, expScore)));

    // 5. Structure & Formatting audit (20% of total score)
    let formatMatches = 0;
    standardHeaders.forEach(hdr => {
        if (normalizedText.includes(hdr)) formatMatches++;
    });
    const formatScore = Math.round((formatMatches / standardHeaders.length) * 100);

    // 6. Weighted Sum Score
    const overallScore = Math.round((skillScore * 0.5) + (expScore * 0.3) + (formatScore * 0.2));

    // 7. Assessment Insights
    const strengths = [];
    const gaps = [];
    
    if (matchedSkills.length > 0) {
        strengths.push(`Matches essential technologies: ${matchedSkills.slice(0, 3).join(", ")}.`);
    }
    if (experienceYears >= 5) {
        strengths.push(`Possesses a solid senior-level career log of ${experienceYears} years.`);
    } else if (experienceYears > 0) {
        strengths.push(`Demonstrated hands-on experience of ${experienceYears} years in field.`);
    }
    if (formatScore >= 70) {
        strengths.push("Excellent resume structure featuring standard ATS sections.");
    }
    
    if (missingSkills.length > 0) {
        gaps.push(`Missing alignment with critical requirements: ${missingSkills.slice(0, 4).join(", ")}.`);
    }
    if (experienceYears < 4 && state.jobTitle.toLowerCase().includes("senior")) {
        gaps.push("Candidate years of experience fall short of senior expectations.");
    }
    if (formatScore < 50) {
        gaps.push("Incomplete formatting structure. Standard section headings are missing.");
    }

    if (strengths.length === 0) strengths.push("Valid parser format template.");
    if (gaps.length === 0) gaps.push("No critical gaps detected relative to criteria.");

    // Tailored Recommendations
    let recommendations = "";
    if (missingSkills.length > 0) {
        recommendations = `Focus on acquiring expertise in ${missingSkills.slice(0, 3).join(", ")}, or make these keywords explicit in the resume if already proficient. `;
    } else {
        recommendations = `Great candidate alignment! Proceed with phone screening and verify details. `;
    }
    
    if (experienceYears < 5 && state.jobTitle.toLowerCase().includes("senior")) {
        recommendations += "Add detailed examples of project leadership to offset short timeline experience.";
    }

    return {
        name,
        email,
        phone,
        experience: `${experienceYears} Years`,
        skillsMatched: matchedSkills.map(s => s.toUpperCase()),
        skillsMissing: missingSkills.map(s => s.toUpperCase()),
        score: overallScore,
        scoreBreakdown: {
            skillMatch: skillScore,
            experience: expScore,
            formatting: formatScore
        },
        strengths,
        gaps,
        recommendations
    };
}

// --- AI SCORING: GOOGLE GEMINI API ENGINE ---

async function analyzeWithGemini(rawText, filename) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.settings.geminiApiKey}`;
    
    const prompt = `
You are an expert ATS (Applicant Tracking System) parser and HR analyst.
Analyze the following resume text relative to the target job requirements.

Target Job Title: "${state.jobTitle}"
Target Job Requirements: "${state.jobRequirements}"

Resume Text Content:
---
${rawText}
---

Provide a structured, parseable JSON response containing candidate details and scoring. You MUST return ONLY the JSON object, with no markdown backticks, no comments, and no extra text. Use the following JSON schema:
{
    "name": "Candidate Name",
    "email": "candidate@email.com",
    "phone": "Candidate Phone Number",
    "experience": "X Years (summarize length briefly)",
    "skillsMatched": ["SKILL1", "SKILL2", "SKILL3"],
    "skillsMissing": ["MISSING1", "MISSING2"],
    "score": 85, (overall rating 0-100 based on fit)
    "scoreBreakdown": {
        "skillMatch": 90, (score 0-100)
        "experience": 80, (score 0-100)
        "formatting": 80 (score 0-100 based on standard section presence)
    },
    "strengths": ["Strengths list item 1", "Strengths list item 2"],
    "gaps": ["Gaps list item 1", "Gaps list item 2"],
    "recommendations": "Tailored actionable advice for this candidate to improve matching"
}
`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1
            }
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText.slice(0, 100)}`);
    }
    
    const responseJson = await response.json();
    const resultText = responseJson.candidates[0].content.parts[0].text;
    
    // Parse the JSON output
    try {
        const parsed = JSON.parse(resultText.trim());
        
        // Basic validators
        if (!parsed.name || parsed.name === "Candidate Name") {
            parsed.name = filename.replace(/\.[^/.]+$/, "");
        }
        
        // Format skills to uppercase
        if (parsed.skillsMatched) parsed.skillsMatched = parsed.skillsMatched.map(s => s.toUpperCase());
        if (parsed.skillsMissing) parsed.skillsMissing = parsed.skillsMissing.map(s => s.toUpperCase());
        
        return parsed;
    } catch (e) {
        console.error("Failed to parse Gemini output: " + resultText, e);
        throw new Error("Gemini returned invalid JSON formatting. Defaulting back to local parser.");
    }
}

// --- DASHBOARD UPDATER ---

function updateDashboard() {
    // 1. Sort state resumes descending by overall score
    state.resumes.sort((a, b) => b.score - a.score);
    
    // 2. Update metric numbers
    const total = state.resumes.length;
    document.getElementById("statTotalResumes").innerText = total;
    
    if (total > 0) {
        const topScore = state.resumes[0].score;
        document.getElementById("statTopScore").innerText = `${topScore}%`;
        
        const sum = state.resumes.reduce((acc, curr) => acc + curr.score, 0);
        const avg = Math.round(sum / total);
        document.getElementById("statAvgScore").innerText = `${avg}%`;
        
        document.getElementById("statTopCandidate").innerText = state.resumes[0].name;
    } else {
        document.getElementById("statTopScore").innerText = "0%";
        document.getElementById("statAvgScore").innerText = "0%";
        document.getElementById("statTopCandidate").innerText = "None";
    }
    
    // 3. Render Table rows
    rankingsTableBody.innerHTML = "";
    
    if (total === 0) {
        const tr = document.createElement("tr");
        tr.id = "emptyRow";
        tr.innerHTML = `
            <td colspan="7" class="empty-message-cell">
                <i class="fa-solid fa-folder-open empty-icon"></i>
                <p>No resumes analyzed yet. Complete the Job Profile and upload resumes above to start ranking.</p>
            </td>
        `;
        rankingsTableBody.appendChild(tr);
        return;
    }
    
    state.resumes.forEach((resume, idx) => {
        const tr = document.createElement("tr");
        const rank = idx + 1;
        
        // Score color class
        let scoreClass = "score-low";
        if (resume.score >= 80) scoreClass = "score-high";
        else if (resume.score >= 50) scoreClass = "score-mid";
        
        // Max 5 skills displayed in table
        const matchedTags = resume.skillsMatched.slice(0, 4).map(s => `<span class="skill-tag matched">${s}</span>`).join("");
        const missingTags = resume.skillsMissing.slice(0, 4).map(s => `<span class="skill-tag missing">${s}</span>`).join("");
        
        tr.innerHTML = `
            <td style="font-weight: 700; font-size: 1.1rem; text-align: center; color: ${rank === 1 ? 'var(--accent-purple)' : 'inherit'}">
                ${rank === 1 ? '<i class="fa-solid fa-crown"></i> ' : ''}#${rank}
            </td>
            <td>
                <div class="candidate-name">${resume.name}</div>
                <div class="candidate-contact">${resume.email}</div>
            </td>
            <td>
                <div class="score-badge-circle ${scoreClass}">${resume.score}%</div>
            </td>
            <td>
                <span style="font-weight: 500;">${resume.experience}</span>
            </td>
            <td>
                <div class="tag-list">${matchedTags || '<span class="text-muted">None</span>'}</div>
            </td>
            <td>
                <div class="tag-list">${missingTags || '<span class="text-muted">None</span>'}</div>
            </td>
            <td>
                <div class="action-cell">
                    <button class="table-action-btn view-btn" title="View Assessment Details" data-id="${resume.id}"><i class="fa-solid fa-chart-pie"></i></button>
                    <button class="table-action-btn speak-btn" title="Listen to AI Summary" data-id="${resume.id}"><i class="fa-solid fa-volume-high"></i></button>
                    <button class="table-action-btn delete-btn" title="Delete Resume" data-id="${resume.id}"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        rankingsTableBody.appendChild(tr);
    });
    
    // Attach dynamically generated action events
    document.querySelectorAll(".view-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = btn.getAttribute("data-id");
            openDetailsModal(id);
        });
    });
    
    document.querySelectorAll(".speak-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = btn.getAttribute("data-id");
            const resume = state.resumes.find(r => r.id === id);
            if (resume) {
                const text = `Candidate ${resume.name} has a matching score of ${resume.score} percent. Experience is: ${resume.experience}. Strengths include: ${resume.strengths[0] || 'matching profile'}.`;
                respondVocally(text);
            }
        });
    });
    
    document.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = btn.getAttribute("data-id");
            deleteResume(id);
        });
    });
}

function deleteResume(id) {
    state.resumes = state.resumes.filter(r => r.id !== id);
    updateDashboard();
}

function clearAllResumes() {
    state.resumes = [];
    updateDashboard();
    uploadQueue.innerHTML = "";
}

// --- MODALS IMPLEMENTATION ---

// Settings MODAL
function openSettings() {
    settingsModal.classList.add("show");
}

function closeSettings() {
    settingsModal.classList.remove("show");
}

function saveConfigurations() {
    const key = document.getElementById("geminiApiKey").value.trim();
    const mode = document.querySelector('input[name="aiEngineMode"]:checked').value;
    const voice = document.getElementById("voiceSelect").value;
    
    state.settings.geminiApiKey = key;
    state.settings.aiEngineMode = mode;
    state.settings.voiceSelect = voice;
    
    saveSettings();
    closeSettings();
    
    respondVocally(`Configurations saved successfully. Engine set to ${mode === 'gemini' ? 'Gemini AI' : 'Local Heuristics'}.`);
}

// Details MODAL
function openDetailsModal(id) {
    const resume = state.resumes.find(r => r.id === id);
    if (!resume) return;
    
    document.getElementById("modalCandidateName").innerText = resume.name;
    document.getElementById("modalCandidateContact").innerHTML = `<i class="fa-solid fa-envelope"></i> ${resume.email} | <i class="fa-solid fa-phone"></i> ${resume.phone}`;
    
    // Set score elements
    document.getElementById("modalScoreText").innerText = `${resume.score}%`;
    
    // Set progress ring
    const circle = document.getElementById("modalProgressCircle");
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (resume.score / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    
    // Set breakdown flat bars
    document.getElementById("barSkillMatch").style.width = `${resume.scoreBreakdown.skillMatch}%`;
    document.getElementById("valSkillMatch").innerText = `${resume.scoreBreakdown.skillMatch}%`;
    
    document.getElementById("barExpMatch").style.width = `${resume.scoreBreakdown.experience}%`;
    document.getElementById("valExpMatch").innerText = `${resume.scoreBreakdown.experience}%`;
    
    document.getElementById("barFormatMatch").style.width = `${resume.scoreBreakdown.formatting}%`;
    document.getElementById("valFormatMatch").innerText = `${resume.scoreBreakdown.formatting}%`;
    
    // Strengths list
    const strengthsUl = document.getElementById("modalStrengthsList");
    strengthsUl.innerHTML = resume.strengths.map(s => `<li>${s}</li>`).join("");
    
    // Gaps list
    const gapsUl = document.getElementById("modalGapsList");
    gapsUl.innerHTML = resume.gaps.map(g => `<li>${g}</li>`).join("");
    
    // Feedback Recommendations
    document.getElementById("modalFeedbackText").innerText = resume.recommendations;
    
    // Raw Text display
    document.getElementById("modalRawText").innerText = resume.rawText;
    
    // Default active tab to AI Assessment
    document.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelector('.tab-btn[data-tab="tabInsights"]').classList.add("active");
    document.getElementById("tabInsights").classList.add("active");
    
    detailsModal.classList.add("show");
}

function closeDetails() {
    detailsModal.classList.remove("show");
}
