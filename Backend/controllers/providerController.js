import axios from 'axios';
import WebSocket from 'ws';
import FormData from 'form-data';

const providers = new Map();
const consumerProviderMap = new Map();

const normalizeIP = (ip) => ip.startsWith('::ffff:') ? ip.split(':').pop() : ip;

const handleHeartbeat = (req, res) => {
    const { userID, providerID, providerName, port,Info} = req.body;

    if (!providerID || !port) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const ip = normalizeIP(req.headers['x-forwarded-for'] || req.ip);
    const providerKey = providerID;

    const existingProvider = providers.get(providerKey);
    let registeredAt = existingProvider?.registeredAt || new Date().toISOString();
    let currentStatus = existingProvider?.status || "active";

    providers.set(providerKey, {
        userID,
        providerID,
        providerName,
        ip,
        port,
        Info,
        status:currentStatus,
        lastHeartbeat: Date.now(),
        registeredAt,
    });
    res.json({ status: 'ACK', timestamp: Date.now() });
};

const getAllProviders = (req, res) => {
    const activeProviders = Array.from(providers.values()).filter(
      (provider) => provider.status === "active"
    );
    res.json(activeProviders);
  };
  

const getProviderById = (id) => providers.get(id);

export const getProviderByProviderId = (req, res) => {
    try {
        const { providerId } = req.params;
        const provider = getProviderById(providerId);

        if (!provider) return res.status(404).json({ error: 'Provider not found' });
        res.json(provider);
    } catch (error) {
        res.status(500).json(error.message);
    }
}
const cleanupProviders = (timeout = 30000) => {
    const now = Date.now();
    for (const [key, provider] of providers.entries()) {
        if (now - provider.lastHeartbeat > timeout) {
            providers.delete(key);
            console.log(`Removed inactive provider: ${key}`);
        }
    }
};
cleanupProviders();


const makeRequestToProvider = async (provider, endpoint, method = 'post', data = {}, timeout = 20000) => {
    return axios({
        method,
        url: `http://${provider.ip}:${provider.port}/${endpoint}`,
        data,
        timeout,
    });
};

const startContainer = async (req, res) => {
    try {
        const { providerId, containerId } = req.body;
        const provider = getProviderById(providerId);

        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const response = await makeRequestToProvider(provider, `containers/${containerId}/start`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to start container', details: error.message });
    }
};

const stopContainer = async (req, res) => {
    try {
        const { providerId, containerId } = req.body;
        const provider = getProviderById(providerId);
        const token = req.header('Authorization')?.replace('Bearer ','');
        const response = await makeRequestToProvider(provider, `containers/${containerId}/stop`);
        consumerProviderMap.delete(token);
        provider.status = "active"
        providers.set(providerId,provider);
        res.json(response.data);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Failed to stop container', details: error.message });
    }
};
const fileUpload = async (req, res) => {
    try {
        const { providerId, containerId} = req.body;
        const file = req.file;
        if(!file) return res.status(400).json({message:"No file uploaded"});

        const formData = new FormData();
        formData.append('file',file.buffer,file.originalname);
        formData.append('containerId',containerId);
        const provider = getProviderById(providerId);
        const response = await axios.post(`http://${provider.ip}:${provider.port}/upload`,formData,{
            headers:{
                'Content-Type': 'multipart/form-data'
            }
        })
        res.status(200);
    } catch (error) {
        console.log(error);
    }
};
const pullImage = async (req, res) => {
    try {
        const { providerId, image } = req.body;
        const provider = getProviderById(providerId);

        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const response = await makeRequestToProvider(provider, 'images/pull', 'post', { imageName: image }, 15000);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to pull image', details: error.message });
    }
};

const createContainer = async (req, res) => {
    try {
        const { providerId, image,containerName} = req.body;
        const provider = getProviderById(providerId);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const response = await makeRequestToProvider(provider, 'containers/create', 'post', { image ,containerName}, 10000);
        const { containerId } = response.data;

        const wsURL = `ws://${provider.ip}:${provider.port}/${containerId}/terminal`;
        const ws = new WebSocket(wsURL);

        ws.on('open', () => console.log(`WebSocket connected to provider ${providerId} at ${wsURL}`));
        ws.on('message', (message) => console.log(`Message from provider ${providerId}:`, message.toString()));
        ws.on('close', () => console.log(`WebSocket closed for provider ${providerId}`));
        ws.on('error', (error) => console.error(`WebSocket error for provider ${providerId}:`, error));

        const token = req.header('Authorization')?.replace('Bearer ', '');
        consumerProviderMap.set(token, { providerId, image, containerId, ws });
        provider.status = "InUse";
        providers.set(providerId, provider);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create container', details: error });
    }
};

const attachTerminal = (ws, req) => {
    const protocols = req.headers['sec-websocket-protocol'].split(',').map((p) => p.trim());
    const token = protocols[1];
    const session = consumerProviderMap.get(token);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) {
        ws.send(JSON.stringify({ error: 'No active terminal session found' }));
        ws.close();
        return;
    }

    console.log(`Attaching terminal for container ${session.containerId} on provider ${session.providerId}`);

    ws.on('message', (message) => {
        const decodedCommand = Buffer.from(message, "base64").toString("utf-8");
        console.log(decodedCommand);
        session.ws.send(decodedCommand)});
    session.ws.on('message', (data) => ws.send(data.toString()));

    ws.on('close', () => console.log('Client disconnected from terminal session.'));
    ws.on('error', (error) => console.error('WebSocket Error:', error));
};

const readFile = async (req, res) => {
    try {
        const { providerId, containerId, path } = req.body;
        const provider = getProviderById(providerId);
        console.log(providerId+" "+containerId+" "+path);
        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const response = await makeRequestToProvider(provider, `containers/read-file`, 'post', { containerId, path });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read file', details: error.message });
    }
};

const listFiles = async (req, res) => {
    try {
        const { providerId, containerId, path } = req.body;
        const provider = getProviderById(providerId);

        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const response = await makeRequestToProvider(provider, 'containers/list-files', 'get', { containerId, path });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to list files', details: error.message });
    }
};

const getSystemInfo = async (req, res) => {
    try {
        const { providerId } = req.body;
        const provider = getProviderById(providerId);
        res.json(provider.Info);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch system info', details: error.message });
    }
};
const writeFile = async (req, res) => {
    try {
        const { providerId, path, content, containerId } = req.body;
        console.log(providerId+" "+containerId+" "+path);
        const provider = getProviderById(providerId);

        if (!provider) return res.status(404).json({ error: 'Provider not found' });

        const response = await makeRequestToProvider(provider, 'containers/write-file', 'post', { path, content, containerId });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to write file', details: error.message });
    }
};

export { handleHeartbeat, getAllProviders, getProviderById, cleanupProviders, startContainer, stopContainer, createContainer, pullImage, readFile, listFiles, attachTerminal, getSystemInfo, writeFile ,fileUpload};


