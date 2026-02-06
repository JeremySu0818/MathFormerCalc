import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    minWidth: 380,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "../public/icon.png"),
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

let pythonPort: number | null = null;

function startPythonBackend(): void {
  const pythonScript = path.join(__dirname, "../python/server.py");

  // Use 'uv run' to execute python script
  // We use "python -u" to ensure unbuffered output so we catch the PORT immediately
  pythonProcess = spawn("uv", ["run", "python", "-u", pythonScript], {
    cwd: path.join(__dirname, "../python"),
    shell: true,
  });

  pythonProcess.stdout?.on("data", (data) => {
    const output = data.toString();
    console.log(`Python stdout: ${output}`);

    if (pythonPort === null) {
      const match = output.match(/PORT:(\d+)/);
      if (match) {
        pythonPort = parseInt(match[1], 10);
        console.log(`Python server ready on port ${pythonPort}`);
      }
    }
  });

  pythonProcess.stderr?.on("data", (data) => {
    console.error(`Python stderr: ${data}`);
  });

  pythonProcess.on("close", (code) => {
    console.log(`Python process exited with code ${code}`);
    pythonPort = null;
  });
}

// IPC handlers for calculator operations
ipcMain.handle(
  "calculate",
  async (_event, operation: string, a: string, b: string) => {
    // Wait for backend if not ready
    if (!pythonPort) {
      console.log("Waiting for Python backend...");
      const startTime = Date.now();
      // Wait up to 15 seconds for the slow mathformer import
      while (!pythonPort && Date.now() - startTime < 15000) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (!pythonPort) {
        throw new Error("Python backend is not ready yet (timed out).");
      }
    }

    try {
      const response = await fetch(`http://127.0.0.1:${pythonPort}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ operation, a, b }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as { error?: string; result?: string };

      if (data.error) {
        throw new Error(data.error);
      }

      return data.result;
    } catch (error: any) {
      console.error("Calculation error:", error);
      throw new Error(error.message || "Failed to communicate with calculation service");
    }
  },
);

// Window control handlers
ipcMain.on("window-minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window-close", () => {
  mainWindow?.close();
});

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
