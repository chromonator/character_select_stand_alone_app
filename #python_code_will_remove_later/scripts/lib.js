//more and more functions
function my_custom_js() {
    class WebSocketManager {
        #ws = null;
        #reconnectInterval = null;
        #isWebSocketInitialized = false;
        #pendingImage = null;
        #isManuallyClosed = false; 
        #INITIAL_RETRY_INTERVAL = 500; 
        #MAX_INITIAL_RETRIES = 10; 
    
        constructor() {}

        async init(retryCount = 0) {
            if (this.#isWebSocketInitialized && this.#ws && this.#ws.readyState === WebSocket.OPEN) {
                console.log('[WebSocket] Already initialized and connected');
                return this.#ws;
            }
    
            if (this.#ws) {
                this.#ws.close();
                this.#ws = null;
            }
    
            const wsServer = `ws://127.0.0.1:${window.WS_PORT}/ws`;

            try {
                this.#ws = new WebSocket(wsServer);
                this.#isWebSocketInitialized = true;

                this.#ws.onopen = () => {
                    //console.log('[WebSocket] Connected to', wsServer);
                    if (this.#reconnectInterval) {
                        clearInterval(this.#reconnectInterval);
                        this.#reconnectInterval = null;
                    }
                    this.#isManuallyClosed = false; 
                };
    
                this.#ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (!data.command || typeof data.command !== 'string') {
                            console.warn('[WebSocket] Invalid or missing command:', data);
                            return;
                        }
                        if (data.command === 'preview_image') {
                            if (data.base64 && data.base64.startsWith('data:image/')) {
                                this.handlePreviewImageResponse(data.base64.trim());
                            } else {
                                this.#pendingImage = null; 
                            }
                        } else if (data.command === 'final_image') {
                            if (data.base64 && data.base64.startsWith('data:image/') && data.seed && data.tags && data.keep_gallery) {                                
                                this.handleFinalImageResponse(data.base64.trim(), data.seed.trim(), data.tags.trim(), data.keep_gallery);
                                this.#ws.send(JSON.stringify({ command: 'final_image_ack', seed: data.seed }));

                                if(data.final_infos) {
                                    const finalInfos = data.final_infos.trim();
                                    window.allInfoBox.updateContent(finalInfos);
                                }
                            } 
                        } else {
                            console.warn('[WebSocket] Invalid data.command:', data.command);
                        }
                    } catch (e) {
                        console.warn('[WebSocket] Failed to process message:', e.message);
                    }
                };
    
                this.#ws.onerror = (error) => {
                    console.warn('[WebSocket] Error:', error);
                };
    
                this.#ws.onclose = async () => {
                    this.#ws = null;
                    if (this.#isManuallyClosed) {
                        return;
                    }
                    if (retryCount < this.#MAX_INITIAL_RETRIES) {
                        console.warn(`[WebSocket] Initial connection attempt ${retryCount + 1} failed, retrying in ${this.#INITIAL_RETRY_INTERVAL}ms...`);
                        await new Promise(resolve => setTimeout(resolve, this.#INITIAL_RETRY_INTERVAL));
                        return this.init(retryCount + 1);
                    }
                    console.error('[WebSocket] Max retry attempts reached, giving up');
                };
    
                return this.#ws;
            } catch (e) {
                console.warn('[WebSocket] Failed to initialize:', e.message);
                if (retryCount < this.#MAX_INITIAL_RETRIES) {
                    console.warn(`[WebSocket] Initial connection attempt ${retryCount + 1} failed, retrying in ${this.#INITIAL_RETRY_INTERVAL}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.#INITIAL_RETRY_INTERVAL));
                    return this.init(retryCount + 1);
                }
                console.error('[WebSocket] Max retry attempts reached, giving up');
                return null;
            }
        }

        async open() {
            if (this.#isWebSocketInitialized && this.#ws && this.#ws.readyState === WebSocket.OPEN) {
                return this.#ws;
            }
            this.#isManuallyClosed = false; 
            return await this.init(0);
        }

        close() {
            this.#isManuallyClosed = true;
            this.cleanup();
        }
    
        handlePreviewImageResponse(base64) {
            this.#pendingImage = base64; 
            const overlay = document.getElementById('cg-loading-overlay');
            if (!overlay) {
                customCommonOverlay().createLoadingOverlay();
                setTimeout(() => this.updatePreviewImage(base64), 0);
                return;
            }
    
            const imgElement = overlay.querySelector('img');
            if (imgElement) {
                imgElement.src = base64;
                imgElement.style.maxWidth = '256px';
                imgElement.style.maxHeight = '384px';
                imgElement.style.objectFit = 'contain';
                imgElement.onerror = () => {
                    console.warn('[handlePreviewImageResponse] Failed to load preview image, reverting to default');
                    imgElement.src = window.LOADING_WAIT_BASE64;
                    imgElement.style.maxWidth = '128px';
                    imgElement.style.maxHeight = '128px';
                    imgElement.onerror = null;
                    this.#pendingImage = null; 
                };
            } 
        }
    
        handleFinalImageResponse(base64, seed, tags, keep_gallery) {
            const galleryContainer = document.getElementById('cg-custom-gallery');
            if (!galleryContainer) {
                console.error('[handleFinalImageResponse] Gallery container not found');
                return;
            }
    
            if (!base64.startsWith('data:image/')) {
                console.error('[handleFinalImageResponse] Invalid base64 image data');
                return;
            }
    
            window.cgCustomGallery.appendImageData(base64, seed, tags, keep_gallery);
            this.#pendingImage = null;             
        }
    
        updatePreviewImage(base64) {
            this.handlePreviewImageResponse(base64);
        }
    
        getPendingImage() {
            return this.#pendingImage;
        }
    
        cleanup() {
            if (this.#ws) {
                this.#ws.close();
                this.#ws = null;
            }
            if (this.#reconnectInterval) {
                clearInterval(this.#reconnectInterval);
                this.#reconnectInterval = null;
            }
            this.#pendingImage = null;
            this.#isWebSocketInitialized = false;
        }
    }

    console.log("[My JS] Script loaded, attempting initial setup");    
    window.LOADING_MESSAGE = 'Processing...';
    window.ELAPSED_TIME_PREFIX = 'Time elapsed: ';
    window.ELAPSED_TIME_SUFFIX = 'sec';
    window.WS_PORT = 47761;
    window.dropdowns = window.dropdowns || {};
    
    // Synchronously initialize dropdowns to ensure availability
    dark_theme();
    myCharacterList();
    myViewsList();
    setupThumbOverlay();

    requestIdleCallback(() => {
        setupSuggestionSystem();
        setupGallery();
        setupThumb();
        setupButtonOverlay();
        if (!window.dropdowns['mydropdown-container']) {
            myCharacterList(); 
        }
        if (!window.dropdowns['myviews-container']) {
            myViewsList(); 
        }
    });    
    window.customOverlay = customCommonOverlay();
    
    window.setupInfoBox = function(title_all, text_all) {    
        window.allInfoBox = initInfoBox(
            'ib-info-all',
            title_all,
            text_all
        );
    }

    // Initialize the WebSocket manager but do not connect automatically
    window.wsManager = new WebSocketManager();

    window.addEventListener('resize', () => {
        const overlays = ['cg-button-overlay', 'cg-loading-overlay'];
        overlays.forEach(id => {
            const overlay = document.getElementById(id);
            if (overlay && !overlay.classList.contains('minimized')) {
                restrictOverlayPosition(overlay, {
                    translateX: id === 'cg-loading-overlay' 
                        ? (window.innerWidth - overlay.offsetWidth) / 2 
                        : window.innerWidth * 0.5 - 120,
                    translateY: id === 'cg-loading-overlay' 
                        ? window.innerHeight * 0.2 - overlay.offsetHeight * 0.2 
                        : window.innerHeight * 0.8
                });
            }
        });
    });

    // Apply dark theme
    function dark_theme() {
        const url = new URL(window.location);
        if (url.searchParams.get('__theme') !== 'dark') {
            url.searchParams.set('__theme', 'dark');
            window.location.href = url.href;
        }
    }

    // Utility: Debounce function to limit frequent calls
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Utility: Setup scrollable container with drag functionality
    function setupScrollableContainer(container) {
        let isDragging = false, startX, scrollLeft;
        container.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            container.style.cursor = 'grabbing';
            startX = e.pageX - container.offsetLeft;
            scrollLeft = container.scrollLeft;
            document.body.style.userSelect = 'none';
        });
        container.addEventListener('mouseleave', () => {
            isDragging = false;
            container.style.cursor = 'grab';
            document.body.style.userSelect = '';
        });
        container.addEventListener('mouseup', () => {
            isDragging = false;
            container.style.cursor = 'grab';
            document.body.style.userSelect = '';
        });
        container.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - container.offsetLeft;
            const walk = (x - startX) * 1;
            container.scrollLeft = scrollLeft - walk;
        });
    }

    function createModeSwitchOverlay(container) {
        let overlay = document.getElementById('cg-mode-switch-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'cg-mode-switch-overlay';
            overlay.className = 'cg-mode-switch-overlay';
            overlay.innerHTML = `
                <div class="cg-mode-switch-spinner"></div>
                <div class="cg-mode-switch-text">Switching Gallery Mode...</div>
            `;
            container.appendChild(overlay);
        }
        return overlay;
    }
    
    function ensureSwitchModeButton(container, toggleFunction, id, images_length) {
        let button = document.getElementById(id);
        if (!button) {
            button = document.createElement('button');
            button.id = id;
            button.className = 'cg-button';
            button.textContent = images_length > 0 ? `<${images_length}>` : '<>';
            button.addEventListener('click', async () => {
                const overlay = createModeSwitchOverlay(container);
                overlay.classList.add('visible');
    
                await new Promise(resolve => setTimeout(resolve, 100));
                toggleFunction();
    
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        overlay.classList.remove('visible');
                        setTimeout(() => overlay.remove(), 300);
                    }, 10000); // assume 10 seconds for the animation to finish
                });
            });
            container.appendChild(button);
        }
        else {
            button.textContent = images_length > 0 ? `<${images_length}>` : '<>';
        }
    }

    function setupSuggestionSystem() {
        const textboxes = document.querySelectorAll(
            '#custom_prompt_text textarea, #positive_prompt_text textarea, #negative_prompt_text textarea, #ai_prompt_text textarea, #prompt_ban_text textarea'
        );
    
        let lastWordSent = '';
        let skipSuggestion = false;
    
        textboxes.forEach(textbox => {
            if (textbox.dataset.suggestionSetup) return;
    
            console.log('Setting up the Suggestion System for ', textbox);
    
            const suggestionBox = document.createElement('div');
            suggestionBox.className = 'suggestion-box scroll-container';
            suggestionBox.style.display = 'none';
            document.body.appendChild(suggestionBox);
    
            let selectedIndex = -1;
            let currentSuggestions = [];
            const textboxWidth = textbox.offsetWidth;
    
            suggestionBox.addEventListener('click', (e) => {
                const item = e.target.closest('.suggestion-item');
                if (item) applySuggestion(item.dataset.value);
            });
    
            textbox.addEventListener('input', debounce(async () => {
                if (skipSuggestion) {
                    skipSuggestion = false;
                    return; 
                }

                updateSuggestionBoxPosition();
    
                const value = textbox.value;
                const cursorPosition = textbox.selectionStart;
                let wordToSend = extractWordToSend(value, cursorPosition);
    
                if (!wordToSend || wordToSend === lastWordSent) {
                    suggestionBox.style.display = 'none';
                    return;
                }
                lastWordSent = wordToSend;
    
                try {
                    const initialResponse = await fetch('/gradio_api/call/update_suggestions_js', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fn_index: 0, data: [wordToSend] })
                    });
    
                    if (!initialResponse.ok) throw new Error(`Initial API failed: ${initialResponse.status}`);
    
                    const initialResult = await initialResponse.json();
                    const eventId = initialResult.event_id;
                    if (!eventId) throw new Error('No event_id in response');
    
                    const suggestionResponse = await fetch(`/gradio_api/call/update_suggestions_js/${eventId}`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' }
                    });
    
                    if (!suggestionResponse.ok) throw new Error(`Suggestion API failed: ${suggestionResponse.status}`);
    
                    const rawSuggestions = await suggestionResponse.text();
                    const dataLine = rawSuggestions.split('\n').find(line => line.startsWith('data:'));
                    if (!dataLine) throw new Error('No data in response');
    
                    const suggestions = JSON.parse(dataLine.replace('data:', '').trim());
    
                    if (!suggestions || suggestions.length === 0 || suggestions.every(s => s.length === 0)) {
                        suggestionBox.style.display = 'none';
                        return;
                    }
    
                    const fragment = document.createDocumentFragment();
                    let maxWidth = 0;
                    const tempDiv = document.createElement('div');
                    tempDiv.style.position = 'absolute';
                    tempDiv.style.visibility = 'hidden';
                    tempDiv.style.whiteSpace = 'nowrap';
                    document.body.appendChild(tempDiv);
    
                    currentSuggestions = [];
                    suggestions[0].forEach((suggestion, index) => {
                        if (!Array.isArray(suggestion) || suggestion.length === 0) {
                            console.warn('Invalid suggestion format at index', index, suggestion);
                            return;
                        }
                        const element = suggestion[0];
                        if (typeof element !== 'string') {
                            console.error('Unexpected element type at index', index, ':', typeof element, element);
                            return;
                        }
                        const item = document.createElement('div');
                        item.className = 'suggestion-item';
                        item.innerHTML = element;
                        const promptMatch = element.match(/<b>(.*?)<\/b>/);
                        item.dataset.value = promptMatch ? promptMatch[1] : element.split(':')[0].trim();
                        tempDiv.textContent = element.replace(/<[^>]+>/g, '');
                        maxWidth = Math.max(maxWidth, tempDiv.offsetWidth);
                        currentSuggestions.push({ prompt: element });
                        fragment.appendChild(item);
                    });
    
                    document.body.removeChild(tempDiv);
                    suggestionBox.innerHTML = '';
                    suggestionBox.appendChild(fragment);
                    suggestionBox.style.width = `${Math.min(maxWidth + 20, 300)}px`;
                    suggestionBox.style.display = 'block';
                    selectedIndex = -1;
    
                } catch (error) {
                    console.error('Suggestion system error:', error);
                    suggestionBox.style.display = 'none';
                }
            }, 50));

            textbox.addEventListener('keydown', (e) => {
                if (suggestionBox.style.display !== 'none') {

                    const items = suggestionBox.querySelectorAll('.suggestion-item');
                    if (items.length === 0) return;

                    if (e.key === 'Tab' || e.key === 'Enter') {
                        e.preventDefault();
                        if (selectedIndex >= 0 && selectedIndex < currentSuggestions.length) {
                            applySuggestion(currentSuggestions[selectedIndex].prompt);
                        } else if (items.length > 0) {
                            applySuggestion(currentSuggestions[0].prompt);
                        }
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                        updateSelection(items);
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        selectedIndex = Math.max(selectedIndex - 1, 0);
                        updateSelection(items);
                    } else if (e.key === 'Escape') {
                        suggestionBox.style.display = 'none';
                    }
                }

                if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                    e.preventDefault();
                    adjustWeight(e.key === 'ArrowUp', textbox);
                }
            });

            function adjustWeight(isIncrease, textbox) {
                const value = textbox.value;
                const startPos = textbox.selectionStart;
                const endPos = textbox.selectionEnd;
    
                let targetText, start, end;
    
                if (startPos !== endPos) {
                    targetText = value.slice(startPos, endPos);
                    start = startPos;
                    end = endPos;
                } else {
                    const beforeCursor = value.slice(0, startPos);
                    const afterCursor = value.slice(startPos);
    
                    const bracketMatch = findBracketedTag(beforeCursor, afterCursor);
                    if (bracketMatch) {
                        targetText = bracketMatch.text;
                        start = bracketMatch.start;
                        end = bracketMatch.end;
                    } else {
                        const lastSeparatorBefore = Math.max(beforeCursor.lastIndexOf(','), beforeCursor.lastIndexOf('\n'));
                        const firstSeparatorAfter = afterCursor.indexOf(',') >= 0 ? afterCursor.indexOf(',') : afterCursor.indexOf('\n');
                        start = lastSeparatorBefore >= 0 ? lastSeparatorBefore + 1 : 0;
                        end = firstSeparatorAfter >= 0 ? startPos + firstSeparatorAfter : value.length;
                        targetText = value.slice(start, end).trim();
                    }
                }
    
                if (!targetText) return;
    
                let currentWeight = 1.0;
                const weightMatch = targetText.match(/^\((.+):(\d*\.?\d+)\)$/);
                if (weightMatch) {
                    targetText = weightMatch[1];
                    currentWeight = parseFloat(weightMatch[2]);
                }
    
                const step = 0.05;
                currentWeight = isIncrease ? currentWeight + step : currentWeight - step;
                if (currentWeight < 0.0 || currentWeight > 3.0) return;
                currentWeight = parseFloat(currentWeight.toFixed(2));
    
                const newTag = currentWeight === 1.0 ? targetText : `(${targetText}:${currentWeight})`;
    
                const newValue = value.slice(0, start) + newTag + value.slice(end);
                textbox.value = newValue;
    
                const newCursorPos = start + newTag.length;
                textbox.setSelectionRange(newCursorPos, newCursorPos);
    
                textbox.dispatchEvent(new Event('input', { bubbles: true }));
            }
    
            function findBracketedTag(beforeCursor, afterCursor) {
                const fullText = beforeCursor + afterCursor;
                const cursorPos = beforeCursor.length;
    
                const bracketRegex = /\(([^()]+:\d*\.?\d+)\)/g;
                let match;
                while ((match = bracketRegex.exec(fullText)) !== null) {
                    const start = match.index;
                    const end = start + match[0].length;
                    if (start <= cursorPos && cursorPos <= end) {
                        return {
                            text: match[0],
                            start: start,
                            end: end
                        };
                    }
                }
                return null;
            }

            document.addEventListener('click', (e) => {
                if (!suggestionBox.contains(e.target) && e.target !== textbox) {
                    suggestionBox.style.display = 'none';
                }
            });

            document.addEventListener('scroll', debounce(() => {
                if (suggestionBox.style.display !== 'none') {
                    updateSuggestionBoxPosition();
                }
            }, 100), true);

            function updateSelection(items) {
                items.forEach((item, idx) => item.classList.toggle('selected', idx === selectedIndex));
                if (selectedIndex >= 0) items[selectedIndex].scrollIntoView({ block: 'nearest' });
                textbox.focus();
            }

            function extractWordToSend(value, cursorPosition) {
                const beforeCursor = value.slice(0, cursorPosition);
                const afterCursor = value.slice(cursorPosition);                
                const lastCommaBefore = beforeCursor.lastIndexOf(',');
                const lastNewlineBefore = beforeCursor.lastIndexOf('\n');
                const start = Math.max(lastCommaBefore, lastNewlineBefore) >= 0 
                    ? Math.max(lastCommaBefore, lastNewlineBefore) + 1 
                    : 0;        
                const firstCommaAfter = afterCursor.indexOf(',');
                const firstNewlineAfter = afterCursor.indexOf('\n');
                
                let end;
                if (firstNewlineAfter === 0) {
                    end = cursorPosition;
                } else if (firstCommaAfter >= 0 || firstNewlineAfter >= 0) {
                    end = firstCommaAfter >= 0 && (firstNewlineAfter < 0 || firstCommaAfter < firstNewlineAfter)
                        ? cursorPosition + firstCommaAfter
                        : firstNewlineAfter >= 0
                        ? cursorPosition + firstNewlineAfter
                        : value.length;
                } else {
                    end = value.length;
                }
            
                const extracted = value.slice(start, end).trim();
                return extracted.endsWith(',') || extracted === '' ? '' : extracted;
            }

            function formatSuggestion(suggestion) {
                const withoutHeat = suggestion.replace(/\s\(\d+\)$/, '');
                let formatted = withoutHeat.replace(/_/g, ' ');
                formatted = formatted.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
                return formatted.startsWith(':') ? formatted : formatted.replace(/:/g, ' ');
            }

            function applySuggestion(promptText) {
                const promptMatch = promptText.match(/<b>(.*?)<\/b>/);                
                let formattedText = '';
                if (promptMatch) {
                    formattedText = formatSuggestion(promptMatch[1]);
                } else {
                    if (promptText.startsWith(':')) {
                        formattedText = promptText.trim();
                    } else {
                        formattedText = formatSuggestion(promptText.split(':')[0].trim());
                    }
                }
            
                const value = textbox.value;
                const cursorPosition = textbox.selectionStart;
            
                const beforeCursor = value.slice(0, cursorPosition);
                const afterCursor = value.slice(cursorPosition);
                const lastSeparatorBefore = Math.max(beforeCursor.lastIndexOf(','), beforeCursor.lastIndexOf('\n'));
                const firstCommaAfter = afterCursor.indexOf(',');
                const firstNewlineAfter = afterCursor.indexOf('\n');
                                const start = lastSeparatorBefore >= 0 ? lastSeparatorBefore + 1 : 0;
                let end = cursorPosition; 
                let suffix = ', ';
            
                if (firstNewlineAfter === 0) {
                    end = cursorPosition; 
                    suffix = ','; 
                } else if (firstCommaAfter >= 0 || firstNewlineAfter >= 0) {
                    end = firstCommaAfter >= 0 && (firstNewlineAfter < 0 || firstCommaAfter < firstNewlineAfter)
                        ? cursorPosition + firstCommaAfter
                        : firstNewlineAfter >= 0
                        ? cursorPosition + firstNewlineAfter
                        : value.length;
                    suffix = firstCommaAfter >= 0 ? '' : firstNewlineAfter >= 0 ? ',' : ', ';
                }
            
                const isFirstWordInLine = start === 0 || value[start - 1] === '\n';
                const prefix = isFirstWordInLine ? '' : ' ';        
                const newValue = value.slice(0, start) + prefix + formattedText + suffix + value.slice(end);
                textbox.value = newValue.trim();
            
                const newCursorPosition = start + prefix.length + formattedText.length + (suffix.startsWith(',') ? 1 : 0);
                textbox.setSelectionRange(newCursorPosition, newCursorPosition);
            
                currentSuggestions = [];
                suggestionBox.innerHTML = '';
                suggestionBox.style.display = 'none';
            
                const inputEvent = new Event('input', { bubbles: true });
                skipSuggestion = true; 
                textbox.dispatchEvent(inputEvent);
                textbox.focus();
            }

            function updateSuggestionBoxPosition() {
                const rect = textbox.getBoundingClientRect();
                const textboxTop = rect.top + window.scrollY;
                const textboxBottom = rect.bottom + window.scrollY;
                const textboxLeft = rect.left + window.scrollX;

                const cursorPosition = Math.min(textbox.selectionStart, textbox.value.length);
                const textBeforeCursor = textbox.value.substring(0, cursorPosition);

                const lineSpan = document.createElement('span');
                lineSpan.style.position = 'absolute';
                lineSpan.style.visibility = 'hidden';
                lineSpan.style.font = window.getComputedStyle(textbox).font;
                lineSpan.style.whiteSpace = 'pre-wrap';
                lineSpan.style.width = `${textboxWidth}px`;
                document.body.appendChild(lineSpan);

                const lines = [];
                let currentLine = '';
                for (let i = 0; i < textBeforeCursor.length; i++) {
                    lineSpan.textContent = currentLine + textBeforeCursor[i];
                    if (lineSpan.scrollWidth > textboxWidth || textBeforeCursor[i] === '\n') {
                        lines.push(currentLine);
                        currentLine = textBeforeCursor[i] === '\n' ? '' : textBeforeCursor[i];
                    } else {
                        currentLine += textBeforeCursor[i];
                    }
                }
                if (currentLine) lines.push(currentLine);
                document.body.removeChild(lineSpan);

                const widthSpan = document.createElement('span');
                widthSpan.style.position = 'absolute';
                widthSpan.style.visibility = 'hidden';
                widthSpan.style.font = window.getComputedStyle(textbox).font;
                widthSpan.style.whiteSpace = 'nowrap';
                widthSpan.textContent = lines[lines.length - 1] || '';
                document.body.appendChild(widthSpan);
                const cursorOffset = widthSpan.offsetWidth;
                document.body.removeChild(widthSpan);

                suggestionBox.style.display = 'block';
                const suggestionWidth = suggestionBox.offsetWidth || 200;
                const suggestionHeight = suggestionBox.offsetHeight || 100;
                if (!suggestionBox.innerHTML) suggestionBox.style.display = 'none';

                let newLeft = textboxLeft + cursorOffset;
                let newTop = textboxBottom;
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;
                const paddingX = 24;
                const paddingY = 12;

                if (newLeft + suggestionWidth > windowWidth - paddingX) {
                    newLeft = Math.max(0, windowWidth - suggestionWidth - paddingX);
                }
                if (newLeft < textboxLeft) newLeft = textboxLeft;

                if (newTop + suggestionHeight > windowHeight + window.scrollY - paddingY) {
                    newTop = textboxTop - suggestionHeight - paddingY;
                    if (newTop < window.scrollY) newTop = textboxBottom;
                }

                suggestionBox.style.left = `${newLeft}px`;
                suggestionBox.style.top = `${newTop}px`;
                suggestionBox.style.zIndex = '10002';
                suggestionBox.style.transform = 'translateZ(0)';
            }

            textbox.dataset.suggestionSetup = 'true';
        });
    }

    function initInfoBox(id, initialTitle='', initialContent = '') {
        function initializeInfoBox() {
            const infoBox = document.querySelector(`#${id}`);
            if (!infoBox) {
                console.error(`InfoBox with id ${id} not found`);
                return false;
            }
    
            let contentDiv = infoBox.querySelector('.ib-info-box-content');
            if (!contentDiv) {
                console.warn(`Content div not found in InfoBox ${id}, creating one`);
                contentDiv = document.createElement('div');
                contentDiv.className = 'ib-info-box-content';
                infoBox.appendChild(contentDiv);
            }
    
            let pre = contentDiv.querySelector('pre');
            if (!pre) {
                pre = document.createElement('pre');
                contentDiv.appendChild(pre);
            }
    
            return true;
        }
    
        function updateInfoBoxContent(newContent) {
            const infoBox = document.querySelector(`#${id}`);
            if (!infoBox) {
                console.error(`InfoBox with id ${id} not found`);
                return;
            }
    
            const pre = infoBox.querySelector('.ib-info-box-content pre');
            if (!pre) {
                console.error(`Content pre element not found in InfoBox ${id}`);
                return;
            }
    
            pre.innerHTML = parseTaggedContent(newContent);
        }

        function updateInfoBoxTitle(newTitle) {
            const infoBox = document.querySelector(`#${id}`);
            if (!infoBox) {
                console.error(`InfoBox with id ${id} not found`);
                return;
            }
    
            const titleDiv = infoBox.querySelector('.ib-info-box-title');
            if (!titleDiv) {
                console.error(`Title div not found in InfoBox ${id}`);
                return;
            }
    
            titleDiv.textContent = newTitle;
        }
    
        function parseTaggedContent(content) {
            const colorRegex = /\[color=([^\]]*?)\](.*?)\[\/color\]/g;
            content = content.replace(colorRegex, (match, color, text) => {
                const isValidColor = /^#[0-9A-Fa-f]{6}$|^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$|^[a-zA-Z]+$/.test(color);
                if (isValidColor) {
                    return `<span style="color:${color}">${text}</span>`;
                }
                return text;
            });
    
            const urlRegex = /\[url=([^\]]*?)\](.*?)\[\/url\]/g;
            content = content.replace(urlRegex, (match, url, text) => {
                const isValidUrl = /^(https?:\/\/[^\s<>"']+)$/.test(url);
                if (isValidUrl) {
                    return `<a href="${url}" target="_blank" style="color:#3498db;text-decoration:underline">${text}</a>`;
                }
                return text;
            });
    
            return content;
        }
    
        if (!initializeInfoBox()) {
            return { updateContent: () => console.error(`Cannot update content for missing InfoBox ${id}`) };
        }
    
        updateInfoBoxContent(initialContent);
        updateInfoBoxTitle(initialTitle);
    
        return {
            updateContent: updateInfoBoxContent,
            updateTitle: updateInfoBoxTitle
        };
    }

    function setupGallery() {
        if (window.isGallerySetup) return;
        window.isGallerySetup = true;
    
        let isGridMode = false;
        let currentIndex = 0;
        let privacyBalls = [];
        let images = [];
        let seeds = [];
        let tags = [];
        let renderedImageCount = 0;
    
        const container = document.getElementById('cg-custom-gallery');
        if (!container) {
            console.error('Gallery container not found');
            return;
        }
    
        if (!window.cgCustomGallery) {
            window.cgCustomGallery = {};
        }
    
        window.addEventListener('unload', () => {
            customCommonOverlay().cleanup();
        });
    
        window.cgCustomGallery.clearGallery = function () {
            images = [];
            seeds = [];
            tags = [];
            renderedImageCount = 0;
            container.innerHTML = '';
        };
    
        window.cgCustomGallery.appendImageData = function (base64, seed, tagsString, keep_gallery) {
            if ('False' === keep_gallery) {
                window.cgCustomGallery.clearGallery();
            }
    
            images.push(base64); 
            seeds.push(seed);
            tags.push(tagsString || '');
    
            if (seeds.length !== tags.length || images.length !== seeds.length) {
                console.warn('[appendImageData] Mismatch: images:', images.length, 'seeds:', seeds.length, 'tags:', tags.length);
            }

            if (isGridMode) {
                gallery_renderGridMode(true);
            } else {
                gallery_renderSplitMode(true);
            }
        };
    
        window.cgCustomGallery.showLoading = function () {
            const loadingOverlay = customCommonOverlay().createLoadingOverlay();
            const buttonOverlay = document.getElementById('cg-button-overlay');
            const savedPosition = JSON.parse(localStorage.getItem('overlayPosition'));
            if (savedPosition && savedPosition.top !== undefined && savedPosition.left !== undefined) {
                loadingOverlay.style.top = `${savedPosition.top}px`;
                loadingOverlay.style.left = `${savedPosition.left}px`;
                loadingOverlay.style.transform = 'none';
            } else if (buttonOverlay) {
                const rect = buttonOverlay.getBoundingClientRect();
                loadingOverlay.style.top = `${rect.top}px`;
                loadingOverlay.style.left = `${rect.left}px`;
                loadingOverlay.style.transform = 'none';
            } else {
                loadingOverlay.style.top = '20%';
                loadingOverlay.style.left = '50%';
                loadingOverlay.style.transform = 'translate(-50%, -20%)';
            }
            addDragFunctionality(loadingOverlay, buttonOverlay);
        };
    
        window.cgCustomGallery.handleResponse = function (js_ret) {
            const loadingOverlay = document.getElementById('cg-loading-overlay');
            const buttonOverlay = document.getElementById('cg-button-overlay');
            if (loadingOverlay) {
                if (loadingOverlay.dataset.timerInterval) {
                    clearInterval(loadingOverlay.dataset.timerInterval);
                }
                if (buttonOverlay && !buttonOverlay.classList.contains('minimized')) {
                    const rect = loadingOverlay.getBoundingClientRect();
                    buttonOverlay.style.left = '0';
                    buttonOverlay.style.top = '0';
                    buttonOverlay.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
                    if (buttonOverlay.updateDragPosition) {
                        buttonOverlay.updateDragPosition(rect.left, rect.top);
                    }
                }
                loadingOverlay.remove();
            }
            if ('success' !== js_ret) {
                console.error('Got Error from backend:', js_ret);
                customCommonOverlay().createErrorOverlay(js_ret);
            }
        };
    
        function ensurePrivacyButton() {
            let privacyButton = document.getElementById('cg-privacy-button');
            if (!privacyButton) {
                privacyButton = document.createElement('button');
                privacyButton.id = 'cg-privacy-button';
                privacyButton.className = 'cg-button';
                privacyButton.textContent = '(X)';
                privacyButton.style.top = '50px';
                privacyButton.style.left = '10px';
                privacyButton.style.background = 'linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet)';
                privacyButton.addEventListener('click', () => {
                    if (privacyBalls.length >= 5) {
                        console.log('Maximum 5 privacy balls reached');
                        return;
                    }
                    createPrivacyBall();
                });
                container.appendChild(privacyButton);
            }
        }
    
        function createPrivacyBall() {
            const ball = document.createElement('div');
            ball.className = 'cg-privacy-ball';
            ball.innerHTML = 'SAA';
            ball.style.width = '100px';
            ball.style.height = '100px';
            const galleryRect = container.getBoundingClientRect();
            const left = galleryRect.left + galleryRect.width / 2 - 50;
            const top = galleryRect.top + galleryRect.height / 2 - 50;
            ball.style.left = `${left}px`;
            ball.style.top = `${top}px`;
        
            let isDragging = false, startX, startY;
            ball.addEventListener('mousedown', (e) => {
                if (e.button === 0) { 
                    e.preventDefault();
                    isDragging = true;
                    startX = e.clientX - parseFloat(ball.style.left || 0);
                    startY = e.clientY - parseFloat(ball.style.top || 0);
                    ball.style.cursor = 'grabbing'; 
                    document.body.style.userSelect = 'none';
                } else if (e.button === 2) { 
                    e.preventDefault();
                    const startY = e.clientY;
                    const startSize = parseFloat(ball.style.width || 100);
        
                    const onMouseMove = (moveEvent) => {
                        const deltaY = moveEvent.clientY - startY;
                        let newSize = startSize + deltaY;
                        newSize = Math.min(Math.max(newSize, 20), 300); 
                        ball.style.width = `${newSize}px`;
                        ball.style.height = `${newSize}px`;
                        ball.style.fontSize = `${newSize * 0.2}px`; 
                    };
        
                    const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    };
        
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                }
            });
        
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                ball.style.left = `${e.clientX - startX}px`;
                ball.style.top = `${e.clientY - startY}px`;
            });
        
            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    ball.style.cursor = 'grab'; 
                    document.body.style.userSelect = '';
                }
            });
        
            ball.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });
        
            ball.addEventListener('dblclick', () => {
                ball.remove();
                privacyBalls = privacyBalls.filter(b => b !== ball);
            });

            document.body.appendChild(ball);
            privacyBalls.push(ball);
        }
    
        function enterFullscreen(index) {
            const imgUrl = images[index];
            if (!imgUrl) {
                console.error('Invalid image index:', index);
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'cg-fullscreen-overlay';

            const fullScreenImg = document.createElement('img');
            fullScreenImg.src = imgUrl;
            fullScreenImg.className = 'cg-fullscreen-image';

            let isDragging = false, startX = 0, startY = 0, translateX = 0, translateY = 0;

            fullScreenImg.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                fullScreenImg.style.cursor = 'grabbing';
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            function onMouseMove(e) {
                if (!isDragging) return;
                e.preventDefault();
                e.stopPropagation();

                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                translateX += deltaX;
                translateY += deltaY;
                fullScreenImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
                startX = e.clientX;
                startY = e.clientY;
            }

            function onMouseUp() {
                isDragging = false;
                fullScreenImg.style.cursor = 'grab';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }

            let scale = 1;
            fullScreenImg.addEventListener('wheel', (e) => {
                e.preventDefault();
                scale += e.deltaY * -0.001;
                scale = Math.min(Math.max(0.5, scale), 4);
                fullScreenImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) exitFullscreen();
            });

            document.addEventListener('keydown', handleFullscreenKeyDown);
            overlay.appendChild(fullScreenImg);
            document.body.appendChild(overlay);

            function handleFullscreenKeyDown(e) {
                if (e.key === 'Escape') {
                    exitFullscreen();
                } else if (e.key === 'ArrowRight' || e.key === ' ') {
                    currentIndex = (currentIndex - 1 + images.length) % images.length;
                    fullScreenImg.src = images[currentIndex];
                } else if (e.key === 'ArrowLeft') {
                    currentIndex = (currentIndex + 1) % images.length;
                    fullScreenImg.src = images[currentIndex];
                }
            }

            function exitFullscreen() {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', handleFullscreenKeyDown);
                
                if (!isGridMode) {
                    let mainImage = document.createElement('img');
                    mainImage.src = images[currentIndex];
                    updatePreviewBorders();

                    let mainImageContainer = container.querySelector('.cg-main-image-container');
                    mainImage = mainImageContainer.querySelector('img')
                    if (mainImage.src !== images[currentIndex]) {
                        mainImage.src = images[currentIndex];
                    }
                }
            }
        }
    
        function gallery_renderGridMode(incremental = false) {
            if (!images || images.length === 0) {
                container.innerHTML = '';
                renderedImageCount = 0;
                currentIndex = 0;
                return;
            }
        
            let gallery = container.querySelector('.cg-gallery-grid-container');
            let lastAspectRatio = parseFloat(localStorage.getItem('gridAspectRatio') || '0');
        
            const containerWidth = container.offsetWidth;
            const firstImage = new Image();
            firstImage.src = images[images.length - 1];
            firstImage.onload = () => {
                const aspectRatio = firstImage.width / firstImage.height;
                const needsRedraw = !incremental || Math.abs(aspectRatio - lastAspectRatio) > 0.001;
        
                if (!gallery || needsRedraw) {
                    container.innerHTML = '';
                    gallery = document.createElement('div');
                    gallery.className = 'cg-gallery-grid-container scroll-container';
                    container.appendChild(gallery);
                    renderedImageCount = 0;
                    gallery.addEventListener('click', (e) => {
                        const imgContainer = e.target.closest('.cg-gallery-item');
                        if (imgContainer) {
                            const index = parseInt(imgContainer.dataset.index);
                            enterFullscreen(index);
                        }
                    });
                }
        
                const targetHeight = 200;
                const targetWidth = targetHeight * aspectRatio;
                const itemsPerRow = Math.floor(containerWidth / (targetWidth + 10));
                gallery.style.gridTemplateColumns = `repeat(${itemsPerRow}, ${targetWidth}px)`;
        
                const fragment = document.createDocumentFragment();
                const observer = new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const imgContainer = entry.target;
                            const img = imgContainer.querySelector('img');
                            img.src = img.dataset.src; 
                            imgContainer.classList.add('visible');
                            observer.unobserve(imgContainer);
                        }
                    });
                }, { root: gallery, threshold: 0.1 });
        
                for (let i = images.length - 1; i >= renderedImageCount; i--) {
                    const imgContainer = document.createElement('div');
                    imgContainer.className = 'cg-gallery-item';
                    imgContainer.style.width = `${targetWidth}px`;
                    imgContainer.style.height = `${targetHeight}px`;
                    imgContainer.dataset.index = i;
                    const img = document.createElement('img');
                    img.className = 'cg-gallery-image';
                    img.dataset.src = images[i]; 
                    img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; 
                    img.loading = 'lazy';
                    imgContainer.appendChild(img);
                    fragment.appendChild(imgContainer);
                    observer.observe(imgContainer); 
                }
                gallery.prepend(fragment);
                renderedImageCount = images.length;
        
                localStorage.setItem('gridAspectRatio', aspectRatio.toString());
        
                ensureSwitchModeButton(container, () => {
                    isGridMode = !isGridMode;
                    currentIndex = images.length - 1;
                    isGridMode ? gallery_renderGridMode() : gallery_renderSplitMode();
                }, 'cg-switch-mode-button', images.length);
                ensurePrivacyButton();
            };
            firstImage.onerror = () => {
                console.error('Failed to load latest image for grid mode');
                container.innerHTML = '';
                renderedImageCount = 0;
                currentIndex = 0;
            };
        }
        
        function gallery_renderSplitMode(incremental = false) {
            if (!images || images.length === 0) {
                container.innerHTML = '';
                renderedImageCount = 0;
                currentIndex = 0;
                return;
            }
    
            let mainImageContainer = container.querySelector('.cg-main-image-container');
            let previewContainer = container.querySelector('.cg-preview-container');
    
            if (!mainImageContainer || !previewContainer || !incremental) {
                container.innerHTML = '';
                mainImageContainer = document.createElement('div');
                mainImageContainer.className = 'cg-main-image-container';
                const mainImage = document.createElement('img');
                currentIndex = images.length - 1;
                mainImage.src = images[currentIndex];
                mainImage.className = 'cg-main-image';
                mainImage.addEventListener('click', () => enterFullscreen(currentIndex));
                mainImageContainer.appendChild(mainImage);
                container.appendChild(mainImageContainer);
    
                mainImageContainer.addEventListener('click', (e) => {
                    e.preventDefault();
                    const rect = mainImageContainer.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const isLeft = clickX < rect.width / 2;
                    if (e.target !== mainImage && images.length > 1) {
                        if (!isLeft) {
                            currentIndex = (currentIndex - 1 + images.length) % images.length;
                        } else {
                            currentIndex = (currentIndex + 1) % images.length;
                        }
                        mainImage.src = images[currentIndex];
                        updatePreviewBorders();
                    }
                });
    
                previewContainer = document.createElement('div');
                previewContainer.className = 'cg-preview-container scroll-container';
                setupScrollableContainer(previewContainer);
                container.appendChild(previewContainer);
                renderedImageCount = 0;
    
                previewContainer.addEventListener('click', (e) => {
                    const previewImage = e.target.closest('.cg-preview-image');
                    if (previewImage) {
                        e.preventDefault();
                        const domIndex = parseInt(previewImage.dataset.domIndex);
                        currentIndex = images.length - 1 - domIndex;
                        mainImage.src = images[currentIndex];
                        updatePreviewBorders();
                        previewImage.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    }
                });
            }
    
            const fragment = document.createDocumentFragment();
            const observer = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.classList.add('visible');
                        observer.unobserve(img);
                    }
                });
            }, { root: previewContainer, threshold: 0.1 });
    
            if (incremental && renderedImageCount < images.length) {
                for (let i = renderedImageCount; i < images.length; i++) {
                    const previewImage = document.createElement('img');
                    previewImage.className = 'cg-preview-image';
                    previewImage.dataset.src = images[i];
                    previewImage.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                    previewImage.loading = 'lazy';
                    previewImage.dataset.domIndex = images.length - 1 - i;
                    fragment.appendChild(previewImage);
                    observer.observe(previewImage);
                }
            } else {
                for (let i = images.length - 1; i >= 0; i--) {
                    const previewImage = document.createElement('img');
                    previewImage.className = 'cg-preview-image';
                    previewImage.dataset.src = images[i];
                    previewImage.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                    previewImage.loading = 'lazy';
                    previewImage.dataset.domIndex = images.length - 1 - i;
                    fragment.appendChild(previewImage);
                    observer.observe(previewImage);
                }
            }
    
            previewContainer.prepend(fragment);
            renderedImageCount = images.length;
    
            updatePreviewBorders();
            const currentPreview = previewContainer.querySelector(`.cg-preview-image[data-domIndex="${images.length - 1 - currentIndex}"]`);
            if (currentPreview) {
                currentPreview.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
    
            ensureSwitchModeButton(container, () => {
                isGridMode = !isGridMode;
                currentIndex = images.length - 1;
                isGridMode ? gallery_renderGridMode() : gallery_renderSplitMode();
            }, 'cg-switch-mode-button', images.length);
            ensureSeedButton();
            ensureTagButton();
            ensurePrivacyButton();
            adjustPreviewContainer(previewContainer);
        }
        
        function updatePreviewBorders() {
            const previewImages = container.querySelectorAll('.cg-preview-image');
            previewImages.forEach((child, domIndex) => {
                const index = images.length - 1 - domIndex;
                child.dataset.domIndex = domIndex;
                child.style.border = index === currentIndex ? '2px solid #3498db' : 'none';
            });
            const domIndex = images.length - 1 - currentIndex;
            if (domIndex >= 0 && domIndex < previewImages.length) {
                previewImages[domIndex].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }
    
        function adjustPreviewContainer(previewContainer) {
            const previewImages = previewContainer.querySelectorAll('.cg-preview-image');
            if (previewImages.length > 0) {
                previewImages[0].onload = () => {
                    const containerWidth = previewContainer.offsetWidth;
                    const firstImageWidth = previewImages[0].offsetWidth || 50;
                    const totalImagesWidth = firstImageWidth * previewImages.length;
                    if (totalImagesWidth < (containerWidth - firstImageWidth)) {
                        previewContainer.style.justifyContent = 'center';
                    } else {
                        previewContainer.style.justifyContent = 'flex-start';
                        if (previewImages.length > 10) {
                            const minWidth = Math.max(50, containerWidth / previewImages.length);
                            previewImages.forEach(img => img.style.maxWidth = `${minWidth}px`);
                        }
                    }
                    previewContainer.scrollLeft = 0;
                };
            }
        }
    
        function ensureSeedButton() {
            let seedButton = document.getElementById('cg-seed-button');
            if (!seedButton) {
                seedButton = document.createElement('button');
                seedButton.id = 'cg-seed-button';
                seedButton.className = 'cg-button';
                seedButton.textContent = 'Seed';
                seedButton.addEventListener('click', () => {
                    if (seeds && seeds[currentIndex]) {
                        const seedToCopy = seeds[currentIndex].trim();
                        navigator.clipboard.writeText(seedToCopy).then(() => {
                            console.log(`Seed ${seedToCopy} copied to clipboard`);
                            seedButton.textContent = 'Copied!';
                            setTimeout(() => seedButton.textContent = 'Seed', 2000);
                            const sliderContainer = document.getElementById('random_seed');
                            if (sliderContainer) {
                                const numberInput = sliderContainer.querySelector('input[type="number"]');
                                const rangeInput = sliderContainer.querySelector('input[type="range"]');
                                if (numberInput && rangeInput) {
                                    const seedValue = parseInt(seedToCopy, 10);
                                    const currentValue = parseInt(numberInput.value, 10);
                                    if (!isNaN(seedValue) && seedValue >= -1 && seedValue <= 4294967295) {
                                        let targetValue = seedValue;
                                        if (currentValue === seedValue) {
                                            targetValue = -1;
                                            console.log(`Seed matches current value (${seedValue}), resetting to -1`);
                                        } else {
                                            console.log(`Updating random_seed to ${seedValue}`);
                                        }
                                        numberInput.value = targetValue;
                                        numberInput.dispatchEvent(new Event('input', { bubbles: true }));
                                        rangeInput.value = targetValue;
                                        rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
                                    }
                                }
                            }
                        }).catch(err => console.error('Failed to copy seed:', err));
                    }
                });
                container.appendChild(seedButton);
            }
        }
    
        function ensureTagButton() {
            let tagButton = document.getElementById('cg-tag-button');
            if (!tagButton) {
                tagButton = document.createElement('button');
                tagButton.id = 'cg-tag-button';
                tagButton.className = 'cg-button';
                tagButton.textContent = 'Tags';
                tagButton.addEventListener('click', () => {
                    if (tags && tags[currentIndex]) {
                        const tagToCopy = tags[currentIndex].trim();
                        navigator.clipboard.writeText(tagToCopy).then(() => {
                            console.log(`Tag [${tagToCopy}] copied to clipboard`);
                            tagButton.textContent = 'Copied!';
                            setTimeout(() => tagButton.textContent = 'Tags', 2000);
                        }).catch(err => console.error('Failed to copy tag:', err));
                    }
                });
                container.appendChild(tagButton);
            }
        }
    
        window.updateGallery = function (imageData) {
            if (!Array.isArray(imageData) || imageData.length === 0) return;
            images = imageData;
            renderedImageCount = 0; 
            isGridMode ? gallery_renderGridMode() : gallery_renderSplitMode();
        };
    }

    function setupThumb() {
        if (window.isThumbSetup) return;
        window.isThumbSetup = true;
    
        let isGridMode = false;
        let images = [];
    
        const container = document.getElementById('cg-custom-thumb');
        if (!container) {
            console.error('Thumbnail gallery container not found');
            return;
        }
    
        console.log('Setting up the thumbnail gallery', container);
    
        function thumb_renderGridMode() {
            container.innerHTML = '';
            if (images.length === 0) {
                const switchModeButton = document.getElementById('cg-thumb-switch-mode-button');
                if (switchModeButton) switchModeButton.remove();
                return;
            }
    
            const gallery = document.createElement('div');
            gallery.className = 'cg-thumb-grid-container scroll-container';
    
            const containerWidth = container.offsetWidth;
            const containerHeight = container.offsetHeight;
    
            const firstImage = new Image();
            firstImage.src = images[0];
            firstImage.onload = () => {
                const aspectRatio = firstImage.width / firstImage.height;
                const targetHeight = containerHeight / 1.2;
                const targetWidth = targetHeight * aspectRatio;
                const itemsPerRow = Math.floor(containerWidth / (targetWidth + 10));
                gallery.style.gridTemplateColumns = `repeat(${itemsPerRow}, ${targetWidth}px)`;
    
                const fragment = document.createDocumentFragment();
                images.forEach(url => {
                    const imgContainer = document.createElement('div');
                    imgContainer.className = 'cg-thumb-item';
                    imgContainer.style.width = `${targetWidth}px`;
                    imgContainer.style.height = `${targetHeight}px`;
    
                    const img = document.createElement('img');
                    img.src = url;
                    img.className = 'cg-thumb-image';
                    imgContainer.appendChild(img);
                    fragment.appendChild(imgContainer);
                });
    
                gallery.appendChild(fragment);
                container.appendChild(gallery);
                ensureSwitchModeButton(container, () => {
                    isGridMode = !isGridMode;
                    isGridMode ? thumb_renderGridMode() : thumb_renderSplitMode();
                }, 'cg-thumb-switch-mode-button', images.length);
            };
            firstImage.onerror = () => {
                console.error('Failed to load first image for grid mode');
                container.innerHTML = '';
                const switchModeButton = document.getElementById('cg-thumb-switch-mode-button');
                if (switchModeButton) switchModeButton.remove();
            };
        }
    
        function thumb_renderSplitMode() {
            container.innerHTML = '';
            if (images.length === 0) {
                const switchModeButton = document.getElementById('cg-thumb-switch-mode-button');
                if (switchModeButton) switchModeButton.remove();
                return;
            }
    
            const scrollContainer = document.createElement('div');
            scrollContainer.className = 'cg-thumb-scroll-container scroll-container';
            setupScrollableContainer(scrollContainer);
    
            const fragment = document.createDocumentFragment();
            images.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                img.className = 'cg-thumb-scroll-image';
                fragment.appendChild(img);
            });
    
            scrollContainer.appendChild(fragment);
            container.appendChild(scrollContainer);
            ensureSwitchModeButton(container, () => {
                isGridMode = !isGridMode;
                isGridMode ? thumb_renderGridMode() : thumb_renderSplitMode();
            }, 'cg-thumb-switch-mode-button', images.length);
        }
    
        window.updateThumbGallery = function (imageData) {
            if (!Array.isArray(imageData) || imageData.length === 0) {
                container.innerHTML = '';
                const switchModeButton = document.getElementById('cg-thumb-switch-mode-button');
                if (switchModeButton) switchModeButton.remove();
                images = [];
                return;
            }
    
            images = imageData;
            isGridMode ? thumb_renderGridMode() : thumb_renderSplitMode();
        };
    
        thumb_renderGridMode();
    }

    function setupThumbOverlay() {
        if (window.isThumbOverlaySetup) return;
        window.isThumbOverlaySetup = true;
    
        let images = [];
        let mouseX = 0, mouseY = 0;
        let lastCharacter = null;
    
        const container = document.createElement('div');
        container.id = 'cg-thumb-overlay';
        container.className = 'cg-overlay cg-thumb-overlay';
        container.style.position = 'fixed';
        container.style.display = 'none';
        container.style.background = 'rgba(0, 0, 0, 0.5)';
        container.style.borderRadius = '8px';
        container.style.padding = '10px';
        container.style.zIndex = '10003';
        container.style.boxSizing = 'border-box';
        container.style.willChange = 'transform';
        document.body.appendChild(container);
    
        function renderOverlay(newImages) {
            if (JSON.stringify(newImages) === JSON.stringify(images)) return;
            images = newImages;
    
            const scrollContainer = container.querySelector('.cg-thumb-overlay-container') || document.createElement('div');
            scrollContainer.className = 'cg-thumb-overlay-container scroll-container';
            scrollContainer.style.display = 'flex';
            scrollContainer.style.flexWrap = 'wrap';
            scrollContainer.style.gap = '10px';
            scrollContainer.style.maxHeight = '460px';
            scrollContainer.style.overflowY = 'auto';
            setupScrollableContainer(scrollContainer);
    
            const existingImages = Array.from(scrollContainer.children);
            const fragment = document.createDocumentFragment();
    
            newImages.forEach((url, idx) => {
                let img = existingImages[idx] || document.createElement('img');
                img.src = url;
                img.loading = 'lazy'; 
                img.className = 'cg-thumb-overlay-image';
                img.style.width = '307px';
                img.style.height = '460px';
                img.style.margin = '10px';
                img.style.cursor = 'pointer';
                img.style.objectFit = 'contain';
                img.onerror = () => {
                    console.error('[renderOverlay] Failed to load image:', url);
                    img.remove();
                };
                fragment.appendChild(img);
            });
    
            existingImages.slice(newImages.length).forEach(img => img.remove());
            scrollContainer.innerHTML = '';
            scrollContainer.appendChild(fragment);
            if (!container.contains(scrollContainer)) container.appendChild(scrollContainer);
    
            const imgWidth = 314;
            const containerWidth = Math.max(314, images.length * imgWidth);
            container.style.width = `${Math.min(containerWidth, window.innerWidth * 0.8)}px`;
        }
    
        window.updateThumbOverlay = function (character, imageData) {
            if (typeof character !== 'string' || character === lastCharacter) return;
            lastCharacter = character;
    
            const overlayContainer = document.getElementById('cg-thumb-overlay');
            if (!overlayContainer) {
                console.warn('[updateThumbOverlay] Overlay container not found');
                return;
            }
    
            overlayContainer.innerHTML = '';
    
            if (imageData) {
                const img = document.createElement('img');
                img.src = imageData;
                img.loading = 'lazy';
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                img.style.objectFit = 'contain';
                overlayContainer.appendChild(img);
            }
        };
    
        const mouseMoveHandler = (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };
    
        document.addEventListener('mousemove', mouseMoveHandler);
        renderOverlay([]);
    
        return () => {
            document.removeEventListener('mousemove', mouseMoveHandler);
            container.remove();
            window.isThumbOverlaySetup = false;
        };
    }    

    function customCommonOverlay() {
        function createInfoOverlay({ id, content, className = '', onClick = null }) {
            let overlay = document.getElementById(id);
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = id;
                overlay.className = `cg-overlay ${className}`;
                document.body.appendChild(overlay);
            }
            overlay.innerHTML = content;
            if (onClick) overlay.onclick = onClick;
            return overlay;
        }

        function createErrorOverlay(errorMessage) {
            let displayMessage = errorMessage;
            let copyContent = errorMessage;

            const hasUrl = /\[COPY_URL\]/.test(errorMessage);
            const hasCustom = /\[COPY_CUSTOM/.test(errorMessage);

            if (hasUrl) {
                displayMessage = displayMessage.replace(
                    /\[COPY_URL\](https?:\/\/[^\s]+)\[\/COPY_URL\]/g,
                    '<a href="$1" target="_blank" style="color: #1e90ff; text-decoration: underline;">$1</a>'
                );
                const urlMatches = [...errorMessage.matchAll(/\[COPY_URL\](https?:\/\/[^\s]+)\[\/COPY_URL\]/g)];
                if (urlMatches.length > 0) {
                    copyContent = urlMatches[urlMatches.length - 1][1];
                }
            }

            if (hasCustom) {
                displayMessage = displayMessage.replace(
                    /\[COPY_CUSTOM(?:=(#[0-9A-Fa-f]{6}|[a-zA-Z]+))?\](.+?)\[\/COPY_CUSTOM\]/g,
                    (match, color, text) => {
                        const colorStyle = color || '#000000';
                        return `<span style="color: ${colorStyle}">${text}</span>`;
                    }
                );
                if (!hasUrl) {
                    const customMatches = [...errorMessage.matchAll(/\[COPY_CUSTOM(?:=(#[0-9A-Fa-f]{6}|[a-zA-Z]+))?\](.+?)\[\/COPY_CUSTOM\]/g)];
                    if (customMatches.length > 0) {
                        copyContent = customMatches[customMatches.length - 1][2];
                    }
                }
            }

            const overlay = createInfoOverlay({
                id: 'cg-error-overlay',
                className: 'cg-overlay-error',
                content: `
                    <div class="cg-error-content" style="display: flex; flex-direction: column; align-items: center;">
                        <img src="${window.LOADING_FAILED_BASE64}" alt="Error" style="max-width: 128px; max-height: 128px; object-fit: contain; margin-bottom: 15px;">
                        <pre style="white-space: pre-wrap; padding: 0 20px; margin: 0; max-width: 100%; font-size: 1.2em;">${displayMessage}</pre>
                    </div>
                `,
                onClick: (e) => {
                    if (e.target.tagName === 'A') {
                        e.stopPropagation();
                        return;
                    }
                    navigator.clipboard.writeText(copyContent)
                        .then(() => console.log(`Copied to clipboard: "${copyContent}"`))
                        .catch(err => console.error('Failed to copy:', err));
                    document.getElementById('cg-error-overlay').remove();
                }
            });

            overlay.style.width = 'fit-content';
            overlay.style.minWidth = '200px';
            overlay.style.maxWidth = 'min(1000px, 90vw)';
            overlay.style.boxSizing = 'border-box';
            overlay.style.padding = '20px';

            const contentPre = overlay.querySelector('.cg-error-content pre');
            if (contentPre) {
                contentPre.style.boxSizing = 'border-box';
                contentPre.style.wordWrap = 'break-word';
            }

            return overlay;
        }

        function createLoadingOverlay() {
            let currentImage = window.LOADING_WAIT_BASE64;
            let lastBase64 = currentImage;
            let pendingImage = null;
        
            const overlay = createInfoOverlay({
                id: 'cg-loading-overlay',
                className: '',
                content: `
                    <img src="${currentImage}" alt="Loading" style="max-width: 128px; max-height: 128px; object-fit: contain; margin-bottom: 10px;">
                    <span>${window.LOADING_MESSAGE || 'Now generating...'}</span>
                    <span class="cg-overlay-timer">${window.ELAPSED_TIME_PREFIX || 'Elapsed time:'} 0 ${window.ELAPSED_TIME_SUFFIX || 'seconds'}</span>
                `
            });
            overlay.style.zIndex = '10001';
            overlay.style.pointerEvents = 'auto';
        
            const savedPosition = JSON.parse(localStorage.getItem('overlayPosition'));
            const buttonOverlay = document.getElementById('cg-button-overlay');
            let translateX, translateY;
        
            if (savedPosition && savedPosition.top !== undefined && savedPosition.left !== undefined) {
                translateX = savedPosition.left;
                translateY = savedPosition.top;
            } else if (buttonOverlay && !buttonOverlay.classList.contains('minimized')) {
                const rect = buttonOverlay.getBoundingClientRect();
                translateX = rect.left;
                translateY = rect.top;
            } else {
                translateX = (window.innerWidth - overlay.offsetWidth) / 2;
                translateY = window.innerHeight * 0.2 - overlay.offsetHeight * 0.2;
            }
        
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.transform = `translate(${translateX}px, ${translateY}px)`;
        
            if (overlay.updateDragPosition) {
                overlay.updateDragPosition(translateX, translateY);
            }
        
            restrictOverlayPosition(overlay, {
                translateX: (window.innerWidth - overlay.offsetWidth) / 2,
                translateY: window.innerHeight * 0.2 - overlay.offsetHeight * 0.2
            });
                
            const startTime = Date.now();
            if (overlay.dataset.timerInterval) clearInterval(overlay.dataset.timerInterval);
            const timerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const timerElement = overlay.querySelector('.cg-overlay-timer');
                if (timerElement) {
                    timerElement.textContent = `${window.ELAPSED_TIME_PREFIX || 'Elapsed time:'} ${elapsed} ${window.ELAPSED_TIME_SUFFIX || 'seconds'}`;
                }
                if (pendingImage && pendingImage !== lastBase64) {
                    lastBase64 = pendingImage;
                    currentImage = pendingImage;
                    const imgElement = overlay.querySelector('img');
                    if (imgElement) {
                        imgElement.src = currentImage;
                        imgElement.style.maxWidth = '256px';
                        imgElement.style.maxHeight = '384px';
                        imgElement.style.objectFit = 'contain';
                        imgElement.onerror = () => {
                            currentImage = window.LOADING_WAIT_BASE64;
                            lastBase64 = currentImage;
                            imgElement.src = currentImage;
                            imgElement.style.maxWidth = '128px';
                            imgElement.style.maxHeight = '128px';
                            imgElement.onerror = null;
                        };
                    }
                }
            }, 100);
        
            overlay._cleanup = () => {
                if (overlay.dataset.timerInterval) {
                    clearInterval(overlay.dataset.timerInterval);
                    delete overlay.dataset.timerInterval;
                }
            };
        
            return overlay;
        }
    

        function createCustomOverlay(image, message) {
            const displayMessage = (typeof message === 'string' && message.trim()) ? message : ' ';
            const hasImage = image && image !== 'none' && typeof image === 'string' && image.startsWith('data:');
        
            let processedMessage = displayMessage.replace(
                /\[COPY_URL\](https?:\/\/[^\s]+)\[\/COPY_URL\]/g,
                '<a href="$1" target="_blank" style="color: #1e90ff; text-decoration: underline;">$1</a>'
            ).replace(
                /\[COPY_CUSTOM(?:=(#[0-9A-Fa-f]{6}|[a-zA-Z]+))?\](.+?)\[\/COPY_CUSTOM\]/g,
                (match, color, text) => {
                    const colorStyle = color || '#ffffff';
                    return `<span style="color: ${colorStyle}">${text}</span>`;
                }
            );
        
            const overlay = createInfoOverlay({
                id: 'cg-custom-overlay',
                className: 'cg-custom-overlay',
                content: `
                    <div class="cg-custom-content">
                        <div class="cg-drag-handle"></div>
                        <div class="cg-custom-textbox scroll-container"></div>
                    </div>
                `
            });
        
            const textbox = overlay.querySelector('.cg-custom-textbox');
            textbox.style.display = 'flex';
            textbox.style.flexDirection = 'column';
            textbox.style.gap = '10px';
            textbox.style.alignItems = 'center';
        
            const fragment = document.createDocumentFragment();
        
            if (hasImage) {
                const img = document.createElement('img');
                img.src = image;
                img.alt = 'Overlay Image';
                img.style.maxWidth = '384px';
                img.style.maxHeight = '384px';
                img.style.objectFit = 'contain';
                img.style.display = 'block';
                img.style.margin = '0 auto';
                fragment.appendChild(img);
            }
        
            const textPre = document.createElement('pre');
            textPre.innerHTML = processedMessage;
            textPre.style.textAlign = 'inherit';
            textPre.style.overflow = 'visible';
            textPre.style.width = '100%';
            fragment.appendChild(textPre);
        
            textbox.appendChild(fragment);
        
            const closeButton = document.createElement('button');
            closeButton.className = 'cg-close-button';
            closeButton.style.backgroundColor = '#ff0000';
            closeButton.style.width = '14px';
            closeButton.style.height = '14px';
            closeButton.style.minWidth = '14px';
            closeButton.style.minHeight = '14px';
            closeButton.style.borderRadius = '50%';
            closeButton.style.border = 'none';
            closeButton.style.padding = '0';
            closeButton.style.margin = '0';
            closeButton.style.cursor = 'pointer';
            closeButton.style.position = 'absolute';
            closeButton.style.top = '8px';
            closeButton.style.left = '8px';
            closeButton.style.boxSizing = 'border-box';
            closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                overlay.remove();
                document.removeEventListener('mousemove', overlay._onMouseMove);
                document.removeEventListener('mouseup', overlay._onMouseUp);
                document.removeEventListener('mousemove', overlay._onResizeMove);
                document.removeEventListener('mouseup', overlay._onResizeUp);
                if (overlay._cleanup) overlay._cleanup();
            });
            overlay.appendChild(closeButton);
        
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'cg-resize-handle';
            overlay.appendChild(resizeHandle);
        
            overlay.style.minWidth = '200px';
            overlay.style.maxWidth = 'min(1600px, 90vw)';
            overlay.style.minHeight = '150px';
            overlay.style.boxSizing = 'border-box';
            overlay.style.padding = '20px';
            overlay.style.pointerEvents = 'auto';
            overlay.style.zIndex = '9999';
        
            const defaultWidth = 600;
            const defaultHeight = 800;
            const savedSize = localStorage.getItem('customOverlaySize') ? JSON.parse(localStorage.getItem('customOverlaySize')) : null;
            let initialWidth = defaultWidth;
            let initialHeight = defaultHeight;
        
            if (savedSize && savedSize.width >= 200 && savedSize.width <= 1600 && savedSize.height >= 150 && savedSize.height <= 1600) {
                initialWidth = savedSize.width;
                initialHeight = savedSize.height;
            }
        
            overlay.style.width = `${initialWidth}px`;
            overlay.style.height = `${initialHeight}px`;
        
            const savedPosition = localStorage.getItem('customOverlayPosition') ? JSON.parse(localStorage.getItem('customOverlayPosition')) : null;
            if (savedPosition && savedPosition.top !== undefined && savedPosition.left !== undefined) {
                overlay.style.position = 'fixed';
                overlay.style.top = `${savedPosition.top}px`;
                overlay.style.left = `${savedPosition.left}px`;
                overlay.style.transform = 'none';
            } else {
                overlay.style.position = 'fixed';
                overlay.style.top = '10%';
                overlay.style.left = '50%';
                overlay.style.transform = 'translate(-50%, -10%)';
            }
        
            const adjustOverlaySize = () => {
                const rect = overlay.getBoundingClientRect();
                const resizeHandleOffset = 4; 
                const rightEdge = rect.left + rect.width - resizeHandleOffset;
                const bottomEdge = rect.top + rect.height - resizeHandleOffset;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const padding = 10; 
        
                let newWidth = rect.width;
                let newHeight = rect.height;
        
                if (rightEdge > viewportWidth - padding) {
                    newWidth = viewportWidth - rect.left - padding;
                    newWidth = Math.max(newWidth, 200); 
                }
                if (bottomEdge > viewportHeight - padding) {
                    newHeight = viewportHeight - rect.top - padding;
                    newHeight = Math.max(newHeight, 150); 
                }
        
                if (newWidth !== rect.width || newHeight !== rect.height) {
                    overlay.style.width = `${newWidth}px`;
                    overlay.style.height = `${newHeight}px`;
                    localStorage.setItem('customOverlaySize', JSON.stringify({
                        width: newWidth,
                        height: newHeight
                    }));
                }
            };
        
            requestAnimationFrame(adjustOverlaySize);
        
            const resizeCleanup = addResizeFunctionality(overlay, resizeHandle);
            const dragHandle = overlay.querySelector('.cg-drag-handle');
            const dragCleanup = addCustomOverlayDragFunctionality(overlay, dragHandle, () => null, 'customOverlayPosition');
        
            overlay._cleanup = () => {
                dragCleanup();
                resizeCleanup();
            };
        
            if (hasImage) {
                const imgElement = textbox.querySelector('img');
                imgElement.onerror = () => {
                    console.warn('Failed to load image, removing from overlay');
                    imgElement.remove();
                };
            }
        
            return overlay;
        }
    
        function addCustomOverlayDragFunctionality(element, dragHandle, getSyncElement, storageKey = 'overlayPosition') {
            let isDragging = false;
            let startX, startY;
    
            element.style.position = 'fixed';
            dragHandle.style.cursor = 'grab';
    
            const onMouseDown = (e) => {
                const target = e.target;
                if (!target.closest('.cg-drag-handle') ||
                    target.closest('.cg-close-button') ||
                    target.closest('.cg-minimize-button') ||
                    target.closest('.cg-resize-handle') ||
                    target.closest('.cg-button-container')) {
                    return;
                }
    
                e.preventDefault();
                e.stopPropagation();
    
                isDragging = true;
    
                const computedStyle = window.getComputedStyle(element);
                if (computedStyle.transform !== 'none' && !element.dataset.transformReset) {
                    const rect = element.getBoundingClientRect();
                    element.style.left = `${rect.left}px`;
                    element.style.top = `${rect.top}px`;
                    element.style.transform = 'none';
                    element.dataset.transformReset = 'true';
                }
    
                const rect = element.getBoundingClientRect();
                startX = e.clientX - rect.left;
                startY = e.clientY - rect.top;
    
                element.classList.add('dragging');
                dragHandle.style.cursor = 'grabbing';
                dragHandle.style.userSelect = 'none';
    
                element._onMouseMove = onMouseMove;
                element._onMouseUp = onMouseUp;
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
    
            const onMouseMove = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                e.stopPropagation();
    
                const newLeft = e.clientX - startX;
                const newTop = e.clientY - startY;
    
                element.style.left = `${newLeft}px`;
                element.style.top = `${newTop}px`;
                element.style.transform = 'none';
    
                const syncElement = typeof getSyncElement === 'function' ? getSyncElement() : null;
                if (syncElement && syncElement.style.display !== 'none') {
                    syncElement.style.left = `${newLeft}px`;
                    syncElement.style.top = `${newTop}px`;
                    syncElement.style.transform = 'none';
                }
            };
    
            const onMouseUp = (e) => {
                if (!isDragging) return;
                isDragging = false;
                element.classList.remove('dragging');
                dragHandle.style.cursor = 'grab';
                dragHandle.style.userSelect = '';
    
                const rect = element.getBoundingClientRect();
                const newLeft = rect.left;
                const newTop = rect.top;
    
                localStorage.setItem(storageKey, JSON.stringify({ top: newTop, left: newLeft }));
    
                if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
                    const defaultTop = window.innerHeight * 0.1;
                    const defaultLeft = window.innerWidth * 0.5 - (element.offsetWidth / 2);
                    element.style.top = `${defaultTop}px`;
                    element.style.left = `${defaultLeft}px`;
                    element.style.transform = 'none';
    
                    const syncElement = typeof getSyncElement === 'function' ? getSyncElement() : null;
                    if (syncElement) {
                        syncElement.style.top = `${defaultTop}px`;
                        syncElement.style.left = `${defaultLeft}px`;
                        syncElement.style.transform = 'none';
                    }
                    localStorage.removeItem(storageKey);
                } else {
                    element.style.transform = 'none';
                    const syncElement = typeof getSyncElement === 'function' ? getSyncElement() : null;
                    if (syncElement) syncElement.style.transform = 'none';
                }
    
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                element._onMouseMove = null;
                element._onMouseUp = null;
            };
    
            dragHandle.addEventListener('mousedown', onMouseDown);
    
            return () => {
                dragHandle.removeEventListener('mousedown', onMouseDown);
                if (element._onMouseMove) document.removeEventListener('mousemove', element._onMouseMove);
                if (element._onMouseUp) document.removeEventListener('mouseup', element._onMouseUp);
            };
        }
    
        function addResizeFunctionality(element, handle) {
            let isResizing = false;
            let startX, startY, startWidth, startHeight;
    
            const onMouseDown = (e) => {
                e.preventDefault();
                e.stopPropagation();
    
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseFloat(getComputedStyle(element).width);
                startHeight = parseFloat(getComputedStyle(element).height);
    
                element.classList.add('resizing');
                document.body.style.userSelect = 'none';
                element._onResizeMove = onMouseMove;
                element._onResizeUp = onMouseUp;
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
    
            const onMouseMove = (e) => {
                if (!isResizing) return;
                e.preventDefault();
                e.stopPropagation();
    
                const newWidth = Math.max(200, startWidth + (e.clientX - startX));
                const newHeight = Math.max(150, startHeight + (e.clientY - startY));
    
                element.style.width = `${newWidth}px`;
                element.style.height = `${newHeight}px`;
            };
    
            const onMouseUp = (e) => {
                if (!isResizing) return;
                isResizing = false;
                element.classList.remove('resizing');
                document.body.style.userSelect = '';
    
                const finalWidth = parseFloat(getComputedStyle(element).width);
                const finalHeight = parseFloat(getComputedStyle(element).height);
                localStorage.setItem('customOverlaySize', JSON.stringify({
                    width: finalWidth,
                    height: finalHeight
                }));
    
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                element._onResizeMove = null;
                element._onResizeUp = null;
            };
    
            handle.addEventListener('mousedown', onMouseDown, { capture: true });
    
            return () => {
                handle.removeEventListener('mousedown', onMouseDown, { capture: true });
                if (element._onResizeMove) document.removeEventListener('mousemove', element._onResizeMove);
                if (element._onResizeUp) document.removeEventListener('mouseup', element._onResizeUp);
            };
        }

        return { createErrorOverlay, createLoadingOverlay, createCustomOverlay };
    }   
    
    function setupButtonOverlay() {
        console.log("Setting up button overlay");
    
        const generateButtons = document.getElementById('generate_buttons');
        if (!generateButtons) {
            console.error('Generate buttons container not found');
            return;
        }
    
        const buttonOverlay = document.createElement('div');
        buttonOverlay.id = 'cg-button-overlay';
        buttonOverlay.className = 'cg-overlay cg-button-overlay';
    
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'cg-button-container';
        buttonContainer.style.padding = '20px';
        buttonContainer.style.width = '240px';
        buttonContainer.style.boxSizing = 'border-box';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'column';
        buttonContainer.style.gap = '12px';
    
        const minimizeButton = document.createElement('button');
        minimizeButton.className = 'cg-minimize-button';
        minimizeButton.style.backgroundColor = '#3498db';
        minimizeButton.style.width = '14px';
        minimizeButton.style.height = '14px';
        minimizeButton.style.minWidth = '14px';
        minimizeButton.style.minHeight = '14px';
        minimizeButton.style.borderRadius = '50%';
        minimizeButton.style.border = 'none';
        minimizeButton.style.padding = '4px';
        minimizeButton.style.margin = '0';
        minimizeButton.style.cursor = 'pointer';
        minimizeButton.style.position = 'absolute';
        minimizeButton.style.top = '8px';
        minimizeButton.style.left = '8px';
        minimizeButton.style.boxSizing = 'border-box';
    
        const runButton = document.getElementById('run_button');
        const runRandomButton = document.getElementById('run_random_button');
        const clonedRunButton = runButton.cloneNode(true);
        const clonedRandomButton = runRandomButton.cloneNode(true);
    
        [clonedRunButton, clonedRandomButton].forEach(button => {
            button.classList.add('cg-overlay-button');
            button.style.width = '200px';
            button.style.boxSizing = 'border-box';
            button.style.padding = '10px 15px';
        });
    
        function preventClickIfDragged(clonedButton, originalButton) {
            let isDraggingButton = false, hasMoved = false;
            const MOVE_THRESHOLD = 5;
    
            clonedButton.addEventListener('mousedown', (e) => {
                isDraggingButton = true;
                hasMoved = false;
                const startX = e.clientX;
                const startY = e.clientY;
    
                const onMove = (moveEvent) => {
                    const deltaX = moveEvent.clientX - startX;
                    const deltaY = moveEvent.clientY - startY;
                    if (Math.abs(deltaX) > MOVE_THRESHOLD || Math.abs(deltaY) > MOVE_THRESHOLD) {
                        hasMoved = true;
                    }
                };
    
                const onUp = () => {
                    if (!hasMoved) originalButton.click();
                    isDraggingButton = false;
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                };
    
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        }
    
        preventClickIfDragged(clonedRandomButton, runRandomButton);
        preventClickIfDragged(clonedRunButton, runButton);
    
        buttonContainer.appendChild(clonedRandomButton);
        buttonContainer.appendChild(clonedRunButton);
        buttonOverlay.appendChild(buttonContainer);
        buttonOverlay.appendChild(minimizeButton);
        document.body.appendChild(buttonOverlay);
    
        buttonOverlay.style.width = '240px';
        buttonOverlay.style.padding = '20px 20px 5px';
        buttonOverlay.style.boxSizing = 'border-box';
    
        const defaultPosition = {
            translateX: window.innerWidth * 0.5 - 120,
            translateY: window.innerHeight * 0.8
        };
        const savedPosition = JSON.parse(localStorage.getItem('overlayPosition'));
        let translateX, translateY;
    
        if (savedPosition && savedPosition.top !== undefined && savedPosition.left !== undefined) {
            translateX = savedPosition.left;
            translateY = savedPosition.top;
        } else {
            translateX = defaultPosition.translateX;
            translateY = defaultPosition.translateY;
        }
    
        buttonOverlay.style.top = '0';
        buttonOverlay.style.left = '0';
        buttonOverlay.style.transform = `translate(${translateX}px, ${translateY}px)`;
    
        if (buttonOverlay.updateDragPosition) {
            buttonOverlay.updateDragPosition(translateX, translateY);
        }
    
        restrictOverlayPosition(buttonOverlay, defaultPosition);
    
        let isMinimized = false;
        let dragHandler;
    
        function enableDrag() {
            if (!dragHandler) {
                dragHandler = addDragFunctionality(buttonOverlay, () => {
                    const loadingOverlay = document.getElementById('cg-loading-overlay');
                    return loadingOverlay && !isMinimized ? loadingOverlay : null;
                });
            }
        }
    
        function disableDrag() {
            buttonOverlay.style.cursor = 'default';
            if (dragHandler) {
                dragHandler();
                dragHandler = null;
            }
            minimizeButton.style.pointerEvents = 'auto';
        }
    
        enableDrag();
    
        function setMinimizedState(overlay, container, button, isMin) {
            if (isMin) {
                overlay.classList.add('minimized');
                overlay.style.top = '0px';
                overlay.style.left = '0px';
                overlay.style.transform = 'none';
                overlay.style.width = '22px';
                overlay.style.height = '22px';
                overlay.style.minWidth = '22px';
                overlay.style.minHeight = '22px';
                overlay.style.padding = '0';
                container.style.display = 'none';
                button.style.top = '2px';
                button.style.left = '2px';
                disableDrag();
            } else {
                overlay.classList.remove('minimized');
                overlay.style.width = '240px';
                overlay.style.height = 'auto';
                overlay.style.minHeight = '110px';
                overlay.style.padding = '20px 20px 5px';
                container.style.display = 'flex';
                container.style.padding = '20px';
    
                const savedPosition = JSON.parse(localStorage.getItem('overlayPosition'));
                if (savedPosition && savedPosition.top !== undefined && savedPosition.left !== undefined) {
                    translateX = savedPosition.left;
                    translateY = savedPosition.top;
                } else {
                    translateX = defaultPosition.translateX;
                    translateY = defaultPosition.translateY;
                }
    
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.transform = `translate(${translateX}px, ${translateY}px)`;
    
                if (overlay.updateDragPosition) {
                    overlay.updateDragPosition(translateX, translateY);
                }
    
                overlay.style.pointerEvents = 'auto';
                enableDrag();
                restrictOverlayPosition(overlay, defaultPosition);
            }
        }
    
        minimizeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            isMinimized = !isMinimized;
            setMinimizedState(buttonOverlay, buttonContainer, minimizeButton, isMinimized);
        });
    
        function toggleButtonOverlayVisibility() {
            const loadingOverlay = document.getElementById('cg-loading-overlay');
            const errorOverlay = document.getElementById('cg-error-overlay');
            buttonOverlay.style.display = (loadingOverlay || errorOverlay) ? 'none' : 'flex';
            if (!isMinimized && buttonOverlay.style.display !== 'none') {
                const savedPosition = JSON.parse(localStorage.getItem('overlayPosition'));
                if (savedPosition && savedPosition.top !== undefined && savedPosition.left !== undefined) {
                    translateX = savedPosition.left;
                    translateY = savedPosition.top;
                } else {
                    translateX = defaultPosition.translateX;
                    translateY = defaultPosition.translateY;
                }
    
                buttonOverlay.style.top = '0';
                buttonOverlay.style.left = '0';
                buttonOverlay.style.transform = `translate(${translateX}px, ${translateY}px)`;
    
                if (buttonOverlay.updateDragPosition) {
                    buttonOverlay.updateDragPosition(translateX, translateY);
                }
    
                restrictOverlayPosition(buttonOverlay, defaultPosition);
            }
        }
    
        toggleButtonOverlayVisibility();
    
        const observer = new MutationObserver(toggleButtonOverlayVisibility);
        observer.observe(document.body, { childList: true, subtree: false });
    
        return function cleanup() {
            observer.disconnect();
            if (buttonOverlay && buttonOverlay.parentNode) {
                buttonOverlay.parentNode.removeChild(buttonOverlay);
            }
            if (dragHandler) dragHandler();
        };
    }

    function setupMyDropdown({ containerId, dropdownCount, labelPrefixList, textboxIds, optionHandler, enableSearch = true, enableOverlay = false }) {
        const container = document.getElementById(containerId);
        if (!container || container.dataset.dropdownSetup) return;
    
        let textboxes = textboxIds.map(id => {
            const element = document.getElementById(id);
            return element ? element.querySelector('textarea') : null;
        });
        const overlayElement = document.getElementById('cd-character-overlay');
        const overlayTextbox = overlayElement ? overlayElement.querySelector('textarea') : null;
    
        let html = '<div class="mydropdown-container-flex">';
        for (let i = 0; i < dropdownCount; i++) {
            html += `
                <div class="mydropdown-wrapper" data-index="${i}">
                    <span class="mydropdown-label">${labelPrefixList[i]}</span>
                    <div class="mydropdown-input-container">
                        <input type="text" id="${textboxIds[i]}-overlay" class="mydropdown-input" placeholder="..." ${!enableSearch ? 'readonly' : ''}>
                        <svg class="mydropdown-arrow" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                            <path d="M5 8l4 4 4-4z"></path>
                        </svg>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;
    
        const inputs = container.querySelectorAll('.mydropdown-input');
        const wrappers = container.querySelectorAll('.mydropdown-wrapper');
        const optionsList = document.createElement('div');
        optionsList.className = 'mydropdown-options scroll-container';
        optionsList.style.display = 'none';
        document.body.appendChild(optionsList);
    
        let options = Array(dropdownCount).fill([]);
        let filteredOptions = Array(dropdownCount).fill([]);
        let activeInput = null;
        let isEditing = Array(dropdownCount).fill(false);
        let selectedValues = Array(dropdownCount).fill('');
        let lastOptionKey = null;
    
        let lastUpdateTime = 0;
        const throttleDelay = 32; // 30 fps
    
        window.dropdowns[containerId] = {
            setOptions: function(data, oc, labelPrefixList, ...rest) {
                const defaults = rest.slice(0, dropdownCount);
                const newEnableSearch = rest[dropdownCount] !== undefined ? rest[dropdownCount] : enableSearch;
    
                optionHandler(options, filteredOptions, [data, oc], dropdownCount);
    
                let updatedLabelPrefixList = labelPrefixList;
                if (typeof labelPrefixList === 'string') {
                    updatedLabelPrefixList = labelPrefixList.split(',').map(label => label.trim());
                }
                if (Array.isArray(updatedLabelPrefixList) && updatedLabelPrefixList.length === dropdownCount) {
                    labelPrefixList = updatedLabelPrefixList;
                }
    
                inputs.forEach((input, index) => {
                    const value = defaults[index] || '';
                    selectedValues[index] = value;
                    input.value = value;
                    if (!newEnableSearch) input.setAttribute('readonly', 'readonly');
                    if (textboxes[index] && textboxes[index].value !== undefined) {
                        textboxes[index].value = value;
                        textboxes[index].dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
                const labels = container.querySelectorAll('.mydropdown-label');
                labels.forEach((label, index) => label.textContent = labelPrefixList[index]);
                updateOptionsList(0);
            },
            updateDefaults: function(...defaults) {
                const defaultValues = defaults.slice(0, dropdownCount);
                inputs.forEach((input, index) => {
                    if (!isEditing[index]) {
                        const value = defaultValues[index] || '';
                        selectedValues[index] = value;
                        input.value = value;
                        if (textboxes[index] && textboxes[index].value !== undefined) {
                            textboxes[index].value = value;
                            textboxes[index].dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                });
            },
            getValue: function() {
                return selectedValues.slice();
            },
            cleanup: function() {
                document.removeEventListener('click', clickHandler);
                document.removeEventListener('scroll', scrollHandler, true);
                optionsList.remove();
                container.dataset.dropdownSetup = null;
                delete window.dropdowns[containerId];
            }
        };
    
        function updateOptionsList(activeIndex = 0) {
            const existingItems = Array.from(optionsList.children);
            const fragment = document.createDocumentFragment();
            const validOverlayIds = ['cd-character1-overlay', 'cd-character2-overlay', 'cd-character3-overlay'];
            const shouldAddOverlayEvents = enableOverlay && activeInput && validOverlayIds.includes(activeInput.id);
        
            filteredOptions[activeIndex].forEach((option, idx) => {
                let item = existingItems[idx] || document.createElement('div');
                item.className = 'mydropdown-item';
                item.textContent = activeIndex === 3 ? option.key : (option.key === option.value ? option.key : `${option.key}\n(${option.value})`);
                item.dataset.key = option.key;
                fragment.appendChild(item);
            });
        
            existingItems.slice(filteredOptions[activeIndex].length).forEach(item => item.remove());
            optionsList.innerHTML = '';
            optionsList.appendChild(fragment);
        
            optionsList.onclick = (e) => {
                const item = e.target.closest('.mydropdown-item');
                if (!item) return;
                const optionKey = item.dataset.key;
                const index = activeInput ? parseInt(activeInput.closest('.mydropdown-wrapper').dataset.index) : activeIndex;
                selectedValues[index] = optionKey;
                activeInput.value = optionKey;
                if (textboxes[index] && textboxes[index].value !== undefined) {
                    textboxes[index].value = optionKey;
                    textboxes[index].dispatchEvent(new Event('input', { bubbles: true }));
                }
                optionsList.style.display = 'none';
                isEditing[index] = false;
                const event = new CustomEvent(`${containerId}-change`, { detail: { value: selectedValues } });
                document.dispatchEvent(event);
            };
        
            optionsList.removeEventListener('mouseenter', optionsList._onMouseEnter);
            optionsList.removeEventListener('mouseleave', optionsList._onMouseLeave);
        
            if (shouldAddOverlayEvents && containerId === 'mydropdown-container') {
                optionsList._onMouseEnter = (e) => {
                    const item = e.target.closest('.mydropdown-item');
                    if (!item) {
                        return;
                    }
        
                    const now = performance.now();
                    if (now - lastUpdateTime < throttleDelay) {
                        return;
                    }
                    lastUpdateTime = now;
        
                    if (lastOptionKey === item.dataset.key) {
                        return;
                    }
                    lastOptionKey = item.dataset.key;
        
                    if (overlayTextbox && overlayTextbox.value !== undefined) {
                        overlayTextbox.value = item.dataset.key;
                        overlayTextbox.dispatchEvent(new Event('input', { bubbles: true }));
                    }
        
                    const overlayContainer = document.getElementById('cg-thumb-overlay');
                    if (overlayContainer) {
                        const hasImage = overlayContainer.querySelector('img') !== null;
                        overlayContainer.style.display = hasImage ? 'block' : 'none';
                        if (hasImage) {
                            overlayContainer.style.background = 'rgba(0, 0, 0, 0.5)';
                            overlayContainer.style.border = 'none';
        
                            requestAnimationFrame(() => {
                                const inputRect = activeInput.getBoundingClientRect();
                                const optionsRect = optionsList.getBoundingClientRect();
                                const itemRect = item.getBoundingClientRect();
        
                                const optionsWidth = Math.min(inputRect.width, 600);
                                let left;
                                let top = itemRect.top;
                                const overlayWidth = overlayContainer.offsetWidth || 327;
                                const overlayHeight = overlayContainer.offsetHeight || 480;
        
                                const inputId = activeInput.id;
                                if (inputId === 'cd-character1-overlay' || inputId === 'cd-character2-overlay') {
                                    left = optionsRect.left + optionsWidth + window.scrollX + 30;
                                } else if (inputId === 'cd-character3-overlay') {
                                    left = optionsRect.left + window.scrollX - overlayWidth - 10;
                                } else {
                                    overlayContainer.style.display = 'none';
                                    return;
                                }
                                        
                                if (top + overlayHeight > window.innerHeight - 10) {
                                    top = window.innerHeight - overlayHeight - 10;
                                }
                                if (top < 10) {
                                    top = 10;
                                }
                                if (top + overlayHeight - window.scrollY > window.innerHeight - 10) {
                                    top = window.innerHeight - overlayHeight - 10;
                                }

                                overlayContainer.style.transform = `translate(${left}px, ${top}px)`;
                                overlayContainer.style.left = '0';
                                overlayContainer.style.top = '0';
                                overlayContainer.style.zIndex = '10003';
                            });
                        }
                    } else {
                        console.warn(`[MouseEnter] cg-thumb-overlay not found`);
                    }
                };
        
                optionsList._onMouseLeave = (e) => {
                    const item = e.target.closest('.mydropdown-item');
                    if (!item) {
                        return;
                    }
                    const overlayContainer = document.getElementById('cg-thumb-overlay');
                    if (overlayContainer) {
                        overlayContainer.style.display = 'none';
                        lastOptionKey = null;
                    }
                };        
                optionsList.addEventListener('mouseenter', optionsList._onMouseEnter, true);
                optionsList.addEventListener('mouseleave', optionsList._onMouseLeave, true);
            }
        }
    
        function updateOptionsPosition(index) {
            if (!activeInput) activeInput = inputs[index];
            const inputRect = activeInput.getBoundingClientRect();
            const inputBottom = inputRect.bottom + window.scrollY;
            const inputLeft = inputRect.left + window.scrollX;
            const inputWidth = inputRect.width;
    
            optionsList.style.width = `${Math.min(inputWidth, 600)}px`;
            optionsList.style.left = `${inputLeft}px`;
            optionsList.style.top = `${inputBottom}px`;
            optionsList.style.zIndex = '10002';
    
            const itemHeight = 40;
            const maxItems = 30;
            const maxHeight = Math.min(maxItems * itemHeight, window.innerHeight * 0.8);
            optionsList.style.maxHeight = `${maxHeight}px`;
        }
    
        const clickHandler = (e) => {
            if (!container.contains(e.target) && !optionsList.contains(e.target)) {
                optionsList.style.display = 'none';
                inputs.forEach((input, index) => {
                    input.value = selectedValues[index];
                    isEditing[index] = false;
                });
                activeInput = null;
            }
        };
    
        const scrollHandler = debounce(() => {
            if (optionsList.style.display !== 'none' && activeInput) {
                const index = parseInt(activeInput.closest('.mydropdown-wrapper').dataset.index);
                updateOptionsPosition(index);
            }
        }, 100);
    
        document.addEventListener('click', clickHandler);
        document.addEventListener('scroll', scrollHandler, true);
    
        if (enableSearch) {
            wrappers.forEach((wrapper, index) => {
                wrapper.addEventListener('click', (e) => {
                    if (e.target.tagName === 'INPUT' && isEditing[index]) return;
                    activeInput = inputs[index];
                    filteredOptions[index] = [...options[index]];
                    updateOptionsList(index);
                    updateOptionsPosition(index);
                    optionsList.style.display = filteredOptions[index].length > 0 ? 'block' : 'none';
                });
            });
    
            inputs.forEach((input, index) => {
                input.addEventListener('click', (e) => {
                    if (optionsList.style.display === 'block' && !isEditing[index]) {
                        e.preventDefault();
                        activeInput = input;
                        isEditing[index] = true;
                        input.value = '';
                        filteredOptions[index] = [...options[index]];
                        updateOptionsList(index);
                        updateOptionsPosition(index);
                        optionsList.style.display = 'block';
                        input.focus();
                    }
                });
    
                input.addEventListener('input', debounce(() => {
                    activeInput = input;
                    const searchText = input.value.toLowerCase();
                    const index = parseInt(input.closest('.mydropdown-wrapper').dataset.index);
                    filteredOptions[index] = options[index].filter(option =>
                        option.key.toLowerCase().includes(searchText) ||
                        (index !== 3 && option.value.toLowerCase().includes(searchText))
                    );
                    updateOptionsList(index);
                    updateOptionsPosition(index);
                    optionsList.style.display = filteredOptions[index].length > 0 ? 'block' : 'none';
                }, 100));
            });
        } else {
            inputs.forEach((input, index) => {
                input.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (activeInput === input && optionsList.style.display === 'block') {
                        optionsList.style.display = 'none';
                        activeInput = null;
                    } else {
                        if (activeInput !== null) {
                            const prevIndex = parseInt(activeInput.closest('.mydropdown-wrapper').dataset.index);
                            inputs[prevIndex].value = selectedValues[prevIndex];
                        }
                        activeInput = input;
                        filteredOptions[index] = [...options[index]];
                        updateOptionsList(index);
                        updateOptionsPosition(index);
                        optionsList.style.display = filteredOptions[index].length > 0 ? 'block' : 'none';
                    }
                    input.value = selectedValues[index];
                });
            });
        }
    }

    function myCharacterList() {
        function handleCharacterOptions(options, filteredOptions, args, dropdownCount) {
            const [[keys, values], oc] = args;
            if (!Array.isArray(keys) || !Array.isArray(values) || keys.length !== values.length) {
                console.error('[handleCharacterOptions] Invalid keys or values:', keys, values);
                return;
            }
            if (!Array.isArray(oc)) {
                console.error('[handleCharacterOptions] Invalid oc:', oc);
                return;
            }

            const charOptions = keys.map((key, idx) => ({ key, value: values[idx] }));
            for (let i = 0; i < dropdownCount - 1; i++) {
                options[i] = charOptions;
                filteredOptions[i] = [...charOptions];
            }

            const originalOptions = oc.map(key => ({ key, value: key }));
            options[dropdownCount - 1] = originalOptions;
            filteredOptions[dropdownCount - 1] = [...originalOptions];
        }

        setupMyDropdown({
            containerId: 'mydropdown-container',
            dropdownCount: 4,
            labelPrefixList: ['character1', 'character2', 'character3', 'original_character'],
            textboxIds: ['cd-character1', 'cd-character2', 'cd-character3', 'cd-original-character'],
            optionHandler: handleCharacterOptions,
            enableSearch: true,
            enableOverlay: true
        });

        window.setMyCharacterOptions = function(data, oc, chara_text, character1, character2, character3, oc_default, enableSearch) {
            window.dropdowns['mydropdown-container'].setOptions(data, oc, chara_text, character1, character2, character3, oc_default, enableSearch);
        };

        window.updateMyCharacterDefaults = window.dropdowns['mydropdown-container'].updateDefaults;
        window.getMyCharacterValue = window.dropdowns['mydropdown-container'].getValue;
    }

    function myViewsList() {
        function handleViewOptions(options, filteredOptions, args, dropdownCount) {
            const [data] = args;
            if (typeof data !== 'object' || data === null || Object.keys(data).length !== dropdownCount) return;
            const keys = ['angle', 'camera', 'background', 'style'];
            options.forEach((_, index) => {
                const key = keys[index];
                options[index] = data[key].map(item => ({ key: item, value: item }));
                filteredOptions[index] = [...options[index]];
            });
        }

        setupMyDropdown({
            containerId: 'myviews-container',
            dropdownCount: 4,
            labelPrefixList: ['angle', 'camera', 'background', 'view'],
            textboxIds: ['cd-view-angle', 'cd-view-camera', 'cd-view-background', 'cd-view-style'],
            optionHandler: handleViewOptions,
            enableSearch: true,
            enableOverlay: false 
        });

        window.setMyViewsOptions = function(view_data, view_text, ...rest) {
            window.dropdowns['myviews-container'].setOptions(view_data, null, view_text, ...rest);
        };

        window.updateMyViewsDefaults = window.dropdowns['myviews-container'].updateDefaults;
        window.getMyViewsValue = window.dropdowns['myviews-container'].getValue;
    }

    function restrictOverlayPosition(element, defaultPosition) {
        if (!element) return;
    
        const rect = element.getBoundingClientRect();
        const isOutOfBounds = rect.top < 0 || rect.left < 0 ||
                             rect.bottom > window.innerHeight || rect.right > window.innerWidth;
    
        if (isOutOfBounds) {
            console.log(`Overlay ${element.id} out of bounds, resetting to default position`);
            let translateX = defaultPosition.translateX;
            let translateY = defaultPosition.translateY;
    
            element.style.transform = `translate(${translateX}px, ${translateY}px)`;
            element.style.top = '0';
            element.style.left = '0';
    
            if (element.updateDragPosition) {
                element.updateDragPosition(translateX, translateY);
            }
        }
    }

    const dragStates = new WeakMap();
    function addDragFunctionality(element, getSyncElement) {
        if (dragStates.has(element)) {
            const cleanup = dragStates.get(element).cleanup;
            if (cleanup) cleanup();
        }
            
        let isDragging = false;
        let startX, startY;
        let state = { translateX: 0, translateY: 0, cleanup: null };
        dragStates.set(element, state);
    
        let rafId = null;
    
        element.style.position = 'fixed';
        element.style.willChange = 'transform';
        element.style.cursor = 'grab';
    
        let syncElement = typeof getSyncElement === 'function' ? getSyncElement() : null;
    
        const updateTransform = () => {
            element.style.transform = `translate(${state.translateX}px, ${state.translateY}px)`;
            element.style.top = '0';
            element.style.left = '0';
        
            syncElement = typeof getSyncElement === 'function' ? getSyncElement() : null;
            if (syncElement && syncElement.isConnected && !syncElement.classList.contains('minimized')) {
                syncElement.style.transform = `translate(${state.translateX}px, ${state.translateY}px)`;
                syncElement.style.top = '0';
                syncElement.style.left = '0';
            }
    
            localStorage.setItem('overlayPosition', JSON.stringify({
                top: state.translateY,
                left: state.translateX
            }));
        };
    
        const throttledUpdate = (callback) => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                callback();
                rafId = null;
            });
        };
    
        state.cleanup = () => {
            if (rafId) cancelAnimationFrame(rafId);
            element.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            dragStates.delete(element);
        };
    
        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
    
            isDragging = true;
            startX = e.clientX - state.translateX;
            startY = e.clientY - state.translateY;
    
            element.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
            syncElement = typeof getSyncElement === 'function' ? getSyncElement() : null;
        };
    
        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            e.stopPropagation();
    
            state.translateX = e.clientX - startX;
            state.translateY = e.clientY - startY;
    
            throttledUpdate(updateTransform);
        };
    
        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            element.style.cursor = 'grab';
            document.body.style.userSelect = '';
    
            const rect = element.getBoundingClientRect();
            const isOutOfBounds = rect.top < 0 || rect.left < 0 ||
                                  rect.bottom > window.innerHeight || rect.right > window.innerWidth;
    
            if (isOutOfBounds) {
                if (element.id === 'cg-loading-overlay') {
                    state.translateX = (window.innerWidth - element.offsetWidth) / 2;
                    state.translateY = window.innerHeight * 0.2 - element.offsetHeight * 0.2;
                } else {
                    state.translateX = window.innerWidth * 0.5 - 120;
                    state.translateY = window.innerHeight * 0.8;
                }
            }
    
            updateTransform();
        };
    
        const savedPosition = localStorage.getItem('overlayPosition');
        if (savedPosition) {
            try {
                const { top, left } = JSON.parse(savedPosition);
                state.translateX = left || 0;
                state.translateY = top || 0;
                updateTransform();
            } catch (err) {
                console.error('Failed to parse saved position:', err);
                localStorage.removeItem('overlayPosition');
            }
        }
    
        element.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    
        element.updateDragPosition = (x, y) => {
            state.translateX = x;
            state.translateY = y;
            updateTransform();
        };
    
        return state.cleanup;
    }
}
