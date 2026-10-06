document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('lexUser'));

   
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    if (user.role === 'lawyer') {
        window.location.replace('lawyer-dashboard.html');
        return;
    }

    // Load User Details
    const firstName = user.name.split(" ")[0];
    document.getElementById('dashHeaderUserName').innerText = firstName;
    document.getElementById('dashProfileName').innerText = user.name;
    document.getElementById('dashAvatarInitials').innerText = firstName.charAt(0).toUpperCase();

    if (user.isPremium) {
        document.getElementById('dashPremiumCrown').style.display = 'inline-block';
    }

    // Sidebar Navigation Switching
    document.querySelectorAll('.dash-nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.dash-nav-link').forEach(l => l.classList.remove('active'));
            document.querySelectorAll('.dash-tab-content').forEach(tab => tab.style.display = 'none');

            link.classList.add('active');
            const target = link.getAttribute('data-tab');
            const targetSection = document.getElementById(target);
            if (targetSection) targetSection.style.display = 'block';
        });
    });

    // Buttons inside cards switching tabs
    document.querySelectorAll('.switch-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-target');
            const targetLink = document.querySelector(`.dash-nav-link[data-tab="${targetTab}"]`);
            if (targetLink) targetLink.click();
        });
    });

    const aiToggle = document.getElementById('floatingAiToggle');
    const aiWidget = document.getElementById('floatingAiWidget');
    const aiClose = document.getElementById('closeAiWidget');
    const aiInput = document.getElementById('aiWidgetInput');
    const aiSend = document.getElementById('aiWidgetSend');
    const aiMessages = document.getElementById('aiWidgetMessages');

    function setAiWidgetOpen(isOpen) {
        aiWidget.classList.toggle('active', isOpen);
        aiWidget.setAttribute('aria-hidden', String(!isOpen));
        aiToggle.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) aiInput.focus();
        else aiToggle.focus();
    }

    aiToggle.addEventListener('click', () => {
        setAiWidgetOpen(!aiWidget.classList.contains('active'));
    });
    aiClose.addEventListener('click', () => setAiWidgetOpen(false));
    document.getElementById('launchAiAssistant').addEventListener('click', () => {
        setAiWidgetOpen(true);
    });

    function appendAiMessage(text, className) {
        const message = document.createElement('div');
        message.className = `ai-msg ${className}`;
        message.textContent = text;
        aiMessages.appendChild(message);
        aiMessages.scrollTop = aiMessages.scrollHeight;
    }

    function sendAiMessage() {
        const question = aiInput.value.trim();
        if (!question) return;

        appendAiMessage(question, 'user-msg');
        aiInput.value = '';
        appendAiMessage(
            'This is a front-end demo and is not connected to a live AI service, so I can’t analyze your question yet. Please don’t share confidential details. You can browse document tools or find a lawyer in your workspace.',
            'bot-msg'
        );
    }

    aiSend.addEventListener('click', sendAiMessage);
    aiInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendAiMessage();
        }
    });

    document.getElementById('goToCommunity').addEventListener('click', () => {
        document.querySelector('.community-header').scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('postInputText').focus({ preventScroll: true });
    });

    // Logout
    document.getElementById('dashLogoutBtn').addEventListener('click', () => {
        localStorage.removeItem('lexUser');
        window.location.href = 'index.html';
    });

    // Subscribe
    const subBtn = document.getElementById('dashSubscribeBtn');
    if(subBtn) {
        subBtn.addEventListener('click', () => {
            user.isPremium = true;
            localStorage.setItem('lexUser', JSON.stringify(user));
            alert("Your plan has been upgraded to Premium.");
            location.reload();
        });
    }
});
document.addEventListener('DOMContentLoaded', () => {
    // Fetch logged-in user or set a default
    const user = JSON.parse(localStorage.getItem('lexUser')) || { name: 'Client Account', isPremium: false };

    // 1. Initialize empty state (No dummy data)
    // Ready for backend integration: Replace localStorage with API fetch later
    let posts = JSON.parse(localStorage.getItem('lexCommunityPosts')) || [];
    let pendingAttachments = [];

    // 2. Render Feed Function
    function renderFeed() {
        const feedContainer = document.getElementById('communityFeed');
        if (!feedContainer) return;

        feedContainer.innerHTML = '';

        // Empty state UI
        if (posts.length === 0) {
            feedContainer.innerHTML = `
                <div style="text-align: center; padding: 50px 20px; background: #FFFFFF; border-radius: 16px; border: 1px solid #E8E6D9;">
                    <h3 style="color: #1A1A1A; margin-bottom: 10px;">No discussions yet</h3>
                    <p style="color: #666666; font-size: 14px;">Be the first to ask a legal question or share an update with the community.</p>
                </div>`;
            return;
        }

        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post-card';

            // Handle Attachments
            let attachmentsHTML = '';
            if (post.attachments && post.attachments.length > 0) {
                attachmentsHTML = `<div class="post-media-grid">`;
                post.attachments.forEach(att => {
                    if (att.type === 'image') {
                        attachmentsHTML += `<img src="${att.src}" alt="Attachment">`;
                    } else if (att.type === 'doc') {
                        attachmentsHTML += `<div class="doc-attach-pill"><svg class="ui-icon" aria-hidden="true"><use href="#icon-file"></use></svg> ${att.name}</div>`;
                    }
                });
                attachmentsHTML += `</div>`;
            }

            // Handle Comments
            let commentsHTML = '';
            if (post.comments) {
                post.comments.forEach(c => {
                    const isLawyer = c.role.includes('Advocate') || c.role.includes('Lawyer');
                    commentsHTML += `
                        <div class="single-comment">
                            <div class="comment-header">
                                <strong>${c.author} <span class="user-role-badge ${isLawyer ? 'advocate-badge' : ''}">${c.role}</span></strong>
                            </div>
                            <div class="comment-body">${c.text}</div>
                        </div>
                    `;
                });
            }

            // Post HTML Structure
            postElement.innerHTML = `
                <div class="post-header">
                    <div class="dash-avatar">${post.author.charAt(0).toUpperCase()}</div>
                    <div class="author-info">
                        <h4>${post.author} <span class="user-role-badge">${post.role}</span></h4>
                        <span class="post-time">${post.time}</span>
                    </div>
                </div>
                <div class="post-body">
                    <p>${post.content}</p>
                    ${attachmentsHTML}
                </div>
                <div class="comments-section">
                    <div class="comments-list">${commentsHTML}</div>
                    <div class="comment-input-box">
                        <input type="text" placeholder="Write a reply..." id="commentInput-${post.id}">
                        <button class="btn-comment-send" data-postid="${post.id}">Reply</button>
                    </div>
                </div>
            `;

            feedContainer.appendChild(postElement);
        });

        // Attach event listeners to all dynamically created reply buttons
        document.querySelectorAll('.btn-comment-send').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = parseInt(e.target.getAttribute('data-postid'));
                const input = document.getElementById(`commentInput-${postId}`);
                if (input && input.value.trim() !== '') {
                    addComment(postId, input.value.trim());
                    input.value = ''; // Clear input after posting
                }
            });
        });
    }

    // 3. Add Comment Function
    function addComment(postId, text) {
        const targetPost = posts.find(p => p.id === postId);
        if (targetPost) {
            if (!targetPost.comments) targetPost.comments = [];
            targetPost.comments.push({
                author: user.name,
                role: user.isPremium ? "Pro Member" : "Client",
                text: text
            });
            // Ready for Backend: Replace this with a POST request to your DB
            localStorage.setItem('lexCommunityPosts', JSON.stringify(posts));
            renderFeed();
        }
    }

    // 4. Attachment Handlers (Images & Docs)
    const imgInput = document.getElementById('imageFileInput');
    const docInput = document.getElementById('docFileInput');
    const previewBox = document.getElementById('attachmentPreviewBox');

    if (imgInput) {
        imgInput.addEventListener('change', (e) => {
            Array.from(e.target.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    pendingAttachments.push({ type: 'image', src: event.target.result, name: file.name });
                    updatePreview();
                };
                reader.readAsDataURL(file);
            });
        });
    }

    if (docInput) {
        docInput.addEventListener('change', (e) => {
            Array.from(e.target.files).forEach(file => {
                pendingAttachments.push({ type: 'doc', name: file.name });
                updatePreview();
            });
        });
    }

    function updatePreview() {
        if (!previewBox) return;
        if (pendingAttachments.length === 0) {
            previewBox.style.display = 'none';
            return;
        }
        
        previewBox.style.display = 'flex';
        previewBox.innerHTML = '';
        
        pendingAttachments.forEach((att, idx) => {
            const item = document.createElement('div');
            item.className = 'preview-item';
            const attachmentIcon = att.type === 'image' ? 'image' : 'file';
            item.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-${attachmentIcon}"></use></svg> ${att.name} <button type="button" class="remove-attach-btn" data-idx="${idx}" aria-label="Remove ${att.name}">×</button>`;
            previewBox.appendChild(item);
        });

        // Handle attachment removal before posting
        document.querySelectorAll('.remove-attach-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-idx'));
                pendingAttachments.splice(idx, 1);
                updatePreview();
            });
        });
    }

    // 5. Submit New Post Handler
    const btnSubmitPost = document.getElementById('btnSubmitPost');
    if (btnSubmitPost) {
        btnSubmitPost.addEventListener('click', () => {
            const textInput = document.getElementById('postInputText');
            if (!textInput || (textInput.value.trim() === '' && pendingAttachments.length === 0)) {
                alert("Please add some text or an attachment before posting.");
                return;
            }

            const newPost = {
                id: Date.now(),
                author: user.name,
                role: user.isPremium ? "Pro Member" : "Client",
                time: "Just now",
                content: textInput.value.trim(),
                attachments: [...pendingAttachments],
                comments: []
            };

            // Push new post to the top of the feed
            posts.unshift(newPost);
            
            // Ready for Backend: Replace this with a POST request to your DB
            localStorage.setItem('lexCommunityPosts', JSON.stringify(posts));

            // Reset UI state
            textInput.value = '';
            pendingAttachments = [];
            updatePreview();
            renderFeed();
        });
    }

    // Initialize the feed on page load
    renderFeed();
    const lawyerAdsGrid = document.getElementById('lawyerAdsGrid');
    if (lawyerAdsGrid && lawyerAdsGrid.children.length === 0) {
        lawyerAdsGrid.closest('.lawyer-ads-section').hidden = true;
    }

    // Search Execution
    // ===================================================
    // DOCUMENTS MODULE (SEARCH, GENERATOR, UPLOADS & NAVIGATION FIX)
    // ===================================================
    const docsHomeView = document.getElementById('docs-home-view');
    const docsSearchView = document.getElementById('docs-search-results-view');
    const docsGeneratorView = document.getElementById('docs-generator-view');
    const searchInput = document.getElementById('templateSearchInput');
    const tags = document.querySelectorAll('.doc-tag-modern');
    const btnBackToDocsHome = document.getElementById('btnBackToDocsHome');
    const btnBackToResults = document.getElementById('btnBackToResults');
    const templateResultsGrid = document.getElementById('templateResultsGrid');
    const searchQueryText = document.getElementById('searchQueryText');

    
    function switchDocView(viewName, pushToHistory = true) {
        if (docsHomeView) docsHomeView.style.display = 'none';
        if (docsSearchView) docsSearchView.style.display = 'none';
        if (docsGeneratorView) docsGeneratorView.style.display = 'none';

        if (viewName === 'home' && docsHomeView) docsHomeView.style.display = 'block';
        if (viewName === 'search' && docsSearchView) docsSearchView.style.display = 'block';
        if (viewName === 'generator' && docsGeneratorView) docsGeneratorView.style.display = 'block';

        if (pushToHistory) {
            history.pushState({ docView: viewName }, '', `#${viewName}`);
        }
    }

    // 2. back in to landing page when click tte Browser back arrow 
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.docView) {
            switchDocView(event.state.docView, false);
        } else {
            switchDocView('home', false);
        }
    });

    // 3. Search Execution (Enter Key)
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = searchInput.value.trim();
                if (query !== '') {
                    executeSearch(query);
                }
            }
        });
    }

    // 4. Trending Tags Click
    if (tags) {
        tags.forEach(tag => {
            tag.addEventListener('click', (e) => {
                const query = e.target.getAttribute('data-search');
                
                // "View All Templates" 
                if (e.target.classList.contains('outline-tag')) {
                    executeSearch("All Form Templates");
                } else if (query) {
                    if (searchInput) searchInput.value = query;
                    executeSearch(query);
                }
            });
        });
    }
    // 5. Search Function
    function executeSearch(query) {
        switchDocView('search', true);

        if (searchQueryText) searchQueryText.innerText = query;

        if (templateResultsGrid) {
            templateResultsGrid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 50px 20px; text-align: center; background: #FFF; border-radius: 12px; border: 1px solid #E8E6D9;">
                    <div class="result-icon"><svg class="ui-icon" aria-hidden="true"><use href="#icon-search"></use></svg></div>
                    <h3 style="margin-bottom: 5px; color: #1A1A1A;">Loading templates for "${query}"...</h3>
                    <p style="font-size: 13px; color: #777;">Fetching document templates from server...</p>
                </div>
            `;
        }

        // Backend Integration Delay 
        setTimeout(() => {
            if (templateResultsGrid) {
                templateResultsGrid.innerHTML = `
                    <div style="grid-column: 1/-1; padding: 40px 20px; text-align: center; background: #FFF; border-radius: 12px; border: 1px solid #E8E6D9;">
                        <p style="color: #666; font-size: 14px;">Results grid empty. Awaiting backend API connection to populate real template cards for "${query}".</p>
                    </div>
                `;
            }
        }, 600);
    }

    // 6. Generator Display
    function openGenerator(templateData) {
        switchDocView('generator', true);

        const genDocType = document.getElementById('genDocType');
        if (genDocType) genDocType.value = templateData.type || "Document Type";

        const previewTitle = document.getElementById('previewTitle');
        if (previewTitle) previewTitle.innerText = (templateData.title || "DOCUMENT TITLE").toUpperCase();

        const dynamicFormFields = document.getElementById('dynamicFormFields');
        if (dynamicFormFields) {
            dynamicFormFields.innerHTML = `
                <p style="color: #666; font-size: 13px;">Dynamic fields waiting for backend mapping...</p>
            `;
        }
    }

    // 7. UI Back Buttons
    if (btnBackToDocsHome) {
        btnBackToDocsHome.addEventListener('click', () => {
            switchDocView('home', true);
            if (searchInput) searchInput.value = '';
        });
    }

    if (btnBackToResults) {
        btnBackToResults.addEventListener('click', () => {
            switchDocView('search', true);
        });
    }

    // 8. Upload Handlers (Ready for Backend Integration)
    const aiReviewUpload = document.getElementById('aiReviewUpload');
    const eSignUpload = document.getElementById('eSignUpload');

    if (aiReviewUpload) {
        aiReviewUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                alert(`Frontend Success: You selected "${file.name}". \n\n(Backend Developer will use FormData to send this to the AI API endpoint).`);
            }
        });
    }

    if (eSignUpload) {
        eSignUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                alert(`Frontend Success: You selected "${file.name}". \n\n(Backend Developer will use FormData to upload this to the eSign gateway).`);
            }
        });
    }
});
// ===================================================
    // FIND A LAWYER MODULE (EMERGENCY & NORMAL BOOKING)
    // ===================================================
    const btnModeEmergency = document.getElementById('btnModeEmergency');
    const btnModeNormal = document.getElementById('btnModeNormal');
    const emergencyWorkspace = document.getElementById('emergencyBookingWorkspace');
    const normalWorkspace = document.getElementById('normalBookingWorkspace');
    const btnFindEmergencyLawyers = document.getElementById('btnFindEmergencyLawyers');
    const emergencyLawyersList = document.getElementById('emergencyLawyersList');

    // 1. Toggle Booking Modes
    if (btnModeEmergency && btnModeNormal) {
        btnModeEmergency.addEventListener('click', () => {
            btnModeEmergency.classList.add('active');
            btnModeNormal.classList.remove('active');
            emergencyWorkspace.style.display = 'block';
            normalWorkspace.style.display = 'none';
        });

        btnModeNormal.addEventListener('click', () => {
            btnModeNormal.classList.add('active');
            btnModeEmergency.classList.remove('active');
            normalWorkspace.style.display = 'block';
            emergencyWorkspace.style.display = 'none';
        });
    }

  
    // 2. Scan for Emergency Lawyers Button (With No Lawyers Found Fallback)
    if (btnFindEmergencyLawyers) {
        btnFindEmergencyLawyers.addEventListener('click', () => {
            const issueType = document.getElementById('emergencyIssueType').value;
            
            if (!issueType) {
                alert("Please select the Nature of Emergency before scanning.");
                return;
            }

            // Step 1: Scanning UI
            emergencyLawyersList.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; border: 1px dashed #E63946; border-radius: 12px; background: #FFF9F9; margin-top: 10px;">
                    <div class="result-icon"><svg class="ui-icon" aria-hidden="true"><use href="#icon-pin"></use></svg></div>
                    <h4 style="color: #E63946; margin-bottom: 8px;">Scanning via GPS for Active Lawyers...</h4>
                    <p style="font-size: 13px; color: #666;">Searching within 10km radius...</p>
                </div>
            `;

            // Step 2: Simulated Backend Fallback (If No Lawyers Accept / Respond)
            setTimeout(() => {
                emergencyLawyersList.innerHTML = `
                    <div class="no-lawyers-fallback">
                        <div class="fallback-header">
                            <span class="alert-icon"><svg class="ui-icon" aria-hidden="true"><use href="#icon-alert"></use></svg></span>
                            <div>
                                <h4>No Active Lawyers Responded Nearby</h4>
                                <p>We couldn't immediately connect you to an on-duty lawyer in your immediate radius.</p>
                            </div>
                        </div>

                        <div class="fallback-actions-grid">
                            <!-- Option 1: Direct Hotline Call -->
                            <a href="tel:+94112345678" class="fallback-card call-hotline">
                                <span class="card-icon"><svg class="ui-icon" aria-hidden="true"><use href="#icon-phone"></use></svg></span>
                                <div>
                                    <h5>Call 24/7 Platform Hotline</h5>
                                    <p>Speak with our emergency desk operator immediately.</p>
                                </div>
                            </a>

                            <!-- Option 2: Legal Aid Commission -->
                            <a href="tel:1919" class="fallback-card call-police">
                                <span class="card-icon"><svg class="ui-icon" aria-hidden="true"><use href="#icon-building"></use></svg></span>
                                <div>
                                    <h5>Government Emergency / Legal Aid</h5>
                                    <p>Dial Govt Helpline (1919 / Police Hotlines)</p>
                                </div>
                            </a>

                            <!-- Option 3: Expand Radius -->
                            <button id="btnExpandRadius" class="fallback-card expand-radius">
                                <span class="card-icon"><svg class="ui-icon" aria-hidden="true"><use href="#icon-globe"></use></svg></span>
                                <div>
                                    <h5>Expand Search Radius</h5>
                                    <p>Search across the entire province for available advocates.</p>
                                </div>
                            </button>
                        </div>
                    </div>
                `;
            }, 3000); // 3-second simulation
        });
    }
/// ===================================================
    // 3. Normal Booking Search (With Clickable Card & Modal)
    // ===================================================
    const btnSearchLawyers = document.getElementById('btnSearchLawyers');
    const normalSearchResults = document.getElementById('normalSearchResults');
    const specialtyCards = document.querySelectorAll('.specialty-card');
    
    // Popup Modal Elements
    const profileModal = document.getElementById('lawyerProfileModal');
    const closeProfileModal = document.getElementById('closeProfileModal');

    // Function to open Modal
    window.openLawyerProfileModal = function() {
        if (profileModal) profileModal.style.display = 'flex';
    };

    // Close Modal Event
    if (closeProfileModal) {
        closeProfileModal.addEventListener('click', () => {
            profileModal.style.display = 'none';
        });
    }

    function searchNormalLawyers(district, category) {
        if (!normalSearchResults) return;
        normalSearchResults.scrollIntoView({ behavior: 'smooth' });
        
        // Loading State
        normalSearchResults.innerHTML = `
            <div style="text-align: center; padding: 40px; border: 1px solid #E8E6D9; border-radius: 12px; background: #FFF;">
                <div class="result-icon"><svg class="ui-icon" aria-hidden="true"><use href="#icon-search"></use></svg></div>
                <h3 style="color: #1A1A1A; margin-bottom: 5px;">Searching Advocates...</h3>
                <p style="font-size: 13px; color: #666;">District: ${district || 'All'} | Category: ${category || 'All'}</p>
            </div>
        `;

        // Show the example result while the lawyer search is not connected to a backend.
        const SHOW_EXAMPLE_CARD = true; 

        setTimeout(() => {
            let htmlContent = `<div style="display: flex; flex-direction: column; gap: 15px;">`;
            
            if (SHOW_EXAMPLE_CARD) {
               
                htmlContent += `
                    <div class="lawyer-profile-card clickable-card" onclick="openLawyerProfileModal()" style="border: 2px dashed #0073E6;">
                        <div class="lawyer-avatar-wrapper">
                            <img src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150" alt="Lawyer" class="lawyer-avatar">
                            <span class="online-status-dot" title="Active Now"></span>
                        </div>
                        <div class="lawyer-info-box">
                            <div class="lawyer-name-row">
                                <h4>Atty. Samantha Perera, LL.B (Col)</h4>
                                <span class="lawyer-rating"><svg class="ui-icon" aria-hidden="true"><use href="#icon-award"></use></svg> 4.9 (142 Reviews)</span>
                            </div>
                            <p class="lawyer-specialization">Corporate & Business Law • Supreme Court Practitioner</p>
                            <p class="lawyer-location"><svg class="ui-icon" aria-hidden="true"><use href="#icon-pin"></use></svg> Colombo District | 8 Years Experience</p>
                        </div>
                        <div class="lawyer-actions-box" style="text-align: right; min-width: auto;">
                            <span class="view-profile-link">View Profile <svg class="ui-icon" aria-hidden="true"><use href="#icon-arrow-right"></use></svg></span>
                        </div>
                    </div>
                `;
            }

            // Backend Placeholder
            htmlContent += `
                <div style="text-align: center; padding: 25px; background: #FFF; border: 1px dashed #D1CFC2; border-radius: 12px;">
                    <p style="color: #666; font-size: 13px;">(Backend Loop Placeholder: Real database lawyer cards will appear here)</p>
                </div>
            </div>`;

            normalSearchResults.innerHTML = htmlContent;
        }, 500);
    }

    // Search & Category Event Listeners
    if (btnSearchLawyers) {
        btnSearchLawyers.addEventListener('click', () => {
            const district = document.getElementById('lawyerDistrict') ? document.getElementById('lawyerDistrict').value : '';
            const category = document.getElementById('lawyerCategory') ? document.getElementById('lawyerCategory').value : '';
            searchNormalLawyers(district, category);
        });
    }

    if (specialtyCards) {
        specialtyCards.forEach(card => {
            card.addEventListener('click', () => {
                const category = card.getAttribute('data-category');
                const selectElement = document.getElementById('lawyerCategory');
                if (selectElement) selectElement.value = category;
                const district = document.getElementById('lawyerDistrict') ? document.getElementById('lawyerDistrict').value : '';
                searchNormalLawyers(district, category);
            });
        });
    }
    // ===================================================
// CLIENT ACCOUNT MODAL & TABS HANDLER
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
    const clientAccountModal = document.getElementById('clientAccountModal');
    const closeAccountModal = document.getElementById('closeAccountModal');
    
    // Tab Elements
    const tabBtnProfile = document.getElementById('tabBtnProfile');
    const tabBtnPayment = document.getElementById('tabBtnPayment');
    const accTabProfile = document.getElementById('accTabProfile');
    const accTabPayment = document.getElementById('accTabPayment');

    // Open Modal when clicking Header "Client Account" badge
    document.addEventListener('click', (e) => {
        const badge = e.target.closest('#clientAccountBadge') || e.target.closest('.user-profile-badge');
        if (badge && clientAccountModal) {
            clientAccountModal.style.display = 'flex';
        }
    });

    // Close Modal
    if (closeAccountModal) {
        closeAccountModal.addEventListener('click', () => {
            clientAccountModal.style.display = 'none';
        });
    }

    if (clientAccountModal) {
        clientAccountModal.addEventListener('click', (e) => {
            if (e.target === clientAccountModal) {
                clientAccountModal.style.display = 'none';
            }
        });
    }

    // Switch Tabs inside Modal
    if (tabBtnProfile && tabBtnPayment) {
        tabBtnProfile.addEventListener('click', () => {
            tabBtnProfile.classList.add('active');
            tabBtnPayment.classList.remove('active');
            accTabProfile.style.display = 'block';
            accTabPayment.style.display = 'none';
        });

        tabBtnPayment.addEventListener('click', () => {
            tabBtnPayment.classList.add('active');
            tabBtnProfile.classList.remove('active');
            accTabPayment.style.display = 'block';
            accTabProfile.style.display = 'none';
        });
    }

    // Form Submit Events
    const clientProfileForm = document.getElementById('clientProfileForm');
    if (clientProfileForm) {
        clientProfileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Profile details updated successfully!');
        });
    }

    const addCardForm = document.getElementById('addCardForm');
    if (addCardForm) {
        addCardForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Payment card added successfully!');
            addCardForm.reset();
        });
    }
});

// ===================================================
// FLOATING LEX AI CHAT WIDGET - COMPLETE JS
// ===================================================
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('floatingAiToggle');
    const widget = document.getElementById('floatingAiWidget');
    const closeBtn = document.getElementById('closeAiWidget');
    const sendBtn = document.getElementById('aiWidgetSend');
    const inputField = document.getElementById('aiWidgetInput');
    const messagesContainer = document.getElementById('aiWidgetMessages');

    // 1. Open / Close Toggle Logic (Bug-Free)
    function toggleAiWidget(show) {
        if (!widget) return;
        
        
        const isOpen = widget.classList.contains('active') || widget.style.display === 'flex';
        const shouldOpen = (show !== undefined) ? show : !isOpen;

        if (shouldOpen) {
            widget.classList.add('active');
            widget.style.setProperty('display', 'flex', 'important');
        } else {
            widget.classList.remove('active');
            widget.style.setProperty('display', 'none', 'important');
        }
    }

    // Gold FAB Button Click -> Open / Close
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleAiWidget();
        });
    }

    // 'X' Close Button Click -> Close
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleAiWidget(false);
        });
    }

    // 2. Send Message Logic
    function sendAiMessage() {
        if (!inputField || !messagesContainer) return;
        
        const text = inputField.value.trim();
        if (!text) return;

        // User Message Bubble
        const userBubble = document.createElement('div');
        userBubble.className = 'ai-msg user-msg';
        userBubble.textContent = text;
        messagesContainer.appendChild(userBubble);

        inputField.value = '';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Simulated AI Bot Reply
        setTimeout(() => {
            const botBubble = document.createElement('div');
            botBubble.className = 'ai-msg bot-msg';
            botBubble.textContent = `I am processing your legal inquiry regarding "${text}". How else can LEX assist you?`;
            messagesContainer.appendChild(botBubble);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 700);
    }

    // Send Button Click Event
    if (sendBtn) {
        sendBtn.addEventListener('click', sendAiMessage);
    }

    // Enter Key Press Event
    if (inputField) {
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendAiMessage();
        });
    }
});