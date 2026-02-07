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

function isBackendInstalled(): boolean {
  if (isDev) {
    return true;
  }
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
let backendReadyCallback: (() => void) | null = null;

function startPythonBackend(onReady?: () => void): void {
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

  if (onReady) {
    backendReadyCallback = onReady;
  }

  console.log(`Starting Python backend: ${pythonExecutable} ${pythonArgs.join(" ")}`);

  pythonProcess = spawn(pythonExecutable, pythonArgs, {
    cwd: backendDir,
    shell: isDev,
    env,
  });

  pythonProcess.stdout?.on("data", (data) => {
    const output = data.toString();
    console.log(`Python stdout: ${output}`);

    if (pythonPort === null) {
      const match = output.match(/PORT:(\d+)/);
      if (match) {
        const port = parseInt(match[1], 10);
        console.log(`Python server started on port ${port}, verifying capability...`);

        const verify = async () => {
          try {
            const response = await fetch(`http://127.0.0.1:${port}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ operation: 'add', a: '0', b: '0' }),
            });

            if (response.ok) {
              pythonPort = port;
              console.log(`Backend verified and ready on port ${pythonPort}`);
              mainWindow?.webContents.send("backend-ready");

              if (backendReadyCallback) {
                backendReadyCallback();
                backendReadyCallback = null;
              }
            } else {
              console.log("Backend started but not ready, retrying...");
              setTimeout(verify, 500);
            }
          } catch (e) {
            console.log("Backend verification failed, retrying...");
            setTimeout(verify, 500);
          }
        };

        verify();
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
  return isBackendInstalled();
});

ipcMain.handle("check-backend-ready", () => {
  return pythonPort !== null;
});

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
    log("正在建立虛擬環境...");
    const venvProc = spawn(uvExecutable, ["venv", envPath], { shell: isDev });

    venvProc.stdout?.on("data", (data) => log(data.toString()));
    venvProc.stderr?.on("data", (data) => log(data.toString()));

    venvProc.on("close", (code) => {
      if (code !== 0) return reject(new Error("Failed to create venv"));

      log("環境建立完成，正在安裝 MathFormer 依賴 (這可能需要幾分鐘)...");

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
        log("安裝完成！正在啟動後端並載入 MathFormer 模型...");
        startPythonBackend(() => {
          log("後端已就緒！");
          resolve();
        });
      });
    });
  });
});

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
    if (isBackendInstalled()) {
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
