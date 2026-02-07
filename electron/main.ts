import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const envPath = path.join(app.getPath("userData"), "python_env");
const pythonBin = process.platform === "win32"
  ? path.join(envPath, "Scripts", "python.exe")
  : path.join(envPath, "bin", "python");
const packagedServerName = process.platform === "win32" ? "server.exe" : "server";
const packagedServerPath = path.join(process.resourcesPath, "python", packagedServerName);

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
  let pythonExecutable: string;
  let pythonArgs: string[];
  let env: NodeJS.ProcessEnv | undefined;
  const backendDir = isDev
    ? path.join(__dirname, "../python")
    : path.join(process.resourcesPath, "python");

  if (isDev) {
    pythonExecutable = "uv";
    pythonArgs = ["run", "python", "-u", path.join(backendDir, "server.py")];
    env = {
      ...process.env,
      CUDA_VISIBLE_DEVICES: "",
    };
  } else {
    if (!fs.existsSync(packagedServerPath)) {
      console.error(`Packaged backend missing at ${packagedServerPath}`);
      return;
    }

    pythonExecutable = packagedServerPath;
    pythonArgs = [];
    env = {
      ...process.env,
      MATHFORMER_BACKEND: "lite",
      CUDA_VISIBLE_DEVICES: "",
    };
  }

  console.log(`Starting Python backend: ${pythonExecutable} ${pythonArgs.join(" ")}`);

  pythonProcess = spawn(pythonExecutable, pythonArgs, {
    cwd: isDev ? backendDir : backendDir,
    shell: true,
    env,
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
    if (!pythonPort) {
      throw new Error("Backend not initialized. Please wait for setup.");
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

ipcMain.handle("check-backend-status", async () => {
  if (isDev) return true;
  return fs.existsSync(packagedServerPath);
});

ipcMain.handle("install-backend", async () => {
  if (!isDev) {
    if (fs.existsSync(packagedServerPath)) {
      startPythonBackend();
      return;
    }
    throw new Error("Embedded backend missing. Please reinstall the app.");
  }

  const uvExecutable = isDev ? "uv" : path.join(process.resourcesPath, "uv.exe");

  const log = (msg: string) => {
    console.log(msg);
    mainWindow?.webContents.send("backend-log", msg);
  };

  log("Initializing Python environment...");

  if (!fs.existsSync(path.dirname(envPath))) {
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
  }

  return new Promise<void>((resolve, reject) => {
    // 1. Create venv using uv
    const venvProc = spawn(uvExecutable, ["venv", envPath], { shell: true });

    venvProc.on("close", (code) => {
      if (code !== 0) return reject(new Error("Failed to create venv"));

      log("Environment created. Installing dependencies (this may take a while)...");

      // 2. Install dependencies
      const installProc = spawn(uvExecutable, [
        "pip", "install",
        "mathformer", "torch",
        "--index", "pytorch-cpu",
        "--python", pythonBin
      ], { shell: true });

      installProc.stdout?.on("data", (data) => log(data.toString()));
      installProc.stderr?.on("data", (data) => log(data.toString()));

      installProc.on("close", (code) => {
        if (code !== 0) return reject(new Error("Failed to install dependencies"));
        log("Backend installation complete!");
        startPythonBackend();
        resolve();
      });
    });
  });
});

// Window control handlers
ipcMain.on("window-minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window-close", () => {
  mainWindow?.close();
});

app.whenReady().then(async () => {
  createWindow();

  if (isDev) {
    startPythonBackend();
  } else {
    // In production, wait for UI to check status and trigger install if needed
    if (fs.existsSync(pythonBin)) {
      startPythonBackend();
    }
  }

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
