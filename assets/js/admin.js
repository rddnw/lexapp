document.addEventListener('DOMContentLoaded', async () => {
    const user = await window.lexApi.requireUser();
    if (!user) return;
    if (!user.is_admin) {
        window.location.replace(user.role === 'lawyer' ? 'lawyer-dashboard.html' : 'dashboard.html');
        return;
    }

    const list = document.getElementById('applicationList');
    const status = document.getElementById('adminStatus');
    const summary = document.getElementById('queueSummary');
    const refreshButton = document.getElementById('refreshQueue');
    const dialog = document.getElementById('documentDialog');
    const frame = document.getElementById('documentFrame');
    const openLink = document.getElementById('documentOpenLink');
    let busy = false;

    document.getElementById('adminName').textContent = user.name || user.email || 'Administrator';
    document.getElementById('adminSignOut').addEventListener('click', async () => {
        try {
            await window.lexApi.signOut();
        } catch (error) {
            window.alert(`Your local session was cleared, but server sign-out failed: ${error.message}`);
            window.lexApi.clearSession();
        }
        window.location.href = 'index.html';
    });

    document.getElementById('closeDocument').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        frame.removeAttribute('src');
        openLink.removeAttribute('href');
    });
    refreshButton.addEventListener('click', loadApplications);

    function addDetail(listElement, label, value) {
        const item = document.createElement('div');
        const term = document.createElement('dt');
        const description = document.createElement('dd');
        term.textContent = label;
        description.textContent = value || 'Not provided';
        item.append(term, description);
        listElement.append(item);
    }

    function makeButton(text, className, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = text;
        button.addEventListener('click', onClick);
        return button;
    }

    function setStatus(message) {
        status.textContent = message || '';
    }

    function renderApplication(application) {
        const card = document.createElement('article');
        card.className = 'admin-application-card';
        card.dataset.applicationId = application.id;

        const heading = document.createElement('div');
        heading.className = 'admin-application-heading';
        const identity = document.createElement('div');
        const name = document.createElement('h3');
        name.textContent = application.full_name || 'LEX lawyer';
        const submitted = document.createElement('p');
        submitted.className = 'admin-submitted';
        const submittedAt = new Date(application.submitted_at);
        submitted.textContent = `Submitted ${Number.isNaN(submittedAt.getTime()) ? 'date unavailable' : submittedAt.toLocaleString()}`;
        identity.append(name, submitted);
        const pending = document.createElement('span');
        pending.className = 'admin-pending-badge';
        pending.textContent = 'Pending';
        heading.append(identity, pending);

        const details = document.createElement('dl');
        details.className = 'admin-details';
        addDetail(details, 'Mobile', application.mobile);
        addDetail(details, 'Bar registration', application.bar_registration);
        addDetail(details, 'Practice area', application.practice_area);
        addDetail(details, 'Jurisdiction', application.jurisdiction);
        addDetail(details, 'Experience', `${application.experience_years} years`);

        const documentRow = document.createElement('div');
        documentRow.className = 'admin-document-row';
        const documentName = document.createElement('span');
        documentName.className = 'admin-document-name';
        documentName.textContent = application.document?.original_name || 'Verification document';
        const scanBadge = document.createElement('span');
        scanBadge.className = 'admin-scan-badge';
        setScanBadge(scanBadge, application.document?.scan_status);
        const documentButton = makeButton('Review document', 'admin-link-button', async () => {
            documentButton.disabled = true;
            try {
                const result = await window.lexApi.request(
                    `/api/v1/admin/lawyer-applications/${encodeURIComponent(application.id)}/document`
                );
                frame.src = result.url;
                openLink.href = result.url;
                document.getElementById('documentTitle').textContent = result.file_name || 'Verification document';
                document.getElementById('documentInfo').textContent = `Private link expires in ${result.expires_in} seconds.`;
                dialog.showModal();
            } catch (error) {
                setStatus(`Unable to open this document: ${error.message}`);
            } finally {
                documentButton.disabled = false;
            }
        });
        documentRow.append(documentName, scanBadge, documentButton);

        const scanActions = document.createElement('div');
        scanActions.className = 'admin-scan-actions';
        const scanLabel = document.createElement('span');
        scanLabel.className = 'admin-scan-label';
        scanLabel.textContent = 'After checking the file with your trusted scanner:';
        const markClean = makeButton('Mark clean', 'admin-button admin-button-secondary', () =>
            updateScan(application, 'clean', scanBadge, markClean, markRejected)
        );
        const markRejected = makeButton('Mark unsafe', 'admin-button admin-button-secondary', () =>
            updateScan(application, 'rejected', scanBadge, markClean, markRejected)
        );
        if (!application.document) {
            markClean.disabled = true;
            markRejected.disabled = true;
        }
        scanActions.append(scanLabel, markClean, markRejected);
        documentRow.append(scanActions);

        const noteWrap = document.createElement('div');
        noteWrap.className = 'admin-review-note';
        const noteLabel = document.createElement('label');
        noteLabel.htmlFor = `review-note-${application.id}`;
        noteLabel.textContent = 'Reviewer note (optional)';
        const note = document.createElement('textarea');
        note.id = noteLabel.htmlFor;
        note.maxLength = 1000;
        note.placeholder = 'Record the reason for your decision.';
        note.value = application.review_note || '';
        noteWrap.append(noteLabel, note);

        const actions = document.createElement('div');
        actions.className = 'admin-review-actions';
        const reject = makeButton('Reject application', 'admin-button admin-button-danger', () =>
            reviewApplication(application.id, 'rejected', note, card)
        );
        const approve = makeButton('Approve and verify', 'admin-button admin-button-primary', () =>
            reviewApplication(application.id, 'approved', note, card)
        );
        approve.disabled = !application.document || application.document.scan_status !== 'clean';
        actions.append(reject, approve);

        card.append(heading, details, documentRow, noteWrap, actions);
        return card;
    }

    function setScanBadge(badge, scanStatus) {
        badge.classList.toggle('is-clean', scanStatus === 'clean');
        badge.classList.toggle('is-rejected', scanStatus === 'rejected');
        badge.textContent = `Security scan: ${scanStatus || 'pending'}`;
    }

    async function updateScan(application, scanStatus, badge, cleanButton, rejectedButton) {
        if (!application.document) {
            setStatus('The verification document metadata is unavailable; this application cannot be scanned.');
            return;
        }
        cleanButton.disabled = true;
        rejectedButton.disabled = true;
        setStatus('');
        try {
            await window.lexApi.request(
                `/api/v1/admin/documents/${encodeURIComponent(application.verification_document_id)}/scan-result`,
                { method: 'POST', body: JSON.stringify({ scan_status: scanStatus }) }
            );
            application.document.scan_status = scanStatus;
            setScanBadge(badge, scanStatus);
            const approveButton = document.querySelector(
                `[data-application-id="${CSS.escape(application.id)}"] .admin-button-primary`
            );
            if (approveButton) approveButton.disabled = scanStatus !== 'clean';
        } catch (error) {
            setStatus(`Unable to save the scan result: ${error.message}`);
        } finally {
            cleanButton.disabled = false;
            rejectedButton.disabled = false;
        }
    }

    async function reviewApplication(applicationId, decision, note, card) {
        if (busy) return;
        busy = true;
        const actionButtons = card.querySelectorAll('.admin-review-actions button');
        actionButtons.forEach(button => { button.disabled = true; });
        setStatus('');
        try {
            await window.lexApi.request(
                `/api/v1/admin/lawyer-applications/${encodeURIComponent(applicationId)}/review`,
                {
                    method: 'POST',
                    body: JSON.stringify({ decision, review_note: note.value.trim() })
                }
            );
            card.remove();
            const remaining = list.querySelectorAll('.admin-application-card').length;
            summary.textContent = `${remaining} pending application${remaining === 1 ? '' : 's'}`;
            if (remaining === 0) renderEmptyState();
        } catch (error) {
            setStatus(`Unable to ${decision === 'approved' ? 'approve' : 'reject'} this application: ${error.message}`);
            actionButtons.forEach(button => {
                button.disabled = button.classList.contains('admin-button-primary') &&
                    card.querySelector('.admin-scan-badge')?.textContent !== 'Security scan: clean';
            });
        } finally {
            busy = false;
        }
    }

    function renderEmptyState() {
        const empty = document.createElement('div');
        empty.className = 'admin-empty-state';
        const title = document.createElement('strong');
        title.textContent = 'No applications awaiting review';
        const detail = document.createElement('span');
        detail.textContent = 'New submissions will appear here.';
        empty.append(title, detail);
        list.replaceChildren(empty);
    }

    async function loadApplications() {
        if (busy) return;
        busy = true;
        refreshButton.disabled = true;
        setStatus('');
        summary.textContent = 'Loading applications…';
        list.replaceChildren();
        try {
            const result = await window.lexApi.request('/api/v1/admin/lawyer-applications');
            const applications = result.applications;
            if (!Array.isArray(applications)) throw new Error('The application queue returned an invalid response.');
            summary.textContent = `${applications.length} pending application${applications.length === 1 ? '' : 's'}`;
            if (applications.length === 0) {
                renderEmptyState();
                return;
            }
            list.replaceChildren(...applications.map(renderApplication));
        } catch (error) {
            summary.textContent = 'Applications could not be loaded.';
            setStatus(`Unable to load the review queue: ${error.message}`);
        } finally {
            busy = false;
            refreshButton.disabled = false;
        }
    }

    await loadApplications();
});
