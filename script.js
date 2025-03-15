document.addEventListener('DOMContentLoaded', () => {
    const getConfigBtn = document.querySelector('.get-btn');
    const downloadBtn = document.querySelector('.download-btn');
    const wireGuardConfig = document.querySelector('.wire-guard-config');
    const v2rayConfig = document.querySelector('.v2ray-config');
    const container = document.querySelector('.container');

    if (!getConfigBtn) {
        console.error('Error: .get-btn not found in DOM');
        return;
    }
    console.log('Script loaded successfully, button found:', getConfigBtn);

    let keys = null; // متغیر برای ذخیره کلیدها

    getConfigBtn.addEventListener('click', async () => {
        console.log('Get Free Config button clicked!');
        getConfigBtn.disabled = true;
        getConfigBtn.textContent = 'Generating...';
        try {
            showSpinner();
            // فقط یک بار کلیدها رو بگیر
            if (!keys) {
                keys = await fetchKeys();
                console.log('Keys fetched:', keys);
            }
            const installId = generateRandomString(22);
            const fcmToken = `${installId}:APA91b${generateRandomString(134)}`;
            const accountData = await fetchAccount(keys.publicKey, installId, fcmToken);
            console.log('Account data received:', accountData);
            if (accountData && (accountData.key === keys.publicKey)) {
                generateConfig(accountData, keys.privateKey);
            } else {
                throw new Error('Public keys do not match!');
            }
        } catch (error) {
            console.error('Error processing configuration:', error);
            showPopup('Failed to generate config. Please try again. (Key mismatch?)', 'error');
        } finally {
            hideSpinner();
            getConfigBtn.disabled = false;
            getConfigBtn.textContent = 'Get Free Config';
            setTimeout(() => {
                if (wireGuardConfig.firstChild) {
                    wireGuardConfig.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 300);
        }
    });

    const fetchKeys = async () => {
        try {
            const response = await fetch('https://ancient.hmidreza13799.workers.dev/keys');
            if (!response.ok) throw new Error(`Failed to fetch keys: ${response.status} - ${await response.text()}`);
            const data = await response.json();
            if (!data.PublicKey || !data.PrivateKey) throw new Error('Invalid key response');
            return { publicKey: data.PublicKey, privateKey: data.PrivateKey };
        } catch (error) {
            console.error('Error fetching keys:', error);
            throw error;
        }
    };

    const fetchAccount = async (publicKey, installId, fcmToken) => {
        const apiUrl = 'https://ancient.hmidreza13799.workers.dev/wg';
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'User-Agent': 'okhttp/3.12.1',
                    'CF-Client-Version': 'a-6.10-2158',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    key: publicKey,
                    install_id: installId,
                    fcm_token: fcmToken,
                    tos: new Date().toISOString(),
                    model: 'PC',
                    serial_number: installId,
                    locale: 'en_US', // تغییر به en_US برای سازگاری با Cloudflare
                }),
            });
            if (!response.ok) throw new Error(`Failed to fetch account: ${response.status} - ${await response.text()}`);
            return response.json();
        } catch (error) {
            console.error('Error fetching account:', error);
            throw error;
        }
    };

    const generateConfig = (data, privateKey) => {
        if (!data.config || !data.config.peers || !data.config.peers[0] || !data.config.interface || !data.config.interface.addresses) {
            console.error('Invalid config data:', data);
            showPopup('Invalid configuration data received.', 'error');
            return;
        }

        const reserved = generateReserved(data.config.client_id || '');
        const wireGuardText = generateWireGuardConfig(data, privateKey);
        const v2rayText = generateV2RayURL(
            privateKey,
            data.config.peers[0].public_key || '',
            data.config.interface.addresses.v4 || '0.0.0.0',
            data.config.interface.addresses.v6 || '::0',
            reserved
        );
        updateDOM(wireGuardConfig, 'WireGuard Format', 'wireguardBox', wireGuardText, 'message1');
        updateDOM(v2rayConfig, 'V2Ray Format', 'v2rayBox', v2rayText, 'message2');
        downloadBtn.style.display = 'block';

        document.querySelectorAll('.copy-button').forEach(btn => {
            btn.addEventListener('click', handleCopyButtonClick);
        });
    };

    const generateWireGuardConfig = (data, privateKey) => `
[Interface]
PrivateKey = ${privateKey}
Address = ${data.config.interface.addresses.v4}/32, ${data.config.interface.addresses.v6}/128
DNS = 1.1.1.1, 1.0.0.1, 2606:4700:4700::1111, 2606:4700:4700::1001
MTU = 1280

[Peer]
PublicKey = ${data.config.peers[0].public_key}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = engage.cloudflareclient.com:2408
`;

    const generateReserved = (clientId) =>
        Array.from(atob(clientId))
            .map((char) => char.charCodeAt(0))
            .slice(0, 3)
            .join(',');

    const generateV2RayURL = (privateKey, publicKey, ipv4, ipv6, reserved) =>
        `wireguard://${encodeURIComponent(privateKey)}@engage.cloudflareclient.com:2408?address=${encodeURIComponent(
            ipv4 + '/32'
        )},${encodeURIComponent(ipv6 + '/128')}&reserved=${reserved}&publickey=${encodeURIComponent(
            publicKey
        )}&mtu=1420#V2ray-Config`;

    const updateDOM = (container, title, textareaId, content, messageId) => {
        container.innerHTML = `
            <h2>${title}</h2>
            <textarea id="${textareaId}" class="config-box visible" readonly>${content.trim()}</textarea>
            <button class="copy-button" data-target="${textareaId}" data-message="${messageId}">Copy ${title} Config</button>
            <p id="${messageId}" class="message" aria-live="polite"></p>
        `;
    };

    const showSpinner = () => {
        const spinner = document.querySelector('.spinner');
        if (spinner) spinner.style.display = 'block';
    };

    const hideSpinner = () => {
        const spinner = document.querySelector('.spinner');
        if (spinner) spinner.style.display = 'none';
    };

    const handleCopyButtonClick = async function(e) {
        const targetId = this.getAttribute('data-target');
        const messageId = this.getAttribute('data-message');
        try {
            const textArea = document.getElementById(targetId);
            await navigator.clipboard.writeText(textArea.value);
            showPopup('Config copied successfully!');
            showCopyMessage(messageId, 'Copied!');
        } catch (error) {
            console.error('Copy failed:', error);
            showPopup('Failed to copy, please try again.', 'error');
            showCopyMessage(messageId, 'Failed to copy');
        }
    };

    const showCopyMessage = (messageId, message) => {
        const messageElement = document.getElementById(messageId);
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.classList.add('visible');
            setTimeout(() => {
                messageElement.classList.remove('visible');
                messageElement.textContent = '';
            }, 2000);
        }
    };

    const showPopup = (message, type = 'success') => {
        const popup = document.createElement('div');
        popup.className = 'popup-message';
        popup.textContent = message;
        if (type === 'error') popup.style.backgroundColor = '#d32f2f';
        document.body.appendChild(popup);
        setTimeout(() => popup.remove(), 2500);
    };

    const generateRandomString = (length) =>
        Array.from({ length }, () =>
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
                Math.floor(Math.random() * 62)
            )
        ).join('');

    downloadBtn.addEventListener('click', () => {
        const content = document.querySelector('#wireguardBox')?.value || "No configuration available";
        if (content === "No configuration available") {
            showPopup('No configuration to download', 'error');
            return;
        }
        downloadConfig('wireguard.conf', content);
        showPopup('Configuration file downloaded');
    });

    const downloadConfig = (fileName, content) => {
        const element = document.createElement('a');
        const file = new Blob([content], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = fileName;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    function checkViewportSize() {
        if (window.innerWidth <= 480) container.style.padding = '15px';
        else if (window.innerWidth <= 768) container.style.padding = '20px';
        else container.style.padding = '32px';
    }

    window.addEventListener('resize', checkViewportSize);
    checkViewportSize();
});
