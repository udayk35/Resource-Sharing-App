import Docker from "dockerode";
import tar from "tar-stream";
import { getInfo } from "./systeminfo.js";
import stream from "stream";
import axios from 'axios';

const docker = new Docker();
const providerConfig = {
  userID: 'user-123',
  providerID: '123456789',
  providerName: 'Edge Node 01',
  port: 5000, // Now using actual server port
};

// Heartbeat payload now only needs to send port
setInterval(async () => {
  try {
    const response = await axios.post(`http://192.168.0.104:8080/api/providers/heartbeat`, {
      ...providerConfig,
      Info: await getInfo(),
      lastHeartbeat: Date.now()
    });
    console.log(response.data);
  } catch (error) { console.log(error); }
}, 5000);


async function buildCustomImage(image) {
  return new Promise((resolve, reject) => {
    const dockerfileContent = `
      FROM ${image}
      RUN useradd -m myuser
      RUN echo 'myuser:mypassword' | chpasswd
    `;
    const pack = tar.pack();
    pack.entry({ name: "Dockerfile" }, dockerfileContent);
    pack.finalize();

    docker.buildImage(pack, { t: 'custom-node-with-myuser' }, (err, response) => {
      if (err) return reject(err);

      // Log build output
      response.on('data', (chunk) => console.log(chunk.toString()));
      response.on('end', () => resolve('custom-node-with-myuser'));
      response.on('error', (err) => reject(err));
    });
  });
}

async function listContainers(req, res) {
  try {
    const containers = await docker.listContainers({ all: true });
    return res.json({ containers: containers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function startContainer(req, res) {
  const { containerId } = req.params;
  try {
    const container = docker.getContainer(containerId);
    await container.start();
    res.json({ message: `Container ${containerId} started successfully` });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
}

async function stopContainer(req, res) {
  const { containerId } = req.params;
  console.log(containerId);
  try {
    const container = docker.getContainer(containerId);
     container.stop();
     container.remove({force:true});
    res.json({ message: `Container ${containerId} stopped successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function pullImage(req, res) {
  const { imageName } = req.body;
  try {
    await docker.pull(imageName);
    res.json({ message: `Image ${imageName} pulled successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createContainer(req, res) {
  const { image,containerName } = req.body;

  console.log(image);
  try {
      const container = await docker.createContainer({
        name:containerName,
        Image: image,
        Tty: true,
        AttachStdin: true, 
        OpenStdin: true,
        WorkingDir:'/app',
      });
      await container.start();
      const containerInfo = await container.inspect();
      containerInfo.Name = containerInfo.Name.replace(/^\//, '');
      console.log(containerInfo.Name);
      res.json({ containerId:container.id, name:containerInfo.Name});
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
}

async function readFile(req, res) {
  const { containerId, path } = req.body;
  console.log(containerId+" "+path);
  if (!containerId || !path) {
    return res
      .status(400)
      .json({ error: "containerId and filePath are required" });
  }

  try {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: ["cat", path],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: true });
    let fileContent = "";

    stream.on("data", (chunk) => {
      fileContent += chunk.toString();
    });

    stream.on("end", () => {
      res.json({ content: fileContent.toString("base64") });
    });

    stream.on("error", (err) => {
      console.error("Stream error:", err);
      res.status(500).json({ error: "Failed to read file from container" });
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  }
}

async function attachTerminal(ws, req) {
  const { containerId } = req.params;

  // Check if containerId is valid
  if (!containerId) {
    ws.send(JSON.stringify({ error: 'No containerId provided' }));
    return;
  }

  // Get the Docker container instance
  const container = docker.getContainer(containerId);
    console.log(containerId);
  // Check if container exists
  container.inspect(async (err, data) => {
    if (err || !data) {
      ws.send(JSON.stringify({ error: `No such container: ${containerId}` }));
      return;
    }

    // Create an exec instance to start a shell in the container
    const exec = await container.exec({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      WorkingDir:'/app',
    });

     exec.start({ hijack:true,stdin: true, tty: true },(err, stream) => {
      if (err) {
        ws.send(JSON.stringify({ error: err.message }));
        return;
      }
      // Send output from container to client
      stream.on('data', (chunk) => {
       const output=chunk.toString();
        console.log(output);
        ws.send(output);
      });
      stream.on('error',(err)=>console.error(err));
      // Send input from client to container
      ws.on('message',  (message) => {
        console.log(message);
        stream.write(message+'\r');
      });

      // Handle WebSocket close event
      ws.on('close', () => {
        console.log("Client disconnected.");
        stream.end(); // Close the exec stream properly when WebSocket closes
      });

      // Handle errors in WebSocket connection
      ws.on('error', (error) => {
        console.error("WebSocket Error:", error);
      });
    });
  });
}
const writeFile = async (req, res) => {
  const { containerId, path, content } = req.body;
  console.log(content + " " + path);
  try {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: ["sh", "-c", `echo '${content}' > ${path}`],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: true });
    stream.on("data", () => { });
    stream.on("end", () => res.json({ message: "File saved successfully" }));
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

// List files in a directory
// const listFiles = async (req, res) => {
//   const { containerId, path } = req.body;
//   try {
//     const container = docker.getContainer(containerId);
//     const exec = await container.exec({
//       Cmd: ['ls', path],
//       AttachStdout: true,
//       AttachStderr: true,
//     });

//     const stream = await exec.start({ hijack: true, stdin: true });
//     let output = '';
    
//     stream.on('data', (chunk) => (output += chunk.toString()));
//     stream.on('end', () => {
//       output =output.split('\n');
//       output[0]=output[0].replace(/[\u0000-\u001F\u007F]/g, '').trim();
//       console.log(output);
//       res.json({ files: output })});
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };
const listFiles = async (req, res) => {
  const { containerId, path } = req.body;

  try {
    const container = docker.getContainer(containerId);

    // Run 'ls -l' to get detailed output
    const exec = await container.exec({
      Cmd: ['ls', '-l', path],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: true });

    let output = '';

    // Collect output stream
    stream.on('data', (chunk) => (output += chunk.toString()));

    stream.on('end', async () => {
      // Clean and split output into lines
      const lines = output
        .split('\n')
        .map((line) => line.replace(/[\u0000-\u001F\u007F]/g, '').trim())
        .filter(Boolean);

      const files = [];
      const directories = [];

      // Parse each line to separate files from directories
      for (const line of lines) {
        const parts = line.split(/\s+/);
        const name = parts.slice(8).join(' '); // Extract filename
        const type = parts[0][0]; // First character of permissions defines type
        const fullPath = path === '/' ? `/${name}` : `${path}/${name}`; // Full path for the item
        if(name===''){
          continue;
        }
        if (type === 'd') {
          // If it's a directory, recursively fetch contents
          directories.push({ name, path: fullPath});
        } else {
          files.push({ name, path: fullPath });
        }
      }

      console.log({ files, directories });
      res.json({ files, directories });
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Helper function to recursively fetch contents of a directory
const fetchDirectoryContents = async (container, dirPath) => {
  try {
    const exec = await container.exec({
      Cmd: ['ls', '-l', dirPath],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: true });

    let output = '';

    stream.on('data', (chunk) => (output += chunk.toString()));

    return new Promise((resolve) => {
      stream.on('end', () => {
        const lines = output
          .split('\n')
          .map((line) => line.replace(/[\u0000-\u001F\u007F]/g, '').trim())
          .filter(Boolean);

        const contents = [];

        lines.forEach((line) => {
          const parts = line.split(/\s+/);
          const name = parts.slice(8).join(' ');
          const type = parts[0][0];
          const fullPath = `${dirPath}/${name}`;

          contents.push({
            name,
            path: fullPath,
            type: type === 'd' ? 'directory' : 'file',
          });
        });

        resolve(contents);
      });
    });
  } catch (err) {
    console.error(`Error reading directory: ${dirPath}`, err);
    return [];
  }
};

export async function getSystemInfo(req, res) {
  try{
    const info = await getInfo();
    console.log(info);
    res.json(info);
  }catch (err) {
    res.status(500).json({ error: err.message });
  }
} 
async function uploadFile( req, res) {
  try {
    const { containerId } = req.body;
    const file = req.file;
    console.log(containerId);
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    console.log(`Uploading file: ${file.originalname} to container: ${containerId}`);

    // Get the Docker container by ID
    const container = docker.getContainer(containerId);
    const containerInfo = await container.inspect();

    if (!containerInfo.State.Running) {
      return res.status(400).json({ message: "Container is not running" });
    }

    const pack = tar.pack();
    pack.entry({ name: file.originalname }, file.buffer);
    pack.finalize();
    await container.putArchive(pack, {
      path: '/app', 
    });

    res.status(200).json({ message: "File uploaded successfully"});

  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Failed to upload file to Docker container" });
  }
}
export {
  buildCustomImage,
  listContainers,
  startContainer,
  stopContainer,
  pullImage,
  createContainer,
  readFile,
  attachTerminal,
  writeFile,
  listFiles,
  uploadFile
};
