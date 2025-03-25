import express, { json } from "express";
import expressWs from "express-ws";
import mongoose from "mongoose";
import { config } from "dotenv"
import cors from "cors";
import multer from "multer";

import {
    listContainers, startContainer, stopContainer, pullImage, createContainer, readFile, attachTerminal, writeFile, listFiles,
    getSystemInfo,
    uploadFile
} from "./functions.js";

config();
const app = express();
const upload = multer({storage:multer.memoryStorage()});
expressWs(app);
app.use(cors());
app.use(json());

// Connect to MongoDB

// Define API routes
app.get("/containers", listContainers);

// Route to start a container
app.post("/containers/:containerId/start", startContainer);

// Route to stop and remove a container
app.post("/containers/:containerId/stop", stopContainer);

app.post("/upload",upload.single('file'),uploadFile);
// Route to pull a Docker image
app.post("/images/pull", pullImage);

// Route to create a new container
app.post("/containers/create", createContainer);

// Route to read a file from a container
app.post("/containers/read-file", readFile);

// Route to write a file to a container
app.post("/containers/write-file", writeFile);

// Route to list files in a container directory
app.get("/containers/list-files", listFiles);
app.get("/systeminfo", getSystemInfo);

app.ws('/:containerId/terminal', attachTerminal);

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
