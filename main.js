const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

const CONFIG_PATH = path.join(app.getPath('userData'), 'server-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(data) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

function createConnectWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    title: 'Tank Merge — Connect',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile('connect.html');

  const config = loadConfig();
  if (config.serverUrl) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('saved-url', config.serverUrl);
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createGameWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Tank Merge',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'Tank Merge',
      submenu: [
        {
          label: 'Change Server...',
          click: () => {
            saveConfig({});
            mainWindow.loadFile('connect.html');
            mainWindow.setResizable(false);
            mainWindow.setSize(500, 400);
            mainWindow.center();
            mainWindow.setTitle('Tank Merge — Connect');
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ]);
  mainWindow.setMenu(menu);
  mainWindow.loadURL(url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.on('connect', (_, url) => {
  saveConfig({ serverUrl: url });
  if (mainWindow) {
    const gameUrl = url.replace(/\/+$/, '');
    mainWindow.loadURL(gameUrl);
    mainWindow.setResizable(true);
    mainWindow.setSize(1280, 800);
    mainWindow.center();
    mainWindow.setTitle('Tank Merge');
  }
});

app.whenReady().then(() => {
  const config = loadConfig();
  if (config.serverUrl) {
    createGameWindow(config.serverUrl.replace(/\/+$/, ''));
  } else {
    createConnectWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    const config = loadConfig();
    if (config.serverUrl) {
      createGameWindow(config.serverUrl.replace(/\/+$/, ''));
    } else {
      createConnectWindow();
    }
  }
});
