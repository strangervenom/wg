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
            // گرفتن کلیدها از Worker
            keys = await fetchKeys();
            console.log('Keys fetched:', keys);
            // ثبت‌نام اکانت با Worker (فقط با publicKey)
            const accountData = await fetchAccount(keys.publicKey);
            console.log('Account data received:', accountData);
            if (accountData && accountData.success && accountData.data.public_key === keys.publicKey) {
                generateConfig(accountData.data, keys.privateKey);
            } else {
                throw new Error('Public keys do not match! Fetched: ' + keys.publicKey + ', Returned: ' + accountData.data.public_key);
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

    // گرفتن کلیدها از Worker
    const fetchKeys = async () => {
        try {
            const response = await fetch('https://ancient.hmidreza13799.workers.dev/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Failed to fetch keys: ${response.status} - ${await response.text()}`);
            const text = await response.text();
            const lines = text.split('\n');
            const privateKey = lines[0].replace('Private Key: ', '').trim();
            const publicKey = lines[1].replace('Public Key: ', '').trim();
            if (!publicKey || !privateKey) throw new Error('Invalid key response');
            return { publicKey, privateKey };
        } catch (error) {
            console.error('Error fetching keys:', error);
            throw error;
        }
    };

    // ثبت‌نام اکانت با Worker (فقط با publicKey)
    const fetchAccount = async (publicKey) => {
        const apiUrl = 'https://ancient.hmidreza13799.workers.dev/wg';
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ publicKey })
            });
            if (!response.ok) throw new Error(`Failed to fetch account: ${response.status} - ${await response.text()}`);
            return await response.json();
        } catch (error) {
            console.error('Error fetching account:', error);
            throw error;
        }
    };

    const generateConfig = (data, privateKey) => {
        if (!data.config || !data.config.peers || !data.config.peers[0] || !data.config.allowed_ips) {
            console.error('Invalid config data:', data);
            showPopup('Invalid configuration data received.', 'error');
            return;
        }

        const reserved = generateReserved(data.client_id || '');
        const wireGuardText = generateWireGuardConfig(data, privateKey);
        const v2rayText = generateV2RayURL(
            privateKey,
            data.config.peers[0].public_key || '',
            data.config.allowed_ips[0].split('/')[0] || '0.0.0.0',
            data.config.allowed_ips[1].split('/')[0] || '::0',
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
Address = ${data.config.allowed_ips[0]}, ${data.config.allowed_ips[1]}
DNS = ${data.config.dns ? data.config.dns.join(', ') : '1.1.1.1, 1.0.0.1'}
MTU = 1280

[Peer]
PublicKey = ${data.config.peers[0].public_key}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 188.114.99.134:4233
`;

    const generateReserved = (clientId) =>
        Array.from(atob(clientId))
            .map((char) => char.charCodeAt(0))
            .slice(0, 3)
            .join(',');

    const generateV2RayURL = (privateKey, publicKey, ipv4, ipv6, reserved) =>
        `wireguard://${encodeURIComponent(privateKey)}@188.114.99.134:4233?address=${encodeURIComponent(
            ipv4 + '/32'
        )},${encodeURIComponent(ipv6 + '/128')}&reserved=${reserved}&publickey=${encodeURIComponent(
            publicKey
        )}&mtu=1280#V2ray-Config`;

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
