document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. Page Loader & 3D Scroll Reveal
    // ==========================================
    setTimeout(() => {
        const loader = document.querySelector('.page-loader');
        if (loader) loader.classList.add('hidden');
    }, 800);

    const reveals = document.querySelectorAll('.reveal-3d');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    reveals.forEach(reveal => observer.observe(reveal));
    setTimeout(() => reveals.forEach(r => r.classList.add('active')), 1000);


    // ==========================================
    // 2. Auth Modals, Profile & Premium State
    // ==========================================
    
    const navSignUpBtn = document.getElementById('navSignUpBtn');
    const navSignInBtn = document.getElementById('navSignInBtn');
    const signUpModal = document.getElementById('signUpModal');
    const signInModal = document.getElementById('signInModal');
    const closeSignUp = document.getElementById('closeSignUp');
    const closeSignIn = document.getElementById('closeSignIn');

    // Modals open/close
    if(navSignUpBtn) navSignUpBtn.addEventListener('click', () => signUpModal.classList.add('active'));
    if(navSignInBtn) navSignInBtn.addEventListener('click', (e) => { e.preventDefault(); signInModal.classList.add('active'); });

    const closeModal = (modal) => modal.classList.remove('active');
    if(closeSignUp) closeSignUp.addEventListener('click', () => closeModal(signUpModal));
    if(closeSignIn) closeSignIn.addEventListener('click', () => closeModal(signInModal));

    window.addEventListener('click', (e) => {
        if (e.target === signUpModal) closeModal(signUpModal);
        if (e.target === signInModal) closeModal(signInModal);
    });

    // Check if user is already logged in -> Redirect directly to Dashboard
    if (window.lexApi.hasSession()) {
        window.lexApi.requireUser().then(existingUser => {
            if (existingUser) {
                window.location.replace(existingUser.role === 'lawyer' ? 'lawyer-dashboard.html' : 'dashboard.html');
            }
        });
    } else {
        localStorage.removeItem('lexUser');
    }

    // Validations
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let selectedRole = 'client';
    const regForm = document.getElementById('regForm');
    const roleButtons = document.querySelectorAll('.role-btn');
    const lawyerContinue = document.getElementById('lawyerContinue');

    roleButtons.forEach((button) => {
        button.addEventListener('click', () => {
            selectedRole = button.dataset.role;

            roleButtons.forEach((roleButton) => {
                const isSelected = roleButton === button;
                roleButton.classList.toggle('active', isSelected);
                roleButton.setAttribute('aria-pressed', String(isSelected));
            });

            regForm.hidden = false;
            lawyerContinue.hidden = true;
        });
    });

    // Sign up form submission
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        let isValid = true;

        const fullName = document.getElementById('fullName');
        const emailAdd = document.getElementById('emailAdd');
        const passWord = document.getElementById('passWord');

        if (!fullName || !fullName.value.trim()) { if(fullName) setError(fullName, 'Please enter your full legal name.'); isValid = false; } else { clearError(fullName); }
        if (!emailAdd || !emailRegex.test(emailAdd.value.trim())) { if(emailAdd) setError(emailAdd, 'Please enter a valid email.'); isValid = false; } else { clearError(emailAdd); }
        if (!passWord || passWord.value.length < 8) { if(passWord) setError(passWord, 'Password must be at least 8 characters.'); isValid = false; } else { clearError(passWord); }

        
        if (isValid) {
            const submitButton = regForm.querySelector('[type="submit"]');
            submitButton.disabled = true;
            try {
                const result = await window.lexApi.request('/api/v1/auth/register', {
                    method: 'POST',
                    skipAuth: true,
                    body: JSON.stringify({
                        full_name: fullName.value.trim(),
                        email: emailAdd.value.trim(),
                        password: passWord.value,
                        role: selectedRole
                    })
                });
                if (result.confirmation_required) {
                    alert('Check your email to confirm your account, then sign in.');
                    regForm.reset();
                    closeModal(signUpModal);
                    return;
                }
                window.lexApi.setSession(result);
                regForm.reset();
                window.location.href = selectedRole === 'lawyer' ? 'lawyer-registration.html' : 'dashboard.html';
            } catch (error) {
                alert(error.message);
            } finally {
                submitButton.disabled = false;
            }
        }
        });
    }


    // Helper functions for Errors 
    function setError(input, message) {
        input.classList.add('input-error');
        const errorText = input.nextElementSibling;
        if (errorText && errorText.classList.contains('error-text')) {
            errorText.innerText = message;
            errorText.style.display = 'block';
        }
    }

    function clearError(input) {
        input.classList.remove('input-error');
        const errorText = input.nextElementSibling;
        if (errorText && errorText.classList.contains('error-text')) {
            errorText.style.display = 'none';
        }
    }

    // Sign In Form Submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const loginEmail = document.getElementById('loginEmail');
            const loginPassword = document.getElementById('loginPassword');
            if (emailRegex.test(loginEmail.value.trim())) {
                const submitButton = loginForm.querySelector('[type="submit"]');
                submitButton.disabled = true;
                try {
                    const result = await window.lexApi.request('/api/v1/auth/login', {
                        method: 'POST',
                        skipAuth: true,
                        body: JSON.stringify({
                            email: loginEmail.value.trim(),
                            password: loginPassword.value
                        })
                    });
                    window.lexApi.setSession(result);
                    loginForm.reset();
                    closeModal(signInModal);
                    window.location.href = result.user.role === 'lawyer' ? 'lawyer-dashboard.html' : 'dashboard.html';
                } catch (error) {
                    alert(error.message);
                } finally {
                    submitButton.disabled = false;
                }
            } else {
                alert("Please enter a valid email.");
            }
        }); 
    }

    


    // ==========================================
    // 3. Dynamic AI Document Generator
    // ==========================================
    const documentTemplates = {
        affidavit: {
            title: "AFFIDAVIT OF RESIDENCE",
            stamp: "OFFICIAL DRAFT",
            fields: [
                { id: "fullNameDoc", label: "Affirmant (Full Name)", placeholder: "e.g. K.A. Sunanda Perera", default: "K.A. Sunanda Perera" },
                { id: "nicNumDoc", label: "NIC Number", placeholder: "e.g. 198524100123", default: "198524100123" },
                { id: "courtDoc", label: "Jurisdiction / Court", placeholder: "e.g. Colombo District Court", default: "Colombo District Court" }
            ],
            generateHTML: (data) => `
                <div class="doc-header">
                    <span class="doc-stamp">${documentTemplates.affidavit.stamp}</span>
                    <h4>${documentTemplates.affidavit.title}</h4>
                </div>
                <div class="doc-body">
                    <p>I, <strong>${data.fullNameDoc}</strong>, holding NIC No: ${data.nicNumDoc}, solemnly, sincerely, and truly declare and affirm as follows:</p>
                    <p>1. That I am the affirmant above named and reside permanently within the jurisdiction of the <strong>${data.courtDoc}</strong>.</p>
                    <p>2. That the statements made herein are true and accurate to the best of my knowledge and belief.</p>
                    <div class="doc-signature-line">
                        <span>Affirmant Signature</span>
                        <span>Justice of the Peace</span>
                    </div>
                </div>
            `
        },
        nda: {
            title: "NON-DISCLOSURE AGREEMENT",
            stamp: "CONFIDENTIAL",
            fields: [
                { id: "party1", label: "Disclosing Party (Company)", placeholder: "e.g. LEX Tech (Pvt) Ltd", default: "LEX Tech (Pvt) Ltd" },
                { id: "party2", label: "Receiving Party (Name)", placeholder: "e.g. Nuwan Silva", default: "Nuwan Silva" },
                { id: "duration", label: "Confidentiality Duration", placeholder: "e.g. 2 Years", default: "2 Years" }
            ],
            generateHTML: (data) => `
                <div class="doc-header">
                    <span class="doc-stamp">${documentTemplates.nda.stamp}</span>
                    <h4>${documentTemplates.nda.title}</h4>
                </div>
                <div class="doc-body">
                    <p>This Agreement is entered into by and between <strong>${data.party1}</strong> (Disclosing Party) and <strong>${data.party2}</strong> (Receiving Party).</p>
                    <p>1. The Receiving Party agrees to maintain the strict confidentiality of the shared proprietary information for a period of <strong>${data.duration}</strong>.</p>
                    <p>2. Any breach of this agreement shall be governed under the Intellectual Property Act of Sri Lanka.</p>
                    <div class="doc-signature-line">
                        <span>${data.party1} (Sign)</span>
                        <span>${data.party2} (Sign)</span>
                    </div>
                </div>
            `
        },
        lease: {
            title: "RESIDENTIAL LEASE AGREEMENT",
            stamp: "LEGAL DRAFT",
            fields: [
                { id: "landlord", label: "Landlord Name", placeholder: "e.g. A.B. Perera", default: "A.B. Perera" },
                { id: "tenant", label: "Tenant Name", placeholder: "e.g. Kamal Silva", default: "Kamal Silva" },
                { id: "rent", label: "Monthly Rent (LKR)", placeholder: "e.g. 50,000", default: "50,000" }
            ],
            generateHTML: (data) => `
                <div class="doc-header">
                    <span class="doc-stamp">${documentTemplates.lease.stamp}</span>
                    <h4>${documentTemplates.lease.title}</h4>
                </div>
                <div class="doc-body">
                    <p>This Deed of Lease is made and entered into by <strong>${data.landlord}</strong> (hereinafter referred to as the Landlord) and <strong>${data.tenant}</strong> (hereinafter referred to as the Tenant).</p>
                    <p>1. The Landlord agrees to let and the Tenant agrees to take the premises for a monthly rental of <strong>LKR ${data.rent}</strong>.</p>
                    <p>2. The Tenant shall not sublet the premises without prior written consent.</p>
                    <div class="doc-signature-line">
                        <span>Landlord Signature</span>
                        <span>Tenant Signature</span>
                    </div>
                </div>
            `
        }
    };

    const docTypeSelect = document.getElementById("docTypeSelect");
    const dynamicInputsArea = document.getElementById("dynamicInputsArea");
    const docPreviewSheet = document.getElementById("docPreviewSheet");
    const generateDocBtn = document.getElementById("generateDocBtn");

    function renderInputs(docKey) {
        if (!docTypeSelect || !dynamicInputsArea) return;
        const template = documentTemplates[docKey];
        dynamicInputsArea.innerHTML = ""; 

        template.fields.forEach(field => {
            const inputGroup = document.createElement("div");
            inputGroup.className = "input-group";
            inputGroup.innerHTML = `
                <label>${field.label}</label>
                <input type="text" id="${field.id}" placeholder="${field.placeholder}" value="${field.default}">
            `;
            dynamicInputsArea.appendChild(inputGroup);
            document.getElementById(field.id).addEventListener("input", updatePreview);
        });

        updatePreview();
    }

    function updatePreview() {
        if (!docTypeSelect || !docPreviewSheet) return;
        const docKey = docTypeSelect.value;
        const template = documentTemplates[docKey];

        const currentData = {};
        template.fields.forEach(field => {
            const inputEl = document.getElementById(field.id);
            currentData[field.id] = inputEl ? inputEl.value : field.default;
        });

        docPreviewSheet.innerHTML = template.generateHTML(currentData);
    }

    if (docTypeSelect) {
        docTypeSelect.addEventListener("change", (e) => renderInputs(e.target.value));
        renderInputs("affidavit");
    }

    if (generateDocBtn) {
        generateDocBtn.addEventListener("click", () => {
            updatePreview();
            docPreviewSheet.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    // Copy Text Logic
    const copyBtn = document.querySelector(".doc-btn-secondary");
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            if (docPreviewSheet) {
                navigator.clipboard.writeText(docPreviewSheet.innerText).then(() => {
                    const originalText = copyBtn.innerText;
                    copyBtn.innerText = "✓ Copied to Clipboard!";
                    copyBtn.style.borderColor = "#00e676";
                    copyBtn.style.color = "#00e676";

                    setTimeout(() => {
                        copyBtn.innerText = originalText;
                        copyBtn.style.borderColor = "";
                        copyBtn.style.color = "";
                    }, 2000);
                });
            }
        });
    }

    // Download PDF / Print Logic
    const pdfBtn = document.querySelector(".doc-btn-primary");
    if (pdfBtn) {
        pdfBtn.addEventListener("click", () => {
            const docContent = docPreviewSheet.innerHTML;
            const printWindow = window.open("", "_blank", "width=800,height=900");

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>LEX Legal Document Draft</title>
                    <style>
                        @page { size: A4; margin: 20mm; }
                        body { font-family: 'Times New Roman', Times, serif; padding: 30px; color: #000; background: #fff; }
                        .doc-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 25px; }
                        .doc-stamp { font-size: 11px; letter-spacing: 2px; color: #b38f38; border: 1px solid #b38f38; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-bottom: 10px; font-weight: bold; text-transform: uppercase; }
                        .doc-header h4 { font-size: 22px; margin: 10px 0; letter-spacing: 1px; color: #000; text-transform: uppercase; }
                        .doc-body p { font-size: 15px; line-height: 1.8; color: #111; margin-bottom: 20px; text-align: justify; }
                        .doc-signature-line { display: flex; justify-content: space-between; margin-top: 80px; padding-top: 20px; border-top: 1px dashed #444; font-size: 13px; color: #000; font-weight: bold; }
                    </style>
                </head>
                <body>
                    ${docContent}
                </body>
                </html>
            `);

            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 400);
        });
    }


    // ==========================================
    // 4. GPS Legal Matching Filter & Pins UI
    // ==========================================
    const radiusPills = document.querySelectorAll(".radius-pills .pill");
    const mapPins = document.querySelectorAll(".map-pin");
    const lawyerCards = document.querySelectorAll(".lawyer-card");

    radiusPills.forEach((pill) => {
        pill.addEventListener("click", function() {
            radiusPills.forEach(p => p.classList.remove("active"));
            this.classList.add("active");

            const maxRadius = parseInt(this.innerText);

            lawyerCards.forEach(card => {
                const distText = card.querySelector(".lawyer-dist").innerText;
                const distance = parseFloat(distText.match(/[\d.]+/)[0]);

                if (distance <= maxRadius) {
                    card.style.display = "flex";
                } else {
                    card.style.display = "none";
                }
            });
        });
    });

    mapPins.forEach((pin, index) => {
        pin.addEventListener("click", () => {
            mapPins.forEach(p => p.classList.remove("active"));
            lawyerCards.forEach(c => c.classList.remove("active"));

            pin.classList.add("active");
            if (lawyerCards[index]) {
                lawyerCards[index].classList.add("active");
                lawyerCards[index].scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        });
    });

    lawyerCards.forEach((card, index) => {
        card.addEventListener("click", () => {
            lawyerCards.forEach(c => c.classList.remove("active"));
            mapPins.forEach(p => p.classList.remove("active"));

            card.classList.add("active");
            if (mapPins[index]) {
                mapPins[index].classList.add("active");
            }
        });
    });


    /// ==========================================
// 5. Floating Chatbot UI Logic (Log In Prompt)
// ==========================================
const chatInput = document.getElementById('chatInput');
const sendMsgBtn = document.getElementById('sendMsgBtn');
const chatMessages = document.querySelector('.chat-messages');

if (sendMsgBtn && chatInput) {
    const handleFloatingChat = () => {
        const text = chatInput.value.trim();
        if (text !== "") {
           
            const userMsg = document.createElement('div');
            userMsg.className = 'message user-message';
            userMsg.style.cssText = 'background: rgba(242, 201, 102, 0.2); color: #fff; align-self: flex-end; border-radius: 12px; border-bottom-right-radius: 2px; padding: 10px 14px; margin-bottom: 8px; font-size: 13.5px; max-width: 80%;';
            userMsg.innerText = text;
            chatMessages.appendChild(userMsg);
            chatInput.value = '';

            chatMessages.scrollTop = chatMessages.scrollHeight;

            
            setTimeout(() => {
                const aiMsg = document.createElement('div');
                aiMsg.className = 'message ai-message';
                aiMsg.style.cssText = 'background: #14233c; color: #e1e8ed; align-self: flex-start; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; font-size: 13px; max-width: 85%; border: 1px solid rgba(242, 201, 102, 0.3);';
                
                aiMsg.innerHTML = `
                    🔒 <strong>Log In Required</strong><br>
                    Please log in to your LEX account to get full AI legal assistance and document support.
                    <button onclick="document.getElementById('signInModal').classList.add('active')" style="display:block; width:100%; margin-top:10px; background:#e5b84c; color:#000; border:none; padding:8px 12px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">
                        Log In Now to Chat
                    </button>
                `;
                chatMessages.appendChild(aiMsg);
                chatMessages.scrollTop = chatMessages.scrollHeight;

                
                setTimeout(() => {
                    const signInModal = document.getElementById('signInModal');
                    if (signInModal) signInModal.classList.add('active');
                }, 800);
            }, 600);
        }
    };

    sendMsgBtn.addEventListener('click', handleFloatingChat);
    chatInput.addEventListener('keypress', (e) => { 
        if (e.key === 'Enter') handleFloatingChat(); 
    });
}
});
