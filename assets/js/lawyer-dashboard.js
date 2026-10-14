document.addEventListener('DOMContentLoaded', async () => {
    const user = await window.lexApi.requireUser('lawyer');
    if (!user) return;

    const name = user.name || 'Lawyer';
    const status = user.verified ? 'Verified' : 'Pending verification';
    const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'L';
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value || 'Not provided';
    };
    const toast = document.getElementById('lawyerToast');
    let toastTimer;
    const showToast = (message) => {
        toast.textContent = message;
        toast.classList.add('is-visible');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
    };

    let application = null;
    try {
        application = (await window.lexApi.request('/api/v1/lawyer-applications/me')).application;
    } catch (error) {
        showToast(`Unable to load your application: ${error.message}`);
    }

    setText('lawyerHeaderName', name);
    setText('lawyerWelcomeName', name.split(/\s+/)[0]);
    setText('lawyerHeaderStatus', status);
    setText('lawyerAvatar', initials);
    setText('lawyerProfileInitials', initials);
    setText('profileName', name);
    setText('profileStatus', status);
    setText('leaderboardLawyerName', name);
    setText('profileEmail', user.email);
    setText('profileMobile', application?.mobile);
    setText('profileBarRegistration', application?.bar_registration);
    setText('profilePractice', application?.practice_area);
    setText('profileJurisdiction', application?.jurisdiction);
    setText('profileExperience', application?.experience_years != null ? `${application.experience_years} years` : '');
    setText('summaryPractice', application?.practice_area);
    setText('summaryJurisdiction', application?.jurisdiction);
    setText('summaryExperience', application?.experience_years != null ? `${application.experience_years} years` : '');

    if (user.verified) {
        setText('verificationTitle', 'Verified lawyer');
        setText('verificationDescription', 'Your profile is marked as verified by LEX.');
        setText('verificationValue', 'Verified');
        setText('verificationNote', 'Verification status is managed by LEX.');
        document.getElementById('verificationBanner').classList.add('is-verified');
    }

    const showSection = (sectionId) => {
        const section = document.getElementById(sectionId);
        if (!section) return;

        document.querySelectorAll('.lawyer-content-section').forEach(item => {
            const isActive = item === section;
            item.classList.toggle('is-active', isActive);
            item.hidden = !isActive;
        });
        document.querySelectorAll('.lawyer-nav-link[data-section]').forEach(link => {
            const isActive = link.dataset.section === sectionId;
            link.classList.toggle('is-active', isActive);
            link.setAttribute('aria-current', isActive ? 'page' : 'false');
        });
        section.scrollIntoView({ behavior: 'auto', block: 'start' });
        if (sectionId === 'personal-chat') initializeDirectChats();
        if (sectionId === 'common-chat') initializeLawyerLounge();
    };

    document.querySelectorAll('[data-section]').forEach(control => {
        control.addEventListener('click', () => showSection(control.dataset.section));
    });
    document.getElementById('openCommonChat').addEventListener('click', () => showSection('common-chat'));

    document.getElementById('lawyerSignOut').addEventListener('click', async () => {
        try {
            await window.lexApi.signOut();
        } catch (error) {
            alert(`Your local session was cleared, but server sign-out failed: ${error.message}`);
            window.lexApi.clearSession();
        }
        window.location.href = 'index.html';
    });

    document.querySelectorAll('.lawyer-truth-card').forEach(card => {
        card.querySelectorAll('[data-verdict]').forEach(button => {
            button.addEventListener('click', () => {
                card.classList.add('is-decided');
                setTextFor(card.querySelector('.lawyer-truth-status'), `Demo verdict: ${button.dataset.verdict}`);
                card.querySelectorAll('[data-verdict]').forEach(verdictButton => {
                    verdictButton.disabled = true;
                });
                const pendingCount = document.querySelectorAll('.lawyer-truth-card:not(.is-decided)').length;
                setText('truthHubCount', `${pendingCount} pending`);
                document.getElementById('truthHubAllClear').hidden = pendingCount !== 0;
            });
        });
    });

    function setTextFor(element, value) {
        if (element) element.textContent = value;
    }

    const lawyerScope = encodeURIComponent((application?.email || user.email || 'lawyer').trim().toLowerCase());
    const serviceStorageKey = `lexLawyerServices:${lawyerScope}`;
    const defaultServices = [
        {
            id: 'family-advisory',
            category: 'Family law',
            name: 'Family advisory',
            description: 'Guidance for separation, parenting plans, and family dispute resolution.'
        },
        {
            id: 'property-disputes',
            category: 'Property law',
            name: 'Property dispute review',
            description: 'Support for ownership disputes, lease issues, and document review.'
        },
        {
            id: 'employment-support',
            category: 'Employment law',
            name: 'Employment support',
            description: 'Advice on contract review, workplace complaints, and leave disputes.'
        }
    ];
    const storedServices = readStoredJson(serviceStorageKey) || defaultServices;
    const validServices = Array.isArray(storedServices)
        ? storedServices.filter(service => service && typeof service.id === 'string' && typeof service.name === 'string' && typeof service.category === 'string' && typeof service.description === 'string')
        : defaultServices;
    const reminderStorageKey = `lexLawyerReminders:${lawyerScope}`;
    const reminders = readStoredJson(reminderStorageKey) || [];
    const validReminders = Array.isArray(reminders) ? reminders.filter(reminder =>
        reminder && typeof reminder.id === 'string' && typeof reminder.date === 'string' &&
        typeof reminder.text === 'string' && typeof reminder.time === 'string'
    ) : [];
    if (!Array.isArray(reminders)) {
        console.error('Saved lawyer reminders are not in the expected format.');
    }
    const serviceList = document.getElementById('serviceList');
    const serviceForm = document.getElementById('serviceForm');
    const serviceStatus = document.getElementById('serviceStatus');
    const serviceCount = document.getElementById('serviceCount');
    const serviceInputName = document.getElementById('serviceName');
    const serviceInputCategory = document.getElementById('serviceCategory');
    const serviceInputDescription = document.getElementById('serviceDescription');

    const saveServices = () => {
        try {
            localStorage.setItem(serviceStorageKey, JSON.stringify(validServices));
            return true;
        } catch (error) {
            console.error('Unable to save lawyer services in browser storage.', error);
            showToast('Could not save the service in this browser.');
            return false;
        }
    };

    const renderServices = () => {
        if (!serviceList) return;
        serviceList.replaceChildren();
        if (serviceCount) {
            serviceCount.textContent = String(validServices.length);
        }
        if (validServices.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'lawyer-list-empty';
            empty.textContent = 'No services added yet. Use the form to add a legal service.';
            serviceList.append(empty);
            return;
        }

        validServices.forEach(service => {
            const item = document.createElement('li');
            item.className = 'lawyer-service-item';
            const meta = document.createElement('div');
            meta.className = 'lawyer-service-meta';
            const category = document.createElement('small');
            category.textContent = service.category;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'lawyer-service-remove';
            remove.textContent = 'Remove';
            remove.addEventListener('click', () => {
                const index = validServices.findIndex(entry => entry.id === service.id);
                if (index === -1) return;
                validServices.splice(index, 1);
                if (saveServices()) {
                    renderServices();
                    showToast('Service removed from this browser.');
                }
            });
            meta.append(category, remove);

            const name = document.createElement('strong');
            name.textContent = service.name;
            const description = document.createElement('p');
            description.textContent = service.description;

            item.append(meta, name, description);
            serviceList.append(item);
        });
    };

    if (serviceForm) {
        serviceForm.addEventListener('submit', event => {
            event.preventDefault();
            const name = serviceInputName.value.trim();
            const category = serviceInputCategory.value.trim();
            const description = serviceInputDescription.value.trim();
            if (!name || !category || !description) {
                serviceStatus.hidden = false;
                serviceStatus.textContent = 'Please complete the service name, category, and description.';
                return;
            }

            validServices.unshift({
                id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                category,
                name,
                description
            });
            if (saveServices()) {
                renderServices();
                serviceForm.reset();
                serviceStatus.hidden = false;
                serviceStatus.textContent = 'Service added to your profile.';
                showToast('Service saved in this browser.');
            }
        });
    }
    renderServices();

    const localDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const parseDateKey = (dateKey) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        return new Date(year, month - 1, day);
    };
    const calendarGrid = document.getElementById('calendarGrid');
    const calendarMonth = document.getElementById('calendarMonth');
    const reminderList = document.getElementById('reminderList');
    const reminderDialog = document.getElementById('reminderDialog');
    const selectedDateReminders = document.getElementById('selectedDateReminders');
    const reminderText = document.getElementById('reminderText');
    const reminderTime = document.getElementById('reminderTime');
    const reminderStatus = document.getElementById('reminderStatus');
    let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let selectedDate = localDateKey(new Date());

    const saveReminders = () => {
        try {
            localStorage.setItem(reminderStorageKey, JSON.stringify(validReminders));
            return true;
        } catch (error) {
            console.error('Unable to save lawyer reminders in browser storage.', error);
            showToast('Could not save the reminder in this browser.');
            return false;
        }
    };

    const renderUpcomingReminders = () => {
        reminderList.replaceChildren();
        const upcoming = validReminders
            .filter(reminder => reminder.date >= localDateKey(new Date()))
            .sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time))
            .slice(0, 8);
        if (upcoming.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'lawyer-list-empty';
            empty.textContent = 'No upcoming reminders. Select a date in the calendar to add one.';
            reminderList.append(empty);
            return;
        }

        upcoming.forEach(reminder => {
            const item = document.createElement('li');
            item.className = 'lawyer-reminder-item';
            const details = document.createElement('div');
            const text = document.createElement('strong');
            const date = document.createElement('small');
            const remove = document.createElement('button');
            text.textContent = reminder.text;
            date.textContent = `${parseDateKey(reminder.date).toLocaleDateString()}${reminder.time ? ` · ${reminder.time}` : ''}`;
            remove.type = 'button';
            remove.textContent = 'Remove';
            remove.setAttribute('aria-label', `Remove reminder: ${reminder.text}`);
            remove.addEventListener('click', () => removeReminder(reminder.id));
            details.append(text, date);
            item.append(details, remove);
            reminderList.append(item);
        });
    };

    const renderCalendar = () => {
        const year = visibleMonth.getFullYear();
        const month = visibleMonth.getMonth();
        calendarMonth.textContent = visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        calendarGrid.replaceChildren();
        const firstDay = new Date(year, month, 1);
        const mondayOffset = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const todayKey = localDateKey(new Date());

        for (let index = 0; index < mondayOffset; index += 1) {
            const spacer = document.createElement('button');
            spacer.type = 'button';
            spacer.disabled = true;
            spacer.tabIndex = -1;
            spacer.setAttribute('aria-hidden', 'true');
            calendarGrid.append(spacer);
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(year, month, day);
            const dateKey = localDateKey(date);
            const dayButton = document.createElement('button');
            dayButton.type = 'button';
            dayButton.textContent = String(day);
            dayButton.setAttribute('aria-label', `${date.toLocaleDateString()}, ${validReminders.filter(reminder => reminder.date === dateKey).length} reminders`);
            if (dateKey === todayKey) dayButton.classList.add('is-today');
            if (validReminders.some(reminder => reminder.date === dateKey)) dayButton.classList.add('has-reminder');
            dayButton.addEventListener('click', () => openReminderDialog(dateKey));
            calendarGrid.append(dayButton);
        }
    };

    const renderSelectedDateReminders = () => {
        selectedDateReminders.replaceChildren();
        const dateReminders = validReminders.filter(reminder => reminder.date === selectedDate);
        if (dateReminders.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'lawyer-list-empty';
            empty.textContent = 'No reminders for this date.';
            selectedDateReminders.append(empty);
            return;
        }
        dateReminders.forEach(reminder => {
            const item = document.createElement('li');
            item.className = 'lawyer-reminder-item';
            const details = document.createElement('div');
            const text = document.createElement('strong');
            const time = document.createElement('small');
            const remove = document.createElement('button');
            text.textContent = reminder.text;
            time.textContent = reminder.time || 'No time set';
            remove.type = 'button';
            remove.textContent = 'Remove';
            remove.addEventListener('click', () => {
                removeReminder(reminder.id);
                renderSelectedDateReminders();
            });
            details.append(text, time);
            item.append(details, remove);
            selectedDateReminders.append(item);
        });
    };

    function removeReminder(id) {
        const reminderIndex = validReminders.findIndex(reminder => reminder.id === id);
        if (reminderIndex < 0) return;
        validReminders.splice(reminderIndex, 1);
        if (saveReminders()) {
            renderCalendar();
            renderUpcomingReminders();
        }
    }

    function openReminderDialog(dateKey) {
        selectedDate = dateKey;
        document.getElementById('reminderDialogTitle').textContent = parseDateKey(dateKey).toLocaleDateString(undefined, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        reminderText.value = '';
        reminderTime.value = '';
        reminderStatus.hidden = true;
        renderSelectedDateReminders();
        reminderDialog.showModal();
        reminderText.focus();
    }

    document.getElementById('calendarPrevious').addEventListener('click', () => {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
        renderCalendar();
    });
    document.getElementById('calendarNext').addEventListener('click', () => {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
        renderCalendar();
    });
    document.getElementById('calendarToday').addEventListener('click', () => {
        const now = new Date();
        visibleMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        renderCalendar();
    });
    document.getElementById('closeReminderDialog').addEventListener('click', () => reminderDialog.close());
    document.getElementById('doneReminderDialog').addEventListener('click', () => reminderDialog.close());
    document.getElementById('reminderForm').addEventListener('submit', event => {
        event.preventDefault();
        const text = reminderText.value.trim();
        if (!text) return;
        const reminder = {
            id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            date: selectedDate,
            time: reminderTime.value,
            text
        };
        validReminders.push(reminder);
        if (saveReminders()) {
            renderCalendar();
            renderUpcomingReminders();
            renderSelectedDateReminders();
            reminderText.value = '';
            reminderTime.value = '';
            reminderStatus.hidden = true;
            showToast('Reminder saved in this browser.');
            reminderDialog.close();
        } else {
            validReminders.pop();
            reminderStatus.textContent = 'The reminder could not be saved. Browser storage may be unavailable.';
            reminderStatus.hidden = false;
        }
    });
    renderCalendar();
    renderUpcomingReminders();

    const uploadedFiles = [];
    const documentInput = document.getElementById('caseDocumentInput');
    const documentList = document.getElementById('caseDocumentList');
    const formatFileSize = bytes => bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    const renderFiles = () => {
        documentList.replaceChildren();
        if (uploadedFiles.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'lawyer-list-empty';
            empty.textContent = 'No documents added in this session.';
            documentList.append(empty);
            return;
        }
        uploadedFiles.forEach((file, index) => {
            const item = document.createElement('li');
            item.className = 'lawyer-document-item';
            const details = document.createElement('div');
            const fileName = document.createElement('strong');
            const size = document.createElement('small');
            const actions = document.createElement('div');
            const download = document.createElement('button');
            const remove = document.createElement('button');
            fileName.textContent = file.name;
            size.textContent = `${formatFileSize(file.size)} · held in this tab only`;
            download.type = 'button';
            download.textContent = 'Download';
            download.addEventListener('click', () => {
                const url = URL.createObjectURL(file);
                const link = document.createElement('a');
                link.href = url;
                link.download = file.name;
                link.click();
                URL.revokeObjectURL(url);
            });
            remove.type = 'button';
            remove.textContent = 'Remove';
            remove.addEventListener('click', () => {
                uploadedFiles.splice(index, 1);
                renderFiles();
            });
            details.append(fileName, size);
            actions.className = 'lawyer-document-actions';
            actions.append(download, remove);
            item.append(details, actions);
            documentList.append(item);
        });
    };
    document.getElementById('uploadDocumentButton').addEventListener('click', () => documentInput.click());
    documentInput.addEventListener('change', () => {
        const incoming = Array.from(documentInput.files || []);
        incoming.forEach(file => {
            if (!uploadedFiles.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
                uploadedFiles.push(file);
            }
        });
        documentInput.value = '';
        renderFiles();
        if (incoming.length) showToast('Files are available in this tab only; they were not uploaded.');
    });

    const conversationList = document.getElementById('conversationList');
    const chatThread = document.getElementById('chatThread');
    const conversationSearch = document.getElementById('conversationSearch');
    let directChannels = [];
    let activeChannel = null;
    let loungeChannel = null;
    let directChatInitialized = false;
    let loungeInitialized = false;

    const appendStreamMessage = (container, message) => {
        const bubble = document.createElement('div');
        bubble.className = `lawyer-chat-message${message.user?.id === user.id ? ' is-lawyer' : ''}`;
        bubble.textContent = message.text || '';
        container.append(bubble);
    };
    const otherMember = channel => Object.values(channel.state.members || {})
        .find(member => member.user_id !== user.id)?.user;
    const renderDirectMessages = () => {
        chatThread.replaceChildren();
        if (!activeChannel) return;
        activeChannel.state.messages.forEach(message => appendStreamMessage(chatThread, message));
        chatThread.scrollTop = chatThread.scrollHeight;
    };
    const renderDirectChannels = () => {
        const query = conversationSearch.value.trim().toLowerCase();
        conversationList.replaceChildren();
        const matches = directChannels.filter(channel => {
            const name = otherMember(channel)?.name || 'LEX member';
            const latest = channel.state.messages[channel.state.messages.length - 1]?.text || '';
            return `${name} ${latest}`.toLowerCase().includes(query);
        });
        if (!matches.length) {
            const empty = document.createElement('li');
            empty.className = 'lawyer-list-empty';
            empty.textContent = query ? 'No matching conversations.' : 'No client conversations yet.';
            conversationList.append(empty);
            return;
        }
        matches.forEach(channel => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            const title = document.createElement('strong');
            const preview = document.createElement('span');
            button.type = 'button';
            button.className = 'lawyer-conversation-button';
            button.classList.toggle('is-active', channel.cid === activeChannel?.cid);
            title.textContent = otherMember(channel)?.name || 'LEX member';
            preview.textContent = channel.state.messages[channel.state.messages.length - 1]?.text || 'Start a conversation';
            button.append(title, preview);
            button.addEventListener('click', async () => {
                activeChannel = channel;
                await channel.watch();
                setText('chatName', otherMember(channel)?.name || 'LEX member');
                setText('chatAvatar', (otherMember(channel)?.name || 'LEX').slice(0, 2).toUpperCase());
                setText('chatSubtitle', 'Secure Stream conversation');
                renderDirectMessages();
                renderDirectChannels();
            });
            item.append(button);
            conversationList.append(item);
        });
    };
    const initializeDirectChats = async () => {
        if (directChatInitialized) return;
        directChatInitialized = true;
        try {
            const { client } = await window.lexStreamChat.getClient();
            directChannels = await client.queryChannels(
                { type: 'messaging', members: { $in: [user.id] }, id: { $ne: 'lex-lawyer-lounge' } },
                { last_message_at: -1 },
                { watch: true, state: true, limit: 50 }
            );
            renderDirectChannels();
            directChannels.forEach(channel => channel.on('message.new', () => {
                renderDirectChannels();
                if (activeChannel?.cid === channel.cid) renderDirectMessages();
            }));
            if (directChannels.length) {
                activeChannel = directChannels[0];
                await activeChannel.watch();
                setText('chatName', otherMember(activeChannel)?.name || 'LEX member');
                setText('chatAvatar', (otherMember(activeChannel)?.name || 'LEX').slice(0, 2).toUpperCase());
                setText('chatSubtitle', 'Secure Stream conversation');
                renderDirectMessages();
                renderDirectChannels();
            } else {
                setText('chatSubtitle', 'New conversations will appear here.');
            }
        } catch (error) {
            const status = document.getElementById('chatStatus');
            status.textContent = `Unable to load conversations: ${error.message}`;
            status.hidden = false;
        }
    };
    conversationSearch.addEventListener('input', renderDirectChannels);
    document.getElementById('chatForm').addEventListener('submit', async event => {
        event.preventDefault();
        const input = document.getElementById('chatMessageInput');
        const text = input.value.trim();
        if (!text || !activeChannel) return;
        try {
            await activeChannel.sendMessage({ text });
            input.value = '';
            renderDirectChannels();
        } catch (error) {
            const status = document.getElementById('chatStatus');
            status.textContent = `Message could not be sent: ${error.message}`;
            status.hidden = false;
        }
    });

    const initializeLawyerLounge = async () => {
        if (loungeInitialized) return;
        loungeInitialized = true;
        const status = document.getElementById('lawyerLoungeStatus');
        const thread = document.getElementById('lawyerLoungeThread');
        try {
            await window.lexApi.request('/api/v1/chat/lawyer-lounge', { method: 'POST' });
            const { client } = await window.lexStreamChat.getClient();
            loungeChannel = client.channel('messaging', 'lex-lawyer-lounge');
            await loungeChannel.watch();
            status.textContent = 'Connected. Do not share confidential client information in this shared room.';
            const render = () => {
                thread.replaceChildren();
                loungeChannel.state.messages.forEach(message => appendStreamMessage(thread, message));
                thread.scrollTop = thread.scrollHeight;
            };
            render();
            loungeChannel.on('message.new', render);
            document.getElementById('lawyerLoungeForm').addEventListener('submit', async event => {
                event.preventDefault();
                const input = document.getElementById('lawyerLoungeInput');
                const text = input.value.trim();
                if (!text) return;
                try {
                    await loungeChannel.sendMessage({ text });
                    input.value = '';
                } catch (error) {
                    status.textContent = `Message could not be sent: ${error.message}`;
                }
            });
        } catch (error) {
            status.textContent = error.message;
        }
    };
    document.getElementById('summarizeChat').addEventListener('click', () => {
        showToast('AI summarization is not available for private conversations.');
    });
    document.getElementById('lawyerUpgradeButton').addEventListener('click', () => {
        showToast('Premium plans and payments are not connected in this demo.');
    });
    document.querySelectorAll('[data-chat-unavailable]').forEach(button => {
        button.addEventListener('click', () => showToast(`${button.dataset.chatUnavailable} are not connected in this demo.`));
    });
});
