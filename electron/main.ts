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
const packagedServerScriptPath = isDev
  ? path.join(__dirname, "../python/server.py")
  : path.join(process.resourcesPath, "python", "server.py");

// Check if backend is properly installed
function isBackendInstalled(): boolean {
  if (isDev) {
    // In dev, we use uv run directly
    return true;
  }
  // In production, check if python venv exists with mathformer installed
  return fs.existsSync(pythonBin);
}

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
    // In production, MUST use the installed venv with mathformer
    if (!fs.existsSync(pythonBin)) {
      console.error(`Python environment not found at ${pythonBin}. Please install dependencies first.`);
      return;
    }

    pythonExecutable = pythonBin;
    pythonArgs = ["-u", packagedServerScriptPath];
    env = {
      ...process.env,
      CUDA_VISIBLE_DEVICES: "",
    };
  }

  console.log(`Starting Python backend: ${pythonExecutable} ${pythonArgs.join(" ")}`);

  pythonProcess = spawn(pythonExecutable, pythonArgs, {
    cwd: backendDir,
    shell: isDev, // Use shell only for 'uv' command in dev
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

// Check if backend dependencies are installed
ipcMain.handle("check-backend-status", async () => {
  return isBackendInstalled();
});

// Install backend dependencies using uv
ipcMain.handle("install-backend", async () => {
  const uvExecutable = isDev ? "uv" : path.join(process.resourcesPath, "uv.exe");

  if (!isDev && !fs.existsSync(uvExecutable)) {
    throw new Error(`Installer missing at ${uvExecutable}`);
  }

  const log = (msg: string) => {
    console.log(msg);
    mainWindow?.webContents.send("backend-log", msg);
  };

  log("正在初始化 Python 環境...");

  if (!fs.existsSync(path.dirname(envPath))) {
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
  }

  return new Promise<void>((resolve, reject) => {
    // 1. Create venv using uv
    log("正在建立虛擬環境...");
    const venvProc = spawn(uvExecutable, ["venv", envPath], { shell: isDev });

    venvProc.stdout?.on("data", (data) => log(data.toString()));
    venvProc.stderr?.on("data", (data) => log(data.toString()));

    venvProc.on("close", (code) => {
      if (code !== 0) return reject(new Error("Failed to create venv"));

      log("環境建立完成，正在安裝 MathFormer 依賴 (這可能需要幾分鐘)...");

      // 2. Install dependencies - mathformer and torch (CPU version)
      const installArgs = [
        "pip", "install",
        "mathformer", "torch",
        "--index-url", "https://download.pytorch.org/whl/cpu",
        "--extra-index-url", "https://pypi.org/simple",
        "--python", pythonBin
      ];
      const installProc = spawn(uvExecutable, installArgs, { shell: isDev });

      installProc.stdout?.on("data", (data) => log(data.toString()));
      installProc.stderr?.on("data", (data) => log(data.toString()));

      installProc.on("close", (code) => {
        if (code !== 0) return reject(new Error("Failed to install dependencies"));
        log("安裝完成！正在啟動後端...");
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
    // In dev, start backend immediately
    startPythonBackend();
  } else {
    // In production, check if backend is installed
    if (isBackendInstalled()) {
      startPythonBackend();
    }
    // If not installed, the renderer will show installation UI
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
