document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('lawyerApplicationForm');
    const status = document.getElementById('applicationStatus');
    const verificationDocument = document.getElementById('verificationDocument');
    const verificationDocumentName = document.getElementById('verificationDocumentName');

    verificationDocument.addEventListener('change', () => {
        verificationDocumentName.textContent = verificationDocument.files.length
            ? `${verificationDocument.files[0].name} selected for this demo; it will not be uploaded or saved.`
            : 'No document selected.';
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        if (!form.reportValidity()) return;

        const application = Object.fromEntries(new FormData(form).entries());
        delete application.verificationDocument;
        delete application.consent;
        application.role = 'lawyer';
        application.verificationStatus = 'pending';
        application.submittedAt = new Date().toISOString();
        localStorage.setItem('lexLawyerApplication', JSON.stringify(application));
        localStorage.setItem('lexUser', JSON.stringify({
            name: application.name,
            email: application.email,
            role: 'lawyer'
        }));

        form.hidden = true;
        status.hidden = false;
        status.replaceChildren(document.createTextNode(
            'Your demo application has been saved in this browser, but it has not been sent to LEX for review. The selected verification document was not uploaded or saved. The workspace below is a preview; verification and lawyer services are not active. '
        ));
        const dashboardLink = document.createElement('a');
        dashboardLink.href = 'lawyer-dashboard.html';
        dashboardLink.textContent = 'Open lawyer workspace preview';
        status.append(dashboardLink);
    });
});
