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

function startPythonBackend(): void {
  const pythonScript = path.join(__dirname, "../python/calculator.py");

  // Use 'uv run' to execute python script
  pythonProcess = spawn("uv", ["run", "python", pythonScript], {
    cwd: path.join(__dirname, "../python"),
    shell: true,
  });

  pythonProcess.stdout?.on("data", (data) => {
    console.log(`Python stdout: ${data}`);
  });

  pythonProcess.stderr?.on("data", (data) => {
    console.error(`Python stderr: ${data}`);
  });

  pythonProcess.on("close", (code) => {
    console.log(`Python process exited with code ${code}`);
  });
}

// IPC handlers for calculator operations
ipcMain.handle(
  "calculate",
  async (_event, operation: string, a: string, b: string) => {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, "../python/calculator.py");

      const process = spawn(
        "uv",
        ["run", "python", pythonScript, operation, a, b],
        {
          cwd: path.join(__dirname, "../python"),
          shell: true,
        },
      );

      let result = "";
      let error = "";

      process.stdout?.on("data", (data) => {
        result += data.toString();
      });

      process.stderr?.on("data", (data) => {
        error += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve(result.trim());
        } else {
          reject(new Error(error || `Process exited with code ${code}`));
        }
      });

      process.on("error", (err) => {
        reject(err);
      });
    });
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
