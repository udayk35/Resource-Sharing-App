Resource Sharing App
🚀 Overview

This project is a resource sharing application where the computational power of one computer can be used by another.
It leverages Docker containerization to run workloads across distributed systems.

The application has three main components:

User Interface (UI):
Shows available provider computers that are online.
Includes an integrated workspace (IDE) with:
  Terminal
  File Editor
  File Explorer
  
Backend:
Handles core logic for connections between Resource Providers and Consumers.
Authorizes incoming HTTP requests.
Forwards valid requests to the Provider Agent.
Returns results only to authorized users.

Provider Agent:
A lightweight Node.js program running on the Provider’s machine.
Communicates with Docker Engine to perform tasks for Consumers.
Sends a heartbeat every 5 seconds to the Backend to indicate availability.
