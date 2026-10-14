(function () {
    let clientPromise;

    async function getClient() {
        if (!clientPromise) {
            clientPromise = (async () => {
                const session = await window.lexApi.request('/api/v1/chat/session');
                const { StreamChat } = await import('https://esm.sh/stream-chat@8.57.3?bundle');
                const client = StreamChat.getInstance(session.api_key);
                await client.connectUser(session.user, async () => {
                    const refreshed = await window.lexApi.request('/api/v1/chat/session');
                    return refreshed.token;
                });
                return { client, user: session.user };
            })();
        }
        try {
            return await clientPromise;
        } catch (error) {
            clientPromise = undefined;
            throw error;
        }
    }

    window.lexStreamChat = Object.freeze({ getClient });
}());
