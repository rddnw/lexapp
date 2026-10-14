document.addEventListener('DOMContentLoaded', async () => {
    const user = await window.lexApi.requireUser('lawyer');
    if (!user) return;

    const form = document.getElementById('lawyerApplicationForm');
    const status = document.getElementById('applicationStatus');
    const verificationDocument = document.getElementById('verificationDocument');
    const verificationDocumentName = document.getElementById('verificationDocumentName');
    document.getElementById('applicationName').value = user.name;
    document.getElementById('applicationEmail').value = user.email;

    try {
        const result = await window.lexApi.request('/api/v1/lawyer-applications/me');
        if (result.application) {
            form.hidden = true;
            status.hidden = false;
            status.textContent = `Your application status is ${result.application.status}. Contact LEX support if you need an update.`;
        }
    } catch (error) {
        status.hidden = false;
        status.textContent = `Unable to load your application: ${error.message}`;
        form.hidden = true;
        return;
    }

    verificationDocument.addEventListener('change', () => {
        verificationDocumentName.textContent = verificationDocument.files.length
            ? `${verificationDocument.files[0].name} will be uploaded securely when you submit.`
            : 'No document selected.';
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const submitButton = form.querySelector('[type="submit"]');
        submitButton.disabled = true;
        try {
            const result = await window.lexApi.request('/api/v1/lawyer-applications', {
                method: 'POST',
                body: new FormData(form)
            });
            form.hidden = true;
            status.hidden = false;
            status.textContent = `Your application has been submitted with ${result.application.status} status. Your private verification document is awaiting a security scan and administrator review.`;
        } catch (error) {
            status.hidden = false;
            status.textContent = `Application not submitted: ${error.message}`;
        } finally {
            submitButton.disabled = false;
        }
    });
});
